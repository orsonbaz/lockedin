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
} from '@/lib/db/types';
import {
  prescribeLoad,
  roundLoad,
  readinessToVolumeMultiplier,
  readinessToRpeOffset,
  blockToSets,
  bottleneckToReps,
  responderMultiplier,
  overshooterRpeAdjust,
} from './calc';

// ── Public Interfaces ──────────────────────────────────────────────────────────

/** Per-lift weekly / historical signal used by the adaptive selector. */
export interface LiftExposure {
  lift: Lift;
  /** Days since this lift was the primary of a (any-status) session. Infinity if never. */
  daysSince: number;
  /** Count of sessions this ISO week where this lift was primary. */
  weekCount: number;
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
   * Explicit athlete request to cover all three comp lifts today. When true
   * the selector returns SQUAT primary with BENCH + DEADLIFT as secondary
   * top-singles at reduced volume.
   */
  sbdToday?: boolean;
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
  // Adaptive selector when we have exposure history — otherwise fall back to
  // the fixed S/B/D rotation (cold start + test fixtures).
  const selection = input.recentLiftExposures && input.recentLiftExposures.length > 0
    ? selectAdaptivePrimary({
        exposures:       input.recentLiftExposures,
        readinessScore,
        blockType:       block.blockType,
        weekInBlock:     input.weekWithinBlock ?? 1,
        totalBlockWeeks: block.weekEnd - block.weekStart + 1,
        sbdToday:        input.sbdToday === true,
      })
    : {
        primary: selectPrimaryLift(sessionNumber, profile.weeklyFrequency),
        secondary: [] as Lift[],
      };
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
  const weekInBlock  = input.weekWithinBlock ?? 1;
  const isDupRepeat  = detectDupRepeat(sessionNumber, profile.weeklyFrequency);
  const exercises = buildSessionExercises(
    profile, block, primaryLift, volMult, totalRpeOffset, weekInBlock, isDupRepeat,
    sessionNumber,
  );

  // Secondary comp blocks: low-volume top singles per additional lift. Ordering
  // stays primary → secondaries → accessories (accessories already trailed the
  // primary block when buildSessionExercises ran).
  if (secondaryLifts.length > 0) {
    // Accessory slots start after whatever buildSessionExercises produced;
    // we insert secondary comps just after the primary comp(s) and push
    // accessories down. Simpler: rebuild the order numbers at the end.
    const totalBlockWeeks = block.weekEnd - block.weekStart + 1;
    const secondaryExercises: GeneratedExercise[] = [];
    for (const lift of secondaryLifts) {
      secondaryExercises.push(
        ...buildSecondaryCompExercises(profile, block.blockType, lift, totalRpeOffset, weekInBlock, totalBlockWeeks),
      );
    }

    // Find the index right after the last COMPETITION exercise so secondary
    // comps appear adjacent to the primary.
    let insertAt = 0;
    for (let i = 0; i < exercises.length; i++) {
      if (exercises[i].exerciseType === 'COMPETITION') insertAt = i + 1;
    }
    exercises.splice(insertAt, 0, ...secondaryExercises);
    exercises.forEach((e, i) => { e.order = i + 1; });

    modifications.push(
      `SBD-style day: added top singles for ${secondaryLifts.join(' + ')}.`,
    );
  }

  // ── 5. Coach note ──────────────────────────────────────────────────────────
  const coachNote = buildCoachNote(readinessScore, block.blockType);

  return { sessionType, primaryLift, secondaryLifts: secondaryLifts.length > 0 ? secondaryLifts : undefined, exercises, modifications, coachNote };
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

// ── Adaptive Primary-Lift Selector ────────────────────────────────────────────

/**
 * Weekly exposure targets per elite-coach consensus:
 *   Squat     — 2 to 3 sessions
 *   Bench     — 3 to 4 sessions (higher SFR, lower systemic cost)
 *   Deadlift  — 2 to 3 sessions (highest systemic cost)
 */
const WEEKLY_TARGET: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
  SQUAT:    2.5,
  BENCH:    3.5,
  DEADLIFT: 2.5,
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
  readinessScore: number;
  blockType: BlockType;
  weekInBlock: number;
  totalBlockWeeks: number;
  sbdToday: boolean;
}

interface AdaptiveOutput {
  primary: Lift;
  secondary: Lift[];
}

/**
 * Score each of SQUAT / BENCH / DEADLIFT and pick the most "due" lift as
 * primary. Secondary lifts are added when readiness + block permit and
 * exposure gaps warrant covering more than one comp lift today.
 *
 *   need = 0.35·dueness   // how many days since last exposure
 *        + 0.35·gap       // weekly target minus this-week count
 *        + 0.20·readFit   // readiness match (low readiness → bench; high → deadlift/squat)
 *        - 0.10·systemic  // damp heavy lifts when readiness is borderline
 *
 * Peaking / REALIZATION collapses to the fixed S/B/D rotation-driven pick so
 * specificity wins over adaptation in meet prep.
 */
function selectAdaptivePrimary(input: AdaptiveInput): AdaptiveOutput {
  // Keep peaking deterministic — meet week cares about order, not novelty.
  if (input.blockType === 'REALIZATION') {
    const byGap = scoreAdaptiveLifts(input);
    return { primary: byGap[0].lift, secondary: [] };
  }

  const scored = scoreAdaptiveLifts(input);
  const primary = scored[0].lift;

  // Explicit SBD request: always two secondaries at reduced volume.
  if (input.sbdToday) {
    return {
      primary,
      secondary: scored.slice(1, 3).map((s) => s.lift),
    };
  }

  // Auto-SBD: on a high-readiness day where two or three lifts are roughly
  // equally due, cover them in one session rather than leaving fatigue on the
  // table. Only consider this in ACCUMULATION or INTENSIFICATION.
  const canStack = (input.blockType === 'ACCUMULATION' || input.blockType === 'INTENSIFICATION')
    && input.readinessScore >= 80;
  if (!canStack) return { primary, secondary: [] };

  const secondary: Lift[] = [];
  for (const s of scored.slice(1)) {
    if (s.lift === 'UPPER') continue;
    const gap = scored[0].score - s.score;
    // Add a second comp block when it's within 20% of the top score.
    if (gap <= scored[0].score * 0.20 && secondary.length < 2) {
      secondary.push(s.lift);
    }
  }
  return { primary, secondary };
}

interface ScoredLift { lift: Lift; score: number; }

function scoreAdaptiveLifts(input: AdaptiveInput): ScoredLift[] {
  const { exposures, readinessScore } = input;
  const byLift = new Map<Lift, LiftExposure>();
  for (const e of exposures) byLift.set(e.lift, e);

  function read(lift: 'SQUAT' | 'BENCH' | 'DEADLIFT'): ScoredLift {
    const exp = byLift.get(lift);
    const daysSince = exp?.daysSince ?? 14;
    const weekCount = exp?.weekCount ?? 0;
    const target    = WEEKLY_TARGET[lift];

    // Dueness: cap influence after ~7 days so a 30-day absence doesn't pin
    // everything to a single lift. Normalize to roughly 0–1.
    const dueness = Math.min(daysSince, 10) / 10;
    // Gap: positive when under weekly target, negative when over. Normalize.
    const gap     = Math.max(-1, Math.min(1, (target - weekCount) / target));
    // Readiness fit: on a poor day bias toward bench (low systemic); on a
    // great day don't penalize squat/deadlift.
    const readFit = (1 - SYSTEMIC_LOAD[lift] / 10) * (1 - readinessScore / 100)
                  + (SYSTEMIC_LOAD[lift] / 10) * (readinessScore / 100);
    // Systemic damp: only hurts when readiness is actually borderline.
    const systemicDamp = readinessScore < 60
      ? (SYSTEMIC_LOAD[lift] / 10) * (1 - readinessScore / 100)
      : 0;

    const score = 0.35 * dueness + 0.35 * gap + 0.20 * readFit - 0.10 * systemicDamp;
    return { lift, score };
  }

  const entries: ScoredLift[] = [read('SQUAT'), read('BENCH'), read('DEADLIFT')];
  entries.sort((a, b) => b.score - a.score);
  return entries;
}

// ── Secondary Comp Block Builder ──────────────────────────────────────────────

/**
 * Minimal top-single comp block for a non-primary lift on an SBD / stacked
 * day. Stays at RPE 7 with 1 top single + 1 backoff so total session stress
 * stays manageable. Respects block context but does not taper (primary block
 * already handles taper logic).
 */
function buildSecondaryCompExercises(
  profile: AthleteProfile,
  blockType: BlockType,
  lift: Lift,
  rpeOffset: number,
  weekInBlock: number,
  totalBlockWeeks: number,
): GeneratedExercise[] {
  // DELOAD + REALIZATION meet week: don't add secondary comp — protect taper.
  if (blockType === 'DELOAD') return [];
  if (blockType === 'REALIZATION' && weekInBlock >= totalBlockWeeks) return [];

  const maxKg  = getLiftMax(lift, profile);
  const topRpe = clampRpe(7 + rpeOffset);
  const topLoad = roundLoad(prescribeLoad(maxKg, topRpe, 1));
  const bkLoad  = roundLoad(topLoad * 0.9);

  return [
    {
      name:              `${getCompMovementName(lift)} — secondary`,
      exerciseType:      'COMPETITION',
      setStructure:      'STRAIGHT',
      sets:              1,
      reps:              1,
      rpeTarget:         topRpe,
      estimatedLoadKg:   topLoad,
      order:             0, // re-numbered by caller
      notes:             `Secondary top single @RPE ${topRpe}. Skip if fatigue flares — primary lift is the priority.`,
      libraryExerciseId: getCompMovementLibraryId(lift),
    },
    {
      name:              `${getCompMovementName(lift)} — backoff`,
      exerciseType:      'VARIATION',
      setStructure:      'STRAIGHT',
      sets:              1,
      reps:              3,
      rpeTarget:         clampRpe(topRpe - 1),
      estimatedLoadKg:   bkLoad,
      order:             0,
      notes:             `One backoff triple — feel for position + bar speed.`,
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
): GeneratedExercise[] {
  const exercises: GeneratedExercise[] = [];
  const reward = profile.rewardSystem;

  // Primary comp movement(s)
  const totalBlockWeeks = block.weekEnd - block.weekStart + 1;
  const primaryExercises = buildPrimaryExercises(
    profile, block.blockType, primaryLift, volMult, rpeOffset,
    weekWithinBlock, totalBlockWeeks, isDupRepeat, reward,
  );
  exercises.push(...primaryExercises);

  // Accessories (skipped in REALIZATION — comp focus)
  if (block.blockType !== 'REALIZATION') {
    const nextOrder = exercises.length + 1;
    const accessories = buildAccessories(
      primaryLift, block.blockType, profile, volMult, rpeOffset, nextOrder,
      reward, sessionNumber,
    );
    exercises.push(...accessories);
  }

  // Cross-discipline accessory overlay — auto-adds face pulls on bench days
  // (elite-coach non-negotiable for shoulder health), and when the athlete's
  // disciplines include street-lift / calisthenics, adds a compatible light
  // street-lift accessory so hybrid training stays hybrid without the
  // athlete babysitting it. Suppressed in DELOAD and REALIZATION (comp focus).
  if (block.blockType !== 'REALIZATION' && block.blockType !== 'DELOAD') {
    const overlay = buildCrossDisciplineOverlay(
      primaryLift, profile, exercises.length + 1, reward,
    );
    exercises.push(...overlay);
  }

  return exercises;
}

/**
 * Returns accessory overlays that elite programs include as table-stakes:
 *   - Face pulls on every bench day (shoulder health, Flex/Millz non-negotiable)
 *   - Weighted pull-up on squat / deadlift days when grip + upper back matter
 *     and the athlete trains any pulling discipline
 *   - Weighted dip on bench days when street-lift is in the discipline mix
 */
function buildCrossDisciplineOverlay(
  primaryLift: Lift,
  profile: AthleteProfile,
  startingOrder: number,
  reward: RewardSystem,
): GeneratedExercise[] {
  const out: GeneratedExercise[] = [];
  const disciplines = profile.disciplines ?? [];
  const hasStreet = disciplines.includes('STREET_LIFT');
  const hasCali   = disciplines.includes('CALISTHENICS') || disciplines.includes('HYBRID');
  const hvBonus   = reward === 'HIGH_VOLUME' ? 1 : 0;
  let order = startingOrder;

  if (primaryLift === 'BENCH') {
    out.push({
      name:              'Face Pull',
      exerciseType:      'ACCESSORY',
      setStructure:      'STRAIGHT',
      sets:              3 + hvBonus,
      reps:              15,
      rpeTarget:         7,
      // Cable lift — no comp max reference. ~12% of bench gives a sane
      // starting weight on most stacks; athlete fine-tunes by feel.
      estimatedLoadKg:   Math.max(10, roundLoad((profile.maxBench ?? 80) * 0.12)),
      order:             order++,
      notes:             'Rear-delt + external rotation. Every bench day, non-negotiable.',
      libraryExerciseId: 'face_pull',
    });
    if (hasStreet || hasCali) {
      out.push({
        name:              'Weighted Dip',
        exerciseType:      'ACCESSORY',
        setStructure:      'STRAIGHT',
        sets:              3 + hvBonus,
        reps:              6,
        rpeTarget:         7,
        estimatedLoadKg:   Math.max(5, roundLoad((profile.maxBench ?? 80) * 0.10)),
        order:             order++,
        notes:             'Street-lift carryover. Lean slightly forward. Stop each set with 2-3 reps in reserve.',
        libraryExerciseId: 'tricep_dip',
      });
    }
  } else if (primaryLift === 'SQUAT' || primaryLift === 'DEADLIFT') {
    if (hasStreet || hasCali || disciplines.length === 0) {
      out.push({
        name:              'Weighted Pull-Up',
        exerciseType:      'ACCESSORY',
        setStructure:      'STRAIGHT',
        sets:              3 + hvBonus,
        reps:              5,
        rpeTarget:         7,
        estimatedLoadKg:   Math.max(5, roundLoad((profile.maxDeadlift ?? 120) * 0.10)),
        order:             order++,
        notes:             'Grip, lats, upper back — carries to every comp lift. Add weight via dip belt.',
        libraryExerciseId: 'weighted_pull_up',
      });
    }
  }

  return out;
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
): GeneratedExercise[] {
  const maxKg   = getLiftMax(lift, profile);
  const baseRpe = getBaseRpeForBlock(blockType, weekInBlock, totalBlockWeeks);

  // Apply overshooter flag, then readiness/history offset
  const adjustedRpe = clampRpe(
    overshooterRpeAdjust(baseRpe, profile.overshooter) + rpeOffset,
  );

  const compName        = getCompMovementName(lift);
  const compLibraryId   = getCompMovementLibraryId(lift);
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
      const openerRpe  = clampRpe(7 + rpeOffset);
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
    const deloadRpe  = clampRpe(6 + rpeOffset);
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
  const baseReps  = getRepsForBlock(blockType, profile.bottleneck);
  const respMult  = responderMultiplier(profile.responder);
  const rawSets   = blockToSets(blockType) * respMult * volMult;
  const baseSets  = Math.max(1, Math.floor(rawSets));

  // Week-within-block undulation (Juggernaut / Noriega style). Keeps total
  // work roughly flat while shifting the stimulus from set-heavy → rep-heavy
  // through the block. Only applies to ACCUMULATION; INTENSIFICATION already
  // peaks via RPE ramp + lower set count.
  const undulation = blockType === 'ACCUMULATION'
    ? undulateSetsReps(baseSets, baseReps, weekInBlock, totalBlockWeeks)
    : { sets: baseSets, reps: baseReps };

  // DUP: second appearance of the same lift in a week is a volume day.
  // Slightly lower RPE + one extra rep differentiates the stimulus from
  // the first (intensity) day — per Stanek mini-peaks / Noriega DUP.
  const dupRpeAdj = isDupRepeat ? -0.5 : 0;
  const dupRepAdj = isDupRepeat ? 1    : 0;
  const finalRpe  = clampRpe(adjustedRpe + dupRpeAdj);
  const finalReps = undulation.reps + dupRepAdj;
  const finalSets = undulation.sets;

  const compLoad = roundLoad(prescribeLoad(maxKg, finalRpe, finalReps));

  const result: GeneratedExercise[] = [];

  // HEAVY_SINGLES: in INTENSIFICATION, add a top single before back-off sets
  // to give heavy-singles athletes the neural stimulus they crave.
  if (reward === 'HEAVY_SINGLES' && blockType === 'INTENSIFICATION') {
    const topSingleRpe  = clampRpe(adjustedRpe + 0.5);
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
  if (variation !== null && (blockType === 'ACCUMULATION' || blockType === 'INTENSIFICATION')) {
    const varRpe    = clampRpe(adjustedRpe - 0.5);
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

// ── Accessory Exercises ────────────────────────────────────────────────────────

function buildAccessories(
  lift: Lift,
  blockType: BlockType,
  profile: AthleteProfile,
  volMult: number,
  rpeOffset: number,
  startOrder: number,
  reward: RewardSystem = 'CONSISTENCY',
  sessionNumber = 1,
): GeneratedExercise[] {
  const accRpe  = clampRpe(7.5 + rpeOffset);
  const baseAccSets = Math.max(1, Math.floor(3 * volMult));
  // HIGH_VOLUME athletes get +1 accessory set
  const accSets = reward === 'HIGH_VOLUME' ? baseAccSets + 1 : baseAccSets;
  const isDeload = blockType === 'DELOAD';

  const sq = profile.maxSquat;
  const bp = profile.maxBench;
  const dl = profile.maxDeadlift;

  // [name, reps, refMaxKg]
  // refMaxKg = the relevant competition max (sq/bp/dl).
  // ACCESSORY_REF_COEFFICIENT[name] is then multiplied to get the accessory
  // effective 1RM, then prescribeLoad() computes the training load.
  // Note: Barbell Rows always reference bp (bench) regardless of session day.
  type AccDef = [string, number, number];

  let defs: AccDef[];

  switch (lift) {
    // ── SQUAT DAY ─────────────────────────────────────────────────────────
    // Upper back pull included on every session (Sheiko, Juggernaut standard)
    case 'SQUAT':
    case 'LOWER':
      defs = isDeload
        ? [
            ['Romanian Deadlift', 12, dl],
            ['Barbell Rows',       8, bp],
          ]
        : [
            ['Romanian Deadlift', 10, dl],  // posterior chain
            ['Barbell Rows',       8, bp],  // upper back (critical for squat bracing)
            ['Leg Press',         12, sq],  // quad volume
            ['Lat Pulldowns',     10, dl],  // lat engagement
          ];
      break;

    // ── BENCH DAY ─────────────────────────────────────────────────────────
    // Upper pressing + rows (antagonist work = shoulder health)
    case 'BENCH':
    case 'UPPER':
      defs = isDeload
        ? [
            ['Overhead Press', 8, bp],
            ['Barbell Rows',   8, bp],
          ]
        : [
            ['Close Grip Bench Press', 10, bp],  // tricep/lockout
            ['Barbell Rows',           10, bp],  // upper back (shoulder health)
            ['Overhead Press',          8, bp],  // shoulder work
            ['Tricep Pushdowns',       12, bp],  // isolation lockout
          ];
      break;

    // ── DEADLIFT DAY ──────────────────────────────────────────────────────
    // Lats are the primary DL stabiliser; RDL for hamstring/glute volume
    case 'DEADLIFT':
      defs = isDeload
        ? [
            ['Romanian Deadlift', 12, dl],
            ['Lat Pulldowns',     10, dl],
          ]
        : [
            ['Romanian Deadlift', 10, dl],  // hamstrings/glutes
            ['Lat Pulldowns',     10, dl],  // lats (bar path control)
            ['Barbell Rows',      10, bp],  // upper back — bp reference, not dl
            ['Deficit Deadlift',   5, dl],  // off-the-floor strength
          ];
      break;

    default:
      // FULL — general GPP
      defs = [
        ['Romanian Deadlift', 10, dl],
        ['Overhead Press',     8, bp],
        ['Lat Pulldowns',     10, dl],
      ];
  }

  // VARIETY: rotate accessories — shift the order each session so the athlete
  // sees different exercises first (and potentially different ones if the pool
  // is larger than what fits in a session). Uses sessionNumber as the seed.
  if (reward === 'VARIETY' && defs.length > 1) {
    const shift = (sessionNumber - 1) % defs.length;
    defs = [...defs.slice(shift), ...defs.slice(0, shift)];
  }

  return defs.map(([name, reps, refMaxKg], i) => {
    const coeff = ACCESSORY_REF_COEFFICIENT[name] ?? 0.6;
    const load  = roundLoad(prescribeLoad(refMaxKg * coeff, accRpe, reps));
    return {
      name,
      exerciseType:      'ACCESSORY' as ExerciseType,
      setStructure:      'STRAIGHT' as SetStructure,
      sets:              accSets,
      reps,
      rpeTarget:         accRpe,
      estimatedLoadKg:   load,
      order:             startOrder + i,
      libraryExerciseId: ACCESSORY_LIBRARY_IDS[name],
    };
  });
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

function getLiftMax(lift: Lift, profile: AthleteProfile): number {
  switch (lift) {
    case 'SQUAT':     return profile.maxSquat;
    case 'BENCH':     return profile.maxBench;
    case 'DEADLIFT':  return profile.maxDeadlift;
    case 'UPPER':     return profile.maxBench;
    case 'LOWER':     return profile.maxSquat;
    case 'FULL':      return profile.maxDeadlift;
  }
}

function getCompMovementName(lift: Lift): string {
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
function getCompMovementLibraryId(lift: Lift): string {
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

/** Maps accessory display names to stable library exercise IDs. */
const ACCESSORY_LIBRARY_IDS: Record<string, string> = {
  'Romanian Deadlift':      'romanian_deadlift',
  'Leg Press':              'leg_press',
  'Walking Lunges':         'walking_lunge',
  'Overhead Press':         'overhead_press',
  'Tricep Pushdowns':       'tricep_pushdown',
  'Close Grip Bench Press': 'close_grip_bench_press',
  'Barbell Rows':           'barbell_row',
  'Deficit Deadlift':       'deficit_deadlift',
  'Lat Pulldowns':          'lat_pulldown',
};

// VARIATION_MAX_COEFFICIENT has been superseded by the coefficient field on
// the VariationChoice records returned by selectVariation().

/**
 * Accessory exercise effective 1RM as a fraction of the relevant competition
 * lift's 1RM. Multiplied by the competition max before calling prescribeLoad()
 * so that: (a) loads land in the correct range, and (b) accessories respond to
 * readiness changes (since load flows through prescribeLoad with the adjusted
 * accRpe, not a flat percentage).
 *
 * Sources: Tuchscherer, Noriega, Stanek, Swolefessor programming references
 * for intermediate-to-advanced raw powerlifters.
 */
const ACCESSORY_REF_COEFFICIENT: Record<string, number> = {
  'Romanian Deadlift':      0.85,  // of DL — strong hinge, shorter ROM
  'Deficit Deadlift':       0.88,  // of DL — harder off floor
  'Barbell Rows':           0.95,  // of BP — most lifters row close to bench
  'Leg Press':              1.25,  // of SQ — favourable leverage, no bracing
  'Lat Pulldowns':          0.45,  // of DL — upper-body pull fraction of DL
  'Close Grip Bench Press': 0.90,  // of BP — slight ROM assist
  'Overhead Press':         0.65,  // of BP — strict press limited by delts
  'Tricep Pushdowns':       0.48,  // of BP — cable isolation
};


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
  }
}

/** Reduce prescribed RPE based on recent overshoot pattern. */
function computeOvershootOffset(overshootHistory?: number): number {
  if (overshootHistory == null || overshootHistory <= 0) return 0;
  // Each 1-RPE average overshoot → reduce by 0.5 (capped at −1.0)
  return -Math.min(1.0, overshootHistory * 0.5);
}

/** Clamp RPE to the valid [5, 10] range. */
function clampRpe(rpe: number): number {
  return Math.max(5, Math.min(10, rpe));
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
