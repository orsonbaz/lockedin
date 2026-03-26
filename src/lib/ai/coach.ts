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
import { getFullKnowledge, getCompactKnowledge, getTopicKnowledge } from './knowledge-base';

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
 * Read athlete context from IndexedDB and build a comprehensive system prompt.
 *
 * @param userMessage  Optional — the user's latest message. Used to select
 *                     relevant knowledge-base sections (topic-aware injection).
 * @param isGroqMode   If true, includes the full knowledge base (larger context
 *                     window). Otherwise uses the compact version.
 */
export async function buildSystemPrompt(
  userMessage?: string,
  isGroqMode = false,
): Promise<string> {
  // ── Read profile ─────────────────────────────────────────────────────────
  const profile = await db.profile.get('me');
  const name        = profile?.name       ?? 'Athlete';
  const squat       = profile?.maxSquat   ?? '?';
  const bench       = profile?.maxBench   ?? '?';
  const deadlift    = profile?.maxDeadlift ?? '?';
  const bottleneck  = profile?.bottleneck ?? 'BALANCED';
  const responder   = profile?.responder  ?? 'STANDARD';
  const overshooter = profile?.overshooter ?? false;
  const rewardSys   = profile?.rewardSystem ?? 'CONSISTENCY';
  const federation  = profile?.federation ?? 'IPF';
  const weightClass = profile?.targetWeightClass ?? '?';
  const bodyweight  = profile?.weightKg   ?? '?';
  const trainingAge = profile?.trainingAgeMonths
    ? `${Math.round(profile.trainingAgeMonths / 12 * 10) / 10} years`
    : '?';

  // ── Active cycle + block ──────────────────────────────────────────────────
  const cycle = await db.cycles
    .filter((c) => c.status === 'ACTIVE')
    .first();

  let blockInfo = '';
  let blockType = '';
  if (cycle) {
    const block = await db.blocks
      .where('cycleId')
      .equals(cycle.id)
      .filter((b) => b.weekStart <= cycle.currentWeek && b.weekEnd >= cycle.currentWeek)
      .first();
    if (block) {
      blockType = block.blockType;
      blockInfo = `Training block: ${block.blockType}, week ${cycle.currentWeek} of ${cycle.totalWeeks}. Volume target: ${block.volumeTarget}x, intensity target: ${Math.round(block.intensityTarget * 100)}%.`;
    }
  }

  // ── Today's readiness ─────────────────────────────────────────────────────
  const readiness = await db.readiness.where('date').equals(today()).first();
  const rdScore    = readiness?.readinessScore;
  const rdLabel    = rdScore !== undefined ? readinessLabel(rdScore).label : undefined;

  let readinessDetails = '';
  if (readiness) {
    const parts = [`Score: ${rdScore}/100 (${rdLabel})`];
    if (readiness.sleepHours) parts.push(`Sleep: ${readiness.sleepHours}h (quality ${readiness.sleepQuality}/5)`);
    if (readiness.energy) parts.push(`Energy: ${readiness.energy}/5`);
    if (readiness.motivation) parts.push(`Motivation: ${readiness.motivation}/5`);
    if (readiness.soreness) parts.push(`Soreness: ${readiness.soreness}/5`);
    if (readiness.stress) parts.push(`Stress: ${readiness.stress}/5`);
    if (readiness.hrv) parts.push(`HRV: ${readiness.hrv}ms`);
    if (readiness.hrvDeviation !== undefined) parts.push(`HRV deviation: ${readiness.hrvDeviation > 0 ? '+' : ''}${readiness.hrvDeviation.toFixed(1)}%`);
    if (readiness.note) parts.push(`Note: "${readiness.note}"`);
    readinessDetails = `Today's readiness: ${parts.join('. ')}.`;
  }

  // ── Readiness trend (last 7 days) ──────────────────────────────────────────
  const recentReadiness = await db.readiness.orderBy('date').reverse().limit(7).toArray();
  let readinessTrend = '';
  if (recentReadiness.length >= 3) {
    const scores = recentReadiness.map((r) => r.readinessScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const trend = scores[0] > scores[scores.length - 1] ? 'improving' : scores[0] < scores[scores.length - 1] ? 'declining' : 'stable';
    readinessTrend = `Readiness trend (${recentReadiness.length}d): avg ${avg}, ${trend}. Recent scores: [${scores.join(', ')}].`;
  }

  // ── Upcoming meet ─────────────────────────────────────────────────────────
  const meet = await db.meets
    .filter((m) => m.status === 'UPCOMING')
    .first();

  let meetInfo = '';
  if (meet) {
    const msUntil  = new Date(meet.date).getTime() - Date.now();
    const daysLeft = Math.ceil(msUntil / 86_400_000);
    if (daysLeft >= 0) {
      meetInfo = `Upcoming meet: "${meet.name}" in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Federation: ${meet.federation}. Weight class: ${meet.weightClass} kg. Weigh-in: ${meet.weighIn === 'TWO_HOUR' ? '2-hour' : '24-hour'}.`;
    }
  }

  // ── Today's session exercises ─────────────────────────────────────────────
  const todaySession = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();

  let sessionInfo = '';
  if (todaySession) {
    const exercises = await db.exercises
      .where('sessionId').equals(todaySession.id)
      .sortBy('order');
    const exList = exercises.map(
      (e) => `  - ${e.name} (${e.exerciseType}): ${e.sets}×${e.reps} @ RPE ${e.rpeTarget}, ~${e.estimatedLoadKg} kg`,
    );
    sessionInfo = `Today's session — ${todaySession.sessionType} ${todaySession.primaryLift}:\n${exList.join('\n')}`;
    if (todaySession.coachNote) {
      sessionInfo += `\nCoach note: ${todaySession.coachNote}`;
    }
  }

  // ── Last 5 completed sessions (richer data) ────────────────────────────────
  const recentSessions = await db.sessions
    .filter((s) => s.status === 'COMPLETED')
    .toArray();
  const last5 = recentSessions
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 5);

  let sessionHistory = '';
  if (last5.length > 0) {
    const summaries = await Promise.all(
      last5.map(async (s) => {
        const sets = await db.sets
          .where('sessionId')
          .equals(s.id)
          .filter((sl) => sl.rpeLogged !== undefined)
          .toArray();
        const avgRpe = sets.length > 0
          ? (sets.reduce((acc, sl) => acc + (sl.rpeLogged ?? 0), 0) / sets.length).toFixed(1)
          : '—';
        const totalVol = sets.reduce((sum, sl) => sum + sl.loadKg * sl.reps, 0);
        const volStr = totalVol > 1000 ? `${(totalVol / 1000).toFixed(1)}t` : `${Math.round(totalVol)}kg`;
        return `${s.scheduledDate} ${s.primaryLift}: avg RPE ${avgRpe}, volume ${volStr}, ${sets.length} sets`;
      }),
    );
    sessionHistory = `Recent completed sessions:\n${summaries.map((s) => `  - ${s}`).join('\n')}`;
  }

  // ── Bodyweight trend ──────────────────────────────────────────────────────
  const recentBw = await db.bodyweight.orderBy('date').reverse().limit(7).toArray();
  let bwTrend = '';
  if (recentBw.length >= 2) {
    const weights = recentBw.map((b) => b.weightKg);
    const latest = weights[0];
    const oldest = weights[weights.length - 1];
    const diff = latest - oldest;
    bwTrend = `Bodyweight trend (${recentBw.length}d): ${latest}kg (${diff > 0 ? '+' : ''}${diff.toFixed(1)}kg from ${recentBw.length} days ago).`;
  }

  // ── Knowledge base (topic-aware) ──────────────────────────────────────────
  let knowledge: string;
  if (isGroqMode) {
    // Groq has larger context — inject topic-relevant knowledge or full base
    if (userMessage) {
      knowledge = getTopicKnowledge(userMessage);
    } else {
      knowledge = getFullKnowledge();
    }
  } else {
    knowledge = getCompactKnowledge();
  }

  // ── Action instructions ───────────────────────────────────────────────────
  const actionInstructions = `
## Actions You Can Take
You can modify the athlete's program by including action tags in your response. The athlete will see a confirmation button before any change is applied.

Format: [ACTION:TYPE|param1=value1|param2=value2]

Available actions:
- [ACTION:UPDATE_MAX|lift=squat|value=185] — Update a competition max (squat/bench/deadlift)
- [ACTION:SWAP_EXERCISE|from=Romanian Deadlift|to=Good Morning] — Swap an exercise in today's session
- [ACTION:ADD_EXERCISE|name=Face Pulls|sets=3|reps=15|rpe=7] — Add exercise to today's session
- [ACTION:REMOVE_EXERCISE|name=Lat Pulldown] — Remove an accessory from today's session
- [ACTION:UPDATE_REPS|name=Competition Back Squat|sets=4|reps=3] — Change sets/reps for an exercise
- [ACTION:SET_RPE_TARGET|name=Competition Back Squat|rpe=7.5] — Change RPE target for an exercise
- [ACTION:MODIFY_SESSION|rpe_offset=-0.5|volume_mult=0.8|modification=Reduced volume due to low readiness] — Adjust entire session
- [ACTION:SKIP_SESSION] — Skip today's session entirely

Rules:
- Always explain WHY you're suggesting the change before including the action tag.
- Only include action tags when the athlete asks for a change or when you're making a specific recommendation.
- Never include more than 2 action tags in a single response.
- Do not include action tags when just answering questions or giving general advice.
- Never remove competition lifts from a session.
- For nutrition questions, give detailed advice — no action tags needed.
`;

  // ── Assemble prompt ───────────────────────────────────────────────────────
  return [
    `You are the Lockedin AI coach — an expert powerlifting coach with deep knowledge of programming, nutrition, recovery, and competition preparation.`,
    ``,
    `## Athlete Profile`,
    `Name: ${name}. Sex: ${profile?.sex ?? '?'}. Body weight: ${bodyweight} kg. Target weight class: ${weightClass} kg.`,
    `Federation: ${federation}. Equipment: ${profile?.equipment ?? 'RAW'}. Training age: ${trainingAge}.`,
    `Current competition maxes — Squat: ${squat} kg, Bench: ${bench} kg, Deadlift: ${deadlift} kg. Total: ${typeof squat === 'number' && typeof bench === 'number' && typeof deadlift === 'number' ? squat + bench + deadlift : '?'} kg.`,
    profile?.gymSquat ? `Gym PRs — Squat: ${profile.gymSquat} kg, Bench: ${profile.gymBench} kg, Deadlift: ${profile.gymDeadlift} kg.` : '',
    `Athlete phenotype — Bottleneck: ${bottleneck}. Responder: ${responder}. Overshooter: ${overshooter ? 'YES (tends to exceed RPE targets)' : 'no'}. Reward system: ${rewardSys}. Peak time: ${profile?.timeToPeakWeeks ?? 3} weeks.`,
    ``,
    `## Current Training State`,
    blockInfo,
    readinessDetails || (rdScore !== undefined ? `Readiness today: ${rdScore}/100 (${rdLabel}).` : 'No readiness check-in today.'),
    readinessTrend,
    bwTrend,
    meetInfo,
    ``,
    sessionInfo ? `## Today's Session\n${sessionInfo}` : '',
    ``,
    sessionHistory ? `## Training History\n${sessionHistory}` : '',
    ``,
    `## Coaching Knowledge Base`,
    knowledge,
    ``,
    actionInstructions,
    ``,
    `## Response Guidelines`,
    `- Be direct and confident. You are an expert coach, not a chatbot.`,
    `- Explain the WHY behind every recommendation. Lifters need to understand the reasoning.`,
    `- When discussing nutrition, give specific numbers (calories, grams, meal examples) tailored to this athlete's weight and goals.`,
    `- When discussing exercises, reference specific technique cues and common errors.`,
    `- Reference the athlete's actual data (maxes, readiness, recent sessions) — don't make up numbers.`,
    `- If the athlete asks about something you can modify (session, maxes, exercises), offer to make the change with an action tag.`,
    `- For complex questions, structure your response with clear sections.`,
    `- Keep responses focused. Don't pad with disclaimers or excessive caveats unless safety is involved.`,
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
