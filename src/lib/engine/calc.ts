/**
 * calc.ts — Pure math functions for Lockedin programming engine.
 * No side effects, no DB/API calls, fully tree-shakeable.
 */

import type { BlockType, Bottleneck, Responder, Sex } from '@/lib/db/types';

// ── 1RM Estimation ─────────────────────────────────────────────────────────────

/**
 * Epley formula: estimate 1RM from a submaximal set.
 * estimateMax(100, 5) ≈ 116.7 kg
 * For reps === 1 the load is the 1RM, returned unchanged.
 */
export function estimateMax(load: number, reps: number): number {
  if (reps <= 1) return load;
  return load * (1 + reps / 30);
}

// ── Load Prescription ──────────────────────────────────────────────────────────

/**
 * Given a 1RM, RPE target, and rep count, return the working load in kg.
 *
 * RPE anchors (for 1 rep):
 *   RPE 10 → 100%   RPE 9 → 97%   RPE 8 → 94%
 *   RPE 7  → 91%    RPE 6 → 88%   RPE 5 → 85%
 *   Each point is exactly 3% — fractional RPE is supported via interpolation.
 *
 * Rep offset: each rep beyond 1 reduces the load by 2.5% (Tuchscherer-style).
 */
export function prescribeLoad(maxKg: number, rpe: number, reps: number): number {
  const clampedRpe = Math.max(5, Math.min(10, rpe));
  // Linear: RPE10 = 100%, step down 3% per RPE point
  const rpePercent = 1.0 - (10 - clampedRpe) * 0.03;
  const repOffset = Math.max(0, reps - 1) * 0.025;
  return maxKg * Math.max(0, rpePercent - repOffset);
}

// ── Plate Rounding ─────────────────────────────────────────────────────────────

/** Round to nearest 2.5 kg (standard barbell plate increment). */
export function roundLoad(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

// ── Readiness Adjustments ──────────────────────────────────────────────────────

/**
 * Map a composite readiness score (0–100) to a volume multiplier.
 *   80–100 → 1.0   (train as planned)
 *   60–79  → 0.9   (reduce by 10%)
 *   40–59  → 0.8   (reduce by 20%)
 *    0–39  → 0.6   (recovery session)
 */
export function readinessToVolumeMultiplier(score: number): number {
  if (score >= 80) return 1.0;
  if (score >= 60) return 0.9;
  if (score >= 40) return 0.8;
  return 0.6;
}

/**
 * Map readiness score to an RPE offset (added to all RPE targets).
 *   80–100 →  0.0
 *   60–79  → −0.5
 *   40–59  → −1.0
 *    0–39  → −1.5
 */
export function readinessToRpeOffset(score: number): number {
  if (score >= 80) return 0;
  if (score >= 60) return -0.5;
  if (score >= 40) return -1.0;
  return -1.5;
}

// ── Block Defaults ─────────────────────────────────────────────────────────────

/** Default intensity target (%1RM as 0–1) for each block type. */
export function blockToIntensity(block: BlockType): number {
  const map: Record<BlockType, number> = {
    ACCUMULATION:    0.73,
    INTENSIFICATION: 0.82,
    REALIZATION:     0.90,
    DELOAD:          0.65,
    PIVOT:           0.70,
    MAINTENANCE:     0.75,
  };
  return map[block];
}

/** Default sets for the primary movement per block type. */
export function blockToSets(block: BlockType): number {
  const map: Record<BlockType, number> = {
    ACCUMULATION:    5,
    INTENSIFICATION: 4,
    REALIZATION:     3,
    DELOAD:          2,
    PIVOT:           3,
    MAINTENANCE:     3,
  };
  return map[block];
}

// ── Athlete Factors ────────────────────────────────────────────────────────────

/** Default reps per set based on the athlete's primary bottleneck. */
export function bottleneckToReps(bottleneck: Bottleneck): number {
  const map: Record<Bottleneck, number> = {
    HYPERTROPHY: 6,
    NEURAL:      3,
    BALANCED:    5,
  };
  return map[bottleneck];
}

/** Volume multiplier from training-response phenotype. */
export function responderMultiplier(responder: Responder): number {
  const map: Record<Responder, number> = {
    HIGH:     1.2,
    LOW:      0.8,
    STANDARD: 1.0,
  };
  return map[responder];
}

/**
 * If the athlete is an overshooter, reduce prescribed RPE by 0.5 so they
 * actually land near the intended intensity.
 */
export function overshooterRpeAdjust(rpe: number, isOvershooter: boolean): number {
  return isOvershooter ? rpe - 0.5 : rpe;
}

// ── DOTS Score ─────────────────────────────────────────────────────────────────

/**
 * DOTS score (federation-standard formula by Tim Konertz, 2019).
 * Bodyweight is clamped to valid ranges: men 40–210 kg, women 40–150 kg.
 * Returns points (typically 200–600 for competitive athletes).
 */
export function calcDots(total: number, bodyweightKg: number, sex: Sex): number {
  let a: number, b: number, c: number, d: number, e: number, bw: number;

  if (sex === 'MALE') {
    bw = Math.min(210, Math.max(40, bodyweightKg));
    a = -0.000001093;
    b =  0.0007391293;
    c = -0.1918759221;
    d =  24.0900756;
    e = -307.75076;
  } else {
    // FEMALE and OTHER use the women's formula
    bw = Math.min(150, Math.max(40, bodyweightKg));
    a = -0.0000010706;
    b =  0.0005158568;
    c = -0.1126655495;
    d =  13.6175032;
    e = -57.96288;
  }

  const denominator =
    a * bw ** 4 +
    b * bw ** 3 +
    c * bw ** 2 +
    d * bw +
    e;

  return (total * 500) / denominator;
}

// ── Attempt Selection ──────────────────────────────────────────────────────────

/**
 * Suggest opener / 2nd / 3rd attempts from a training max.
 * Rounds each attempt to the nearest 0.5 kg (meet standard).
 *   Opener → 92% of max
 *   2nd    → 99% of max
 *   3rd    → 103% of max
 */
export function suggestAttempts(
  trainingMaxKg: number,
): [number, number, number] {
  const toHalf = (kg: number) => Math.round(kg * 2) / 2;
  return [
    toHalf(trainingMaxKg * 0.92),
    toHalf(trainingMaxKg * 0.99),
    toHalf(trainingMaxKg * 1.03),
  ];
}
