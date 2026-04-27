import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; apiKey?: string; maxTokens?: number };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages = [], apiKey, maxTokens = 1024 } = body;

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chat   = model.startChat({ history: rawHistory });
        const result = await chat.sendMessageStream(lastMsg.content);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        // Signal error to the client as a plain-text body with a special prefix
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`__ERROR__:${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
