// ── Exercise Library Index ─────────────────────────────────────────────────────
// Aggregates all domain files into:
//   EXERCISE_LIBRARY  — flat array of all built-in exercises
//   EXERCISE_BY_ID    — O(1) Map<id, Exercise>
//   EXERCISES_BY_PATTERN — Map<MovementPattern, Exercise[]>
//   EXERCISES_BY_SWAP_GROUP — Map<swapGroupId, Exercise[]>

import type { LibraryExercise, MovementPattern } from './types';

import { squatExercises }        from './library/squat';
import { hingeExercises }        from './library/hinge';
import { horizontalPushExercises } from './library/horizontal-push';
import { verticalPushExercises } from './library/vertical-push';
import { horizontalPullExercises } from './library/horizontal-pull';
import { verticalPullExercises } from './library/vertical-pull';
import { singleLegExercises }    from './library/single-leg';
import { caryAndCoreExercises }  from './library/carry-core';

// ── Flat array ────────────────────────────────────────────────────────────────

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  ...squatExercises,
  ...hingeExercises,
  ...horizontalPushExercises,
  ...verticalPushExercises,
  ...horizontalPullExercises,
  ...verticalPullExercises,
  ...singleLegExercises,
  ...caryAndCoreExercises,
];

// ── O(1) id lookup ────────────────────────────────────────────────────────────

export const EXERCISE_BY_ID = new Map<string, LibraryExercise>(
  EXERCISE_LIBRARY.map((ex) => [ex.id, ex]),
);

// ── By movement pattern ───────────────────────────────────────────────────────

export const EXERCISES_BY_PATTERN = new Map<MovementPattern, LibraryExercise[]>();

for (const ex of EXERCISE_LIBRARY) {
  const bucket = EXERCISES_BY_PATTERN.get(ex.movementPattern) ?? [];
  bucket.push(ex);
  EXERCISES_BY_PATTERN.set(ex.movementPattern, bucket);
}

// ── By swap group ─────────────────────────────────────────────────────────────

export const EXERCISES_BY_SWAP_GROUP = new Map<string, LibraryExercise[]>();

for (const ex of EXERCISE_LIBRARY) {
  for (const group of ex.swapGroups) {
    const bucket = EXERCISES_BY_SWAP_GROUP.get(group) ?? [];
    bucket.push(ex);
    EXERCISES_BY_SWAP_GROUP.set(group, bucket);
  }
}

// ── Re-exports for convenience ────────────────────────────────────────────────

export type { LibraryExercise, Exercise, GymEquipment, MovementPattern,
              MuscleGroup, FatigueProfile, EquipmentModifiers,
              SwapContext, SwapCandidate, UserEquipmentProfile,
              CustomExercise, GearContext } from './types';
export { SWAP_GROUPS } from './swap-groups';
export type { SwapGroupId } from './swap-groups';
