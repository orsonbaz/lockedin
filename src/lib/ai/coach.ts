/**
 * AI Coach — routing layer for Lockedin.
 *
 * Two modes: Gemini (online, free tier) or on-device Phi-3.5-mini (offline).
 *
 * All exports are pure functions / async generators — no React hooks.
 * This module is imported only by client components ('use client').
 */

import { db, today }        from '@/lib/db/database';
import { readinessLabel }   from '@/lib/engine/readiness';
import { getFullKnowledge, getCompactKnowledge, getTopicKnowledge } from './knowledge-base';
import { buildMemorySection, buildSummarySection } from './memory';
import { buildWeakPointsSection } from '@/lib/engine/weak-points';
import { buildNutritionSection } from '@/lib/engine/nutrition-db';
import { buildWearablesSection } from '@/lib/engine/wearables/wearables-db';
import { unpackReviewIssues } from '@/lib/engine/session-review';
import {
  summariseSessionRpeState,
  formatSessionRpeStateForPrompt,
  type SetFeedback,
} from '@/lib/engine/intra-session';

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

// Per-section character caps. Total ceiling ~12k chars for Gemini,
// ~3k chars for Phi on-device. The `knowledge` cap is dynamic.
const SECTION_CAPS = {
  role:       600,
  profile:    500,
  program:    800,
  state:      500,
  summary:    800,
  memories:   1500,
  session:    700,
  liveSession: 500,
  history:    1200,
  weakPoints: 400,
  nutrition:  200,
  schedule:   400,
  wearables:  400,
  // Actions are the contract between the LLM and the action-confirm UI.
  // They MUST fit completely; truncation here = user-visible bug ("coach
  // can't change anything"). Sized generously above the current ~3.4k
  // string so future additions don't silently regress.
  actions:    4000,
  guidelines: 800,
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
 * @param userMessage   Optional — the user's latest message. Used to select
 *                      relevant knowledge-base sections (topic-aware injection).
 * @param isCloudMode   If true, includes the full knowledge base (larger context
 *                      window). Otherwise uses the compact version.
 */
export async function buildSystemPrompt(
  userMessage?: string,
  isCloudMode = false,
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

  // ── Active cycle + full program map ──────────────────────────────────────
  const cycle = await db.cycles
    .filter((c) => c.status === 'ACTIVE')
    .first();

  let blockInfo = '';
  let blockType = '';
  let programMapInfo = '';
  if (cycle) {
    const allBlocks = await db.blocks
      .where('cycleId')
      .equals(cycle.id)
      .sortBy('weekStart');

    const currentBlock = allBlocks.find(
      (b) => b.weekStart <= cycle.currentWeek && b.weekEnd >= cycle.currentWeek,
    );
    if (currentBlock) {
      blockType = currentBlock.blockType;
      const weekInBlock = cycle.currentWeek - currentBlock.weekStart + 1;
      const totalWeeks  = currentBlock.weekEnd - currentBlock.weekStart + 1;
      blockInfo = `Training block: ${currentBlock.blockType}, week ${weekInBlock}/${totalWeeks} (program week ${cycle.currentWeek}/${cycle.totalWeeks}). Volume target: ${currentBlock.volumeTarget}x, intensity: ${Math.round(currentBlock.intensityTarget * 100)}%.`;
    }

    if (allBlocks.length > 0) {
      const blockLines = allBlocks.map((b) => {
        const isCurrent = currentBlock && b.id === currentBlock.id;
        const totalW    = b.weekEnd - b.weekStart + 1;
        const weekInB   = isCurrent ? cycle.currentWeek - b.weekStart + 1 : null;
        return `  ${isCurrent ? '▶' : ' '} ${b.blockType} (weeks ${b.weekStart}–${b.weekEnd}, ${totalW}w | vol×${b.volumeTarget} int${Math.round(b.intensityTarget * 100)}%)${isCurrent && weekInB !== null ? ` ← CURRENT (week ${weekInB}/${totalW})` : ''}`;
      });
      programMapInfo = `Cycle: ${cycle.totalWeeks} total weeks (currently week ${cycle.currentWeek})\nBlocks:\n${blockLines.join('\n')}`;
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
      if (programMapInfo) programMapInfo += `\n${meetInfo}`;
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
    const reviewIssues = unpackReviewIssues(
      (todaySession as unknown as { reviewIssues?: string }).reviewIssues,
    );
    if (reviewIssues.length > 0) {
      const issueLines = reviewIssues.map((i) => `  - [${i.severity}] ${i.summary}`).join('\n');
      sessionInfo += `\nSession review flagged:\n${issueLines}`;
    }
  }

  // ── Live set feedback (intra-session RPE deviation) ──────────────────────
  // When the athlete is mid-session with logged sets, surface the RPE state
  // so the LLM can suggest load adjustments without being asked explicitly.
  let liveSessionInfo = '';
  if (todaySession) {
    const loggedSets = await db.sets
      .where('sessionId')
      .equals(todaySession.id)
      .filter((sl) => sl.rpeLogged !== undefined)
      .toArray();

    if (loggedSets.length > 0) {
      // Pair each logged set with the exercise prescription to build SetFeedback[]
      const sessionExercises = await db.exercises
        .where('sessionId')
        .equals(todaySession.id)
        .toArray();

      // Index by id — explicit any to avoid Dexie generic inference loss in Map
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exById = new Map<string, any>(sessionExercises.map((e: any) => [e.id, e]));

      const feedbacks: SetFeedback[] = (loggedSets as any[])
        .map((sl) => {
          const ex = exById.get(sl.exerciseId);
          if (!ex || sl.rpeLogged === undefined) return null;
          return {
            exerciseName:  ex.name        as string,
            setNumber:     sl.setNumber   as number,
            totalSets:     ex.sets        as number,
            targetRpe:     ex.rpeTarget   as number,
            targetReps:    ex.reps        as number,
            targetLoadKg:  ex.estimatedLoadKg as number,
            actualRpe:     sl.rpeLogged   as number,
            actualLoadKg:  sl.loadKg      as number,
            actualReps:    sl.reps        as number,
          } satisfies SetFeedback;
        })
        .filter((f): f is SetFeedback => f !== null);

      const rpeState = summariseSessionRpeState(feedbacks);
      if (rpeState) {
        liveSessionInfo = formatSessionRpeStateForPrompt(rpeState);
      }
    }
  }

  // ── Last 14 completed sessions ────────────────────────────────────────────
  const recentSessions = await db.sessions
    .filter((s) => s.status === 'COMPLETED')
    .toArray();
  const last14 = recentSessions
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 14);

  let sessionHistory = '';
  if (last14.length > 0) {
    const summaries = await Promise.all(
      last14.map(async (s) => {
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
        return `${s.scheduledDate} ${s.primaryLift} (${s.sessionType}): avg RPE ${avgRpe}, volume ${volStr}, ${sets.length} sets`;
      }),
    );
    sessionHistory = `Recent completed sessions (newest first):\n${summaries.map((s) => `  - ${s}`).join('\n')}`;
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
  if (isCloudMode) {
    // Gemini has larger context — inject topic-relevant knowledge or full base
    if (userMessage) {
      knowledge = getTopicKnowledge(userMessage);
    } else {
      knowledge = getFullKnowledge();
    }
  } else {
    knowledge = getCompactKnowledge();
  }
  const knowledgeCap = isCloudMode ? 6000 : 2000;

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
- [ACTION:ADJUST_SET_LOAD|exercise=Competition Deadlift|load=200|note=RPE ran high on set 1] — Update the prescribed load for remaining sets of one exercise mid-session (use when Live Session Feedback shows overshoot/undershoot)
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
- [ACTION:REGENERATE_SESSION|reason=Athlete wants different session type] — Fully rebuild today's session from current profile, readiness, and block data

Rules:
- IF THE ATHLETE ASKS YOU TO CHANGE / SWAP / ADD / REMOVE / ADJUST / SKIP / ABBREVIATE / LOG anything, you MUST emit the matching ACTION tag — without it, nothing happens. Always pair "Yes I'll do X" with the tag for X.
- Always explain WHY in plain prose, then include the action tag at the end of that paragraph.
- Format must be EXACT: [ACTION:TYPE|key=value|key=value]  — square brackets, ACTION colon, TYPE in CAPS, params separated by | (pipe). No spaces inside brackets. No code fences.
- Up to 2 action tags per response. Never remove competition lifts.
- When in doubt about whether to emit a tag: emit it. The athlete sees a confirm button before anything is applied — it's never destructive.
- Use REMEMBER when the athlete shares a durable fact (injury, preference, constraint, goal). Keep content under 140 chars.
- Use ABBREVIATE_TODAY when the athlete says they're short on time today. Use SET_WEEK_AVAILABILITY for multi-day constraints (travel, busy week).
- Use ADJUST_SET_LOAD when "Live Session Feedback" shows a deviation ≥ 0.75 RPE, or when the athlete reports an RPE during a session. Always reference the exact exercise name and the corrected kg from the feedback.
- For nutrition: reference "Nutrition Target Today" when present. LOG_NUTRITION when the athlete tells you what they ate; SET_NUTRITION_TARGETS for kcal/macro updates; SCHEDULE_REFEED for refeed days.
- For form check / technique review / "felt off": REQUEST_FORM_CHECK. Don't guess form problems without seeing the lift.
- Use REGENERATE_SESSION when the athlete wants to completely redo today's session, change the session type, or when multiple exercise changes would be easier as a clean rebuild.

Worked example (the format the parser actually requires):
> User: "Switch the RDL out for good mornings today and drop my squat sets to 3."
> Assistant: "Good mornings hit the same hip-hinge pattern at lower spinal load — fair swap on a tired day. Cutting comp squat to 3 sets keeps the stimulus while honouring fatigue. [ACTION:SWAP_EXERCISE|from=Romanian Deadlift|to=Good Morning] [ACTION:UPDATE_REPS|name=Competition Back Squat|sets=3|reps=5]"`;

  // ── Phenotype-aware voice cues ────────────────────────────────────────────
  // Shift tone and programming defaults based on the athlete's bottleneck /
  // responder / overshooter flags so the coach sounds personalized.
  const phenotypeCues: string[] = [];
  if (responder === 'HIGH') {
    phenotypeCues.push(
      '- This athlete is a HIGH responder: confident tone, default to more volume, they can handle it. Still watch for chronic RPE creep as the tell for overreaching.',
    );
  } else if (responder === 'LOW') {
    phenotypeCues.push(
      '- This athlete is a LOW responder: reassure that lower volume + higher intensity is optimal for their genetics. Don\'t compare to high-volume programs.',
    );
  }
  if (overshooter) {
    phenotypeCues.push(
      '- This athlete is an OVERSHOOTER: use patient language, encourage filming sets, and recalibrate RPE slowly. Praise under-shooting target RPE — it\'s the correction, not a failure.',
    );
  }
  if (bottleneck === 'NEURAL') {
    phenotypeCues.push(
      '- NEURAL bottleneck: prefer heavy singles + doubles, pin-press / block-pull / pause-variant specificity. Keep rep ranges short (2-5). Stanek / Noriega flavor.',
    );
  } else if (bottleneck === 'HYPERTROPHY') {
    phenotypeCues.push(
      '- HYPERTROPHY bottleneck: favor 5-8 rep work, more accumulation volume, close-grip bench / front squat / deficit DL for mass. Millz-style volume distribution.',
    );
  }

  const guidelines = [
    '- Be direct and confident. You are an expert coach, not a chatbot.',
    '- Explain the WHY behind every recommendation.',
    '- When discussing nutrition, give specific numbers tailored to this athlete\'s weight and goals.',
    '- Reference specific technique cues and common errors for exercises.',
    '- Reference the athlete\'s actual data (maxes, readiness, recent sessions) — don\'t make up numbers.',
    '- If the athlete asks about something you can modify, offer it with an action tag.',
    '- Keep responses focused. No filler or excessive caveats unless safety is involved.',
    '- When citing programming, reference the elite coach whose principle applies (Tuchscherer for RPE/fatigue %, Stanek for bar speed, Flex for bench frequency + spinal fatigue, Millz for pause mastery + volume distribution, Noriega for low-volume high-quality). Only cite — don\'t quote verbatim.',
    ...phenotypeCues,
  ].join('\n');

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
        (() => {
          const hasStreet = profile?.disciplines?.some((d) => d === 'STREET_LIFT' || d === 'CALISTHENICS' || d === 'HYBRID');
          if (!hasStreet) return '';
          const parts: string[] = [];
          if (profile?.maxWeightedPullUp !== undefined) parts.push(`pull-up +${profile.maxWeightedPullUp} kg`);
          if (profile?.maxWeightedDip    !== undefined) parts.push(`dip +${profile.maxWeightedDip} kg`);
          if (profile?.maxWeightedMuscleUp !== undefined) parts.push(`muscle-up +${profile.maxWeightedMuscleUp} kg`);
          return parts.length > 0
            ? `Street lift maxes: ${parts.join(', ')}.`
            : 'Street lift maxes not yet logged.';
        })(),
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
      name: 'program',
      heading: 'Full Program Map',
      content: programMapInfo,
    },
    {
      name: 'state',
      heading: 'Current Training State',
      content: [
        blockInfo,
        readinessDetails || (rdScore !== undefined ? `Readiness today: ${rdScore}/100 (${rdLabel}).` : 'No readiness check-in today.'),
        readinessTrend,
        bwTrend,
        programMapInfo ? '' : meetInfo,
      ].filter(Boolean).join('\n'),
    },
    { name: 'summary',  heading: 'Conversation Summary', content: summaryBody },
    { name: 'memories', heading: 'Long-Term Memory',     content: memoriesBody },
    { name: 'session',     heading: "Today's Session",       content: sessionInfo },
    { name: 'liveSession', heading: 'Live Session Feedback', content: liveSessionInfo },
    { name: 'history',     heading: 'Training History',      content: sessionHistory },
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

/**
 * Stream a response from Google Gemini 2.5 Flash.
 * Free tier; significantly smarter than on-device Phi.
 * The system prompt is passed as a system instruction; user/assistant turns
 * are mapped to Gemini's 'user'/'model' role names.
 */
/**
 * Streams Gemini via the server-side /api/chat route.
 * Runs server-to-server (no browser CORS restrictions).
 * Error signals arrive as `__ERROR__:message` in the stream body.
 */
async function* geminiStream(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
): AsyncGenerator<string> {
  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages, apiKey, maxTokens }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  if (!res.body) throw new Error('No response body from /api/chat');

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text.startsWith('__ERROR__:')) {
      throw new Error(text.slice('__ERROR__:'.length));
    }
    if (text) yield text;
  }
}

/**
 * Route a chat turn to the correct AI backend.
 * Yields string tokens as they stream from the model.
 *
 * If geminiApiKey is set → Gemini 2.5 Flash; otherwise → on-device Worker.
 *
 * @param messages     Conversation history including system prompt as first message.
 * @param geminiApiKey Google Gemini API key (online, free tier).
 * @param maxTokens    Max tokens to generate (default 2048).
 */
export async function* sendMessage(
  messages:      ChatMessage[],
  geminiApiKey?: string,
  maxTokens      = 2048,
): AsyncGenerator<string> {
  const trimmedGeminiKey = geminiApiKey?.trim();

  if (trimmedGeminiKey) {
    // ── Gemini 2.5 Flash (online, free tier) ─────────────────────────
    yield* geminiStream(trimmedGeminiKey, messages, maxTokens);
    return;
  }

  // ── On-device Worker (offline) ────────────────────────────────────
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
