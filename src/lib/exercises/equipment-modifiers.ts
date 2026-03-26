// ── Gear modifier → effective 1RM ─────────────────────────────────────────────
// Belt and knee sleeves increase the effective 1RM for compatible exercises.
// This is applied BEFORE prescribeLoad() so the prescribed weight is higher
// when the athlete is wearing gear, but the RPE target stays the same.
//
// Modifiers stack ADDITIVELY (belt + sleeves on a squat = ~10% combined)
// to avoid double-counting compounding effects.

import type { Exercise, GearContext } from './types';

/**
 * Returns the effective 1RM to use for load prescription given the gear
 * the athlete is wearing for this specific exercise.
 *
 * Example: maxSquat = 200 kg, belt modifier = 0.07, sleeves = 0.03
 *          effectiveMax(200, competitionSquat, { usingBelt: true, usingKneeSleeves: true })
 *          → 200 * (1 + 0.07 + 0.03) = 220 kg
 *
 * When no gear is worn, or gear is not compatible with this exercise,
 * returns baseMaxKg unchanged.
 */
export function effectiveMax(
  baseMaxKg: number,
  exercise: Exercise,
  gear: GearContext,
): number {
  let modifier = 0;

  if (
    gear.usingBelt &&
    exercise.modifiers.beltCompatible &&
    exercise.modifiers.beltStrengthModifier !== null
  ) {
    modifier += exercise.modifiers.beltStrengthModifier;
  }

  if (
    gear.usingKneeSleeves &&
    exercise.modifiers.kneeSleevesCompatible &&
    exercise.modifiers.kneeSleevesModifier !== null
  ) {
    modifier += exercise.modifiers.kneeSleevesModifier;
  }

  // Wrist wraps provide wrist stability but no meaningful strength increase.
  // No multiplier applied — only compatibility is checked in the UI.

  return baseMaxKg * (1 + modifier);
}

/**
 * Returns a short label describing what gear is active for an exercise,
 * e.g. "Belt + Sleeves" or "Belt only". Returns null if no gear active.
 */
export function gearLabel(
  exercise: Exercise,
  gear: GearContext,
): string | null {
  const active: string[] = [];

  if (gear.usingBelt && exercise.modifiers.beltCompatible) {
    active.push('Belt');
  }
  if (gear.usingKneeSleeves && exercise.modifiers.kneeSleevesCompatible) {
    active.push('Sleeves');
  }
  if (gear.usingWristWraps && exercise.modifiers.wristWrapsCompatible) {
    active.push('Wraps');
  }

  if (active.length === 0) return null;
  return active.join(' + ');
}
