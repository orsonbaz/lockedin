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
  const weekInBlock = input.weekWithinBlock ?? 1;
  const exercises = buildSessionExercises(
    profile, block, primaryLift, volMult, totalRpeOffset, weekInBlock,
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
): GeneratedExercise[] {
  const exercises: GeneratedExercise[] = [];

  // Primary comp movement(s)
  const totalBlockWeeks = block.weekEnd - block.weekStart + 1;
  const primaryExercises = buildPrimaryExercises(
    profile, block.blockType, primaryLift, volMult, rpeOffset,
    weekWithinBlock, totalBlockWeeks,
  );
  exercises.push(...primaryExercises);

  // Accessories (skipped in REALIZATION — comp focus)
  if (block.blockType !== 'REALIZATION') {
    const nextOrder = exercises.length + 1;
    const accessories = buildAccessories(
      primaryLift, block.blockType, profile, volMult, rpeOffset, nextOrder,
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
): GeneratedExercise[] {
  const maxKg   = getLiftMax(lift, profile);
  const baseRpe = getBaseRpeForBlock(blockType);

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

  const compLoad = roundLoad(prescribeLoad(maxKg, adjustedRpe, baseReps));

  const result: GeneratedExercise[] = [
    {
      name:              compName,
      exerciseType:      'COMPETITION',
      setStructure:      'STRAIGHT',
      sets:              finalSets,
      reps:              baseReps,
      rpeTarget:         adjustedRpe,
      estimatedLoadKg:   compLoad,
      order:             1,
      libraryExerciseId: compLibraryId,
    },
  ];

  // Variation exercise — only in ACCUMULATION
  if (blockType === 'ACCUMULATION' && variationName !== null) {
    const varRpe    = clampRpe(adjustedRpe - 0.5);
    const varReps   = baseReps + 1;
    const varSets   = Math.max(1, Math.floor(3 * volMult));
    const varLoad   = roundLoad(prescribeLoad(maxKg, varRpe, varReps));

    result.push({
      name:              variationName,
      exerciseType:      'VARIATION',
      setStructure:      'STRAIGHT',
      sets:              varSets,
      reps:              varReps,
      rpeTarget:         varRpe,
      estimatedLoadKg:   varLoad,
      order:             2,
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
): GeneratedExercise[] {
  const accRpe   = clampRpe(7.5 + rpeOffset);
  const lightRpe = clampRpe(7.0 + rpeOffset);
  const accSets  = Math.max(1, Math.floor(3 * volMult));
  const isDeload = blockType === 'DELOAD';

  const sq  = profile.maxSquat;
  const bp  = profile.maxBench;
  const dl  = profile.maxDeadlift;

  type AccDef = [string, number, number, number?]; // [name, reps, loadKg, rpeOverride?]

  let defs: AccDef[];

  switch (lift) {
    // ── SQUAT DAY ─────────────────────────────────────────────────────────
    // Standard in elite programs (Sheiko, GZCLP, Juggernaut):
    // squat variation + upper back pull + posterior chain + core
    case 'SQUAT':
    case 'LOWER':
      defs = isDeload
        ? [
            ['Romanian Deadlift',  12, dl  * 0.38],
            ['Barbell Rows',        8, bp  * 0.55],
          ]
        : [
            ['Romanian Deadlift',  10, dl  * 0.42],       // posterior chain
            ['Barbell Rows',        8, bp  * 0.60],       // upper back (critical for squat bracing)
            ['Leg Press',          12, sq  * 0.80],       // quad volume
            ['Lat Pulldowns',      10, dl  * 0.22],       // lat engagement
          ];
      break;

    // ── BENCH DAY ─────────────────────────────────────────────────────────
    // Upper pressing volume + heavy rows (lats antagonist = shoulder health)
    case 'BENCH':
    case 'UPPER':
      defs = isDeload
        ? [
            ['Overhead Press',    8,  bp * 0.52],
            ['Barbell Rows',      8,  bp * 0.55],
          ]
        : [
            ['Close Grip Bench Press', 10, bp * 0.65],   // tricep/lockout
            ['Barbell Rows',           10, bp * 0.65],   // upper back (shoulder health)
            ['Overhead Press',          8, bp * 0.55],   // shoulder work
            ['Tricep Pushdowns',       12, bp * 0.20],   // isolation lockout
          ];
      break;

    // ── DEADLIFT DAY ──────────────────────────────────────────────────────
    // Heavy lat/back work (lats are the primary stabiliser on DL)
    // + RDL for hamstring/glute accessory
    case 'DEADLIFT':
      defs = isDeload
        ? [
            ['Romanian Deadlift', 12, dl * 0.40],
            ['Lat Pulldowns',     10, dl * 0.22],
          ]
        : [
            ['Romanian Deadlift',  10, dl  * 0.42],     // hamstrings/glutes
            ['Lat Pulldowns',      10, dl  * 0.25],     // lats (bar path control)
            ['Barbell Rows',       10, dl  * 0.40],     // upper back
            ['Deficit Deadlift',    5, dl  * 0.68],     // off-the-floor strength
          ];
      break;

    default:
      // FULL — general GPP
      defs = [
        ['Romanian Deadlift', 10, dl  * 0.42],
        ['Overhead Press',     8, bp  * 0.52],
        ['Lat Pulldowns',     10, dl  * 0.22],
      ];
  }

  // Suppress unused variable warning — lightRpe is available for rpeOverride use
  void lightRpe;

  return defs.map(([name, reps, load], i) => ({
    name,
    exerciseType:      'ACCESSORY' as ExerciseType,
    setStructure:      'STRAIGHT' as SetStructure,
    sets:              accSets,
    reps,
    rpeTarget:         accRpe,
    estimatedLoadKg:   roundLoad(load),
    order:             startOrder + i,
    libraryExerciseId: ACCESSORY_LIBRARY_IDS[name],
  }));
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


/** Default base RPE (before adjustments) for each block type. */
function getBaseRpeForBlock(blockType: BlockType): number {
  const map: Record<BlockType, number> = {
    ACCUMULATION:    7.5,
    INTENSIFICATION: 8.0,
    REALIZATION:     9.0,
    DELOAD:          6.0,
    PIVOT:           7.0,
    MAINTENANCE:     7.5,
  };
  return map[blockType];
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
