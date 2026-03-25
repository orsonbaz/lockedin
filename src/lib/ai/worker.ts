/**
 * Web Worker — On-device AI inference via Transformers.js (Phi-3.5-mini-instruct).
 *
 * This file runs ONLY in a DedicatedWorker context.
 * No Next.js / DOM imports. No IndexedDB access.
 *
 * Message protocol (main → worker):
 *   { type: 'LOAD' }
 *   { type: 'GENERATE', payload: { messages, maxTokens? } }
 *   { type: 'STOP' }
 *
 * Message protocol (worker → main):
 *   { type: 'LOAD_PROGRESS', payload: <Transformers.js progress object> }
 *   { type: 'LOAD_COMPLETE' }
 *   { type: 'TOKEN',    payload: string }
 *   { type: 'GENERATE_COMPLETE' }
 *   { type: 'ERROR',    payload: string }
 */

import { TextStreamer }           from '@huggingface/transformers';
import type { TextGenerationPipelineType, PreTrainedTokenizer } from '@huggingface/transformers';

// Cast pipeline to a simple async factory to avoid "union type too complex" TS errors.
// The actual runtime behaviour is identical — we only change how TypeScript sees the call.
type SimplePipelineFn = (
  task:    string,
  model:   string,
  options: Record<string, unknown>,
) => Promise<TextGenerationPipelineType>;

// Dynamic import avoids the complex overload set
const { pipeline } = await import('@huggingface/transformers');
const _pipeline = pipeline as unknown as SimplePipelineFn;

// ── Worker context interface ──────────────────────────────────────────────────
// The project tsconfig uses lib:dom, which types `self` as `Window`.
// Window.postMessage requires a targetOrigin arg; the worker version does not.
// We define a minimal interface covering only what we need.
interface WorkerCtx {
  postMessage(data: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<{ type: string; payload?: unknown }>) => void,
  ): void;
}
const ctx = self as unknown as WorkerCtx;

// ── Module-level pipeline singleton ─────────────────────────────────────────
let pipe: TextGenerationPipelineType | null = null;
let stopRequested = false;

// ── Message handler ──────────────────────────────────────────────────────────
ctx.addEventListener('message', async (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  const { type, payload } = event.data;

  // ── LOAD — download + initialise the model ──────────────────────────────
  if (type === 'LOAD') {
    if (pipe) {
      // Model already loaded — just confirm
      ctx.postMessage({ type: 'LOAD_COMPLETE' });
      return;
    }
    try {
      pipe = await _pipeline(
        'text-generation',
        'microsoft/Phi-3.5-mini-instruct',
        {
          dtype:             'q4',
          // Relay download progress to the main thread
          progress_callback: (progress: Record<string, unknown>) => {
            ctx.postMessage({ type: 'LOAD_PROGRESS', payload: progress });
          },
        },
      );
      ctx.postMessage({ type: 'LOAD_COMPLETE' });
    } catch (err) {
      ctx.postMessage({ type: 'ERROR', payload: String(err) });
    }
    return;
  }

  // ── STOP — abort current generation ────────────────────────────────────
  if (type === 'STOP') {
    stopRequested = true;
    return;
  }

  // ── GENERATE — stream tokens for a chat conversation ───────────────────
  if (type === 'GENERATE') {
    if (!pipe) {
      ctx.postMessage({ type: 'ERROR', payload: 'Model not loaded. Call LOAD first.' });
      return;
    }

    const { messages, maxTokens } = payload as {
      messages:  Array<{ role: string; content: string }>;
      maxTokens?: number;
    };

    stopRequested = false;

    // TextStreamer decodes token IDs and calls callback_function with text chunks
    const streamer = new TextStreamer(pipe.tokenizer as PreTrainedTokenizer, {
      skip_prompt:         true,
      skip_special_tokens: true,
      callback_function:   (text: string) => {
        if (stopRequested) return;         // silently drop after stop
        ctx.postMessage({ type: 'TOKEN', payload: text });
      },
    });

    try {
      // Chat input (array of {role, content}) is accepted by the pipeline directly
      await (pipe as (
        input:   unknown,
        options: Record<string, unknown>
      ) => Promise<unknown>)(messages, {
        max_new_tokens: maxTokens ?? 512,
        do_sample:      false,
        streamer,
      });

      if (!stopRequested) {
        ctx.postMessage({ type: 'GENERATE_COMPLETE' });
      }
    } catch (err) {
      ctx.postMessage({ type: 'ERROR', payload: String(err) });
    }
  }
});
