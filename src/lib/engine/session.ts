/**
 * session.ts — Generate a single training session from profile + block + readiness.
 * Pure function: no DB calls, no side effects, no LLM — all rule-based.
 */

import type {
  AthleteProfile,
  TrainingBlock,
  BlockType,
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

export interface SessionInput {
  profile: AthleteProfile;
  block: TrainingBlock;
  weekDayOfWeek: number;     // 0 = Sun … 6 = Sat (for future use / day-specific logic)
  readinessScore: number;    // 0–100 composite
  sessionNumber: number;     // which session this week (1-based)
  overshootHistory?: number; // avg RPE overshoot in last 5 sessions (positive = over)
  weekWithinBlock?: number;  // 1-based week index within the current block (for taper logic)
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
}

export interface GeneratedSession {
  sessionType: SessionType;
  primaryLift: Lift;
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

  // ── 1. Determine primary lift ──────────────────────────────────────────────
  const primaryLift = selectPrimaryLift(sessionNumber, profile.weeklyFrequency);

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

  // ── 5. Coach note ──────────────────────────────────────────────────────────
  const coachNote = buildCoachNote(readinessScore, block.blockType);

  return { sessionType, primaryLift, exercises, modifications, coachNote };
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
): GeneratedExercise[] {
  const maxKg   = getLiftMax(lift, profile);
  const baseRpe = getBaseRpeForBlock(blockType, weekInBlock, totalBlockWeeks);

  // Apply overshooter flag, then readiness/history offset
  const adjustedRpe = clampRpe(
    overshooterRpeAdjust(baseRpe, profile.overshooter) + rpeOffset,
  );

  const compName        = getCompMovementName(lift);
  const compLibraryId   = getCompMovementLibraryId(lift);
  const variationName   = getVariationName(lift);
  const variationLibId  = getVariationLibraryId(lift);

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
  const finalSets = Math.max(1, Math.floor(rawSets));

  // DUP: second appearance of the same lift in a week is a volume day.
  // Slightly lower RPE + one extra rep differentiates the stimulus from
  // the first (intensity) day — per Stanek mini-peaks / Noriega DUP.
  const dupRpeAdj = isDupRepeat ? -0.5 : 0;
  const dupRepAdj = isDupRepeat ? 1    : 0;
  const finalRpe  = clampRpe(adjustedRpe + dupRpeAdj);
  const finalReps = baseReps + dupRepAdj;

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

  // Variation exercise — only in ACCUMULATION
  if (blockType === 'ACCUMULATION' && variationName !== null) {
    const varRpe    = clampRpe(adjustedRpe - 0.5);
    const varReps   = baseReps + 1;
    const varSets   = Math.max(1, Math.floor(3 * volMult));
    // Discount the reference max — pause squat/bench/deficit DL are weaker
    // than the competition lift. Without this, loads land 15-20 kg too heavy.
    const varCoeff  = VARIATION_MAX_COEFFICIENT[variationName ?? ''] ?? 1.0;
    const varLoad   = roundLoad(prescribeLoad(maxKg * varCoeff, varRpe, varReps));

    result.push({
      name:              variationName,
      exerciseType:      'VARIATION',
      setStructure:      'STRAIGHT',
      sets:              varSets,
      reps:              varReps,
      rpeTarget:         varRpe,
      estimatedLoadKg:   varLoad,
      order:             result.length + 1,
      libraryExerciseId: variationLibId ?? undefined,
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
function getVariationName(lift: Lift): string | null {
  switch (lift) {
    case 'SQUAT':     return 'Pause Squat';
    case 'BENCH':     return 'Pause Bench Press';
    case 'DEADLIFT':  return 'Deficit Deadlift';
    default:          return null;
  }
}

/** Returns the stable library exercise ID for the ACCUMULATION variation, or null. */
function getVariationLibraryId(lift: Lift): string | null {
  switch (lift) {
    case 'SQUAT':     return 'pause_squat';
    case 'BENCH':     return 'pause_bench_press';
    case 'DEADLIFT':  return 'deficit_deadlift';
    default:          return null;
  }
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

/**
 * Variation exercise effective 1RM as a fraction of the competition lift 1RM.
 * Pause squat max ≈ 87% of comp squat (Tuchscherer/Noriega programming notes).
 * Pause bench max ≈ 85% of comp bench (widespread coach consensus).
 * Deficit DL max  ≈ 88% of comp DL   (harder off floor, similar top end).
 *
 * Without this discount, prescribeLoad() uses the full competition max and
 * produces loads 15–20 kg too heavy for the variation in an accumulation block.
 */
const VARIATION_MAX_COEFFICIENT: Partial<Record<string, number>> = {
  'Pause Squat':       0.87,
  'Pause Bench Press': 0.85,
  'Deficit Deadlift':  0.88,
};

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
