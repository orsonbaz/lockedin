/**
 * accessory-selector.ts — Library-driven accessory exercise selection.
 *
 * Replaces the hardcoded switch/case in buildAccessories. The exercise library
 * already encodes all the programming knowledge we need: primaryLiftTarget,
 * movementPattern, specificity, FatigueProfile, swapGroups. This module reads
 * those fields and scores candidates so that:
 *   - Adding a new exercise to the library makes it a candidate automatically.
 *   - Pattern diversity is enforced structurally, not by hand-maintained lists.
 *   - Week-to-week variety comes from swap-group rotation, not random picks.
 *   - Spinal load budget is respected on hinge-primary days.
 */

import type { Lift, BlockType, RewardSystem } from '@/lib/db/types';
import type { AthleteProfile }                from '@/lib/db/types';
import type { LibraryExercise, MovementPattern } from '@/lib/exercises/types';
import { EXERCISE_LIBRARY, EXERCISE_BY_ID }   from '@/lib/exercises/index';
import { prescribeLoad, roundLoad }            from './calc';
import type { GeneratedExercise }              from './session';

// ── Input / output ────────────────────────────────────────────────────────────

export interface AccessorySelectorInput {
  primaryLift:        Lift;
  blockType:          BlockType;
  profile:            AthleteProfile;
  /** Competition + variation exercises already placed. Used for pattern tracking and dedup. */
  existingExercises:  GeneratedExercise[];
  volMult:            number;
  rpeOffset:          number;
  /** 1-based session number within the week — drives swap-group rotation for variety. */
  sessionNumber:      number;
  reward:             RewardSystem;
  /** Signed offset applied to the base accessory count (e.g. -1 when a secondary comp lift is present). */
  countOverride?:     number;
}

// ── Movement pattern budgets (soft) ──────────────────────────────────────────
//
// Suggested ceiling on how many exercises a single movement pattern should
// occupy in one session. Encoded as a *scoring penalty*, not a hard cap, so
// the AI session advisor can override when it has a good reason. The penalty
// scales with how far over budget a candidate would push the session.
//
// Example — DEADLIFT day (primary pattern = HINGE):
//   Comp Deadlift + Pause Deadlift already place 2 HINGE exercises (the
//   primary-pattern budget). Adding an RDL costs one overflow's penalty —
//   noticeable, but not forbidden when justified.
//
//   OTHER_PATTERN_BUDGET   = 2  → two pull exercises are free; a third pays.

const PRIMARY_PATTERN_BUDGET   = 2;
const OTHER_PATTERN_BUDGET     = 2;
const PRIMARY_OVERFLOW_PENALTY = 1.5;
const OTHER_OVERFLOW_PENALTY   = 0.75;

// ── Target accessory count per block ─────────────────────────────────────────

const BASE_ACCESSORY_COUNT: Partial<Record<BlockType, number>> = {
  ACCUMULATION:    4,
  INTENSIFICATION: 3,
  PIVOT:           3,
  MAINTENANCE:     3,
  DELOAD:          2,
};

// ── Primary movement pattern per lift ────────────────────────────────────────

const LIFT_TO_PATTERN: Partial<Record<Lift, MovementPattern>> = {
  SQUAT:    'SQUAT',
  BENCH:    'HORIZONTAL_PUSH',
  DEADLIFT: 'HINGE',
  UPPER:    'HORIZONTAL_PUSH',
  LOWER:    'SQUAT',
  FULL:     'HINGE',
};

// ── Load reference table ──────────────────────────────────────────────────────
//
// [fraction-of-max, which-max]. 'primary' = the session's primary lift max.
// Exercises not in this table fall back to [0.60, 'primary'].
//
// Sources: Tuchscherer, Noriega, Stanek, Swolefessor programming references.

// Street lift anchors use the athlete's own max added weight when known.
// The 'PULL_UP' / 'DIP' / 'MUSCLE_UP' values are resolved in resolveAnchorMax.
type StreetLiftAnchor = 'PULL_UP' | 'DIP' | 'MUSCLE_UP';
type LoadRef = [fraction: number, anchor: Lift | 'primary' | StreetLiftAnchor];

const LOAD_REF: Record<string, LoadRef> = {
  // ── Hinge / posterior chain ────────────────────────────────────────────────
  romanian_deadlift:        [0.85, 'DEADLIFT'],
  deficit_deadlift:         [0.88, 'DEADLIFT'],
  good_morning:             [0.35, 'SQUAT'],      // light — technically demanding
  hip_thrust:               [0.70, 'DEADLIFT'],
  glute_ham_raise:          [0.30, 'DEADLIFT'],
  // ── Horizontal pull (rows anchor to bench — most lifters row close to bench) ─
  barbell_row:              [0.95, 'BENCH'],
  dumbbell_row:             [0.70, 'BENCH'],
  cable_row:                [0.55, 'BENCH'],
  chest_supported_row:      [0.70, 'BENCH'],
  seal_row:                 [0.65, 'BENCH'],
  t_bar_row:                [0.70, 'BENCH'],
  landmine_row:             [0.60, 'BENCH'],
  // ── Vertical pull ──────────────────────────────────────────────────────────
  // Pull-up/chin-up variants: use athlete's known max added weight as the
  // anchor so load prescription reflects their actual strength, not a DL fraction.
  weighted_pull_up:         [1.0, 'PULL_UP'],
  weighted_chin_up:         [1.0, 'PULL_UP'],
  ring_pull_up:             [0.9, 'PULL_UP'],
  archer_pull_up:           [0.6, 'PULL_UP'],
  lat_pulldown:             [0.45, 'DEADLIFT'],
  assisted_pull_up:         [0.30, 'DEADLIFT'],
  // ── Calisthenics / street lift ─────────────────────────────────────────────
  weighted_muscle_up:       [1.0, 'MUSCLE_UP'],
  weighted_ring_dip:        [1.0, 'DIP'],
  weighted_bar_dip:         [1.0, 'DIP'],
  tricep_dip:               [1.0, 'DIP'],
  // ── Squat pattern / single leg ─────────────────────────────────────────────
  leg_press:                [1.25, 'SQUAT'],       // favourable leverage
  bulgarian_split_squat:    [0.40, 'SQUAT'],
  walking_lunge:            [0.35, 'SQUAT'],
  step_up:                  [0.40, 'SQUAT'],
  pistol_squat:             [0.05, 'SQUAT'],       // additional weight
  // ── Horizontal push ────────────────────────────────────────────────────────
  close_grip_bench_press:   [0.90, 'BENCH'],
  dumbbell_bench_press:     [0.60, 'BENCH'],
  floor_press:              [0.85, 'BENCH'],
  // ── Vertical push / tricep / shoulder ─────────────────────────────────────
  overhead_press:           [0.65, 'BENCH'],
  dumbbell_overhead_press:  [0.55, 'BENCH'],
  tricep_pushdown:          [0.48, 'BENCH'],
  // ── Core / carry ──────────────────────────────────────────────────────────
  farmers_walk:             [0.60, 'DEADLIFT'],
  ab_wheel:                 [0.00, 'primary'],      // bodyweight
  hanging_leg_raise:        [0.00, 'primary'],      // bodyweight
};

// ── Main selector ─────────────────────────────────────────────────────────────

export function selectAccessories(input: AccessorySelectorInput): GeneratedExercise[] {
  const { primaryLift, blockType, profile, existingExercises, volMult, rpeOffset, sessionNumber, reward, countOverride = 0 } = input;

  if (blockType === 'REALIZATION') return [];

  const base        = BASE_ACCESSORY_COUNT[blockType] ?? 3;
  const targetCount = Math.max(1, base + countOverride);
  const primaryPat  = LIFT_TO_PATTERN[primaryLift] ?? null;

  // ── 1. Count patterns already in the session ───────────────────────────────
  const patternCounts = new Map<MovementPattern, number>();
  for (const ex of existingExercises) {
    const lib = ex.libraryExerciseId ? EXERCISE_BY_ID.get(ex.libraryExerciseId) : undefined;
    if (lib) {
      patternCounts.set(lib.movementPattern, (patternCounts.get(lib.movementPattern) ?? 0) + 1);
    }
  }

  // ── 2. Build exclusion sets (IDs and names already in the session) ─────────
  const usedIds   = new Set(existingExercises.map((e) => e.libraryExerciseId).filter(Boolean) as string[]);
  const usedNames = new Set(existingExercises.map((e) => e.name));

  // ── 3. Candidate pool ─────────────────────────────────────────────────────
  const candidates = EXERCISE_LIBRARY.filter((ex) => {
    if (usedIds.has(ex.id) || usedNames.has(ex.name)) return false;
    // Exclude comp-level exercises (specificity 4-5) — they belong in the
    // competition or variation slots, not accessories.
    if (ex.specificity >= 4) return false;
    // Discipline gate: only include exercises the athlete actually trains.
    if (ex.disciplines && ex.disciplines.length > 0) {
      const athleteDisciplines = profile.disciplines ?? ['POWERLIFTING'];
      if (!ex.disciplines.some((d) => athleteDisciplines.includes(d))) return false;
    }
    // Only include exercises that target this session's lift OR are general (null).
    const targetOk =
      ex.primaryLiftTarget === primaryLift ||
      ex.primaryLiftTarget === null;
    return targetOk;
  });

  // ── 4. Score candidates ────────────────────────────────────────────────────
  interface Scored { ex: LibraryExercise; score: number; }

  const scored: Scored[] = candidates.map((ex) => {
    // Movement-pattern overflow: soft penalty per exercise that would push
    // this pattern past its session budget. Lets the engine still pick a 3rd
    // hinge when no better alternative exists, instead of hard-excluding.
    const curCount = patternCounts.get(ex.movementPattern) ?? 0;
    const isPrimaryPattern = ex.movementPattern === primaryPat;
    const budget = isPrimaryPattern ? PRIMARY_PATTERN_BUDGET : OTHER_PATTERN_BUDGET;
    const overflow = Math.max(0, (curCount + 1) - budget);
    const overlapPenalty =
      overflow * (isPrimaryPattern ? PRIMARY_OVERFLOW_PENALTY : OTHER_OVERFLOW_PENALTY);

    // SFR: specificity / systemic cost — higher is more efficient
    const sfr = ex.specificity / Math.max(1, ex.fatigue.systemicFatigue);

    // Spinal load penalty: on HINGE days the posterior chain is already taxed.
    // HIGH-spinal-load accessories compete for the same recovery window as the
    // comp lift and variation. Soft nudge toward LOW/MEDIUM alternatives.
    const spinalPenalty =
      primaryPat === 'HINGE' && ex.fatigue.spinalLoad === 'HIGH' ? 2.5 : 0;

    // Specificity-to-primary bonus: exercises explicitly targeting this lift win
    // over general accessories with the same SFR.
    const targetBonus = ex.primaryLiftTarget === primaryLift ? 0.4 : 0;

    return { ex, score: sfr + targetBonus - spinalPenalty - overlapPenalty };
  });

  scored.sort((a, b) => b.score - a.score);

  // ── 5. Pick — one representative per swap group, with session rotation ─────
  const selected: LibraryExercise[]  = [];
  const usedGroups = new Set<string>();
  const addedPats  = new Map<MovementPattern, number>(patternCounts);

  for (const { ex } of scored) {
    if (selected.length >= targetCount) break;

    const group = ex.swapGroups[0] ?? null;

    if (group) {
      if (usedGroups.has(group)) continue;
      // Within this swap group, use sessionNumber to rotate which member wins.
      const groupMembers = scored.filter((s) => s.ex.swapGroups[0] === group);
      const rotated = groupMembers[(sessionNumber - 1) % Math.max(1, groupMembers.length)];
      selected.push(rotated.ex);
      usedGroups.add(group);
    } else {
      selected.push(ex);
    }

    addedPats.set(ex.movementPattern, (addedPats.get(ex.movementPattern) ?? 0) + 1);
  }

  // ── 6. Convert to GeneratedExercise ───────────────────────────────────────
  const accRpe  = Math.max(5, Math.min(10, 7.5 + rpeOffset));
  // HIGH_VOLUME bumps each accessory by +1 set (was previously +1 slot — slot
  // count is now left for the AI session advisor to shape via principle).
  const baseAccSets = Math.max(1, Math.floor(3 * volMult));
  const accSets     = baseAccSets + (reward === 'HIGH_VOLUME' ? 1 : 0);

  return selected.map((ex, i) => {
    const [coeff, anchor] = LOAD_REF[ex.id] ?? [0.60, 'primary' as const];
    const maxKg = resolveAnchorMax(anchor, primaryLift, profile);
    const reps  = repsForSpec(ex.specificity, blockType);
    // Bodyweight exercises have coeff 0 — prescribed load is addl. weight only.
    // For pure bodyweight (hanging leg raise etc.) estimatedLoadKg = 0 is fine;
    // the athlete uses feel.
    const load  = coeff > 0 ? roundLoad(prescribeLoad(maxKg * coeff, accRpe, reps)) : 0;

    return {
      name:              ex.name,
      exerciseType:      'ACCESSORY' as const,
      setStructure:      'STRAIGHT' as const,
      sets:              accSets,
      reps,
      rpeTarget:         accRpe,
      estimatedLoadKg:   load,
      order:             existingExercises.length + i + 1,
      libraryExerciseId: ex.id,
      ...(ex.coachingNotes ? { notes: ex.coachingNotes } : {}),
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAnchorMax(anchor: Lift | 'primary' | StreetLiftAnchor, primaryLift: Lift, profile: AthleteProfile): number {
  // Street lift anchors: use the athlete's known max added weight.
  // When not set, fall back to a conservative fraction of bodyweight
  // (pull-up ~15% BW, dip ~20% BW, muscle-up ~10% BW as starting points).
  if (anchor === 'PULL_UP')   return profile.maxWeightedPullUp   ?? Math.round(profile.weightKg * 0.15);
  if (anchor === 'DIP')       return profile.maxWeightedDip       ?? Math.round(profile.weightKg * 0.20);
  if (anchor === 'MUSCLE_UP') return profile.maxWeightedMuscleUp  ?? Math.round(profile.weightKg * 0.10);

  const lift = anchor === 'primary' ? primaryLift : anchor;
  switch (lift) {
    case 'SQUAT':    return profile.maxSquat    ?? 100;
    case 'BENCH':    return profile.maxBench    ?? 80;
    case 'DEADLIFT': return profile.maxDeadlift ?? 120;
    case 'UPPER':    return profile.maxBench    ?? 80;
    case 'LOWER':    return profile.maxSquat    ?? 100;
    case 'FULL':     return profile.maxDeadlift ?? 120;
  }
}

/** Rep count for an accessory exercise based on its specificity. */
function repsForSpec(specificity: number, blockType: BlockType): number {
  // Lower specificity = further from comp pattern = higher rep hypertrophy range.
  const base: Record<number, number> = { 1: 12, 2: 10, 3: 8 };
  const reps = base[specificity] ?? 10;
  if (blockType === 'DELOAD')          return Math.min(15, reps + 3);
  if (blockType === 'INTENSIFICATION') return Math.max(5,  reps - 2);
  return reps;
}
