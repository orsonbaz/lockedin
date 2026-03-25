/**
 * AI Coach — routing layer for Lockedin.
 *
 * Two modes:
 *   MODE A  On-device   Phi-3.5-mini via Transformers.js Web Worker (offline-first)
 *   MODE B  Groq online llama-3.3-70b-versatile (better quality, needs API key)
 *
 * Routing: if profile.groqApiKey is set, use Groq; otherwise use the Worker.
 *
 * All exports are pure functions / async generators — no React hooks.
 * This module is imported only by client components ('use client').
 */

import Groq                 from 'groq-sdk';
import { db, today }        from '@/lib/db/database';
import { readinessLabel }   from '@/lib/engine/readiness';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProgressPayload {
  status?:   string;
  name?:     string;
  file?:     string;
  progress?: number;   // 0-100
  loaded?:   number;   // bytes
  total?:    number;   // bytes
}

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

// ── Worker singleton ──────────────────────────────────────────────────────────
// Kept at module level so the model stays loaded across navigation.
let _worker:      Worker | null = null;
let _modelLoaded  = false;

function getWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('[coach] Workers are only available in the browser.');
  }
  if (!_worker) {
    // Turbopack / webpack both handle `new URL('./worker.ts', import.meta.url)`
    _worker = new Worker(new URL('./worker.ts', import.meta.url));
  }
  return _worker;
}

// ── System-prompt builder ─────────────────────────────────────────────────────

/**
 * Read athlete context from IndexedDB and build a compact system prompt.
 * Keeps the prompt short so it consumes minimal context-window tokens.
 */
export async function buildSystemPrompt(): Promise<string> {
  // ── Read profile ─────────────────────────────────────────────────────────
  const profile = await db.profile.get('me');
  const name        = profile?.name       ?? 'Athlete';
  const squat       = profile?.maxSquat   ?? '?';
  const bench       = profile?.maxBench   ?? '?';
  const deadlift    = profile?.maxDeadlift ?? '?';
  const bottleneck  = profile?.bottleneck ?? 'BALANCED';
  const federation  = profile?.federation ?? 'IPF';
  const weightClass = profile?.targetWeightClass ?? '?';

  // ── Active cycle + block ──────────────────────────────────────────────────
  const cycle = await db.cycles
    .filter((c) => c.status === 'ACTIVE')
    .first();

  let blockInfo = '';
  if (cycle) {
    const block = await db.blocks
      .where('cycleId')
      .equals(cycle.id)
      .filter((b) => b.weekStart <= cycle.currentWeek && b.weekEnd >= cycle.currentWeek)
      .first();
    if (block) {
      blockInfo = `Training block: ${block.blockType}, week ${cycle.currentWeek} of ${cycle.totalWeeks}.`;
    }
  }

  // ── Today's readiness ─────────────────────────────────────────────────────
  const readiness = await db.readiness.where('date').equals(today()).first();
  const rdScore    = readiness?.readinessScore;
  const rdLabel    = rdScore !== undefined ? readinessLabel(rdScore).label : undefined;
  const readinessInfo = rdScore !== undefined
    ? `Readiness today: ${rdScore}/100 (${rdLabel}).`
    : '';

  // ── Upcoming meet ─────────────────────────────────────────────────────────
  const meet = await db.meets
    .filter((m) => m.status === 'UPCOMING')
    .first();

  let meetInfo = '';
  if (meet) {
    const msUntil  = new Date(meet.date).getTime() - Date.now();
    const daysLeft = Math.ceil(msUntil / 86_400_000);
    if (daysLeft >= 0) {
      meetInfo = `Upcoming meet: "${meet.name}" in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
    }
  }

  // ── Last 3 completed sessions ─────────────────────────────────────────────
  const recentSessions = await db.sessions
    .filter((s) => s.status === 'COMPLETED')
    .toArray();
  const last3 = recentSessions
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 3);

  let sessionHistory = '';
  if (last3.length > 0) {
    const summaries = await Promise.all(
      last3.map(async (s) => {
        const sets = await db.sets
          .where('sessionId')
          .equals(s.id)
          .filter((sl) => sl.rpeLogged !== undefined)
          .toArray();
        const avgRpe = sets.length > 0
          ? (sets.reduce((acc, sl) => acc + (sl.rpeLogged ?? 0), 0) / sets.length).toFixed(1)
          : '—';
        return `${s.primaryLift} (avg RPE ${avgRpe})`;
      }),
    );
    sessionHistory = `Recent sessions: ${summaries.join(', ')}.`;
  }

  // ── Assemble prompt ───────────────────────────────────────────────────────
  return [
    `You are the Lockedin AI coach — a direct, knowledgeable powerlifting coach.`,
    `Athlete: ${name}. Weight class: ${weightClass} kg. Federation: ${federation}.`,
    `Current maxes — Squat: ${squat} kg, Bench: ${bench} kg, Deadlift: ${deadlift} kg.`,
    blockInfo,
    readinessInfo,
    meetInfo,
    sessionHistory,
    `Bottleneck: ${bottleneck}.`,
    `Be direct. Explain the WHY behind recommendations.`,
    `Keep responses concise unless depth is needed.`,
    `Do not make up numbers. Only reference data provided above.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Token streaming — async generator queue ───────────────────────────────────

async function* streamFromWorker(
  messages:  ChatMessage[],
  maxTokens: number,
): AsyncGenerator<string> {
  const worker = getWorker();

  const queue:   Array<string | null> = [];
  let   resolver: (() => void) | null  = null;

  function enqueue(item: string | null) {
    queue.push(item);
    const r = resolver;
    if (r) { resolver = null; r(); }
  }

  const handler = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
    const { type, payload } = event.data;
    if      (type === 'TOKEN')             enqueue(payload as string);
    else if (type === 'GENERATE_COMPLETE') enqueue(null);
    else if (type === 'ERROR')             enqueue(null);
  };

  worker.addEventListener('message', handler);
  worker.postMessage({ type: 'GENERATE', payload: { messages, maxTokens } });

  try {
    loop: while (true) {
      // Drain what's already in the queue
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item === null) break loop;
        yield item;
      }
      // Wait for the next enqueue
      await new Promise<void>((resolve) => { resolver = resolve; });
    }
  } finally {
    worker.removeEventListener('message', handler);
  }
}

// ── Main public API ───────────────────────────────────────────────────────────

/**
 * Route a chat turn to the correct AI backend.
 * Yields string tokens as they stream from the model.
 *
 * @param messages   Conversation history (user + assistant turns). Include
 *                   the system prompt as the first message with role 'system'.
 * @param groqApiKey If set, use Groq. Otherwise use the on-device Worker.
 * @param maxTokens  Max tokens to generate (default 512).
 */
export async function* sendMessage(
  messages:    ChatMessage[],
  groqApiKey?: string,
  maxTokens    = 512,
): AsyncGenerator<string> {
  if (groqApiKey && groqApiKey.trim()) {
    // ── MODE B: Groq online ─────────────────────────────────────────────
    const client = new Groq({
      apiKey:                 groqApiKey.trim(),
      dangerouslyAllowBrowser: true,
    });

    const stream = await client.chat.completions.create({
      model:      'llama-3.3-70b-versatile',
      messages:   messages as Groq.Chat.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
      stream:     true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  } else {
    // ── MODE A: On-device Worker ────────────────────────────────────────
    yield* streamFromWorker(messages, maxTokens);
  }
}

/**
 * Download and initialise the on-device model in the Worker.
 * Safe to call multiple times — resolves immediately if already loaded.
 *
 * @param onProgress  Callback for download progress updates.
 */
export function loadOnDeviceModel(
  onProgress: (p: ProgressPayload) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (_modelLoaded) {
      resolve();
      return;
    }

    const worker = getWorker();

    const handler = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
      const { type, payload } = event.data;
      if (type === 'LOAD_PROGRESS') {
        onProgress(payload as ProgressPayload);
      } else if (type === 'LOAD_COMPLETE') {
        worker.removeEventListener('message', handler);
        _modelLoaded = true;
        resolve();
      } else if (type === 'ERROR') {
        worker.removeEventListener('message', handler);
        reject(new Error(payload as string));
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'LOAD' });
  });
}

/**
 * Send a STOP signal to the Worker so it drops in-flight token generation.
 */
export function stopGeneration(): void {
  _worker?.postMessage({ type: 'STOP' });
}

/** Whether the on-device model has been successfully loaded this session. */
export function isModelLoaded(): boolean {
  return _modelLoaded;
}
