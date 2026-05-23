import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
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

const MODEL_ID = 'gemini-2.5-flash';
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour — matches Gemini default
const MIN_CACHE_TOKENS = 1024;     // Gemini 2.5 Flash minimum cache size

export async function POST(req: NextRequest) {
  let body: {
    messages?: ChatMessage[];
    apiKey?:   string;
    maxTokens?: number;
    /** When false, return a single JSON `{ text }` instead of a token stream. */
    stream?:   boolean;
    /**
     * v9: caller-provided cached-content resource name. When set, the server
     * uses it as the context and skips the systemInstruction path. Pair with
     * `cacheStableCore` so the server can rebuild the cache if the name is
     * stale.
     */
    cacheName?: string;
    /**
     * v9: caller-built stable-core string. When `cacheName` is missing OR
     * Gemini rejects it as expired, the server calls
     * `cacheManager.create()` with this content and returns the new resource
     * name + expiry via response headers. When this is absent, caching is
     * disabled and the call falls back to passing systemMsg as a regular
     * systemInstruction.
     */
    cacheStableCore?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const {
    messages = [], apiKey, maxTokens = 1024, stream = true,
    cacheName, cacheStableCore,
  } = body;

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

  // ── Resolve the cached-content resource if the caller supplied one ─────
  // Returns the model + the cache headers the response should advertise so
  // the client can persist the new resource name when we (re)create one.
  const { model, cacheHeaders } = await resolveModel({
    genAI,
    apiKey: apiKey.trim(),
    systemContent: systemMsg?.content ?? '',
    cacheName,
    cacheStableCore,
    maxTokens,
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
      const usage  = result.response.usageMetadata;
      return new Response(
        JSON.stringify({
          text,
          usage: usage ? {
            cachedTokens:        usage.cachedContentTokenCount ?? 0,
            uncachedInputTokens: (usage.promptTokenCount ?? 0) - (usage.cachedContentTokenCount ?? 0),
            outputTokens:        usage.candidatesTokenCount ?? 0,
            model:               MODEL_ID,
          } : undefined,
        }),
        { headers: { 'Content-Type': 'application/json', ...cacheHeaders } },
      );
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

  let finalUsageHeaders: Record<string, string> = {};

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
        // Capture usage metadata when the stream is done so the client can
        // log telemetry. Headers were already sent (Response was constructed
        // before streaming started); see the workaround below — for streaming
        // we surface usage via a trailing __USAGE__ JSON marker.
        try {
          const finalResponse = await result.response;
          const usage = finalResponse.usageMetadata;
          if (usage) {
            controller.enqueue(encoder.encode(
              `\n__USAGE__:${JSON.stringify({
                cachedTokens:        usage.cachedContentTokenCount ?? 0,
                uncachedInputTokens: (usage.promptTokenCount ?? 0) - (usage.cachedContentTokenCount ?? 0),
                outputTokens:        usage.candidatesTokenCount ?? 0,
                model:               MODEL_ID,
              })}`,
            ));
          }
        } catch {
          // Best effort — never break the stream because of telemetry.
        }
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

  // Drain the cache-related headers into the unused finalUsageHeaders var
  // for typescript happiness; the real cache headers go in the Response
  // constructor below.
  void finalUsageHeaders;

  return new Response(responseStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cacheHeaders },
  });
}

// ── Cache resolver ───────────────────────────────────────────────────────────

interface ResolvedModel {
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
  /** Headers the response should set so the client can persist the new cache. */
  cacheHeaders: Record<string, string>;
}

/**
 * Try the caller-supplied cache name first; if it's stale or missing AND we
 * have a stable-core string, create a fresh cache and return its name via
 * response headers. Falls back to the regular systemInstruction path if
 * either piece is missing — caching is opt-in, not required.
 */
async function resolveModel(args: {
  genAI: GoogleGenerativeAI;
  apiKey: string;
  systemContent: string;
  cacheName?: string;
  cacheStableCore?: string;
  maxTokens: number;
}): Promise<ResolvedModel> {
  const { genAI, apiKey, systemContent, cacheName, cacheStableCore, maxTokens } = args;

  // Path A: caller supplied a cache name. Trust it. (Validating the resource
  // costs an extra round-trip; if the name is stale, generateContent fails
  // and the client invalidates + retries.)
  if (cacheName) {
    try {
      const model = genAI.getGenerativeModelFromCachedContent(
        {
          name: cacheName,
          model: MODEL_ID,
        } as never,
        {
          generationConfig: { maxOutputTokens: maxTokens },
        },
      );
      return { model, cacheHeaders: {} };
    } catch {
      // Fall through to create-or-fallback.
    }
  }

  // Path B: no cache name, but we have a stable core large enough to be worth
  // caching. Create a fresh cache and surface its name + expiry via headers.
  if (cacheStableCore && cacheStableCore.length > MIN_CACHE_TOKENS * 4 /* approx chars-per-token */) {
    try {
      const cacheManager = new GoogleAICacheManager(apiKey);
      const created = await cacheManager.create({
        model: `models/${MODEL_ID}`,
        contents: [
          { role: 'user', parts: [{ text: cacheStableCore }] },
        ],
        ttlSeconds: CACHE_TTL_SECONDS,
      });
      const model = genAI.getGenerativeModelFromCachedContent(
        created,
        { generationConfig: { maxOutputTokens: maxTokens } },
      );
      const expiresAt = created.expireTime ?? new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();
      return {
        model,
        cacheHeaders: {
          'X-Cache-Name':    created.name ?? '',
          'X-Cache-Expires': expiresAt,
        },
      };
    } catch {
      // Fall through to plain path — caching is best-effort.
    }
  }

  // Path C: plain — no caching. Send the system prompt as a regular instruction.
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    ...(systemContent ? { systemInstruction: systemContent } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  });
  return { model, cacheHeaders: {} };
}
