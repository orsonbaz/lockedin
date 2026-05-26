/**
 * session-author.ts — LLM-primary session generator.
 *
 * Replaces the "rule engine builds, advisor tweaks" pattern with a single
 * LLM call that authors the session from scratch using the same context
 * bundle the chat coach has access to: profile, goals, athlete memories,
 * knowledge base, readiness, recent training, current block + week.
 *
 * The rule engine's output is passed in as `baseline` and offered to the
 * model as a structural starting point — it is free to discard or
 * restructure.
 *
 * Failure modes (silent fallback to baseline):
 *   - No API key configured
 *   - HTTP / parse / validation error
 *   - Function timeout (60s ceiling, see /api/chat)
 *
 * Non-streaming: this caller buffers and parses the whole response, so
 * /api/chat is invoked with `stream: false` to bypass Vercel's gateway
 * idle-timeout entirely.
 */

import { z } from 'zod';
import { db, today } from '@/lib/db/database';
import { getFullKnowledge } from './knowledge-base';
import { retrieveRelevantMemories } from './memory';
import type { GeneratedSession, GeneratedExercise } from '@/lib/engine/session';
import { quantizeRpe } from '@/lib/engine/calc';
import type { AthleteProfile, TrainingBlock, Lift, SessionType } from '@/lib/db/types';

// ── Public API ────────────────────────────────────────────────────────────────

export interface AuthorInput {
  profile:         AthleteProfile;
  block:           TrainingBlock;
  /** Rule-engine output. Used as a structural hint and as the fallback. */
  baseline:        GeneratedSession;
  /** Composite readiness score for today (0-100). */
  readinessScore:  number;
  /** Athlete's chosen primary lift at check-in, if any. */
  preferredPrimary?: Lift;
  /**
   * Athlete's explicit secondary-comp choice from check-in:
   *   'AUTO'  — let the LLM pick (default)
   *   'NONE'  — primary lift only, no secondary comp work
   *   <lift>  — pin this specific lift as the secondary comp
   * Independent of `preferredPrimary` — both can be specified.
   */
  preferredSecondary?: 'AUTO' | 'NONE' | Lift;
}

export type AuthorFailureReason =
  | 'no-api-key' | 'http-error' | 'parse-error'
  | 'validation-error' | 'timeout' | 'unknown';

export interface AuthorResult {
  /** 'authored' = LLM produced a valid session; 'fallback' = baseline used. */
  source:        'authored' | 'fallback';
  session:       GeneratedSession;
  failureReason?: AuthorFailureReason;
  /** Internal LLM rationale — logged but not shown directly to the athlete. */
  rationale?:    string;
  /** How many athlete memories were available in the author's context. */
  memoryCount:   number;
  /** Detail string useful for diagnostics / toasts. */
  detail?:       string;
}

// ── Output schema ─────────────────────────────────────────────────────────────

const ExerciseTypeEnum = z.enum(['COMPETITION', 'VARIATION', 'ACCESSORY']);
const SetStructureEnum = z.enum(['STRAIGHT', 'ASCENDING', 'DESCENDING']);
const SessionTypeEnum  = z.enum(['ACCUMULATION', 'TECHNICAL', 'BRIDGE', 'PEAK', 'RECOVERY']);
const LiftEnum         = z.enum(['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'LOWER', 'FULL']);

const AuthoredExerciseSchema = z.object({
  name:            z.string().min(1).max(80),
  exerciseType:    ExerciseTypeEnum,
  setStructure:    SetStructureEnum.default('STRAIGHT'),
  sets:            z.number().int().min(1).max(15),
  reps:            z.number().int().min(1).max(50),
  // multipleOf(0.5) rejects 7.3 / 8.1 etc. The LLM occasionally emits these
  // even when the prompt says half-steps; defensive validation here means a
  // bad value triggers the rule-engine fallback rather than leaking into the UI.
  rpeTarget:       z.number().min(5).max(10).multipleOf(0.5),
  estimatedLoadKg: z.number().min(0).max(600),
  notes:           z.string().max(400).optional(),
  tempo:           z.string().max(20).optional(),
});

const AuthoredSessionSchema = z.object({
  sessionType:     SessionTypeEnum,
  primaryLift:     LiftEnum,
  secondaryLifts:  z.array(LiftEnum).max(3).optional(),
  coachNote:       z.string().min(1).max(600),
  exercises:       z.array(AuthoredExerciseSchema).min(1).max(15),
  rationale:       z.string().max(2000).optional(),
});

// ── Main entry point ──────────────────────────────────────────────────────────

export async function authorSessionFromCoach(
  input: AuthorInput,
): Promise<AuthorResult> {
  const key = input.profile.geminiApiKey?.trim();
  if (!key) {
    return fallback(input.baseline, 'no-api-key', 0,
      'No Gemini API key — used rule-engine session.');
  }

  let context: string;
  let memoryCount = 0;
  try {
    const built = await buildAuthorContext(input);
    context = built.context;
    memoryCount = built.memoryCount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[author] context build failed:', msg);
    return fallback(input.baseline, 'unknown', 0, msg);
  }

  try {
    const result = await callAuthor(key, context, input.baseline, memoryCount);
    console.info(
      `[author] authored session — ${result.session.exercises.length} exercises, saw ${memoryCount} memor${memoryCount === 1 ? 'y' : 'ies'}`,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[author] authoring failed — falling back to baseline:', msg);
    const reason: AuthorFailureReason =
      /timeout/i.test(msg)         ? 'timeout'
      : /HTTP \d+/.test(msg)       ? 'http-error'
      : /JSON|parse|validation/i.test(msg) ? 'parse-error'
      :                              'unknown';
    return fallback(input.baseline, reason, memoryCount, msg);
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function fallback(
  baseline:    GeneratedSession,
  reason:      AuthorFailureReason,
  memoryCount: number,
  detail?:     string,
): AuthorResult {
  return {
    source:        'fallback',
    session:       baseline,
    failureReason: reason,
    memoryCount,
    detail,
  };
}

async function callAuthor(
  apiKey:      string,
  context:     string,
  baseline:    GeneratedSession,
  memoryCount: number,
): Promise<AuthorResult> {
  const messages = [
    { role: 'system' as const, content: AUTHOR_SYSTEM_PROMPT },
    { role: 'user'   as const, content: context },
  ];

  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      maxTokens: 4096,
      stream:    false,
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`author HTTP ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
  }

  const payload = await res.json().catch(() => ({})) as { text?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  const raw = payload.text ?? '';

  // Lift the first {…} block out of the response — strip code fences and
  // any incidental prose the model puts around the JSON.
  const stripped  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch (parseErr) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error('[author] JSON parse failed:', parseMsg, '\n  raw:', raw.slice(0, 400));
    throw new Error(`parse-error — model returned non-JSON: "${raw.slice(0, 80).replace(/\s+/g, ' ').trim()}…"`);
  }

  const validated = AuthoredSessionSchema.safeParse(parsedJson);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    throw new Error(`validation-error — ${issue?.path.join('.')}: ${issue?.message}`);
  }
  const v = validated.data;

  // Re-number order to keep persistence happy. Quantise rpeTarget defensively
  // even though Zod multipleOf(0.5) already rejected non-half values — float
  // arithmetic upstream can leave 7.499999... which multipleOf may accept.
  const exercises: GeneratedExercise[] = v.exercises.map((e, i) => ({
    name:            e.name,
    exerciseType:    e.exerciseType,
    setStructure:    e.setStructure,
    sets:            e.sets,
    reps:            e.reps,
    rpeTarget:       quantizeRpe(e.rpeTarget),
    estimatedLoadKg: e.estimatedLoadKg,
    order:           i + 1,
    ...(e.notes ? { notes: e.notes } : {}),
    ...(e.tempo ? { tempo: e.tempo } : {}),
  }));

  const session: GeneratedSession = {
    sessionType:    v.sessionType as SessionType,
    primaryLift:    v.primaryLift,
    ...(v.secondaryLifts && v.secondaryLifts.length > 0
      ? { secondaryLifts: v.secondaryLifts }
      : {}),
    exercises,
    coachNote: v.coachNote,
    // Surface a marker so the UI / diagnostics can see this came from the LLM.
    modifications: [
      ...(baseline.modifications ?? []),
      'Session authored by AI coach with full goal + memory context.',
    ],
  };

  return {
    source:      'authored',
    session,
    rationale:   v.rationale,
    memoryCount,
  };
}

// Context builder lives in a separate file to keep this module readable.
import { buildAuthorContext } from './session-author-context';

// ── System prompt ─────────────────────────────────────────────────────────────

const AUTHOR_SYSTEM_PROMPT = `You are an elite strength coach AI. You operate from the Lockedin Coaching Intelligence Framework and the wider knowledge base — a synthesised body of principles drawn from evidence-based powerlifting, streetlifting, and calisthenics methodology. Reason from those principles. Synthesise across them; do not quote individual coaches by name.

YOUR TASK is to AUTHOR this athlete's session for today — a complete prescription, not a review of someone else's draft.

You will be given:
- The athlete's full profile, current maxes, federation, equipment, training age, phenotype.
- Their GOALS and ACTIVE DISCIPLINES — these are non-negotiable. If the athlete has STREET_LIFT or CALISTHENICS as a primary or secondary discipline, the session MUST contain meaningful work for those movement patterns. If they have skill goals (e.g. "muscle_up", "front_lever"), include skill work when readiness and block phase allow.
- ATHLETE MEMORIES — durable instructions persisted from prior coach conversations. Treat them as standing rules. A memory like "no unilateral work" or "ramp loads back gradually after layoff" or "include weighted pull-ups" is a direct constraint on what you author. You may not produce a session that violates them.
- ACTIVE ARC (when present) — the athlete's current training context (e.g. "Get Healthy", "Back to Powerlifting", "Mobility Rebuild"). Its intent, ordered priorities, deprioritized areas, constraints, and coach directive are the binding frame for this session. The arc IS the frame — every exercise must serve it. Do NOT silently push generic powerlifting when the active arc is "Get Healthy", "Mobility Rebuild", or any other non-competition arc. If a CALISTHENICS-dominant arc is active, the primary lift should be UPPER or LOWER (weighted pull-up, pistol, etc.) — not SBD. Treat barbell and weighted-calisthenics strength as co-equal expressions.
- ACTIVE INJURIES (when present) — structured injury rows with regions, status, severity, constraints, and contraindicated movement patterns. These are hard constraints. Never load a contraindicated pattern. Slot remedial work per REMEDIAL_KNOWLEDGE — heavy-slow-resistance / isometrics for tendon and chronic complaints, NOT static stretching.
- The current TRAINING BLOCK and where today sits within it (volume target, intensity target, weeks remaining).
- Today's READINESS SCORE and recent readiness trend.
- The last 14-21 completed sessions with volume / RPE summaries.
- A BASELINE produced by a deterministic rule engine — offered as a structural starting point. The baseline already encodes the ACTIVE ARC's primary-lift rotation (e.g. UPPER/LOWER on calisthenics arcs), injury vetoes, dosed remedial prep, and the arc-aware length cap. You are FREE to restructure it, but if you replace the baseline's primary lift with an SBD comp lift on a non-COMPETITION arc, you are overriding the arc — only do so with explicit cause from the athlete's check-in preference.

Run the Coach's First Questions before authoring:
1. What does today's readiness say? (volume + intensity modulation)
2. What does the program arc need this session to accomplish?
3. Does the recent log point to overshoot, undershoot, fatigue, or a stalled lift?
4. What disciplines + memories must this session honour?
5. What is the ONE primary purpose of this session, and how will every exercise serve it?

Respect the Non-Negotiables: a horizontal push every session (or note its deliberate absence), a pull every session, ≥2 movement patterns, primary > accessories in stimulus. Never load painful joints flagged in memories. Never pair heavy squat + heavy deadlift at full intensity in the same session.

Respect the discipline mix: if the athlete trains HYBRID or has a secondary discipline, that secondary should appear in accessory slots — not just powerlifting accessories. A primary-powerlifting / secondary-streetlift athlete gets streetlift work (weighted pull-ups, dips, muscle-ups, ring work) layered into the session, not omitted in favour of more powerlifting accessories.

Accessory continuity: progressive overload only happens when the athlete repeats the same accessory long enough to load it. Default to KEEPING the accessories the athlete has been running on this lift's day — same names, same rep ranges, with small load progressions when warranted. Rotate an accessory ONLY when (a) a memory directs you to, (b) the athlete is stalled or hitting it at RPE > target consistently, (c) the block phase changes and the old accessory no longer serves the new aim, or (d) the athlete has run this same accessory >6 weeks and is plateauing. Novelty for novelty's sake is anti-progress. When in doubt, repeat.

LEAN HEAVILY on these knowledge-base modules — they encode the protocols you are responsible for executing:
- STRUCTURE_KNOWLEDGE — your primary reference. Session-shape templates by lift × phase × recency, set/rep structure rules (straight / ascending / top-set+backoff / cluster), microcycle templates, the recent-exposure protocol. Read the PER-LIFT RECENCY block (FRESH / RECOVERED / OVERDUE / STACKED) BEFORE picking session shape: STACKED → cap intensity, no top single; OVERDUE → primary today; FRESH → not the primary; RECOVERED → normal.
- MULTI_FREQUENCY_KNOWLEDGE — read this whenever the PER-LIFT RECENCY block shows the next-appearance role (PRIMARY / SECONDARY / TERTIARY / QUATERNARY). Differentiation between appearances comes from FOUR LEVERS — pick ONE per appearance, do not stack:  L1 VARIATION (pause / pin / deficit), L2 EMPHASIS rotation (which pattern the day prioritises), L3 INTENT shift (Westside-style speed work at maximal bar speed, 50-60 %), L4 VOLUME / intensity modulation. Sheiko 3× bench keeps uniform intensity across all three sessions and differentiates only by volume allocation. Calgary 4× bench keeps top sets at 76-82 % across days and differentiates by emphasis. Stanek 4× bench builds toward a planned peak day, not a load ladder. **Do not reflexively drop RPE per appearance** — that's the amateur error this module corrects. SECONDARY = variation slot at near-primary RPE; TERTIARY = volume cut + emphasis or variation, not auto -1.0 RPE; QUATERNARY = intent shift (speed work at RPE 5-6 by design, OR skill-accessory at RPE 6-7, OR skip). Pick the lever, write the session.
- DIAGNOSTIC_PLAYBOOK_KNOWLEDGE — when recent training shows RPE_CREEP, LOAD_PLATEAU, MISSED_REPS, LIFT_IMBALANCE, or VOLUME_DROP, this maps the failure point to a dosed Rx (e.g. "fail off chest → Spoto press 4×4 @ RPE 7 1×/wk").
- REMEDIAL_KNOWLEDGE — when the athlete has an INJURY memory, slot remedial work into accessory positions per the modern evidence base: tendons get HEAVY SLOW RESISTANCE (3-1-3 tempo, ~70 % 1RM) or isometrics for acute pain, NOT rest or pure stretching; "tight" muscles get strengthened through range BEFORE stretched; McGill Big 3 for back complaints; scapular control work (face pulls, lower trap Y/T/W) for shoulder issues. Do NOT prescribe static stretches as the primary intervention — that is outdated for most complaints.
- FATIGUE_MANAGEMENT_KNOWLEDGE — Stress Index drift, volume-first deload taper, recovery-debt heuristic. If readiness is low or HRV deviation is < −15 % for 3+ days, deload regardless of phase.
- PEAKING_TEMPLATE_KNOWLEDGE — concrete day-by-day taper templates and attempt-selection math when a meet is within 4 weeks.
- RPE_DEEP_KNOWLEDGE — RPE→e1RM mapping, drift signals, calibration-max protocol. Use it when recent RPE data is informing today's load. ALL prescribed rpeTarget values MUST be on the half-step grid (5, 5.5, 6, 6.5, … 10) — fractional values like 7.3 will be rejected.

Output a complete session as a single JSON object — no markdown fences, no prose outside the object:

{
  "sessionType": "ACCUMULATION | TECHNICAL | BRIDGE | PEAK | RECOVERY",
  "primaryLift": "SQUAT | BENCH | DEADLIFT | UPPER | LOWER | FULL",
  "secondaryLifts": ["SQUAT" | "BENCH" | "DEADLIFT", ...] (optional, max 3),
  "coachNote": "1-2 sentence note shown at the top of the session — direct, specific, grounded in their data.",
  "exercises": [
    {
      "name": "Exercise name (free text — match common gym names; the UI doesn't require library IDs).",
      "exerciseType": "COMPETITION | VARIATION | ACCESSORY",
      "setStructure": "STRAIGHT | ASCENDING | DESCENDING",
      "sets": 1-15,
      "reps": 1-50,
      "rpeTarget": 5-10,
      "estimatedLoadKg": 0-600 (use 0 for bodyweight-only; calculate from prescribeLoad-style logic for loaded work),
      "notes": "Optional — a cue, tempo hint, or rationale.",
      "tempo": "Optional — e.g. \\"3-1-0\\" for a tempo variation."
    }
  ],
  "rationale": "Internal walk-through: address each numbered memory in order, justify lift selection, and explain the volume/intensity choice. Not shown to the athlete."
}

The number of exercises is whatever good programming actually calls for — typically 5-9 for a full session, fewer for deload or time-capped days. Include ONE competition-style primary lift first, then secondary comp lifts if appropriate, then variations and accessories that serve the session's purpose. Order matters — the exercise list IS the workout flow.`;
