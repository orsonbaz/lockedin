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
import type { GeneratedSession, GeneratedExercise } from '@/lib/engine/session';
import type { AthleteProfile, TrainingBlock } from '@/lib/db/types';

// ── Public API ────────────────────────────────────────────────────────────────

export interface AdvisorModification {
  type:
    | 'ADJUST_SETS'
    | 'ADJUST_REPS'
    | 'ADJUST_RPE'
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
      timeout(8000),
    ]);
    return result;
  } catch {
    return fallback(generated.coachNote);
  }
}

/**
 * Apply advisor modifications to a generated session.
 * Returns a new session with coachNote and exercises updated.
 * COMPETITION exercises are never removed regardless of advisor instructions.
 */
export function applyAdvisorModifications(
  generated: GeneratedSession,
  result:    AdvisorResult,
): GeneratedSession {
  let exercises = generated.exercises.map((e) => ({ ...e }));

  for (const mod of result.modifications) {
    switch (mod.type) {
      case 'ADJUST_SETS': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) exercises[idx].sets = mod.value;
        break;
      }
      case 'ADJUST_REPS': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) exercises[idx].reps = mod.value;
        break;
      }
      case 'ADJUST_RPE': {
        const idx = exercises.findIndex((e) => e.name === mod.target);
        if (idx !== -1 && mod.value !== undefined) exercises[idx].rpeTarget = mod.value;
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
  sections.push(`# ATHLETE
Name: ${profile.name || 'Athlete'}
Maxes: S${profile.maxSquat} / B${profile.maxBench} / D${profile.maxDeadlift} (total: ${total} kg)
Bodyweight: ${profile.weightKg} kg  |  Target class: ${profile.targetWeightClass} kg
Federation: ${profile.federation}  |  Equipment: ${profile.equipment}
Training age: ${profile.trainingAgeMonths ? `${(profile.trainingAgeMonths / 12).toFixed(1)} years` : 'unknown'}
Phenotype: bottleneck=${profile.bottleneck}, responder=${profile.responder}, overshooter=${profile.overshooter ? 'YES' : 'no'}
Reward system: ${profile.rewardSystem}
Goal: ${profile.trainingGoal}${profile.trainingGoalTarget ? ` — "${profile.trainingGoalTarget}"` : ''}${profile.trainingGoalDeadline ? ` by ${profile.trainingGoalDeadline}` : ''}
Disciplines: ${(profile.disciplines ?? []).join(', ') || 'powerlifting'}
Gym PRs: S${profile.gymSquat ?? profile.maxSquat} / B${profile.gymBench ?? profile.maxBench} / D${profile.gymDeadlift ?? profile.maxDeadlift}`);

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
Review the session above. Consider:
1. Does the session fit the block objectives and the athlete's phenotype?
2. Is the volume/intensity appropriate given readiness and recent fatigue?
3. Are there missing exercises the athlete needs (e.g. face pulls on bench days, weak-point work)?
4. Does the pairing of primary + secondary lifts make sense this week?
5. What would you tell the athlete to set the right mindset for this session?

Respond ONLY with valid JSON — no markdown fences, no prose outside the object:

{
  "coachNote": "<1-2 sentence note for the athlete — direct, specific, motivating>",
  "modifications": [
    {
      "type": "ADJUST_SETS | ADJUST_REPS | ADJUST_RPE | ADD_EXERCISE | REMOVE_EXERCISE | ADD_NOTE | REPLACE_EXERCISE",
      "target": "<exact exercise name from the list above, or omit for ADD_EXERCISE>",
      "value": <number, e.g. new sets/reps/RPE — omit if not applicable>,
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

const ADVISOR_SYSTEM_PROMPT = `You are an elite strength coach AI — in the lineage of Mike Tuchscherer (RTS autoregulation), Joe Stanek (bar-speed, daily max), Joey Flex (bench frequency, spinal fatigue management), Marcellus "Millz" Wallace (volume distribution, pause mastery), and Sean Noriega (high-quality low-volume).

Your job is to review a training session that has already been generated by a rule-based engine, then decide whether to approve it or make targeted improvements. You see the athlete's full program arc, recent training history, readiness data, and today's session plan.

You are the brain. The engine gives you a starting point — you make it intelligent.

Rules for modifications:
- Never remove competition lifts (COMPETITION exerciseType).
- Never add more than 3 exercises.
- Prefer adjusting volume/RPE over adding/removing exercises.
- On low-readiness days (score < 65): reduce, don't expand.
- On high-readiness days (score > 85) after a deload: approve or add a little.
- Respect the block type: ACCUMULATION = volume, INTENSIFICATION = quality, REALIZATION = specificity, DELOAD = recovery.
- Face pulls are non-negotiable on bench days — add them if missing.
- Never pair heavy squat + heavy deadlift at full intensity in the same session.
- If the session already looks well-programmed, return an empty modifications array.

Your coach note goes directly to the athlete. Make it count: specific, grounded in their data, no fluff.`;
