/**
 * session-advisor.ts — AI pre-generation review of training sessions.
 *
 * Called after the rule engine builds a session but BEFORE exercises are
 * persisted. The advisor sees the full program context — all blocks, recent
 * sessions, readiness trend, goals, upcoming meet — and returns structured
 * modifications plus a personalised coach note.
 *
 * Design goals:
 *   - Large context window: everything the AI needs, nothing it doesn't.
 *   - Structured JSON output: zero ambiguity, easy to apply.
 *   - Hard timeout (8s) with silent fallback to the rule-engine result.
 *   - Single call per session per day: callers check the MODIFIED guard
 *     so this doesn't fire on every page mount.
 *
 * Token budget (Gemini 2.5 Flash, 1M context):
 *   System / context : ~6 000 tokens
 *   Session to review:   ~500 tokens
 *   Response (JSON)  :  ~1 500 tokens
 */

import { db, today }           from '@/lib/db/database';
import { getFullKnowledge }     from './knowledge-base';
import { buildMemorySection }   from './memory';
import { getMaxForLift, liftAnchorForExercise } from './lift-anchor';
import { prescribeLoad, roundLoad } from '@/lib/engine/calc';
import type { GeneratedSession, GeneratedExercise } from '@/lib/engine/session';
import type { AthleteProfile, TrainingBlock } from '@/lib/db/types';

// ── Public API ────────────────────────────────────────────────────────────────

export interface AdvisorModification {
  type:
    | 'ADJUST_SETS'
    | 'ADJUST_REPS'
    | 'ADJUST_RPE'
    | 'ADJUST_LOAD'
    | 'ADD_EXERCISE'
    | 'REMOVE_EXERCISE'
    | 'ADD_NOTE'
    | 'REPLACE_EXERCISE';
  /** Exercise name to target (undefined for ADD_EXERCISE). */
  target?: string;
  /** Numeric value (sets count, reps count, RPE). */
  value?: number;
  /** For ADD_EXERCISE / REPLACE_EXERCISE: the new exercise name. */
  name?: string;
  /** Sets for ADD_EXERCISE. */
  sets?: number;
  /** Reps for ADD_EXERCISE. */
  reps?: number;
  /** RPE for ADD_EXERCISE. */
  rpe?: number;
  /** Human-readable rationale for this specific modification. */
  reason: string;
}

export interface AdvisorResult {
  /** 1-2 sentence coach note shown to the athlete at the top of their session. */
  coachNote: string;
  /** List of changes to apply to the generated session. May be empty. */
  modifications: AdvisorModification[];
  /**
   * One-word assessment:
   *   APPROVED  — session looks great, no changes
   *   TWEAKED   — minor adjustments applied
   *   REDUCED   — volume or intensity cut due to fatigue/readiness
   *   REBUILT   — significant restructure recommended
   */
  assessment: 'APPROVED' | 'TWEAKED' | 'REDUCED' | 'REBUILT';
  /** Internal AI reasoning — logged but not shown to athlete. */
  rationale: string;
}

/**
 * Ask the AI to review a generated session before it is saved.
 *
 * Returns the rule-engine coachNote as a fallback if:
 *   - No Gemini API key is configured
 *   - The call exceeds the 8s timeout
 *   - The response cannot be parsed as valid JSON
 *
 * @param generated  The session produced by generateSession()
 * @param profile    Athlete profile (already fetched by caller)
 * @param block      Current training block (already fetched by caller)
 */
export async function advisorReviewSession(
  generated: GeneratedSession,
  profile:   AthleteProfile,
  block:     TrainingBlock,
): Promise<AdvisorResult> {
  const key = profile.geminiApiKey?.trim();
  if (!key) return fallback(generated.coachNote);

  try {
    const result = await Promise.race([
      runAdvisor(key, generated, profile, block),
      timeout(15000),
    ]);
    console.info(
      `[advisor] ${result.assessment} — ${result.modifications.length} modification(s) emitted`,
      result.modifications.map((m) => `${m.type}${m.target ? `:${m.target}` : ''}`),
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[advisor] review failed — falling back to engine output:', msg);
    return fallback(generated.coachNote);
  }
}

/**
 * Apply advisor modifications to a generated session.
 * Returns a new session with coachNote and exercises updated.
 * COMPETITION exercises are never removed regardless of advisor instructions.
 *
 * When `profile` is provided, RPE and rep changes on COMPETITION exercises
 * trigger a load recompute (`prescribeLoad(max, rpe, reps)`). Without it,
 * the prescribed weight stays at the engine's original value even after an
 * advisor RPE adjustment — so "ramp loads back" memory cues had no teeth.
 */
export function applyAdvisorModifications(
  generated: GeneratedSession,
  result:    AdvisorResult,
  profile?:  AthleteProfile,
): GeneratedSession {
  let exercises = generated.exercises.map((e) => ({ ...e }));

  /** Recompute load for a COMPETITION exercise after RPE/reps changed. */
  const recomputeLoad = (ex: GeneratedExercise) => {
    if (!profile || ex.exerciseType !== 'COMPETITION') return;
    const max = getMaxForLift(profile, liftAnchorForExercise(ex, generated.primaryLift));
    if (max > 0) {
      ex.estimatedLoadKg = roundLoad(prescribeLoad(max, ex.rpeTarget, ex.reps));
    }
  };

  for (const mod of result.modifications) {
    switch (mod.type) {
      case 'ADJUST_SETS': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) exercises[idx].sets = mod.value;
        break;
      }
      case 'ADJUST_REPS': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) {
          exercises[idx].reps = mod.value;
          recomputeLoad(exercises[idx]);
        }
        break;
      }
      case 'ADJUST_RPE': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) {
          exercises[idx].rpeTarget = mod.value;
          recomputeLoad(exercises[idx]);
        }
        break;
      }
      case 'ADJUST_LOAD': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) exercises[idx].estimatedLoadKg = mod.value;
        break;
      }
      case 'ADD_NOTE': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1) {
          const existing = exercises[idx].notes ? `${exercises[idx].notes}; ` : '';
          exercises[idx].notes = `${existing}${mod.reason}`;
        }
        break;
      }
      case 'REMOVE_EXERCISE': {
        exercises = exercises.filter(
          (e) => e.name !== mod.target || e.exerciseType === 'COMPETITION',
        );
        break;
      }
      case 'ADD_EXERCISE': {
        if (mod.name) {
          const newEx: GeneratedExercise = {
            name:            mod.name,
            exerciseType:    'ACCESSORY',
            setStructure:    'STRAIGHT',
            sets:            mod.sets ?? 3,
            reps:            mod.reps ?? 10,
            rpeTarget:       mod.rpe  ?? 7,
            estimatedLoadKg: 0,
            order:           exercises.length + 1,
            notes:           mod.reason,
          };
          exercises.push(newEx);
        }
        break;
      }
      case 'REPLACE_EXERCISE': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.name && exercises[idx].exerciseType !== 'COMPETITION') {
          exercises[idx].name = mod.name;
        }
        break;
      }
    }
  }

  // Re-number order after any removals/additions.
  exercises = exercises.map((e, i) => ({ ...e, order: i + 1 }));

  return {
    ...generated,
    coachNote: result.coachNote,
    exercises,
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function fallback(coachNote: string): AdvisorResult {
  return {
    coachNote,
    modifications: [],
    assessment:    'APPROVED',
    rationale:     'Fallback — AI advisor skipped (no key, timeout, or parse error).',
  };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('advisor timeout')), ms),
  );
}

async function runAdvisor(
  apiKey:    string,
  generated: GeneratedSession,
  profile:   AthleteProfile,
  block:     TrainingBlock,
): Promise<AdvisorResult> {
  const context = await buildAdvisorContext(profile, block, generated);

  const messages = [
    { role: 'system' as const,    content: ADVISOR_SYSTEM_PROMPT },
    { role: 'user'   as const,    content: context },
  ];

  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      maxTokens: 2048,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`advisor HTTP ${res.status}`);

  const reader  = res.body?.getReader();
  const decoder = new TextDecoder();
  let   raw     = '';

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }

  if (raw.startsWith('__ERROR__:')) throw new Error(raw.slice(10));

  // Strip markdown code fences if the model wrapped the JSON.
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const parsed = JSON.parse(jsonStr) as AdvisorResult;
  // Ensure required fields exist with safe defaults.
  return {
    coachNote:     parsed.coachNote     ?? generated.coachNote,
    modifications: parsed.modifications ?? [],
    assessment:    parsed.assessment    ?? 'APPROVED',
    rationale:     parsed.rationale     ?? '',
  };
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildAdvisorContext(
  profile:   AthleteProfile,
  block:     TrainingBlock,
  generated: GeneratedSession,
): Promise<string> {
  const dateStr = today();
  const sections: string[] = [];

  // ── 1. Athlete snapshot ──────────────────────────────────────────────────
  const total = profile.maxSquat + profile.maxBench + profile.maxDeadlift;
  const disciplines = profile.disciplines ?? ['POWERLIFTING'];
  const primaryDisc = profile.primaryDiscipline ?? disciplines[0];
  const hasStreetLift = disciplines.some((d) => d === 'STREET_LIFT' || d === 'CALISTHENICS' || d === 'HYBRID');

  const streetLiftLines: string[] = [];
  if (hasStreetLift) {
    const pullMax = profile.maxWeightedPullUp;
    const dipMax  = profile.maxWeightedDip;
    const muMax   = profile.maxWeightedMuscleUp;
    if (pullMax !== undefined) streetLiftLines.push(`Weighted pull-up max: +${pullMax} kg`);
    if (dipMax  !== undefined) streetLiftLines.push(`Weighted dip max: +${dipMax} kg`);
    if (muMax   !== undefined) streetLiftLines.push(`Weighted muscle-up max: +${muMax} kg`);
    if (streetLiftLines.length === 0) streetLiftLines.push('Street lift maxes not yet logged — use bodyweight fraction for load estimates');
  }

  const goalLine = [
    profile.trainingGoal,
    profile.trainingGoalTarget ? `"${profile.trainingGoalTarget}"` : '',
    profile.trainingGoalDeadline ? `by ${profile.trainingGoalDeadline}` : '',
  ].filter(Boolean).join(' — ');

  const skillGoals = profile.calisthenicsGoals?.length
    ? `Skill goals: ${profile.calisthenicsGoals.join(', ')}`
    : '';

  const secondaryDisciplines = disciplines.filter((d) => d !== primaryDisc);

  sections.push(`# ATHLETE
Name: ${profile.name || 'Athlete'}
Powerlifting maxes: S${profile.maxSquat} / B${profile.maxBench} / D${profile.maxDeadlift} (total: ${total} kg)
Gym PRs: S${profile.gymSquat ?? profile.maxSquat} / B${profile.gymBench ?? profile.maxBench} / D${profile.gymDeadlift ?? profile.maxDeadlift}${streetLiftLines.length ? `\nStreet lift: ${streetLiftLines.join('  |  ')}` : ''}
Bodyweight: ${profile.weightKg} kg  |  Target class: ${profile.targetWeightClass} kg
Federation: ${profile.federation}  |  Equipment: ${profile.equipment}
Training age: ${profile.trainingAgeMonths ? `${(profile.trainingAgeMonths / 12).toFixed(1)} years` : 'unknown'}
Phenotype: bottleneck=${profile.bottleneck}, responder=${profile.responder}, overshooter=${profile.overshooter ? 'YES' : 'no'}
Reward system: ${profile.rewardSystem}`);

  // ── 1b. Goals tab snapshot (primary + any secondary objectives) ──────────
  const goalLines: string[] = [];
  goalLines.push(`Primary discipline: ${primaryDisc}`);
  if (secondaryDisciplines.length > 0) {
    goalLines.push(`Secondary disciplines (the athlete actively pursues these — include relevant work when feasible): ${secondaryDisciplines.join(', ')}`);
  }
  if (goalLine) goalLines.push(`Primary goal: ${goalLine}`);
  if (skillGoals) goalLines.push(skillGoals);
  sections.push(`# GOALS\n${goalLines.join('\n')}`);

  // ── 2. Full program map (all blocks in active cycle) ─────────────────────
  const cycle = await db.cycles.filter((c) => c.status === 'ACTIVE').first();
  let programMap = '';
  if (cycle) {
    const allBlocks = await db.blocks
      .where('cycleId').equals(cycle.id)
      .sortBy('weekStart');

    const blockLines = allBlocks.map((b) => {
      const isCurrent = b.id === block.id;
      const weekInBlock = cycle.currentWeek - b.weekStart + 1;
      const totalWeeks  = b.weekEnd - b.weekStart + 1;
      return `  ${isCurrent ? '▶' : ' '} ${b.blockType} (weeks ${b.weekStart}–${b.weekEnd}, ${totalWeeks}w) | vol×${b.volumeTarget} | int${Math.round(b.intensityTarget * 100)}%${isCurrent ? ` ← CURRENT (week ${weekInBlock}/${totalWeeks})` : ''}`;
    });
    programMap = `Cycle: ${cycle.totalWeeks} weeks total, currently week ${cycle.currentWeek}\n${blockLines.join('\n')}`;

    // Upcoming meet
    const meet = await db.meets.filter((m) => m.status === 'UPCOMING').first();
    if (meet) {
      const daysLeft = Math.ceil((new Date(meet.date).getTime() - Date.now()) / 86_400_000);
      programMap += `\nUpcoming meet: "${meet.name}" in ${daysLeft} days (${meet.federation}, ${meet.weightClass} kg)`;
    }
  }
  if (programMap) {
    sections.push(`# PROGRAM MAP\n${programMap}`);
  }

  // ── 2b. Athlete memories (durable facts persisted from coach chat) ───────
  // Bias retrieval toward memories tagged with this session's lift / block so
  // lift-specific notes (e.g. "ramp deadlift back gradually") surface first.
  const memoryQuery = [
    generated.primaryLift,
    ...(generated.secondaryLifts ?? []),
    block.blockType,
    generated.sessionType,
  ].join(' ').toLowerCase();
  const memorySection = await buildMemorySection(memoryQuery, 2000);
  if (memorySection) {
    sections.push(`# ATHLETE MEMORIES
Durable facts the coach has persisted from prior conversations. Treat them as standing instructions unless current readiness or recent training data clearly overrides them.
${memorySection}`);
  }

  // ── 3. Readiness (today + 14-day trend) ──────────────────────────────────
  const [todayReadiness, recentReadiness] = await Promise.all([
    db.readiness.where('date').equals(dateStr).first(),
    db.readiness.orderBy('date').reverse().limit(14).toArray(),
  ]);

  const rdLines: string[] = [];
  if (todayReadiness) {
    const parts = [`Score: ${todayReadiness.readinessScore}/100`];
    if (todayReadiness.sleepHours)  parts.push(`sleep ${todayReadiness.sleepHours}h (quality ${todayReadiness.sleepQuality}/5)`);
    if (todayReadiness.energy)      parts.push(`energy ${todayReadiness.energy}/5`);
    if (todayReadiness.motivation)  parts.push(`motivation ${todayReadiness.motivation}/5`);
    if (todayReadiness.soreness)    parts.push(`soreness ${todayReadiness.soreness}/5`);
    if (todayReadiness.stress)      parts.push(`stress ${todayReadiness.stress}/5`);
    if (todayReadiness.hrv)         parts.push(`HRV ${todayReadiness.hrv}ms (${todayReadiness.hrvDeviation !== undefined ? `${todayReadiness.hrvDeviation > 0 ? '+' : ''}${todayReadiness.hrvDeviation.toFixed(1)}% vs 7d avg` : 'no baseline'})`);
    if (todayReadiness.note)        parts.push(`note: "${todayReadiness.note}"`);
    rdLines.push(`Today: ${parts.join(' | ')}`);
  } else {
    rdLines.push('Today: no check-in recorded');
  }

  if (recentReadiness.length >= 3) {
    const scores = recentReadiness.map((r) => r.readinessScore);
    const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const trend  = scores[0] > scores[scores.length - 1] ? '↑ improving' : scores[0] < scores[scores.length - 1] ? '↓ declining' : '→ stable';
    rdLines.push(`14-day avg: ${avg}/100  |  trend: ${trend}`);
    rdLines.push(`Scores (newest first): [${scores.join(', ')}]`);
  }
  sections.push(`# READINESS\n${rdLines.join('\n')}`);

  // ── 4. Recent training (last 21 sessions) ────────────────────────────────
  const recentSessions = await db.sessions
    .filter((s) => s.status === 'COMPLETED')
    .toArray();
  const last21 = recentSessions
    .sort((a, b) => (b.scheduledDate).localeCompare(a.scheduledDate))
    .slice(0, 21);

  if (last21.length > 0) {
    const summaries = await Promise.all(
      last21.map(async (s) => {
        const sets = await db.sets
          .where('sessionId').equals(s.id)
          .filter((sl) => sl.rpeLogged !== undefined)
          .toArray();
        const avgRpe  = sets.length > 0
          ? (sets.reduce((a, sl) => a + (sl.rpeLogged ?? 0), 0) / sets.length).toFixed(1)
          : '—';
        const totalVol = sets.reduce((sum, sl) => sum + sl.loadKg * sl.reps, 0);
        const volStr   = totalVol > 0 ? `${Math.round(totalVol / 1000 * 10) / 10}t` : '—';
        return `  ${s.scheduledDate} | ${s.primaryLift.padEnd(9)} | ${s.sessionType.padEnd(14)} | RPE avg ${avgRpe} | vol ${volStr} | ${sets.length} sets`;
      }),
    );
    sections.push(`# RECENT TRAINING (last ${last21.length} sessions)\n${summaries.join('\n')}`);
  }

  // ── 5. Current week's sessions so far ────────────────────────────────────
  if (cycle) {
    const monday = mondayOf(dateStr);
    const weekSessions = await db.sessions
      .where('cycleId').equals(cycle.id)
      .filter((s) => s.scheduledDate >= monday && s.scheduledDate < dateStr)
      .sortBy('scheduledDate');

    if (weekSessions.length > 0) {
      const lines = weekSessions.map(
        (s) => `  ${s.scheduledDate} | ${s.primaryLift} | ${s.status}`,
      );
      sections.push(`# THIS WEEK SO FAR (${monday} → today)\n${lines.join('\n')}`);
    }
  }

  // ── 6. Session to review ─────────────────────────────────────────────────
  const exLines = generated.exercises.map(
    (e) => `  ${e.order}. ${e.name} (${e.exerciseType}): ${e.sets}×${e.reps} @ RPE ${e.rpeTarget}, ~${e.estimatedLoadKg} kg${e.notes ? `\n     Note: ${e.notes}` : ''}`,
  );
  const modLines = generated.modifications.length > 0
    ? `Engine modifications applied:\n${generated.modifications.map((m) => `  - ${m}`).join('\n')}`
    : 'No engine modifications.';

  sections.push(`# SESSION TO REVIEW
Date: ${dateStr}
Type: ${generated.sessionType}
Primary lift: ${generated.primaryLift}${generated.secondaryLifts?.length ? ` | Secondary: ${generated.secondaryLifts.join(', ')}` : ''}
Engine coach note: "${generated.coachNote}"

Exercises:
${exLines.join('\n')}

${modLines}`);

  // ── 7. Coaching knowledge (full base — we have token headroom) ───────────
  sections.push(`# COACHING KNOWLEDGE BASE\n${getFullKnowledge()}`);

  // ── 8. Output schema ──────────────────────────────────────────────────────
  sections.push(`# YOUR TASK
Reason about the draft above from the Framework and the knowledge base — not from the engine's choices. Ask:

- Does the session honour today's readiness state and the current block's primary purpose?
- Are the Non-Negotiables present (horizontal push, a pull, ≥2 patterns, primary > accessories)?
- Does the recent log reveal anything the draft missed — a weak point, fatigue accumulation, an undertrained pattern, an overshoot signal, a stall?
- Does the pairing of primary + secondary lifts serve this week's needs?
- **Do any ATHLETE MEMORIES conflict with the engine's prescribed loads, sets, or exercises?** A memory that says "returning from layoff, keep loads at 80%" or "reintroductory week, RPE cap 7.5" or "joint flare-up, drop bench volume" is a direct instruction to reshape the session — not advisory.
- What single thing should the athlete hold in mind for this session?

If a memory or readiness state calls for changes to the engine's draft, EMIT MODIFICATIONS — do not return APPROVED. APPROVED is only correct when the engine's draft already honours every memory and constraint. When in doubt, modify; the athlete's history overrides the engine's defaults every time.

Reshape the session to whatever good programming actually calls for. The number of modifications is whatever the principles require — make them all.

Respond ONLY with valid JSON — no markdown fences, no prose outside the object:

{
  "coachNote": "<1-2 sentence note for the athlete — direct, specific, motivating>",
  "modifications": [
    {
      "type": "ADJUST_SETS | ADJUST_REPS | ADJUST_RPE | ADJUST_LOAD | ADD_EXERCISE | REMOVE_EXERCISE | ADD_NOTE | REPLACE_EXERCISE",
      "target": "<exact exercise name from the list above, or omit for ADD_EXERCISE>",
      "value": <number — for ADJUST_SETS / ADJUST_REPS / ADJUST_RPE: the new value; for ADJUST_LOAD: the new prescribed weight in kg. Omit if not applicable.>,
      "name": "<new exercise name for ADD_EXERCISE / REPLACE_EXERCISE>",
      "sets": <number, for ADD_EXERCISE>,
      "reps": <number, for ADD_EXERCISE>,
      "rpe": <number, for ADD_EXERCISE>,
      "reason": "<one sentence explaining why>"
    }
  ],
  "assessment": "APPROVED | TWEAKED | REDUCED | REBUILT",
  "rationale": "<2-4 sentences of internal reasoning — not shown to athlete>"
}`);

  return sections.join('\n\n');
}

function mondayOf(dateStr: string): string {
  const d   = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── System prompt ─────────────────────────────────────────────────────────────

const ADVISOR_SYSTEM_PROMPT = `You are an elite strength coach AI. You operate from the Lockedin Coaching Intelligence Framework and the wider knowledge base — a synthesised body of principles drawn from evidence-based powerlifting, streetlifting, and calisthenics methodology. Reason from those principles. Synthesise across them; do not quote individual coaches by name.

Your job is to take a training session that the rule-based engine has produced and decide what to do with it. The engine produces a DRAFT from simple heuristics — treat it as a starting point, not a baseline to defer to. The Framework's principles override the engine's defaults. If the principles call for structural changes, make them.

Run the Coach's First Questions before deciding:
1. State — what does today's readiness say?
2. Goal & time horizon — what does the program arc need this session to accomplish?
3. History — does the recent log point to overshoot, undershoot, fatigue accumulation, or a stalled lift?
4. What does the body need that the engine isn't asking for?
5. What is the ONE primary purpose of this session, and does the draft protect it?

Then check the Non-Negotiables — horizontal push every session (or noted absent), a pull every session, ≥2 patterns, primary > accessories in stimulus, no loading of painful joints. If any are violated, fix them.

The athlete's GOALS section and ATHLETE MEMORIES section are standing context the engine cannot see. Secondary disciplines (street lift, calisthenics, etc.), skill goals, free-text goal targets, and persisted memories from prior coach conversations are all part of the program — when there is room and readiness allows, include work that serves them. A "powerlifting primary, street-lift secondary" athlete should see street-lift work surface in their accessory slots, not just powerlifting accessories. Memories override engine defaults: if a memory says the athlete is returning from layoff, ramp loads back; if it says they want streetlifts integrated, integrate them.

When a memory or readiness signal calls for lighter weights (layoff return, reintroductory week, joint flare-up), use ADJUST_LOAD directly with a kg value that reflects the cut — do not rely on RPE/rep changes alone to lower load. Compute the target weight from the athlete's max (e.g. "drop bench to 80% of 170 kg" → ADJUST_LOAD value 135). RPE and rep adjustments still apply load math, but ADJUST_LOAD is the unambiguous lever when you know the target weight.

Hard invariants (only these — everything else is judgment):
- Never remove a COMPETITION exercise.
- Never pair heavy squat + heavy deadlift at full intensity in the same session.

Everything else is yours to shape. The number of modifications is whatever the principles require — a one-line tweak, a few targeted swaps, or a full restructure. Do what good programming actually calls for. Do not artificially limit the scope of your changes; do not artificially defer to the engine.

Your coach note goes directly to the athlete. Make it count: specific, grounded in their data, no fluff.`;
