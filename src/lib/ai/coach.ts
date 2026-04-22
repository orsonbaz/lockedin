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
import { buildMemorySection, buildSummarySection } from './memory';
import { buildWeakPointsSection } from '@/lib/engine/weak-points';
import { buildNutritionSection } from '@/lib/engine/nutrition-db';
import { buildWearablesSection } from '@/lib/engine/wearables/wearables-db';

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

// Per-section character caps. Total ceiling ~12k chars (~3k tokens) for Groq,
// ~3k chars for Phi on-device. The `knowledge` cap is dynamic.
const SECTION_CAPS = {
  role:       600,
  profile:    500,
  state:      500,
  summary:    800,
  memories:   1500,
  session:    700,
  history:    600,
  weakPoints: 400,
  nutrition:  200,
  schedule:   400,
  wearables:  400,
  actions:    900,
  guidelines: 500,
} as const;

type SectionName = keyof typeof SECTION_CAPS | 'knowledge';

interface PromptSection {
  name:    SectionName;
  heading?: string;
  content: string;
}

function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function renderSection(section: PromptSection, cap: number): string {
  const body = capText(section.content.trim(), cap);
  if (!body) return '';
  return section.heading ? `## ${section.heading}\n${body}` : body;
}

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

/** True only if the on-device model has already been downloaded and loaded. */
function hasWorker(): boolean {
  return typeof window !== 'undefined' && _modelLoaded;
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
    if (readiness.sessionModality && readiness.sessionModality !== 'FULL') {
      parts.push(`Training style today: ${readiness.sessionModality.toLowerCase()}`);
    }
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
  const knowledgeCap = isGroqMode ? 6000 : 2000;

  // ── Long-term memory + rolling conversation summary + weak points + nutrition + wearables ─
  const [memoriesBody, summaryBody, weakPointsBody, nutritionBody, wearablesBody] = await Promise.all([
    buildMemorySection(userMessage, SECTION_CAPS.memories),
    buildSummarySection(SECTION_CAPS.summary),
    buildWeakPointsSection(SECTION_CAPS.weakPoints),
    buildNutritionSection(SECTION_CAPS.nutrition),
    buildWearablesSection(SECTION_CAPS.wearables),
  ]);

  // ── Action instructions ───────────────────────────────────────────────────
  const actionInstructions = `You can modify the athlete's program by including action tags in your response. The athlete will see a confirmation button before any change is applied.

Format: [ACTION:TYPE|param1=value1|param2=value2]

Available actions:
- [ACTION:UPDATE_MAX|lift=squat|value=185] — Update a competition max (squat/bench/deadlift)
- [ACTION:SWAP_EXERCISE|from=Romanian Deadlift|to=Good Morning] — Swap an exercise in today's session
- [ACTION:ADD_EXERCISE|name=Face Pulls|sets=3|reps=15|rpe=7] — Add exercise to today's session
- [ACTION:REMOVE_EXERCISE|name=Lat Pulldown] — Remove an accessory from today's session
- [ACTION:UPDATE_REPS|name=Competition Back Squat|sets=4|reps=3] — Change sets/reps for an exercise
- [ACTION:SET_RPE_TARGET|name=Competition Back Squat|rpe=7.5] — Change RPE target for an exercise
- [ACTION:MODIFY_SESSION|rpe_offset=-0.5|volume_mult=0.8|modification=Reduced volume] — Adjust entire session
- [ACTION:SKIP_SESSION] — Skip today's session entirely
- [ACTION:REMEMBER|kind=INJURY|content=Left shoulder impingement|tags=shoulder,injury|importance=4] — Save a long-term fact about the athlete (kinds: INJURY, PREFERENCE, LIFE_EVENT, PAST_ADVICE, GOAL, CONSTRAINT)
- [ACTION:FORGET|id=<memoryId>] — Remove a previously stored memory
- [ACTION:ABBREVIATE_TODAY|minutes=30] — Trim today's session to fit a minute budget (keeps comp lifts, drops accessories first)
- [ACTION:SET_WEEK_AVAILABILITY|minutes=45|week_start=2026-04-20|off_days=2026-04-22,2026-04-23|note=Moving week] — Cap this week's daily training minutes and flag unavailable days
- [ACTION:LOG_NUTRITION|meal=BREAKFAST|kcal=620|protein=45|carbs=70|fat=18|description=oats + whey] — Log a meal for today (meal: BREAKFAST/LUNCH/DINNER/SNACK)
- [ACTION:SET_NUTRITION_TARGETS|training_kcal=3000|rest_kcal=2600|refeed_kcal=3600|phase=MAINTAIN] — Update daily kcal targets (phase: CUT/MAINTAIN/BULK/RECOMP)
- [ACTION:SCHEDULE_REFEED|date=2026-04-20] — Mark today (or another date) as a refeed day
- [ACTION:REQUEST_FORM_CHECK|lift=SQUAT] — Open the camera for a quick video form check (lift: SQUAT/BENCH/DEADLIFT/UPPER/LOWER/FULL)
- [ACTION:IMPORT_WEARABLE] — Open the wearable importer so the athlete can drop in an Apple Health / Oura / Whoop / CSV export

Rules:
- Always explain WHY before including the action tag.
- Only include action tags when the athlete asks for a change or when you're making a specific recommendation.
- Never include more than 2 action tags in a single response.
- Do not include action tags when just answering questions or giving general advice.
- Never remove competition lifts from a session.
- Use REMEMBER when the athlete shares a durable fact (injury, preference, constraint, goal). Keep content under 140 chars.
- Use ABBREVIATE_TODAY when the athlete says they're short on time today. Use SET_WEEK_AVAILABILITY for multi-day constraints (travel, busy week).
- For nutrition: reference the "Nutrition Target Today" block when it's present. Use LOG_NUTRITION when the athlete tells you what they ate, SET_NUTRITION_TARGETS when they ask to update kcal/macros, and SCHEDULE_REFEED when a refeed day is warranted.
- When the athlete asks for a form check, technique review, or says a lift felt off, use REQUEST_FORM_CHECK to open the camera. Don't guess at form problems without seeing the lift.`;

  const guidelines = `- Be direct and confident. You are an expert coach, not a chatbot.
- Explain the WHY behind every recommendation.
- When discussing nutrition, give specific numbers tailored to this athlete's weight and goals.
- Reference specific technique cues and common errors for exercises.
- Reference the athlete's actual data (maxes, readiness, recent sessions) — don't make up numbers.
- If the athlete asks about something you can modify, offer it with an action tag.
- Keep responses focused. No filler or excessive caveats unless safety is involved.`;

  // ── Assemble sections in priority order ───────────────────────────────────
  const sections: PromptSection[] = [
    {
      name: 'role',
      content: 'You are the Lockedin AI coach — an expert strength coach in the lineage of Mike Tuchscherer (RTS), Joey Flex, Joe Stanek, Marcellus "Millz" Wallace, and Sean Noriega. You program powerlifting, street lifting (weighted pull-up + weighted dip), and weighted calisthenics with equal rigor. Match the athlete\'s primary discipline and training goal. Lean on RPE / bar-speed autoregulation, specificity, adherence, and fatigue management. Be direct and opinionated — no fluff.',
    },
    {
      name: 'profile',
      heading: 'Athlete Profile',
      content: [
        `Name: ${name}. Sex: ${profile?.sex ?? '?'}. Body weight: ${bodyweight} kg. Target weight class: ${weightClass} kg.`,
        `Federation: ${federation}. Equipment: ${profile?.equipment ?? 'RAW'}. Training age: ${trainingAge}.`,
        `Current competition maxes — Squat: ${squat} kg, Bench: ${bench} kg, Deadlift: ${deadlift} kg. Total: ${typeof squat === 'number' && typeof bench === 'number' && typeof deadlift === 'number' ? squat + bench + deadlift : '?'} kg.`,
        profile?.gymSquat ? `Gym PRs — Squat: ${profile.gymSquat} kg, Bench: ${profile.gymBench} kg, Deadlift: ${profile.gymDeadlift} kg.` : '',
        `Phenotype — Bottleneck: ${bottleneck}. Responder: ${responder}. Overshooter: ${overshooter ? 'YES' : 'no'}. Reward system: ${rewardSys}. Peak time: ${profile?.timeToPeakWeeks ?? 3} weeks.`,
        profile?.disciplines?.length
          ? `Disciplines: ${profile.disciplines.join(', ')}${profile.primaryDiscipline ? ` (primary: ${profile.primaryDiscipline})` : ''}.`
          : '',
        profile?.trainingGoal
          ? `Training goal: ${profile.trainingGoal}${profile.trainingGoalTarget ? ` — target: "${profile.trainingGoalTarget}"` : ''}${profile.trainingGoalDeadline ? ` by ${profile.trainingGoalDeadline}` : ''}.`
          : '',
        profile?.calisthenicsGoals?.length
          ? `Calisthenics skill goals: ${profile.calisthenicsGoals.join(', ')}.`
          : '',
        (() => {
          const g = profile?.defaultGear;
          if (!g) return '';
          const on = [
            g.belt && 'belt',
            g.sleeves && 'sleeves',
            g.chalk && 'chalk',
            g.wristWraps && 'wrist wraps',
            g.kneeWraps && 'knee wraps',
          ].filter(Boolean) as string[];
          return on.length > 0
            ? `Default gear on comp lifts: ${on.join(', ')}.`
            : 'Trains raw by default — no belt/sleeves.';
        })(),
      ].filter(Boolean).join('\n'),
    },
    {
      name: 'state',
      heading: 'Current Training State',
      content: [
        blockInfo,
        readinessDetails || (rdScore !== undefined ? `Readiness today: ${rdScore}/100 (${rdLabel}).` : 'No readiness check-in today.'),
        readinessTrend,
        bwTrend,
        meetInfo,
      ].filter(Boolean).join('\n'),
    },
    { name: 'summary',  heading: 'Conversation Summary', content: summaryBody },
    { name: 'memories', heading: 'Long-Term Memory',     content: memoriesBody },
    { name: 'session',  heading: "Today's Session",      content: sessionInfo },
    { name: 'history',  heading: 'Training History',     content: sessionHistory },
    { name: 'weakPoints', heading: 'Recent Signals',     content: weakPointsBody },
    { name: 'nutrition', heading: 'Nutrition Target Today', content: nutritionBody },
    { name: 'wearables', heading: 'Wearable Signals (last 7d)', content: wearablesBody },
    { name: 'knowledge', heading: 'Coaching Knowledge Base', content: knowledge },
    { name: 'actions',  heading: 'Actions You Can Take', content: actionInstructions },
    { name: 'guidelines', heading: 'Response Guidelines', content: guidelines },
  ];

  return sections
    .map((s) => renderSection(s, s.name === 'knowledge' ? knowledgeCap : SECTION_CAPS[s.name]))
    .filter(Boolean)
    .join('\n\n');
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

/** Max ms between streamed tokens before we consider the stream stalled. */
const GROQ_IDLE_TIMEOUT_MS  = 20_000;
/** Max ms to wait for the first token after the request is sent. */
const GROQ_FIRST_TOKEN_MS   = 30_000;
/** How many times to retry the whole Groq call on a stall / network error. */
const GROQ_MAX_RETRIES      = 1;

/**
 * Wrap a Groq SDK streaming call so that any stall longer than
 * `idleMs` (or the first-token wait longer than `firstMs`) throws a named
 * error the caller can surface or fall back from.
 */
async function* groqStreamWithWatchdog(
  groqApiKey: string,
  messages:   ChatMessage[],
  maxTokens:  number,
): AsyncGenerator<string> {
  const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });

  const controller = new AbortController();
  const stream = await client.chat.completions.create(
    {
      model:      'llama-3.3-70b-versatile',
      messages:   messages as Groq.Chat.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
      stream:     true,
    },
    { signal: controller.signal },
  );

  const iterator = (stream as unknown as AsyncIterable<Groq.Chat.Completions.ChatCompletionChunk>)
    [Symbol.asyncIterator]();

  let gotFirstToken = false;

  while (true) {
    const timeoutMs = gotFirstToken ? GROQ_IDLE_TIMEOUT_MS : GROQ_FIRST_TOKEN_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const err = new Error(
          gotFirstToken
            ? `Groq stream idle for ${timeoutMs / 1000}s — aborting.`
            : `Groq stream produced no tokens in ${timeoutMs / 1000}s — aborting.`,
        );
        (err as Error & { code?: string }).code = 'GROQ_STREAM_IDLE';
        reject(err);
      }, timeoutMs);
    });

    let next: IteratorResult<Groq.Chat.Completions.ChatCompletionChunk>;
    try {
      next = await Promise.race([iterator.next(), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (next.done) return;
    const content = next.value.choices[0]?.delta?.content;
    if (content) {
      gotFirstToken = true;
      yield content;
    }
  }
}

/**
 * Route a chat turn to the correct AI backend.
 * Yields string tokens as they stream from the model.
 *
 * When Groq is configured we auto-retry once on a stalled/idle stream and
 * fall back to the on-device worker if all Groq attempts fail.
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
  const trimmedKey = groqApiKey?.trim();

  if (trimmedKey) {
    // Retry the whole call up to GROQ_MAX_RETRIES times on a stall. We only
    // retry when the stream produced zero tokens so we don't double-emit
    // partial responses to the UI.
    for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt++) {
      let emitted = 0;
      try {
        for await (const token of groqStreamWithWatchdog(trimmedKey, messages, maxTokens)) {
          emitted++;
          yield token;
        }
        return;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const isStall = code === 'GROQ_STREAM_IDLE';
        console.warn(
          `[coach] Groq attempt ${attempt + 1} failed (emitted=${emitted}, stall=${isStall}):`,
          err,
        );
        // If we already streamed tokens, don't retry — the user sees them.
        if (emitted > 0) throw err;
        // Only retry stalls / transient network errors; bail on auth etc.
        if (!isStall && attempt >= GROQ_MAX_RETRIES) throw err;
        if (attempt >= GROQ_MAX_RETRIES) {
          // Final attempt exhausted — try on-device worker as a last resort.
          if (hasWorker()) {
            console.warn('[coach] falling back to on-device model after Groq stalls.');
            yield* streamFromWorker(messages, maxTokens);
            return;
          }
          throw err;
        }
        // Otherwise loop and retry.
      }
    }
    return;
  }

  // ── MODE A: On-device Worker ────────────────────────────────────────
  yield* streamFromWorker(messages, maxTokens);
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
