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
 * Tuchscherer/RTS RPE percentage table — fraction of 1RM.
 * Index: RPE_TABLE[reps][rpe] where reps ∈ [1,10], rpe ∈ {6,7,8,9,10}.
 * Fractional RPE values (e.g. 7.5) are handled by linear interpolation.
 * Sub-6 RPE values are extrapolated from the RPE6→RPE7 step.
 *
 * Key calibration anchors (cross-checked against RTS, Noriega, Stanek references):
 *   1 rep  @ RPE 10 → 100%                        (definition)
 *   5 reps @ RPE  8 → 84%                          (intensification zone)
 *   5 reps @ RPE 7.5 → (0.75+0.84)/2 = 79.5%     (accumulation zone)
 */
const RPE_TABLE: Record<number, Record<number, number>> = {
  //       RPE6   RPE7   RPE8   RPE9  RPE10
  1:  { 6: 0.80, 7: 0.86, 8: 0.92, 9: 0.96, 10: 1.00 },
  2:  { 6: 0.77, 7: 0.83, 8: 0.89, 9: 0.94, 10: 0.97 },
  3:  { 6: 0.74, 7: 0.80, 8: 0.86, 9: 0.91, 10: 0.94 },
  4:  { 6: 0.71, 7: 0.77, 8: 0.83, 9: 0.88, 10: 0.92 },
  5:  { 6: 0.68, 7: 0.75, 8: 0.84, 9: 0.86, 10: 0.89 },
  6:  { 6: 0.65, 7: 0.72, 8: 0.79, 9: 0.83, 10: 0.86 },
  7:  { 6: 0.63, 7: 0.69, 8: 0.76, 9: 0.80, 10: 0.83 },
  8:  { 6: 0.60, 7: 0.67, 8: 0.73, 9: 0.77, 10: 0.81 },
  9:  { 6: 0.58, 7: 0.64, 8: 0.70, 9: 0.74, 10: 0.78 },
  10: { 6: 0.56, 7: 0.62, 8: 0.67, 9: 0.72, 10: 0.75 },
};

/**
 * Given a 1RM, RPE target, and rep count, return the working load in kg.
 *
 * Uses the Tuchscherer/RTS RPE percentage table (industry standard across
 * RTS, Noriega, and Stanek programming). Fractional RPE values are linearly
 * interpolated between the two adjacent integer rows. Sub-RPE-6 values are
 * extrapolated by projecting the RPE6→RPE7 step further downward.
 *
 * The table covers reps 1–10; values beyond 10 clamp to the 10-rep row
 * (within 1–2 kg after rounding for typical accessory ranges of 11–12 reps).
 */
export function prescribeLoad(maxKg: number, rpe: number, reps: number): number {
  const clampedRpe  = Math.max(5, Math.min(10, rpe));
  const clampedReps = Math.max(1, Math.min(10, reps));

  let pct: number;

  if (clampedRpe < 6) {
    // Extrapolate below table: step down from RPE6 using the RPE7→RPE6 delta
    const rpe6       = RPE_TABLE[clampedReps]?.[6] ?? 0;
    const rpe7       = RPE_TABLE[clampedReps]?.[7] ?? 0;
    const stepPerRpe = rpe7 - rpe6; // positive — higher RPE = higher %
    pct = rpe6 - (6 - clampedRpe) * stepPerRpe; // step DOWN below RPE6
  } else {
    const rpeFloor = Math.floor(clampedRpe);
    const rpeCeil  = Math.ceil(clampedRpe);
    const pctFloor = RPE_TABLE[clampedReps]?.[rpeFloor] ?? 0;
    const pctCeil  = RPE_TABLE[clampedReps]?.[rpeCeil]  ?? 0;
    pct = rpeFloor === rpeCeil
      ? pctFloor
      : pctFloor + (clampedRpe - rpeFloor) * (pctCeil - pctFloor);
  }

  return maxKg * Math.max(0, pct);
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

// ── Wilks Score ───────────────────────────────────────────────────────────────

/**
 * Wilks score (2020 revised coefficients).
 * Bodyweight is clamped to valid ranges: men 40–200 kg, women 40–150 kg.
 * Returns points (typically 200–600 for competitive lifters).
 *
 * Formula:  Wilks = Total × 500 / (a·bw⁵ + b·bw⁴ + c·bw³ + d·bw² + e·bw + f)
 */
export function calcWilks(total: number, bodyweightKg: number, sex: Sex): number {
  let a: number, b: number, c: number, d: number, e: number, f: number, bw: number;

  if (sex === 'MALE') {
    bw = Math.min(200, Math.max(40, bodyweightKg));
    a = -216.0475144;
    b =  16.2606339;
    c = -0.002388645;
    d = -0.00113732;
    e =  7.01863e-6;
    f = -1.291e-8;
  } else {
    bw = Math.min(150, Math.max(40, bodyweightKg));
    a =  594.31747775582;
    b = -27.23842536447;
    c =  0.82112226871;
    d = -0.00930733913;
    e =  4.731582e-5;
    f = -9.054e-8;
  }

  const denom = a + b * bw + c * bw ** 2 + d * bw ** 3 + e * bw ** 4 + f * bw ** 5;
  if (denom <= 0) return 0;

  return (total * 500) / denom;
}

// ── IPF GL Points ─────────────────────────────────────────────────────────────

/**
 * IPF Goodlift Points (GL Points) — the official IPF scoring system (2020+).
 * Uses natural-log regression coefficients published by the IPF.
 *
 * Formula:  GL = Total × 100 / (a − b × e^(−c × bw))
 * Bodyweight is clamped to 40–250 kg.
 */
export function calcIpfPoints(total: number, bodyweightKg: number, sex: Sex): number {
  const bw = Math.min(250, Math.max(40, bodyweightKg));

  let a: number, b: number, c: number;

  if (sex === 'MALE') {
    a = 1199.72839;
    b = 1025.18162;
    c = 0.009210;
  } else {
    a = 610.32796;
    b = 527.01485;
    c = 0.011452;
  }

  const denom = a - b * Math.exp(-c * bw);
  if (denom <= 0) return 0;

  return (total * 100) / denom;
}

// ── Inverse RPE: Estimate 1RM from a logged set ──────────────────────────────

/**
 * Inverse of `prescribeLoad`: given a performed set, estimate the athlete's
 * 1RM using the Tuchscherer/RTS RPE percentage table.
 *
 *   e1RM = loadKg / RPE_TABLE[reps][rpe]
 *
 * Returns `null` if the lookup falls outside the table range or would produce
 * a nonsensical value (e.g. zero divisor).
 */
export function estimateMaxFromRpe(
  loadKg: number,
  reps: number,
  rpe: number,
): number | null {
  const clampedRpe  = Math.max(6, Math.min(10, rpe));
  const clampedReps = Math.max(1, Math.min(10, reps));

  const rpeFloor = Math.floor(clampedRpe);
  const rpeCeil  = Math.ceil(clampedRpe);
  const pctFloor = RPE_TABLE[clampedReps]?.[rpeFloor] ?? 0;
  const pctCeil  = RPE_TABLE[clampedReps]?.[rpeCeil]  ?? 0;

  const pct =
    rpeFloor === rpeCeil
      ? pctFloor
      : pctFloor + (clampedRpe - rpeFloor) * (pctCeil - pctFloor);

  if (pct <= 0) return null;
  return loadKg / pct;
}

// ── Auto-Max Detection ───────────────────────────────────────────────────────

export interface MaxUpdateSuggestion {
  lift: 'SQUAT' | 'BENCH' | 'DEADLIFT';
  currentMax: number;
  suggestedMax: number;
  evidence: string; // e.g. "5 × 140 @ RPE 8 → est. 1RM 168 kg"
}

/**
 * Analyse recent logged sets for a competition lift and determine whether the
 * athlete's current training max should be bumped.
 *
 * Algorithm:
 * 1. Filter sets that have `rpeLogged` and at least 1 rep.
 * 2. Estimate 1RM for each via the inverse RPE table.
 * 3. Take the median of the top 3 estimated 1RMs.
 * 4. If that median exceeds `currentMax × 1.03` (at least 3% above), return
 *    a suggestion.
 *
 * Guard: need ≥ 3 qualifying sets to avoid basing a max update on a single
 * lucky set.
 */
export function detectMaxUpdate(
  lift: 'SQUAT' | 'BENCH' | 'DEADLIFT',
  currentMax: number,
  recentSets: Array<{ loadKg: number; reps: number; rpeLogged?: number }>,
): MaxUpdateSuggestion | null {
  // Collect valid e1RMs
  const estimates: { e1rm: number; set: typeof recentSets[number] }[] = [];

  for (const s of recentSets) {
    if (s.rpeLogged === undefined || s.reps < 1) continue;
    const e1rm = estimateMaxFromRpe(s.loadKg, s.reps, s.rpeLogged);
    if (e1rm !== null && e1rm > 0) {
      estimates.push({ e1rm, set: s });
    }
  }

  if (estimates.length < 3) return null;

  // Sort descending and take top 3
  estimates.sort((a, b) => b.e1rm - a.e1rm);
  const top3 = estimates.slice(0, 3);

  // Median of 3 = the middle value (index 1 when sorted desc)
  const median = top3[1]!.e1rm;

  // Need at least 3% improvement to suggest
  if (median <= currentMax * 1.03) return null;

  const suggestedMax = Math.round(median * 2) / 2; // round to 0.5 kg
  const best = top3[1]!.set;
  const evidence = `${best.reps} × ${best.loadKg} @ RPE ${best.rpeLogged} → est. 1RM ${Math.round(median)} kg`;

  return { lift, currentMax, suggestedMax, evidence };
}

// ── Neural Gap Detection ─────────────────────────────────────────────────────

/**
 * If `gymMax > meetMax × 1.05`, the athlete has a "neural gap" — they're
 * stronger in training than on the platform. Returns the gap percentage
 * (e.g. 8 means gym max is 8% above meet max). Returns 0 when no gap.
 */
export function detectNeuralGap(meetMax: number, gymMax: number): number {
  if (meetMax <= 0 || gymMax <= meetMax * 1.05) return 0;
  return Math.round(((gymMax - meetMax) / meetMax) * 100);
}

// ── Isometric hold prescription ──────────────────────────────────────────────

/**
 * Prescribe hold seconds for an isometric skill level (front lever, planche,
 * L-sit, etc.). Scales the level's target by RPE so the coach can dial the
 * hold down on a low-readiness day without changing the level itself.
 *
 * Examples:
 *   prescribeHoldSeconds(15, 7.5) ≈ 11s  (75%)
 *   prescribeHoldSeconds(15, 9)   ≈ 14s  (93%)
 *   prescribeHoldSeconds(15, 10)  === 15  (100%)
 *
 * Floored at 3s — hold any less and the set is too short to build capacity.
 */
export function prescribeHoldSeconds(targetSeconds: number, rpe: number): number {
  const clampedRpe = Math.max(5, Math.min(10, rpe));
  // Map RPE 10→1.00, RPE 7→0.70, RPE 5→0.50. Linear for simplicity.
  const factor = 0.1 * clampedRpe;
  const seconds = Math.round(targetSeconds * factor);
  return Math.max(3, seconds);
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
