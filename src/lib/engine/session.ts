/**
 * session.ts — Generate a single training session from profile + block + readiness.
 * Pure function: no DB calls, no side effects, no LLM — all rule-based.
 */

import type {
  AthleteProfile,
  TrainingBlock,
  BlockType,
  Bottleneck,
  Lift,
  ExerciseType,
  SetStructure,
  SessionType,
  RewardSystem,
  Injury,
  ArcPriority,
  InjuryMovementPattern,
} from '@/lib/db/types';
import {
  prescribeLoad,
  roundLoad,
  quantizeRpe,
  readinessToVolumeMultiplier,
  readinessToRpeOffset,
  blockToSets,
  bottleneckToReps,
  responderMultiplier,
  overshooterRpeAdjust,
} from './calc';
import { selectAccessories } from './accessory-selector';
import {
  complaintsForRegion,
  pickTopRemedies,
  type RemedialExercise,
} from '@/lib/exercises/remedial-library';

// ── Public Interfaces ──────────────────────────────────────────────────────────

/** Per-lift weekly / historical signal used by the adaptive selector. */
export interface LiftExposure {
  lift: Lift;
  /** Days since this lift was the *primary* of a completed session. Infinity if never. */
  daysSince: number;
  /** Count of completed sessions this ISO week where this lift was primary. */
  weekCount: number;
  /**
   * Days since this lift appeared in ANY completed session — as either the
   * primary lift OR an entry in `secondaryLifts`. Always ≤ `daysSince`. The
   * structural role of today's session (PRIMARY/SECONDARY/TERTIARY/...) is
   * determined by primary appearances only (`weekCount`); this field is the
   * separate FATIGUE signal that catches "bench-as-secondary yesterday +
   * bench-primary today" situations the role tier would otherwise miss.
   * Optional for backwards compatibility — defaults to `daysSince`.
   */
  daysSinceAny?: number;
  /**
   * Count of completed sessions this ISO week where this lift was a
   * SECONDARY lift (in `secondaryLifts`, not `primaryLift`). Optional —
   * defaults to 0. Surfaced to the coach so it can read total weekly
   * exposure, not just primary-day count.
   */
  secondaryCount?: number;
}

export interface SessionInput {
  profile: AthleteProfile;
  block: TrainingBlock;
  weekDayOfWeek: number;     // 0 = Sun … 6 = Sat (for future use / day-specific logic)
  readinessScore: number;    // 0–100 composite
  sessionNumber: number;     // which session this week (1-based)
  overshootHistory?: number; // avg RPE overshoot in last 5 sessions (positive = over)
  weekWithinBlock?: number;  // 1-based week index within the current block (for taper logic)
  /**
   * Recent per-lift exposure signal. When provided, `generateSession` uses an
   * adaptive scorer that picks the most-due lift(s) for today instead of the
   * fixed S/B/D rotation. Omit to fall back to the sessionNumber rotation
   * (primarily for test fixtures + cold-start sessions).
   */
  recentLiftExposures?: LiftExposure[];
  /**
   * @deprecated No longer used — all competition-lift sessions now include
   * all three lifts by default (Sheiko methodology). Kept for API compatibility.
   */
  sbdToday?: boolean;
  /**
   * Override both rotation and adaptive selection to force a specific primary
   * lift. Used by the session review engine when it swaps today's primary
   * (e.g. bench drought). Secondary is auto-picked via `pickSecondary`.
   */
  forcePrimary?: Lift;
  /**
   * When true, include all three competition lifts in a single session
   * (S→B→D rehearsal). Primary gets full block volume; the other two comp
   * lifts each get 3 submaximal working sets. `forcePrimary` determines which
   * lift is primary; omit to let the adaptive selector decide.
   *
   * Use sparingly — full SBD is a rehearsal format best deployed once every
   * 3–4 weeks, not as an everyday session.
   */
  forceSBD?: boolean;
  /**
   * Athlete's explicit secondary-comp choice from check-in:
   *   'AUTO'      — let the engine pick (default; equivalent to undefined)
   *   'NONE'      — primary lift only, no secondary comp work
   *   'SQUAT' | 'BENCH' | 'DEADLIFT' — pin this lift as the secondary
   * Ignored when `forceSBD` is true (SBD always has two secondaries).
   * Falls through to the auto-pick when the request is invalid (e.g. pinning
   * the same lift as the primary).
   */
  preferredSecondary?: 'AUTO' | 'NONE' | 'SQUAT' | 'BENCH' | 'DEADLIFT';
  /**
   * v8: active injuries the generator should prep-load around. When present,
   * 1-3 dosed remedial exercises (drawn from the remedial library, keyed by
   * the injuries' anatomical regions) get prepended to the session so the
   * athlete warms up the cranky joint BEFORE touching the main lift. Sets +
   * reps + holdSeconds + tempo come straight from the remedial library so
   * the prescription stays evidence-grounded.
   *
   * Caller passes the same activeInjuries list it gives to the swap engine
   * (see SwapContext.activeInjuries) — getting both wires consistent.
   */
  activeInjuries?: Injury[];
  /**
   * Active arc's ordered priorities. When omitted, the engine defaults to
   * the legacy powerlifting rotation (SBD primaries, OHP/RDL for UPPER/
   * LOWER). When present, the primary-lift selector and comp movement
   * resolver shift to honour the arc:
   *   • COMPETITION or STRENGTH_BARBELL dominant → SBD rotation (unchanged).
   *   • STRENGTH_CALISTHENICS ranks above STRENGTH_BARBELL → UPPER/LOWER
   *     alternation, with UPPER mapped to Weighted Pull-Up and LOWER to
   *     Pistol Squat.
   *   • INJURY_HEALING / MOBILITY dominant with no strength priority in
   *     the top two → UPPER/LOWER alternation (light, calisthenics-mapped).
   * Active injuries can also veto a primary lift whose movement pattern is
   * contraindicated; the next-best lift is chosen instead.
   */
  arcPriorities?: ArcPriority[];
}

export interface GeneratedExercise {
  name: string;
  exerciseType: ExerciseType;
  setStructure: SetStructure;
  sets: number;
  reps: number;
  rpeTarget: number;
  estimatedLoadKg: number;
  order: number;
  notes?: string;
  /** Stable library exercise id for swap suggestions. undefined = no library entry. */
  libraryExerciseId?: string;
  /**
   * Eccentric-pause-concentric tempo pattern (e.g. "3-1-0" — 3s down, 1s
   * pause, normal drive). Only set for explicit tempo variations. When set
   * the session UI renders a chip so the athlete respects the tempo.
   */
  tempo?: string;
}

export interface GeneratedSession {
  sessionType: SessionType;
  primaryLift: Lift;
  /**
   * Additional comp lifts selected for today. Empty for a conventional
   * single-lift session; populated when readiness + exposure history warrant
   * a two-lift or full-SBD day.
   */
  secondaryLifts?: Lift[];
  exercises: GeneratedExercise[];
  modifications: string[];   // human-readable list of any changes applied
  coachNote: string;         // 1-2 sentence rule-based coaching cue
}

/** Constraints the generator/abbreviator must satisfy. */
export interface SessionBudget {
  /** Hard ceiling on estimated minutes for the entire session. */
  maxMinutes?: number;
  /** If present, only exercises whose libraryExerciseId is in this list stay. */
  allowedEquipment?: string[];
  /** Coarse movement-pattern allow-list (future use). */
  allowedPatterns?: string[];
  /** When true, strip exercises that load the spine axially (deadlifts, squats) — e.g. back-pain day. */
  excludedSpinalLoad?: boolean;
}

// ── Main Generator ─────────────────────────────────────────────────────────────

export function generateSession(input: SessionInput): GeneratedSession {
  const { profile, block, readinessScore, sessionNumber } = input;

  // ── 1. Determine primary lift(s) ───────────────────────────────────────────
  const weekInBlockVal     = input.weekWithinBlock ?? 1;
  const totalBlockWeeksVal = block.weekEnd - block.weekStart + 1;

  // Resolve the athlete's secondary-comp preference into a concrete override.
  // `forceSBD` wins (full-SBD rehearsals require two secondaries by definition).
  const applySecondaryPreference = (primary: Lift, autoPick: Lift[]): Lift[] => {
    if (input.forceSBD) return autoPick;
    const pref = input.preferredSecondary;
    if (!pref || pref === 'AUTO') return autoPick;
    if (pref === 'NONE') return [];
    // Pinning a specific lift — only honor if it's a comp lift different
    // from the primary; otherwise fall through to the auto pick.
    if (pref === primary) return autoPick;
    if (primary !== 'SQUAT' && primary !== 'BENCH' && primary !== 'DEADLIFT') return autoPick;
    if (block.blockType === 'REALIZATION' || block.blockType === 'DELOAD') return [];
    return [pref];
  };

  // v8: arc-aware rotation. Cali- or rehab-dominant arcs short-circuit the
  // SBD selectors and rotate UPPER/LOWER instead. forcePrimary still wins
  // (athlete explicitly picked a lift at check-in), and a meet's COMPETITION
  // priority routes back to the standard SBD path. injuryBlocksLift then
  // vetoes any candidate whose movement pattern is contraindicated.
  const arcMode = resolveArcMode(input.arcPriorities);

  const selection = (() => {
    const tryDemote = (primary: Lift, fallback: Lift): Lift =>
      injuryBlocksLift(primary, input.activeInjuries, arcMode, sessionNumber)
        ? fallback
        : primary;

    // Resolve primary via forcePrimary → arc-aware → adaptive → cold-start.
    const resolvePrimary = (): Lift => {
      if (input.forcePrimary) return input.forcePrimary;
      if (arcMode !== 'BARBELL') {
        return selectArcPrimary(sessionNumber, arcMode, input.activeInjuries);
      }
      if (input.recentLiftExposures && input.recentLiftExposures.length > 0) {
        return selectAdaptivePrimary({
          exposures:       input.recentLiftExposures,
          profile,
          readinessScore,
          blockType:       block.blockType,
          weekInBlock:     weekInBlockVal,
          totalBlockWeeks: totalBlockWeeksVal,
          activeInjuries:  input.activeInjuries,
        }).primary;
      }
      return tryDemote(
        selectPrimaryLift(sessionNumber, profile.weeklyFrequency),
        'BENCH',
      );
    };

    if (input.forceSBD && block.blockType !== 'DELOAD' && block.blockType !== 'REALIZATION') {
      // Full SBD rehearsal: primary gets block volume, the other two each get
      // 3 submaximal working sets. Order enforced S→B→D later.
      const primary = resolvePrimary();
      const secondary = (['SQUAT', 'BENCH', 'DEADLIFT'] as Lift[]).filter((l) => l !== primary);
      return { primary, secondary };
    }

    if (input.forcePrimary) {
      const auto = pickSecondary(
        input.forcePrimary, input.recentLiftExposures, profile,
        readinessScore, block.blockType, weekInBlockVal, totalBlockWeeksVal,
      );
      return {
        primary:   input.forcePrimary,
        secondary: applySecondaryPreference(input.forcePrimary, auto),
      };
    }

    // Non-barbell arc: no SBD secondary stacking — calisthenics/rehab days
    // run a single primary plus accessories.
    if (arcMode !== 'BARBELL') {
      return { primary: resolvePrimary(), secondary: [] as Lift[] };
    }

    if (input.recentLiftExposures && input.recentLiftExposures.length > 0) {
      const adaptive = selectAdaptivePrimary({
        exposures:       input.recentLiftExposures,
        profile,
        readinessScore,
        blockType:       block.blockType,
        weekInBlock:     weekInBlockVal,
        totalBlockWeeks: totalBlockWeeksVal,
        activeInjuries:  input.activeInjuries,
      });
      return {
        primary:   adaptive.primary,
        secondary: applySecondaryPreference(adaptive.primary, adaptive.secondary),
      };
    }

    const primary = tryDemote(
      selectPrimaryLift(sessionNumber, profile.weeklyFrequency),
      'BENCH',
    );
    const auto = pickSecondary(
      primary, [], profile, readinessScore, block.blockType,
      weekInBlockVal, totalBlockWeeksVal,
    );
    return {
      primary,
      secondary: applySecondaryPreference(primary, auto),
    };
  })();
  const primaryLift = selection.primary;
  const secondaryLifts = selection.secondary;

  // ── 2. Session type from block ─────────────────────────────────────────────
  const sessionType = blockTypeToSessionType(block.blockType);

  // ── 3. Readiness & overshoot adjustments ──────────────────────────────────
  const volMult          = readinessToVolumeMultiplier(readinessScore);
  const rpeReadOffset    = readinessToRpeOffset(readinessScore);
  const rpeHistoryOffset = computeOvershootOffset(input.overshootHistory);
  const totalRpeOffset   = rpeReadOffset + rpeHistoryOffset;

  const modifications: string[] = [];
  if (volMult < 1.0) {
    modifications.push(
      `Volume reduced to ${Math.round(volMult * 100)}% — readiness score: ${readinessScore}.`,
    );
  }
  if (rpeReadOffset < 0) {
    modifications.push(
      `RPE targets reduced by ${Math.abs(rpeReadOffset)} — readiness score: ${readinessScore}.`,
    );
  }
  if (rpeHistoryOffset < 0) {
    modifications.push(
      `RPE reduced by ${Math.abs(rpeHistoryOffset).toFixed(1)} to correct recent overshoot pattern.`,
    );
  }

  // ── 4. Build exercises ─────────────────────────────────────────────────────
  const isDupRepeat = detectDupRepeat(sessionNumber, profile.weeklyFrequency);
  // appearanceIndex = the role this session plays for the primary lift this
  // week (1=PRIMARY, 2=SECONDARY, 3=TERTIARY, 4+=QUATERNARY). Drives the
  // multi-frequency RPE / reps / sets adjustments inside buildPrimaryExercises.
  // When exposures are available we use them as the source of truth; otherwise
  // fall back to the binary DUP signal (= 2 if repeat, else 1) so cold-start
  // sessions and test fixtures get the same behaviour they always have.
  const primaryExposure = input.recentLiftExposures?.find((e) => e.lift === primaryLift);
  const appearanceIndex = primaryExposure
    ? Math.max(1, primaryExposure.weekCount + 1)
    : (isDupRepeat ? 2 : 1);
  // Full SBD (3 comp lifts) already fills the session — skip variation + accessories.
  // A regular 2-lift session (primary + one secondary) still gets variation + accessories.
  const sbdDay = secondaryLifts.length >= 2;
  const exercises = buildSessionExercises(
    profile, block, primaryLift, volMult, totalRpeOffset, weekInBlockVal, isDupRepeat,
    sessionNumber, sbdDay, secondaryLifts.length === 1, appearanceIndex,
    arcMode,
  );

  // SBD day: rebuild all exercises in competition order (S→B→D) so the
  // session matches how the lifts appear on the platform. Primary gets the
  // reduced-volume block from buildPrimaryExercises; secondaries each get 3
  // working sets via buildSecondaryCompExercises.
  if (secondaryLifts.length > 0) {
    const totalBlockWeeks = totalBlockWeeksVal;

    const liftMap = new Map<Lift, GeneratedExercise[]>();
    liftMap.set(primaryLift, [...exercises]);
    for (const lift of secondaryLifts) {
      liftMap.set(
        lift,
        buildSecondaryCompExercises(profile, block.blockType, lift, totalRpeOffset, weekInBlockVal, totalBlockWeeks),
      );
    }

    // Enforce S→B→D competition order regardless of which lift was primary.
    exercises.length = 0;
    for (const lift of ['SQUAT', 'BENCH', 'DEADLIFT'] as Lift[]) {
      const exs = liftMap.get(lift);
      if (exs) exercises.push(...exs);
    }
    exercises.forEach((e, i) => { e.order = i + 1; });

    const isFull = secondaryLifts.length === 2;
    modifications.push(
      isFull
        ? `Full SBD rehearsal (S→B→D): ${primaryLift} primary at block volume, ${secondaryLifts.join(' + ')} at 3 working sets each.`
        : `Session includes ${primaryLift} primary + ${secondaryLifts[0]} secondary (3 working sets) in competition order.`,
    );
  }

  // ── 5. v8 — Prepend remedial prep for active injuries ──────────────────────
  // The athlete sees these FIRST in the session so the cranky joint warms up
  // before the main lift loads it. Dosed off the remedial library (evidence-
  // graded, complaint-keyed); injuries with higher severity drive the pick
  // order, capped at 3 prep exercises so the session doesn't bloat.
  if (input.activeInjuries && input.activeInjuries.length > 0) {
    const prep = buildRemedialPrep(input.activeInjuries);
    if (prep.length > 0) {
      exercises.unshift(...prep);
      exercises.forEach((e, i) => { e.order = i + 1; });
      modifications.push(
        `Prepped ${prep.length} rehab movement${prep.length === 1 ? '' : 's'} ` +
        `for ${input.activeInjuries.slice(0, 2).map((i) => i.label).join(', ')}` +
        `${input.activeInjuries.length > 2 ? ` (+${input.activeInjuries.length - 2})` : ''}.`,
      );
    }
  }

  // ── 5b. Arc-aware length cap ──────────────────────────────────────────────
  // After prep + comp + variation + accessories are all in the list, sessions
  // can balloon past 10 exercises — especially when injuries add 3-5 prep
  // rows on top of a barbell-style accessory load. Trim from the END of the
  // accessory tail (the selector already ranks low-priority last) until total
  // is under the arc-mode ceiling. Prep, comp, and variation are protected.
  const cap = sessionExerciseCap(arcMode);
  const trimmed = trimToCap(exercises, cap);
  if (trimmed > 0) {
    modifications.push(
      `Trimmed ${trimmed} accessor${trimmed === 1 ? 'y' : 'ies'} to keep the session under ${cap} exercises.`,
    );
    exercises.forEach((e, i) => { e.order = i + 1; });
  }

  // ── 6. Coach note ──────────────────────────────────────────────────────────
  const coachNote = buildCoachNote(readinessScore, block.blockType);

  return { sessionType, primaryLift, secondaryLifts: secondaryLifts.length > 0 ? secondaryLifts : undefined, exercises, modifications, coachNote };
}

// ── Remedial prep (v8) ────────────────────────────────────────────────────────

const MAX_REMEDIAL_PREP = 5;

/**
 * Translate active injuries into a small set of GeneratedExercise prep rows.
 *
 * Allocation philosophy — "physio that wants you strong af":
 *   - Every active injury gets at least ONE remedy (its single highest-
 *     evidence pick). A sev-2 niggle is still a niggle.
 *   - Severity ≥ 3 gets TWO remedies — they warrant more attention.
 *   - Solo injuries get a bonus slot ("breathing room") since there's no
 *     other injury competing for session time.
 *   - Total prep capped at MAX_REMEDIAL_PREP (5). If the sum of wants
 *     overflows, we shave wants from lowest-severity injuries first BUT
 *     never below 1 — the "no injury gets ignored" invariant holds.
 *   - Per-injury picks draw from THAT injury's region complaints, so a
 *     shoulder injury never crowds out a knee injury's slot. Dedupe
 *     across the final list (a remedy hitting multiple complaints still
 *     only counts once and counts toward both injuries' allocations).
 */
function buildRemedialPrep(injuries: readonly Injury[]): GeneratedExercise[] {
  const active = injuries.filter((i) => i.status !== 'RESOLVED');
  if (active.length === 0) return [];

  // Higher severity goes first; within ties newer activity precedes.
  const ordered = [...active].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  // ── Allocate per-injury "want" counts ────────────────────────────────
  const allocations = ordered.map((injury) => ({
    injury,
    want: injury.severity >= 3 ? 2 : 1,
  }));

  // Solo injury → +1 breathing room.
  if (allocations.length === 1) allocations[0].want += 1;

  // Cap total at MAX_REMEDIAL_PREP. Shave from lowest-severity injuries
  // first, but never below 1 (every injury keeps at least one remedy).
  let total = allocations.reduce((sum, a) => sum + a.want, 0);
  while (total > MAX_REMEDIAL_PREP) {
    const droppable = [...allocations].reverse().find((a) => a.want > 1);
    if (!droppable) break;
    droppable.want -= 1;
    total -= 1;
  }

  // ── Pick remedies per injury, dedup across the whole list ────────────
  const picked: RemedialExercise[] = [];
  const seenIds = new Set<string>();

  for (const { injury, want } of allocations) {
    if (picked.length >= MAX_REMEDIAL_PREP) break;

    // Collect this injury's region complaints (dedup across its own regions).
    const injuryComplaints = new Set<ReturnType<typeof complaintsForRegion>[number]>();
    for (const region of injury.regions) {
      for (const c of complaintsForRegion(region)) {
        injuryComplaints.add(c);
      }
    }
    if (injuryComplaints.size === 0) continue;

    // Pull this injury's top picks from its own pool. Ask for an oversized
    // buffer so duplicates already-in-picked don't starve us.
    const buffer = pickTopRemedies([...injuryComplaints], want + picked.length);

    let added = 0;
    for (const rem of buffer) {
      if (added >= want) break;
      if (picked.length >= MAX_REMEDIAL_PREP) break;
      if (seenIds.has(rem.id)) {
        // Already prepped (probably by a higher-severity injury whose
        // complaints overlap). Count it as satisfying this injury's slot too
        // — no need to add a duplicate exercise.
        added += 1;
        continue;
      }
      seenIds.add(rem.id);
      picked.push(rem);
      added += 1;
    }
  }

  return picked.map((rem, i) => remedyToExercise(rem, i + 1));
}

/**
 * GeneratedExercise shape so the session UI renders these alongside the comp
 * work. The mapping is mechanism-aware:
 *
 *   HEAVY_SLOW    → RPE 7  — these are real loaded sets (4×8 tempo etc.).
 *   ECCENTRIC     → RPE 7  — controlled lengthening under load.
 *   STRENGTHEN    → RPE 6.5 — working sets, not pump work.
 *   ISOMETRIC     → RPE 5  — analgesic / motor-control holds.
 *   ACTIVATE      → RPE 5  — wake-up drills, not loading.
 *   STABILIZE     → RPE 5  — McGill-style endurance.
 *   MOBILIZE/STRETCH/NEURAL_GLIDE → RPE 4 — not loading at all.
 *
 * estimatedLoadKg stays 0 — for HSR / eccentric work, the athlete picks the
 * load that gets them to the target RPE on the prescribed tempo. The session
 * logger captures actual load so progression happens organically over time
 * (same as bodyweight accessories elsewhere in the engine). The progression
 * criterion from the library entry rides along in `notes` so the athlete
 * sees when to level up.
 *
 * Type tag: HEAVY_SLOW / ECCENTRIC / STRENGTHEN map to ExerciseType
 * `'VARIATION'` so they read as real training work in the UI; lighter
 * mechanisms map to `'ACCESSORY'`.
 */
function remedyToExercise(rem: RemedialExercise, order: number): GeneratedExercise {
  const loadable =
    rem.mechanism === 'HEAVY_SLOW' ||
    rem.mechanism === 'ECCENTRIC' ||
    rem.mechanism === 'STRENGTHEN';

  const rpeByMechanism: Record<typeof rem.mechanism, number> = {
    HEAVY_SLOW:    7,
    ECCENTRIC:     7,
    STRENGTHEN:    6.5,
    ISOMETRIC:     5,
    ACTIVATE:      5,
    STABILIZE:     5,
    MOBILIZE:      4,
    STRETCH:       4,
    NEURAL_GLIDE:  4,
  };
  const rpeTarget = quantizeRpe(rpeByMechanism[rem.mechanism]);

  const reps = rem.dosing.reps && rem.dosing.reps > 0
    ? rem.dosing.reps
    : Math.max(1, Math.round((rem.dosing.holdSeconds ?? 30) / 10));

  // Build the notes line: lead with rehab tag + first cue, then surface the
  // load hint (HSR cues often include "Load = ~70 % of your 8RM …") and the
  // progression criterion so the athlete sees the path forward.
  const firstCue = rem.cues[0] ?? '';
  const loadHint = rem.cues.find((c) => /load|kg|%|rm/i.test(c)) ?? '';
  const tag = loadable ? 'Rehab + loading' : 'Rehab prep';
  const noteParts = [
    `${tag} — ${firstCue}`,
    loadHint && loadHint !== firstCue ? loadHint : '',
    `Progress: ${rem.dosing.progressionCriteria}`,
  ].filter(Boolean);
  const notes = noteParts.join(' · ').slice(0, 280);

  return {
    name: rem.name,
    exerciseType: loadable ? 'VARIATION' : 'ACCESSORY',
    setStructure: 'STRAIGHT',
    sets: rem.dosing.sets,
    reps,
    rpeTarget,
    estimatedLoadKg: 0,
    order,
    notes,
    tempo: rem.dosing.tempo,
  };
}

// ── SBD Secondary Helpers ─────────────────────────────────────────────────────

/**
 * Returns exactly one secondary competition lift for the session.
 * Returns [] for REALIZATION, DELOAD, or non-comp primaries.
 *
 * Hard pairing rules (knowledge base: "Never heavy squat + heavy deadlift
 * the same day outside of an SBD rehearsal once every 3–4 weeks"):
 *   SQUAT primary    → BENCH secondary (always)
 *   DEADLIFT primary → BENCH secondary (always)
 *   BENCH primary    → adaptive pick from SQUAT or DEADLIFT only
 *
 * Bench achieves its 3-4×/week total through primaries (1-2×) + secondaries
 * (1-2× as secondary on every SQ/DL day). WEEKLY_TARGET for bench is set
 * lower (1.5) to reflect that only primary sessions are tracked in weekCount.
 */
function pickSecondary(
  primary: Lift,
  exposures: LiftExposure[] | undefined,
  profile: AthleteProfile,
  readinessScore: number,
  blockType: BlockType,
  weekInBlock: number,
  totalBlockWeeks: number,
): Lift[] {
  if (blockType === 'REALIZATION' || blockType === 'DELOAD') return [];
  if (primary !== 'SQUAT' && primary !== 'BENCH' && primary !== 'DEADLIFT') return [];

  // SQUAT or DEADLIFT primary always pairs with BENCH.
  if (primary === 'SQUAT' || primary === 'DEADLIFT') return ['BENCH'];

  // BENCH primary: pick the most-due of SQUAT or DEADLIFT.
  if (exposures && exposures.length > 0) {
    const scored = scoreAdaptiveLifts({
      exposures, profile, readinessScore, blockType, weekInBlock, totalBlockWeeks,
    });
    const pick = scored.find((s) => s.lift === 'SQUAT' || s.lift === 'DEADLIFT');
    return pick ? [pick.lift] : ['SQUAT'];
  }
  // Cold start when bench is primary: default SQUAT secondary.
  return ['SQUAT'];
}

/**
 * Return the expected secondary lift for a given primary without running the
 * full engine. Used by the check-in page to show a pairing preview before the
 * athlete submits. When bench is primary and exposures are available, picks
 * whichever of SQUAT/DEADLIFT is more overdue.
 */
export function getExpectedSecondary(
  primary: 'SQUAT' | 'BENCH' | 'DEADLIFT',
  exposures?: LiftExposure[],
): 'SQUAT' | 'BENCH' | 'DEADLIFT' {
  if (primary === 'SQUAT' || primary === 'DEADLIFT') return 'BENCH';
  // BENCH primary: whichever of SQ/DL has more daysSince
  if (exposures && exposures.length > 0) {
    const sq = exposures.find((e) => e.lift === 'SQUAT')?.daysSince ?? Infinity;
    const dl = exposures.find((e) => e.lift === 'DEADLIFT')?.daysSince ?? Infinity;
    return sq >= dl ? 'SQUAT' : 'DEADLIFT';
  }
  return 'SQUAT';
}

/**
 * Suggest the most-due primary lift for today's session. Uses
 * frequency-weighted scoring (dueness + weekly-target gap) so that bench,
 * whose total frequency comes partly from secondaries, isn't over-suggested
 * as primary when the athlete is due for a big leg or pull day.
 */
export function suggestPrimaryLift(
  exposures: LiftExposure[],
): 'SQUAT' | 'BENCH' | 'DEADLIFT' | null {
  if (exposures.length === 0) return null;
  const compLifts: Array<'SQUAT' | 'BENCH' | 'DEADLIFT'> = ['SQUAT', 'BENCH', 'DEADLIFT'];
  let best: 'SQUAT' | 'BENCH' | 'DEADLIFT' | null = null;
  let bestScore = -Infinity;
  for (const lift of compLifts) {
    const exp = exposures.find((e) => e.lift === lift);
    const daysSince = exp?.daysSince ?? 14;
    const weekCount = exp?.weekCount ?? 0;
    const target    = WEEKLY_TARGET[lift];
    const dueness   = Math.min(daysSince, 10) / 10;
    const gap       = Math.max(0, Math.min(1, (target - weekCount) / target));
    const score     = 0.6 * dueness + 0.4 * gap;
    if (score > bestScore) { bestScore = score; best = lift; }
  }
  return best;
}

// ── Primary Lift Rotation ──────────────────────────────────────────────────────

/**
 * Assign primary lift by session number within the week.
 *
 *   3-day (or fewer): S1=Squat  S2=Bench      S3=Deadlift
 *   4-day:            S1=Squat  S2=Bench      S3=Deadlift  S4=Bench (lighter)
 *   5-day:            S1=Squat  S2=Bench      S3=Deadlift  S4=Upper S5=Squat (variation)
 *   6-day:            S1=Squat  S2=Bench      S3=Deadlift  S4=Upper S5=Squat  S6=Deadlift (variation)
 */
function selectPrimaryLift(sessionNumber: number, weeklyFrequency: number): Lift {
  const freq = Math.min(6, Math.max(1, weeklyFrequency));
  const idx  = (sessionNumber - 1) % freq;

  const rotations: Record<number, Lift[]> = {
    1: ['SQUAT'],
    2: ['SQUAT', 'BENCH'],
    3: ['SQUAT', 'BENCH', 'DEADLIFT'],
    4: ['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH'],
    5: ['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'SQUAT'],
    6: ['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'SQUAT', 'DEADLIFT'],
  };

  return rotations[freq][idx];
}

// ── Arc-Aware Primary-Lift Selector ───────────────────────────────────────────

/**
 * Which "shape" the active arc imposes on session generation:
 *   • BARBELL       — legacy default: SBD rotation, OHP/RDL for UPPER/LOWER.
 *   • CALISTHENICS  — STRENGTH_CALISTHENICS ranks above STRENGTH_BARBELL in
 *                     priorities. Primary lift alternates UPPER (weighted
 *                     pull-up) and LOWER (pistol squat); no SBD secondaries.
 *   • REHAB         — INJURY_HEALING or MOBILITY dominant with no strength
 *                     priority in the top two. Same UPPER/LOWER alternation
 *                     as CALISTHENICS — accessories carry the session, comp
 *                     lifts stay off the menu.
 */
export type ArcMode = 'BARBELL' | 'CALISTHENICS' | 'REHAB';

export function resolveArcMode(priorities?: ArcPriority[]): ArcMode {
  if (!priorities || priorities.length === 0) return 'BARBELL';

  // COMPETITION anywhere in the top three keeps us on the powerlifting rails
  // — meet prep needs SBD specificity regardless of secondary priorities.
  if (priorities.slice(0, 3).includes('COMPETITION')) return 'BARBELL';

  const barbellIdx = priorities.indexOf('STRENGTH_BARBELL');
  const caliIdx    = priorities.indexOf('STRENGTH_CALISTHENICS');
  const hasCali    = caliIdx !== -1;
  const hasBarbell = barbellIdx !== -1;

  // Whichever strength expression ranks first wins. STRENGTH_BARBELL first
  // (or only) → BARBELL; STRENGTH_CALISTHENICS first → CALISTHENICS.
  if (hasCali && (!hasBarbell || caliIdx < barbellIdx)) return 'CALISTHENICS';
  if (hasBarbell) return 'BARBELL';

  // No explicit strength priority in the list — INJURY_HEALING or MOBILITY
  // in the top two routes to REHAB; everything else defaults to BARBELL so
  // unknown arc shapes still produce a usable session.
  const top2 = priorities.slice(0, 2);
  if (top2.includes('INJURY_HEALING') || top2.includes('MOBILITY')) return 'REHAB';
  return 'BARBELL';
}

/**
 * UPPER/LOWER rotation for non-barbell arcs. Demotes off any lift whose
 * movement pattern is contraindicated by an active injury; if both UPPER
 * and LOWER are blocked, falls through to FULL (low-intensity full-body).
 */
function selectArcPrimary(
  sessionNumber: number,
  arcMode: ArcMode,
  activeInjuries?: Injury[],
): Lift {
  const candidates: Lift[] = sessionNumber % 2 === 1
    ? ['UPPER', 'LOWER', 'FULL']
    : ['LOWER', 'UPPER', 'FULL'];
  for (const lift of candidates) {
    if (!injuryBlocksLift(lift, activeInjuries, arcMode, sessionNumber)) return lift;
  }
  // Everything contraindicated — fall back to FULL anyway so the session
  // generator still produces output. The remedial prep + accessory selector
  // will fill in something the athlete can actually do.
  return 'FULL';
}

// ── Arc-Aware Session Length Cap ──────────────────────────────────────────────

/**
 * Total-exercises ceiling per arc mode. Tuned so a remedial-prep-heavy
 * session (3 prep + 1 comp + 1 variation + accessories) doesn't blow past
 * a reasonable training window:
 *
 *   BARBELL       → 8  — comp + variation + 4-5 accessories; powerlifting
 *                       sessions earn the higher count.
 *   CALISTHENICS  → 7  — pull-up / pistol primary doesn't need a variation,
 *                       so the budget leaves room for 4-5 accessories.
 *   REHAB         → 6  — prep is the point; accessories stay minimal.
 *
 * Not currently arc-constraint-aware (LIMITED_TIME etc.) — abbreviateSession
 * still handles explicit minute budgets downstream.
 */
function sessionExerciseCap(arcMode: ArcMode): number {
  switch (arcMode) {
    case 'BARBELL':       return 8;
    case 'CALISTHENICS':  return 7;
    case 'REHAB':         return 6;
  }
}

/**
 * In-place trim the lowest-priority ACCESSORY exercises off the end of the
 * list until total is at or under `cap`. Competition, variation, and
 * remedial-prep rows are protected — they never get dropped.
 *
 * Returns the number of exercises removed (for the caller to surface in
 * `modifications`).
 */
function trimToCap(exercises: GeneratedExercise[], cap: number): number {
  if (exercises.length <= cap) return 0;
  let removed = 0;
  // Walk from the end; only accessories are eligible. Stop when we hit the
  // cap or we run out of accessories (everything else is structural).
  for (let i = exercises.length - 1; i >= 0 && exercises.length > cap; i--) {
    if (exercises[i].exerciseType === 'ACCESSORY') {
      exercises.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

// ── Injury → Primary-Lift Vetoes ──────────────────────────────────────────────

/**
 * Map a primary-lift label to the movement pattern an injury could veto.
 * Returns null when the lift is intentionally non-specific (e.g. FULL) so
 * the caller treats it as "no movement-pattern conflict possible."
 */
function liftToPattern(lift: Lift, arcMode: ArcMode): InjuryMovementPattern | null {
  if (arcMode !== 'BARBELL') {
    if (lift === 'UPPER') return 'VERTICAL_PULL'; // weighted pull-up
    if (lift === 'LOWER') return 'SINGLE_LEG';    // pistol squat
  }
  switch (lift) {
    case 'SQUAT':    return 'SQUAT';
    case 'DEADLIFT': return 'HINGE';
    case 'BENCH':    return 'HORIZONTAL_PUSH';
    case 'UPPER':    return 'VERTICAL_PUSH';      // OHP
    case 'LOWER':    return 'HINGE';              // RDL
    case 'FULL':     return null;                 // no single pattern
  }
}

function injuryBlocksLift(
  lift: Lift,
  injuries: Injury[] | undefined,
  arcMode: ArcMode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sessionNumber: number,
): boolean {
  if (!injuries || injuries.length === 0) return false;
  const pattern = liftToPattern(lift, arcMode);
  if (!pattern) return false;
  for (const inj of injuries) {
    if (inj.status === 'RESOLVED') continue;
    if (inj.contraindicatedPatterns.includes(pattern)) return true;
  }
  return false;
}

// ── Adaptive Primary-Lift Selector ────────────────────────────────────────────

/**
 * Weekly PRIMARY-session targets per elite-coach consensus.
 *
 * These count only sessions where the lift is the primary focus. Secondary
 * appearances (bench on every squat/DL day) are not tracked in weekCount,
 * so bench's total frequency (3-4x) comes from primaries (1-2x) + secondaries
 * (1-2x from the pairing rules). Setting bench's primary target lower prevents
 * the adaptive selector from making bench primary every single day.
 *
 *   Squat     — 2 primary sessions/week
 *   Bench     — 1.5 primary sessions/week (rest of its frequency comes as secondary)
 *   Deadlift  — 2 primary sessions/week
 */
const WEEKLY_TARGET: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
  SQUAT:    2.0,
  BENCH:    1.5,
  DEADLIFT: 2.0,
};

/**
 * Systemic load of each lift — used to down-rank high-fatigue lifts when
 * readiness is low. Higher = more taxing.
 */
const SYSTEMIC_LOAD: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
  SQUAT:    7,
  BENCH:    4,
  DEADLIFT: 9,
};

interface AdaptiveInput {
  exposures: LiftExposure[];
  profile: AthleteProfile;
  readinessScore: number;
  /** Active injuries used to veto contraindicated primary picks. */
  activeInjuries?: Injury[];
  blockType: BlockType;
  weekInBlock: number;
  totalBlockWeeks: number;
}

interface AdaptiveOutput {
  primary: Lift;
  secondary: Lift[];
}

/**
 * Score each of SQUAT / BENCH / DEADLIFT and pick the most "due" lift as
 * primary, then apply the same hard pairing rules as pickSecondary so the
 * adaptive path never produces a SQUAT+DEADLIFT same-session combination.
 * REALIZATION (meet week) is the only exception: single-lift focus preserves
 * peaking specificity.
 *
 *   need = 0.30·dueness   // how many days since last exposure
 *        + 0.30·gap       // weekly target minus this-week count
 *        + 0.20·readFit   // readiness match
 *        + 0.20·goalBoost // athlete goal / bottleneck bias
 */
function selectAdaptivePrimary(input: AdaptiveInput): AdaptiveOutput {
  const rawScored = scoreAdaptiveLifts(input);
  // Demote any primary candidate whose movement pattern is contraindicated
  // by an active injury — picking the next-best lift instead of forcing
  // the athlete into a swap on session open.
  const scored = rawScored.map((s) =>
    injuryBlocksLift(s.lift, input.activeInjuries, 'BARBELL', 1)
      ? { ...s, score: -Infinity }
      : s,
  ).sort((a, b) => b.score - a.score);
  const primary = scored[0].lift;

  // REALIZATION: single-lift focus only — meet prep specificity wins.
  if (input.blockType === 'REALIZATION') {
    return { primary, secondary: [] };
  }

  // Hard pairing rules — mirror pickSecondary (never SQ+DL same session).
  let secondary: Lift[];
  if (primary === 'SQUAT' || primary === 'DEADLIFT') {
    secondary = ['BENCH'];
  } else {
    // BENCH primary: most-due of SQUAT or DEADLIFT
    const pick = scored.find((s) => s.lift === 'SQUAT' || s.lift === 'DEADLIFT');
    secondary = pick ? [pick.lift] : ['SQUAT'];
  }
  return { primary, secondary };
}

interface ScoredLift { lift: Lift; score: number; }

function scoreAdaptiveLifts(input: AdaptiveInput): ScoredLift[] {
  const { exposures, readinessScore, profile } = input;
  const byLift = new Map<Lift, LiftExposure>();
  for (const e of exposures) byLift.set(e.lift, e);

  function read(lift: 'SQUAT' | 'BENCH' | 'DEADLIFT'): ScoredLift {
    const exp = byLift.get(lift);
    const daysSince = exp?.daysSince ?? 14;
    const weekCount = exp?.weekCount ?? 0;
    const target    = WEEKLY_TARGET[lift];

    // Dueness: cap influence after ~10 days so a long absence doesn't
    // permanently pin everything to one lift. Normalize to 0–1.
    const dueness = Math.min(daysSince, 10) / 10;
    // Gap: positive when under weekly target, negative when over. Normalize.
    const gap = Math.max(-1, Math.min(1, (target - weekCount) / target));
    // Readiness fit: neutral at good readiness (≥60); only penalise
    // high-systemic lifts when readiness is genuinely low. This prevents
    // the old biased formula from always picking Deadlift at readiness 70.
    const systemicFrac = SYSTEMIC_LOAD[lift] / 10;
    const readFit = readinessScore >= 60
      ? 1.0
      : 1.0 - systemicFrac * (60 - readinessScore) / 60;
    // Goal boost: weight each lift based on the athlete's declared goal,
    // training focus, and bottleneck phenotype so the session plan emerges
    // from what the athlete is actually working toward.
    const goalBoost = computeGoalBoost(lift, profile);

    const score = 0.30 * dueness + 0.30 * gap + 0.20 * readFit + 0.20 * goalBoost;
    return { lift, score };
  }

  const entries: ScoredLift[] = [read('SQUAT'), read('BENCH'), read('DEADLIFT')];
  entries.sort((a, b) => b.score - a.score);
  return entries;
}

/**
 * Compute a 0–1 priority boost for a given lift based on the athlete's
 * declared goal and profile characteristics. Lifts the programmer uses to
 * build sessions from the athlete's actual goal rather than from arbitrary
 * rotation order.
 *
 * Signals used (in priority order):
 *   1. trainingGoalTarget — free-text mention of a specific lift
 *   2. bottleneck — HYPERTROPHY → more bench; NEURAL → lift with biggest gym gap
 *   3. trainingGoal — COMPETITION_PREP equally weights all three; others neutral
 */
function computeGoalBoost(
  lift: 'SQUAT' | 'BENCH' | 'DEADLIFT',
  profile: AthleteProfile,
): number {
  let boost = 0;

  // Explicit goal target: parse free-text for lift mentions.
  const targetText = (profile.trainingGoalTarget ?? '').toLowerCase();
  if (targetText.includes('squat') && lift === 'SQUAT') boost += 0.20;
  if ((targetText.includes('bench') || targetText.includes('press')) && lift === 'BENCH') boost += 0.20;
  if ((targetText.includes('deadlift') || targetText.includes('pull')) && lift === 'DEADLIFT') boost += 0.20;

  // Bottleneck phenotype.
  if (profile.bottleneck === 'HYPERTROPHY' && lift === 'BENCH') {
    // Bench has the best hypertrophy-to-fatigue ratio among the three lifts —
    // more pressing volume builds the triceps/pecs that are almost always the
    // hypertrophy bottleneck for powerlifters.
    boost += 0.15;
  }
  if (profile.bottleneck === 'NEURAL') {
    // Find the lift where the athlete's gym PR significantly exceeds their
    // competition max — that gap signals untapped neural potential; practicing
    // that lift more often reduces it.
    const gymGaps: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
      SQUAT:    (profile.gymSquat    ?? profile.maxSquat)    - profile.maxSquat,
      BENCH:    (profile.gymBench    ?? profile.maxBench)    - profile.maxBench,
      DEADLIFT: (profile.gymDeadlift ?? profile.maxDeadlift) - profile.maxDeadlift,
    };
    const maxGap = Math.max(gymGaps.SQUAT, gymGaps.BENCH, gymGaps.DEADLIFT);
    if (maxGap > 5 && gymGaps[lift] === maxGap) boost += 0.15;
  }

  return Math.min(0.5, boost);
}

// ── Secondary Comp Block Builder ──────────────────────────────────────────────

/**
 * Working-set comp block for a non-primary lift on a full SBD day.
 * Generates straight sets at submaximal intensity — enough to constitute
 * real training stimulus, not a token single. Rep scheme matches the block
 * context so all three lifts feel coherent within the same session.
 *
 *   ACCUMULATION:    3 × 3 @ RPE 7   (moderate load, volume emphasis)
 *   INTENSIFICATION: 3 × 2 @ RPE 7.5 (heavier, lower reps — strength phase)
 *   MAINTENANCE:     3 × 3 @ RPE 7
 *   DELOAD:          skipped          (protect taper)
 *   REALIZATION:     skipped on meet week (protect taper)
 */
function buildSecondaryCompExercises(
  profile: AthleteProfile,
  blockType: BlockType,
  lift: Lift,
  rpeOffset: number,
  weekInBlock: number,
  totalBlockWeeks: number,
): GeneratedExercise[] {
  if (blockType === 'DELOAD') return [];
  if (blockType === 'REALIZATION' && weekInBlock >= totalBlockWeeks) return [];

  const maxKg = getLiftMax(lift, profile);
  const isIntensification = blockType === 'INTENSIFICATION';
  const targetRpe  = quantizeRpe((isIntensification ? 7.5 : 7) + rpeOffset);
  const targetReps = isIntensification ? 2 : 3;
  const targetSets = 3;
  const workLoad   = roundLoad(prescribeLoad(maxKg, targetRpe, targetReps));

  return [
    {
      name:              getCompMovementName(lift),
      exerciseType:      'COMPETITION',
      setStructure:      'STRAIGHT',
      sets:              targetSets,
      reps:              targetReps,
      rpeTarget:         targetRpe,
      estimatedLoadKg:   workLoad,
      order:             0,
      notes:             `Secondary block @RPE ${targetRpe} — submaximal, controlled effort. Focus on technique.`,
      libraryExerciseId: getCompMovementLibraryId(lift),
    },
  ];
}

// ── Session Type Mapping ───────────────────────────────────────────────────────

function blockTypeToSessionType(blockType: BlockType): SessionType {
  const map: Record<BlockType, SessionType> = {
    ACCUMULATION:    'ACCUMULATION',
    INTENSIFICATION: 'TECHNICAL',
    REALIZATION:     'PEAK',
    DELOAD:          'RECOVERY',
    PIVOT:           'ACCUMULATION',
    MAINTENANCE:     'BRIDGE',
    // v8: HEALTH_BASE biases toward TECHNICAL — tempo + ROM work fits
    // technical-quality framing better than ACCUMULATION volume framing.
    HEALTH_BASE:     'TECHNICAL',
  };
  return map[blockType];
}

// ── Exercise Builder ───────────────────────────────────────────────────────────

function buildSessionExercises(
  profile: AthleteProfile,
  block: TrainingBlock,
  primaryLift: Lift,
  volMult: number,
  rpeOffset: number,
  weekWithinBlock = 1,
  isDupRepeat = false,
  sessionNumber = 1,
  sbdDay = false,
  hasSecondary = false,
  appearanceIndex = isDupRepeat ? 2 : 1,
  arcMode: ArcMode = 'BARBELL',
): GeneratedExercise[] {
  const exercises: GeneratedExercise[] = [];
  const reward = profile.rewardSystem;

  const totalBlockWeeks = block.weekEnd - block.weekStart + 1;
  const primaryExercises = buildPrimaryExercises(
    profile, block.blockType, primaryLift, volMult, rpeOffset,
    weekWithinBlock, totalBlockWeeks, isDupRepeat, reward, sbdDay,
    appearanceIndex, arcMode,
  );
  exercises.push(...primaryExercises);

  if (!sbdDay) {
    // Accessories — library-driven, discipline-aware selection. When a secondary
    // comp lift is present the session has more volume, so target 1 fewer accessory.
    if (block.blockType !== 'REALIZATION') {
      const accessories = selectAccessories({
        primaryLift,
        blockType: block.blockType,
        profile,
        existingExercises: exercises,
        volMult,
        rpeOffset,
        sessionNumber,
        reward,
        countOverride: hasSecondary ? -1 : 0,
      });
      exercises.push(...accessories);
    }
  }

  return exercises;
}

// ── Primary Exercise ───────────────────────────────────────────────────────────

function buildPrimaryExercises(
  profile: AthleteProfile,
  blockType: BlockType,
  lift: Lift,
  volMult: number,
  rpeOffset: number,
  weekInBlock = 1,
  totalBlockWeeks = 1,
  isDupRepeat = false,
  reward: RewardSystem = 'CONSISTENCY',
  sbdDay = false,
  appearanceIndex = isDupRepeat ? 2 : 1,
  arcMode: ArcMode = 'BARBELL',
): GeneratedExercise[] {
  const maxKg   = getLiftMax(lift, profile, arcMode);
  const baseRpe = getBaseRpeForBlock(blockType, weekInBlock, totalBlockWeeks);

  // Apply overshooter flag, then readiness/history offset
  const adjustedRpe = quantizeRpe(
    overshooterRpeAdjust(baseRpe, profile.overshooter) + rpeOffset,
  );

  const compName        = getCompMovementName(lift, arcMode);
  const compLibraryId   = getCompMovementLibraryId(lift, arcMode);
  const variation       = selectVariation(lift, profile.bottleneck, blockType, weekInBlock);
  const variationName   = variation?.name ?? null;
  const variationLibId  = variation?.libraryId ?? null;

  // ── REALIZATION (with taper) ──────────────────────────────────────────────
  //   Week 1 of REAL: 3 sets of 2 (full ramp)
  //   Middle weeks:   2 sets of 2 (reduced volume)
  //   Meet week:      1 × 1 @ RPE 7 (openers only)
  if (blockType === 'REALIZATION') {
    const isMeetWeek = totalBlockWeeks > 1 && weekInBlock >= totalBlockWeeks;

    if (isMeetWeek) {
      const openerRpe  = quantizeRpe(7 + rpeOffset);
      const openerLoad = roundLoad(prescribeLoad(maxKg, openerRpe, 1));
      return [
        {
          name:              compName,
          exerciseType:      'COMPETITION',
          setStructure:      'STRAIGHT',
          sets:              1,
          reps:              1,
          rpeTarget:         openerRpe,
          estimatedLoadKg:   openerLoad,
          order:             1,
          notes:             `Opener rehearsal only. Hit ${openerLoad}kg × 1 @RPE ${openerRpe} and call it.`,
          libraryExerciseId: compLibraryId,
        },
      ];
    }

    // Progressive taper: sets decrease through the block
    const sets    = weekInBlock <= 1 ? 3 : 2;
    const topLoad = roundLoad(prescribeLoad(maxKg, adjustedRpe, 1));
    return [
      {
        name:              compName,
        exerciseType:      'COMPETITION',
        setStructure:      'ASCENDING',
        sets,
        reps:              2,
        rpeTarget:         adjustedRpe,
        estimatedLoadKg:   topLoad,
        order:             1,
        notes:             `Build to top single @RPE ${adjustedRpe}. Suggested: ${Math.round(topLoad * 0.85)}kg × 3, ${Math.round(topLoad * 0.93)}kg × 2, ${topLoad}kg × 1.`,
        libraryExerciseId: compLibraryId,
      },
    ];
  }

  // ── DELOAD ─────────────────────────────────────────────────────────────────
  if (blockType === 'DELOAD') {
    const deloadRpe  = quantizeRpe(6 + rpeOffset);
    const deloadLoad = roundLoad(prescribeLoad(maxKg, deloadRpe, 5));
    return [
      {
        name:              compName,
        exerciseType:      'COMPETITION',
        setStructure:      'STRAIGHT',
        sets:              2,
        reps:              5,
        rpeTarget:         deloadRpe,
        estimatedLoadKg:   deloadLoad,
        order:             1,
        notes:             'Deload — move well, keep it comfortable.',
        libraryExerciseId: compLibraryId,
      },
    ];
  }

  // ── ACCUMULATION / INTENSIFICATION / PIVOT / MAINTENANCE ──────────────────
  const baseReps    = getRepsForBlock(blockType, profile.bottleneck);
  const respMult    = responderMultiplier(profile.responder);
  const rawSets     = blockToSets(blockType) * respMult * volMult;
  const baseRawSets = Math.max(1, Math.floor(rawSets));
  // On SBD days the primary takes ~35% fewer sets so the session stays
  // manageable when secondaries each contribute 3 working sets.
  const baseSets = sbdDay
    ? Math.max(2, Math.round(baseRawSets * 0.65))
    : baseRawSets;

  // Week-within-block undulation (Juggernaut / Noriega style). Keeps total
  // work roughly flat while shifting the stimulus from set-heavy → rep-heavy
  // through the block. Only applies to ACCUMULATION; INTENSIFICATION already
  // peaks via RPE ramp + lower set count.
  const undulation = blockType === 'ACCUMULATION'
    ? undulateSetsReps(baseSets, baseReps, weekInBlock, totalBlockWeeks)
    : { sets: baseSets, reps: baseReps };

  // Multi-frequency role per appearance — see MULTI_FREQUENCY_KNOWLEDGE.
  // Per elite practice (Sheiko 3×/wk bench at uniform intensity, Calgary
  // Barbell 4×/wk bench with top sets at 76-82% across days, Westside DE
  // differentiated by INTENT rather than RPE drop) the engine should NOT
  // reflexively drop RPE per appearance. Differentiation comes from
  // VARIATION slot, EMPHASIS rotation, INTENT shift — modelled in the LLM
  // prompts, not the rule engine. The engine still cuts VOLUME and skips
  // top singles on later appearances (well-supported across all sources)
  // but holds RPE near the primary level on the tertiary day.
  //
  //   1  PRIMARY:    full prescription, no adjustment.
  //   2  SECONDARY:  -0.5 RPE, +1 rep — DUP convention (Stanek/Noriega).
  //                  Preserved verbatim so existing fixtures still pass.
  //   3  TERTIARY:   -0.5 RPE, +1 rep, sets capped at 3, top single skipped.
  //                  Volume drop > intensity drop. NOT -1.0 RPE — Calgary +
  //                  Sheiko keep RPE on the third bench day.
  //   4+ QUATERNARY: -1.0 RPE, base reps, sets capped at 2, top single
  //                  skipped. The lower load HERE has elite support
  //                  because Westside DE is a distinct intent (speed work
  //                  at RPE 5-6) — but the LLM prompt is responsible for
  //                  electing speed-vs-skill-accessory; the engine just
  //                  produces a low-cost shape so neither path is wrong.
  const repeatAdj = (() => {
    if (appearanceIndex >= 4) return { rpe: -1.0, rep:  0, setCap: 2 };
    if (appearanceIndex === 3) return { rpe: -0.5, rep:  1, setCap: 3 };
    if (appearanceIndex === 2) return { rpe: -0.5, rep:  1, setCap: Infinity };
    return { rpe: 0, rep: 0, setCap: Infinity };
  })();
  const finalRpe  = quantizeRpe(adjustedRpe + repeatAdj.rpe);
  const finalReps = undulation.reps + repeatAdj.rep;
  const finalSets = Math.min(undulation.sets, repeatAdj.setCap);
  // Tertiary / quaternary appearances skip the heavy-singles top set —
  // well-supported across all sources (Sheiko caps intensity in any
  // session at 90%, Calgary backs off after the top set, Westside DE has
  // no max-effort component). The set cap above carries the volume-cut
  // half of the role; this carries the no-PR half.
  const skipTopSingle = appearanceIndex >= 3;

  const compLoad = roundLoad(prescribeLoad(maxKg, finalRpe, finalReps));

  const result: GeneratedExercise[] = [];

  // HEAVY_SINGLES: in INTENSIFICATION, add a top single before back-off sets
  // to give heavy-singles athletes the neural stimulus they crave.
  // Suppressed on TERTIARY / QUATERNARY appearances — those roles are skill /
  // speed work, not a place for additional max-effort exposure.
  if (reward === 'HEAVY_SINGLES' && blockType === 'INTENSIFICATION' && !skipTopSingle) {
    const topSingleRpe  = quantizeRpe(adjustedRpe + 0.5);
    const topSingleLoad = roundLoad(prescribeLoad(maxKg, topSingleRpe, 1));
    result.push({
      name:              compName,
      exerciseType:      'COMPETITION',
      setStructure:      'ASCENDING',
      sets:              1,
      reps:              1,
      rpeTarget:         topSingleRpe,
      estimatedLoadKg:   topSingleLoad,
      order:             1,
      notes:             `Top single @ RPE ${topSingleRpe} before back-offs.`,
      libraryExerciseId: compLibraryId,
    });
  }

  result.push({
    name:              compName,
    exerciseType:      'COMPETITION',
    setStructure:      'STRAIGHT',
    sets:              finalSets,
    reps:              finalReps,
    rpeTarget:         finalRpe,
    estimatedLoadKg:   compLoad,
    order:             result.length + 1,
    libraryExerciseId: compLibraryId,
  });

  // Variation exercise — runs in ACCUMULATION and INTENSIFICATION.
  // Intensification uses lower reps / fewer sets but keeps the variation
  // (e.g. pin press, block pull) so lockout / position strength keeps
  // developing during the strength phase.
  if (!sbdDay && variation !== null && (blockType === 'ACCUMULATION' || blockType === 'INTENSIFICATION')) {
    const varRpe    = quantizeRpe(adjustedRpe - 0.5);
    const varReps   = blockType === 'INTENSIFICATION'
      ? Math.max(2, baseReps - 1)
      : baseReps + 1;
    const varSets   = blockType === 'INTENSIFICATION'
      ? Math.max(1, Math.floor(2 * volMult))
      : Math.max(1, Math.floor(3 * volMult));
    const varLoad   = roundLoad(prescribeLoad(maxKg * variation.coefficient, varRpe, varReps));

    result.push({
      name:              variation.name,
      exerciseType:      'VARIATION',
      setStructure:      'STRAIGHT',
      sets:              varSets,
      reps:              varReps,
      rpeTarget:         varRpe,
      estimatedLoadKg:   varLoad,
      order:             result.length + 1,
      libraryExerciseId: variation.libraryId,
      ...(variation.tempo ? { tempo: variation.tempo } : {}),
    });
  }

  return result;
}



// ── Coach Note (Rule-Based) ────────────────────────────────────────────────────

function buildCoachNote(readinessScore: number, blockType: BlockType): string {
  // Lowest readiness overrides everything — safety first
  if (readinessScore < 60) {
    return "Your readiness is lower than normal today — I've reduced volume and dialled intensity back. Focus on quality over quantity.";
  }
  // Peak week is its own category
  if (blockType === 'REALIZATION') {
    return 'Peak week. Everything is earned — just execute.';
  }
  // High readiness gets an encouraging push
  if (readinessScore > 85) {
    return "You're in great shape today. Hit the targets as prescribed — this is a quality session.";
  }
  // Standard session
  return 'Stick to the RPE targets. Log everything. See you on the other side.';
}

// ── Lookup Helpers ─────────────────────────────────────────────────────────────

function getLiftMax(lift: Lift, profile: AthleteProfile, arcMode: ArcMode = 'BARBELL'): number {
  if (arcMode !== 'BARBELL') {
    // Calisthenics / rehab arcs: route UPPER/LOWER through cali maxes so
    // load prescription uses *added* weight on pull-ups / dips. Pistols are
    // bodyweight-default (0 added) — athlete can swap to weighted later.
    if (lift === 'UPPER') return profile.maxWeightedPullUp ?? 0;
    if (lift === 'LOWER') return 0;
  }
  switch (lift) {
    case 'SQUAT':     return profile.maxSquat;
    case 'BENCH':     return profile.maxBench;
    case 'DEADLIFT':  return profile.maxDeadlift;
    case 'UPPER':     return profile.maxBench;
    case 'LOWER':     return profile.maxSquat;
    case 'FULL':      return profile.maxDeadlift;
  }
}

function getCompMovementName(lift: Lift, arcMode: ArcMode = 'BARBELL'): string {
  if (arcMode !== 'BARBELL') {
    if (lift === 'UPPER') return 'Weighted Pull-Up';
    if (lift === 'LOWER') return 'Pistol Squat';
  }
  switch (lift) {
    case 'SQUAT':     return 'Competition Back Squat';
    case 'BENCH':     return 'Competition Bench Press';
    case 'DEADLIFT':  return 'Competition Deadlift';
    case 'UPPER':     return 'Overhead Press';
    case 'LOWER':     return 'Romanian Deadlift';
    case 'FULL':      return 'Competition Deadlift';
  }
}

/** Returns the stable library exercise ID for the primary competition lift. */
function getCompMovementLibraryId(lift: Lift, arcMode: ArcMode = 'BARBELL'): string {
  if (arcMode !== 'BARBELL') {
    if (lift === 'UPPER') return 'weighted_pull_up';
    if (lift === 'LOWER') return 'pistol_squat';
  }
  switch (lift) {
    case 'SQUAT':     return 'competition_squat';
    case 'BENCH':     return 'competition_bench_press';
    case 'DEADLIFT':  return 'competition_deadlift';
    case 'UPPER':     return 'overhead_press';
    case 'LOWER':     return 'romanian_deadlift';
    case 'FULL':      return 'competition_deadlift';
  }
}

/** Returns the variation exercise for ACCUMULATION blocks, or null if none. */
/**
 * Undulate sets × reps across an ACCUMULATION block so the athlete doesn't
 * hit the same 5×5 every week. Pattern from Juggernaut / Noriega / Millz —
 * keep total work ~flat while gradually shifting stimulus from set-dominant
 * to rep-dominant as RPE ramps up:
 *
 *   Week 1: baseSets   × baseReps
 *   Week 2: baseSets   × baseReps
 *   Week 3: baseSets-1 × baseReps+1   ← drop a set, add a rep
 *   Week 4: baseSets-2 × baseReps+2
 *
 * Clamps to sane floors (sets ≥ 2, reps ≤ baseReps + 3).
 */
function undulateSetsReps(
  baseSets: number,
  baseReps: number,
  weekInBlock: number,
  totalBlockWeeks: number,
): { sets: number; reps: number } {
  // Short blocks (≤2 weeks) don't undulate — not enough runway.
  if (totalBlockWeeks < 3) return { sets: baseSets, reps: baseReps };

  // Normalise weekInBlock to a 0-indexed "how far through the block" signal.
  const week = Math.max(1, Math.min(weekInBlock, totalBlockWeeks));
  const shift = week <= 2 ? 0 : week === 3 ? 1 : 2;

  const sets = Math.max(2, baseSets - shift);
  const reps = Math.min(baseReps + 3, baseReps + shift);
  return { sets, reps };
}

/**
 * Selects the variation lift for a primary day based on bottleneck phenotype,
 * block type, and a week-within-block rotation so the athlete sees 2 different
 * pause/tempo/pin variants per block rather than the same one every week.
 *
 * Design follows the elite-coach consensus the knowledge base cites:
 *   • Millz + Noriega: pause work is the standard, not peaking-only.
 *   • Tuchscherer: match the variation to the identified weak point.
 *   • Flex: vary weekly to keep SFR high without staleness.
 */
interface VariationChoice {
  name: string;
  libraryId: string;
  /** Fraction of the comp max used to prescribe load. */
  coefficient: number;
  /** Eccentric-pause-concentric tempo, if the variation imposes one. */
  tempo?: string;
}

function selectVariation(
  lift: Lift,
  bottleneck: Bottleneck,
  blockType: BlockType,
  weekInBlock: number,
): VariationChoice | null {
  // REALIZATION + DELOAD don't run a variation — comp lift only.
  if (blockType === 'REALIZATION' || blockType === 'DELOAD') return null;
  if (lift === 'UPPER' || lift === 'LOWER' || lift === 'FULL') return null;

  // Two-slot rotation by parity of weekInBlock. Slot A in odd weeks, slot B in
  // even weeks. Table below is hand-curated per (lift × bottleneck × block).
  const evenWeek = weekInBlock % 2 === 0;

  switch (lift) {
    case 'SQUAT': {
      if (blockType === 'INTENSIFICATION') {
        if (bottleneck === 'NEURAL') {
          return evenWeek ? VARIATIONS.pin_squat : VARIATIONS.pause_squat;
        }
        if (bottleneck === 'HYPERTROPHY') {
          return evenWeek ? VARIATIONS.tempo_squat : VARIATIONS.pause_squat;
        }
        return evenWeek ? VARIATIONS.pause_squat : VARIATIONS.pin_squat;
      }
      // ACCUMULATION (default)
      if (bottleneck === 'HYPERTROPHY') {
        return evenWeek ? VARIATIONS.high_bar_squat : VARIATIONS.pause_squat;
      }
      if (bottleneck === 'NEURAL') {
        return evenWeek ? VARIATIONS.pause_squat : VARIATIONS.pin_squat;
      }
      return evenWeek ? VARIATIONS.pause_squat : VARIATIONS.tempo_squat;
    }
    case 'BENCH': {
      if (blockType === 'INTENSIFICATION') {
        if (bottleneck === 'NEURAL') {
          return evenWeek ? VARIATIONS.pin_press : VARIATIONS.board_press;
        }
        if (bottleneck === 'HYPERTROPHY') {
          return evenWeek ? VARIATIONS.close_grip_bench : VARIATIONS.pause_bench;
        }
        return evenWeek ? VARIATIONS.pause_bench : VARIATIONS.pin_press;
      }
      // ACCUMULATION
      if (bottleneck === 'HYPERTROPHY') {
        return evenWeek ? VARIATIONS.close_grip_bench : VARIATIONS.spoto_press;
      }
      if (bottleneck === 'NEURAL') {
        return evenWeek ? VARIATIONS.dead_bench : VARIATIONS.pause_bench;
      }
      return evenWeek ? VARIATIONS.spoto_press : VARIATIONS.tempo_bench;
    }
    case 'DEADLIFT': {
      if (blockType === 'INTENSIFICATION') {
        if (bottleneck === 'NEURAL') {
          return evenWeek ? VARIATIONS.block_pull : VARIATIONS.pause_deadlift;
        }
        if (bottleneck === 'HYPERTROPHY') {
          return evenWeek ? VARIATIONS.deficit_deadlift : VARIATIONS.pause_deadlift;
        }
        return evenWeek ? VARIATIONS.pause_deadlift : VARIATIONS.block_pull;
      }
      // ACCUMULATION
      if (bottleneck === 'HYPERTROPHY') {
        return evenWeek ? VARIATIONS.deficit_deadlift : VARIATIONS.tempo_deadlift;
      }
      if (bottleneck === 'NEURAL') {
        return evenWeek ? VARIATIONS.block_pull : VARIATIONS.pause_deadlift;
      }
      return evenWeek ? VARIATIONS.deficit_deadlift : VARIATIONS.pause_deadlift;
    }
    default:
      return null;
  }
}

/**
 * Variation library registry. `coefficient` discounts the comp max because
 * the variation is weaker than the competition lift (pause squat ≈ 87% comp,
 * etc.) — prescribeLoad() would otherwise overload the bar.
 */
const VARIATIONS: Record<string, VariationChoice> = {
  // Bench
  pause_bench:        { name: 'Pause Bench Press', libraryId: 'pause_bench_press', coefficient: 0.85 },
  close_grip_bench:   { name: 'Close Grip Bench Press', libraryId: 'close_grip_bench_press', coefficient: 0.88 },
  spoto_press:        { name: 'Spoto Press', libraryId: 'spoto_press', coefficient: 0.85 },
  dead_bench:         { name: 'Dead Bench Press', libraryId: 'dead_bench_press', coefficient: 0.80 },
  pin_press:          { name: 'Pin Press', libraryId: 'pin_press', coefficient: 0.90 },
  board_press:        { name: 'Board Press', libraryId: 'board_press', coefficient: 1.00 },
  tempo_bench:        { name: 'Tempo Bench Press', libraryId: 'tempo_bench_press', coefficient: 0.78, tempo: '3-1-0' },
  // Squat
  pause_squat:        { name: 'Pause Squat', libraryId: 'pause_squat', coefficient: 0.87 },
  high_bar_squat:     { name: 'High-Bar Squat', libraryId: 'high_bar_squat', coefficient: 0.90 },
  pin_squat:          { name: 'Pin Squat', libraryId: 'pin_squat', coefficient: 0.88 },
  tempo_squat:        { name: 'Tempo Squat', libraryId: 'tempo_squat', coefficient: 0.78, tempo: '4-1-0' },
  // Deadlift
  deficit_deadlift:   { name: 'Deficit Deadlift', libraryId: 'deficit_deadlift', coefficient: 0.88 },
  pause_deadlift:     { name: 'Pause Deadlift', libraryId: 'pause_deadlift', coefficient: 0.86 },
  block_pull:         { name: 'Block Pull', libraryId: 'block_pull', coefficient: 1.10 },
  tempo_deadlift:     { name: 'Tempo Deadlift', libraryId: 'tempo_deadlift', coefficient: 0.72, tempo: '3-0-1' },
};

// Legacy shim for callers outside the primary-exercise builder.
function getVariationName(lift: Lift): string | null {
  const v = selectVariation(lift, 'BALANCED', 'ACCUMULATION', 1);
  return v?.name ?? null;
}

/** Returns the stable library exercise ID for the ACCUMULATION variation, or null. */
function getVariationLibraryId(lift: Lift): string | null {
  const v = selectVariation(lift, 'BALANCED', 'ACCUMULATION', 1);
  return v?.libraryId ?? null;
}



/**
 * Base RPE for each block type, with progressive weekly ramp.
 *
 * Within a multi-week block the RPE ramps up by +0.25 per week so that
 * the athlete progressively overloads towards the next block transition.
 *
 * Example — 4-week ACCUMULATION:
 *   Week 1: 7.0, Week 2: 7.25, Week 3: 7.5, Week 4: 7.75
 *
 * The first week starts *below* the old flat value so that by mid-block
 * the athlete is at the familiar intensity, and by the final week they are
 * slightly above — creating a natural within-block overload ramp.
 */
function getBaseRpeForBlock(
  blockType: BlockType,
  weekInBlock = 1,
  totalBlockWeeks = 1,
): number {
  // Target RPE at the midpoint of the block (preserves old behaviour
  // for single-week blocks or when weekInBlock defaults to 1).
  const midRpe: Record<BlockType, number> = {
    ACCUMULATION:    7.5,
    INTENSIFICATION: 8.0,
    REALIZATION:     9.0,
    DELOAD:          6.0,
    PIVOT:           7.0,
    MAINTENANCE:     7.5,
    // v8: HEALTH_BASE keeps RPE under 8 — never grinders.
    HEALTH_BASE:     7.0,
  };
  const mid = midRpe[blockType];

  // No ramp for single-week blocks or deloads
  if (totalBlockWeeks <= 1 || blockType === 'DELOAD') return mid;

  // Ramp ±0.25 per week around the midpoint
  const rampPerWeek = 0.25;
  const midWeek = (totalBlockWeeks + 1) / 2;   // e.g. 2.5 for a 4-week block
  const offset  = (weekInBlock - midWeek) * rampPerWeek;
  return mid + offset;
}

/**
 * Reps per set for the comp movement, adjusted for block context.
 * REALIZATION always uses very low reps regardless of bottleneck.
 */
function getRepsForBlock(
  blockType: BlockType,
  bottleneck: AthleteProfile['bottleneck'],
): number {
  const base = bottleneckToReps(bottleneck);
  switch (blockType) {
    case 'ACCUMULATION':    return base;
    case 'INTENSIFICATION': return Math.max(2, base - 1);
    case 'REALIZATION':     return 1;
    case 'DELOAD':          return 5;
    case 'PIVOT':           return base;
    case 'MAINTENANCE':     return Math.max(3, base - 1);
    // v8: HEALTH_BASE — moderate reps with tempo bias. Pull rep count up so
    // the load can come down without losing total mechanical work.
    case 'HEALTH_BASE':     return Math.max(5, base + 1);
  }
}

/**
 * Reduce prescribed RPE based on recent overshoot pattern. Quantised to 0.5
 * increments — the offset itself respects the RPE scale, so adding it to a
 * half-step base value preserves half-step output.
 */
function computeOvershootOffset(overshootHistory?: number): number {
  if (overshootHistory == null || overshootHistory <= 0) return 0;
  // Each 1-RPE average overshoot → reduce by 0.5 (capped at −1.0). Round to
  // the nearest 0.5 step so partial-RPE histories (e.g. 0.7) snap to a clean
  // -0.5 instead of -0.35.
  const raw = -Math.min(1.0, overshootHistory * 0.5);
  return Math.round(raw * 2) / 2;
}

/**
 * Returns true when this session is a second (or later) appearance of the
 * same lift in the weekly rotation. Used to apply DUP variation: the second
 * squat or deadlift day becomes a volume day (+1 rep, −0.5 RPE) rather than
 * a clone of the intensity day. Informed by Stanek "mini-peaks" and Noriega
 * DUP methodology.
 *
 * Repeat positions (0-indexed in the rotation):
 *   5-day: index 4  (S5 = SQUAT, second appearance)
 *   6-day: index 4  (S5 = SQUAT) and index 5 (S6 = DEADLIFT)
 */
function detectDupRepeat(sessionNumber: number, weeklyFrequency: number): boolean {
  const freq = Math.min(6, Math.max(1, weeklyFrequency));
  const idx  = (sessionNumber - 1) % freq;
  const repeatIndices: Partial<Record<number, number[]>> = {
    5: [4],
    6: [4, 5],
  };
  return (repeatIndices[freq] ?? []).includes(idx);
}

// ── Time estimation & abbreviation ─────────────────────────────────────────────

/**
 * Rough time cost for one working set of an exercise. Includes rest between
 * sets, amortised. Warmups for comp/variation movements are counted via
 * `WARMUP_MINUTES` so single-set top-singles aren't underestimated.
 */
const MINUTES_PER_SET: Record<ExerciseType, number> = {
  COMPETITION: 4.5,
  VARIATION:   3.5,
  ACCESSORY:   2.5,
};

/** One-time warmup cost per comp/variation exercise slot. */
const WARMUP_MINUTES: Partial<Record<ExerciseType, number>> = {
  COMPETITION: 10,
  VARIATION:   4,
};

export function estimateExerciseMinutes(ex: Pick<GeneratedExercise, 'sets' | 'exerciseType'>): number {
  const warmup = WARMUP_MINUTES[ex.exerciseType] ?? 0;
  return warmup + ex.sets * MINUTES_PER_SET[ex.exerciseType];
}

export function estimateSessionMinutes(
  exercises: Array<Pick<GeneratedExercise, 'sets' | 'exerciseType'>>,
): number {
  return exercises.reduce((sum, e) => sum + estimateExerciseMinutes(e), 0);
}

/**
 * Trim a generated session to fit inside `budget.maxMinutes`.
 *
 * Rules:
 *   - Competition lifts are never removed.
 *   - Variation lifts get trimmed (sets) before accessories are touched.
 *   - Accessories drop from the bottom of the order list first (accessory
 *     order reflects priority — lats/triceps pushdowns etc. come last).
 *   - If still over budget after dropping all accessories, accessory sets on
 *     remaining rows are reduced, then variation sets.
 *   - Comp sets reduce only as a last resort and never below 2 (1 for REALIZATION top-single).
 *   - Returns the trimmed session with `modifications` describing what was cut.
 */
export function abbreviateSession(
  session: GeneratedSession,
  budget: SessionBudget,
): GeneratedSession {
  const cap = budget.maxMinutes;
  if (!cap || cap <= 0) return session;

  // Deep-enough copy: exercises are re-created so callers can safely mutate.
  const exercises: GeneratedExercise[] = session.exercises.map((e) => ({ ...e }));
  const modifications: string[] = [...session.modifications];

  const minutes = () => estimateSessionMinutes(exercises);

  if (minutes() <= cap) return session;

  // 1. Reduce accessory sets (bottom-up) until each is at ≥1, while over budget.
  const droppedNames: string[] = [];

  // Pass A: drop accessories from the end until we fit or only comp/variation remain.
  while (minutes() > cap) {
    const lastAccessoryIdx = [...exercises]
      .map((e, i) => ({ e, i }))
      .reverse()
      .find(({ e }) => e.exerciseType === 'ACCESSORY')?.i;
    if (lastAccessoryIdx === undefined) break;
    droppedNames.push(exercises[lastAccessoryIdx].name);
    exercises.splice(lastAccessoryIdx, 1);
  }

  // Pass B: if still over, reduce variation sets to a minimum of 2.
  if (minutes() > cap) {
    for (const e of exercises) {
      if (e.exerciseType !== 'VARIATION') continue;
      while (e.sets > 2 && minutes() > cap) e.sets -= 1;
    }
  }

  // Pass C: last resort — reduce comp sets. Floor at 2 (or 1 for top-single peak sessions).
  if (minutes() > cap) {
    for (const e of exercises) {
      if (e.exerciseType !== 'COMPETITION') continue;
      const floor = e.reps === 1 ? 1 : 2;
      while (e.sets > floor && minutes() > cap) e.sets -= 1;
    }
  }

  // Re-number the order field to stay contiguous after deletions.
  exercises.forEach((e, i) => { e.order = i + 1; });

  if (droppedNames.length > 0) {
    modifications.push(
      `Abbreviated to fit ${cap} min — dropped ${droppedNames.join(', ')}.`,
    );
  } else {
    modifications.push(`Abbreviated to fit ${cap} min — reduced sets to fit budget.`);
  }

  return { ...session, exercises, modifications };
}
