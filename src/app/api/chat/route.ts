import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
// Vercel default ceiling is 10s; the advisor / authoring prompts (≈6-12 KB
// system context + up to 4 KB output) regularly need 20-40s end-to-end on
// Gemini 2.5 Flash. Bump the function ceiling so the platform doesn't kill
// the request before the model returns. Heartbeats (below) handle the
// platform's separate stream-idle timeout.
export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Heartbeat character emitted while waiting for Gemini's first token. Vercel
 * severs streaming responses that go silent for ~25s — Gemini's TTFT on
 * large prompts can exceed that. Zero-width space is invisible if it leaks
 * to a UI; consumers strip it before parsing JSON.
 */
const HEARTBEAT = '​';
const HEARTBEAT_INTERVAL_MS = 8_000;

export async function POST(req: NextRequest) {
  let body: {
    messages?: ChatMessage[];
    apiKey?:   string;
    maxTokens?: number;
    /** When false, return a single JSON `{ text }` instead of a token stream. */
    stream?:   boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages = [], apiKey, maxTokens = 1024, stream = true } = body;

  if (!apiKey?.trim()) {
    return new Response('API key required', { status: 400 });
  }

  const systemMsg = messages.find((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const lastMsg   = nonSystem.at(-1);

  if (!lastMsg) {
    return new Response('No user message in context', { status: 400 });
  }

  // Build strictly alternating user→model history.
  // Gemini requires the first history entry (if any) to be 'user' and that
  // history end on 'model' before sendMessage runs the next user turn.
  // Drop leading 'model' entries — happens when the 20-message window slices
  // mid-turn or after a stack of action-confirmation status messages.
  // Drop trailing 'user' entries so history always ends with 'model' or is empty.
  const rawHistory = nonSystem
    .slice(0, -1)
    .map((m) => ({
      role:  m.role === 'assistant' ? 'model' : 'user' as 'user' | 'model',
      parts: [{ text: m.content }],
    }));
  while (rawHistory.length > 0 && rawHistory[0].role === 'model') {
    rawHistory.shift();
  }
  while (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].role === 'user') {
    rawHistory.pop();
  }

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(systemMsg?.content ? { systemInstruction: systemMsg.content } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  });

  // ── Non-streaming path ────────────────────────────────────────────────────
  // Buffered consumers (advisor, session author) parse the full response as
  // JSON before doing anything with it. Streaming gives them no benefit and
  // exposes them to the gateway's stream-idle timeout. A single non-streaming
  // request returns once the model is done and is bounded only by maxDuration.
  if (stream === false) {
    try {
      const chat   = model.startChat({ history: rawHistory });
      const result = await chat.sendMessage(lastMsg.content);
      const text   = result.response.text();
      return new Response(JSON.stringify({ text }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // ── Streaming path ────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      // Keep the connection alive while we wait on Gemini. The first
      // heartbeat fires immediately so Vercel sees activity right away;
      // subsequent ones fire on the interval until the model starts
      // emitting real tokens.
      let heartbeatActive = true;
      const sendHeartbeat = () => {
        if (!heartbeatActive) return;
        try { controller.enqueue(encoder.encode(HEARTBEAT)); } catch { heartbeatActive = false; }
      };
      sendHeartbeat();
      const heartbeat = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      const stopHeartbeat = () => {
        heartbeatActive = false;
        clearInterval(heartbeat);
      };

      try {
        const chat   = model.startChat({ history: rawHistory });
        const result = await chat.sendMessageStream(lastMsg.content);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            stopHeartbeat();
            controller.enqueue(encoder.encode(text));
          }
        }
        stopHeartbeat();
        controller.close();
      } catch (err) {
        stopHeartbeat();
        // Signal error to the client as a plain-text body with a special prefix
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`__ERROR__:${msg}`));
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
