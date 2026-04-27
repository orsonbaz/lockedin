/**
 * lift-anchor.ts — shared helpers for prescribing competition-lift loads.
 *
 * Both the AI coach action executors (coach-actions.ts) and the AI session
 * advisor's apply step (session-advisor.ts) need to map an exercise to the
 * athlete max it should be loaded against. This module centralises that
 * decision so the two paths can never diverge again.
 *
 * Background: a prior bug used `session.primaryLift` to anchor every load,
 * so on a squat day the bench secondary got prescribed against squat max
 * (190 kg+ on a 170 kg bencher).
 */

import { EXERCISE_BY_ID } from '@/lib/exercises/index';

export function getMaxForLift(
  profile: { maxSquat?: number; maxBench?: number; maxDeadlift?: number },
  lift: string,
): number {
  switch (lift) {
    case 'SQUAT':    return profile.maxSquat ?? 0;
    case 'BENCH':    return profile.maxBench ?? 0;
    case 'DEADLIFT': return profile.maxDeadlift ?? 0;
    // Match engine getLiftMax() — UPPER/LOWER/FULL alias to the closest comp lift.
    case 'UPPER':    return profile.maxBench ?? 0;
    case 'LOWER':    return profile.maxSquat ?? 0;
    case 'FULL':     return profile.maxDeadlift ?? 0;
    default:         return 0;
  }
}

/**
 * Determine which competition-lift max should anchor an exercise's prescribed
 * load. Uses the exercise's own identity (library `primaryLiftTarget`, then
 * name matching) before falling back to the session's primary lift.
 */
export function liftAnchorForExercise(
  ex: { name: string; libraryExerciseId?: string },
  sessionPrimaryLift: string,
): string {
  const lib = ex.libraryExerciseId ? EXERCISE_BY_ID.get(ex.libraryExerciseId) : undefined;
  if (lib?.primaryLiftTarget) return lib.primaryLiftTarget;

  const n = ex.name.toLowerCase();
  if (n.includes('squat'))                                                    return 'SQUAT';
  if (n.includes('deadlift') || n.includes('rdl') || n.includes('romanian')) return 'DEADLIFT';
  if (n.includes('bench')   || n.includes('press'))                           return 'BENCH';

  return sessionPrimaryLift;
}
