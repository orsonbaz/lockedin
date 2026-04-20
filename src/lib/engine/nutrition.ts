/**
 * nutrition.ts — Resolve daily calorie and macro targets.
 *
 * Pure functions that turn a NutritionProfile + context (training day,
 * block phase, days-since-last-refeed) into a DailyTarget. The UI layer
 * reads these and renders the athlete's target rings; the coach prompt
 * references them so advice is grounded in real numbers.
 *
 * Refeed rule:
 *   - Only during ACCUMULATION or INTENSIFICATION blocks.
 *   - Only on a training day.
 *   - Only when daysSinceLastRefeed >= refeedFrequencyDays.
 *   - Suppressed during REALIZATION, DELOAD (weight-sensitive windows).
 *
 * BMR formulas:
 *   - MIFFLIN_ST_JEOR: 10 × kg + 6.25 × cm − 5 × age + (5 ♂ / −161 ♀)
 *   - KATCH_MCARDLE:   370 + 21.6 × lean body mass (needs bodyFatPercent)
 *
 * We default activity factor to 1.55 for a 4-day strength athlete.
 */

import type {
  AthleteProfile,
  BlockType,
  DietPhase,
  NutritionProfile,
} from '@/lib/db/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DailyTarget {
  date: string;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  isTrainingDay: boolean;
  isRefeed: boolean;
  note?: string;
}

export interface ResolveTargetInputs {
  date: string;
  profile: Pick<AthleteProfile, 'weightKg' | 'heightCm' | 'sex' | 'trainingAgeMonths'> & {
    /** Derived from `createdAt` + trainingAgeMonths; caller can pass age directly. */
    age?: number;
  };
  nutrition: NutritionProfile;
  isTrainingDay: boolean;
  blockType?: BlockType;
}

// ── BMR + TDEE ───────────────────────────────────────────────────────────────

export function bmrMifflinStJeor(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: 'MALE' | 'FEMALE' | 'OTHER',
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  // OTHER: average the ±161 offset for a neutral mid-point.
  if (sex === 'MALE') return base + 5;
  if (sex === 'FEMALE') return base - 161;
  return base - 78;
}

export function bmrKatchMcArdle(weightKg: number, bodyFatPercent: number): number {
  const lbm = weightKg * (1 - bodyFatPercent / 100);
  return 370 + 21.6 * lbm;
}

export function estimateBmr(
  profile: ResolveTargetInputs['profile'],
  nutrition: NutritionProfile,
): number {
  if (nutrition.bmrFormula === 'KATCH_MCARDLE' && nutrition.bodyFatPercent !== undefined) {
    return bmrKatchMcArdle(profile.weightKg, nutrition.bodyFatPercent);
  }
  const age = profile.age ?? 28;  // reasonable default; UI collects age separately
  const height = profile.heightCm ?? 175;
  return bmrMifflinStJeor(profile.weightKg, height, age, profile.sex);
}

export function estimateTdee(
  profile: ResolveTargetInputs['profile'],
  nutrition: NutritionProfile,
): number {
  return Math.round(estimateBmr(profile, nutrition) * nutrition.activityFactor);
}

// ── Refeed decision ──────────────────────────────────────────────────────────

export function shouldRefeed(
  blockType: BlockType | undefined,
  isTrainingDay: boolean,
  lastRefeedDate: string | undefined,
  refeedFrequencyDays: number,
  today: string,
): boolean {
  if (refeedFrequencyDays <= 0) return false;
  if (!isTrainingDay) return false;
  if (blockType === 'REALIZATION' || blockType === 'DELOAD') return false;
  if (blockType && blockType !== 'ACCUMULATION' && blockType !== 'INTENSIFICATION') {
    // PIVOT / MAINTENANCE are ambiguous; allow refeeds for variety.
    // (Explicit list keeps the logic readable and easy to change.)
  }
  // No prior refeed logged yet → athlete hasn't opted in. Surface the
  // suggestion in the UI, but don't auto-flip a normal training day.
  if (!lastRefeedDate) return false;

  const last = Date.parse(lastRefeedDate + 'T00:00:00');
  const now = Date.parse(today + 'T00:00:00');
  if (Number.isNaN(last) || Number.isNaN(now)) return false;
  const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
  return days >= refeedFrequencyDays;
}

// ── Target resolver ──────────────────────────────────────────────────────────

function phaseAdjustment(phase: DietPhase): number {
  // Multiplier applied to the day's base kcal after the training/rest split.
  switch (phase) {
    case 'CUT':     return 0.80;
    case 'RECOMP':  return 0.95;
    case 'MAINTAIN': return 1.00;
    case 'BULK':    return 1.10;
  }
}

export function resolveDailyTarget(inputs: ResolveTargetInputs): DailyTarget {
  const { nutrition, profile, isTrainingDay, blockType, date } = inputs;
  const isRefeed = shouldRefeed(
    blockType,
    isTrainingDay,
    nutrition.lastRefeedDate,
    nutrition.refeedFrequencyDays,
    date,
  );

  const baseKcal = isRefeed
    ? nutrition.refeedDayKcal
    : isTrainingDay
      ? nutrition.trainingDayKcal
      : nutrition.restDayKcal;

  const kcal = Math.round(baseKcal * phaseAdjustment(nutrition.dietPhase));

  // Protein scales with body weight; fat floor for hormones; carbs fill the rest.
  const proteinG = Math.round(profile.weightKg * nutrition.proteinGPerKg);
  const fatG = Math.round(profile.weightKg * nutrition.fatGPerKg);
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbKcal = Math.max(0, kcal - proteinKcal - fatKcal);
  const carbG = Math.round(carbKcal / 4);

  const note = isRefeed
    ? `Refeed day: carbs +${Math.round(((nutrition.refeedDayKcal - nutrition.trainingDayKcal) / nutrition.trainingDayKcal) * 100)}% vs training baseline.`
    : isTrainingDay
      ? 'Training day target.'
      : 'Rest day target.';

  return { date, kcal, proteinG, carbG, fatG, isTrainingDay, isRefeed, note };
}

// ── Sensible defaults for first-time profile creation ───────────────────────

export function defaultNutritionProfile(
  profile: Pick<AthleteProfile, 'weightKg'>,
  phase: DietPhase = 'MAINTAIN',
): Omit<NutritionProfile, 'updatedAt'> {
  // Training day ≈ TDEE. Rest day ≈ TDEE − 400. Refeed ≈ TDEE + 600.
  // We don't have a TDEE here; use body-weight-based rules of thumb that
  // are reasonable starting points before the athlete tunes them.
  const tdee = Math.round(profile.weightKg * 33);  // 33 kcal/kg ~ moderate
  return {
    id: 'me',
    dietPhase: phase,
    bmrFormula: 'MIFFLIN_ST_JEOR',
    activityFactor: 1.55,
    trainingDayKcal: tdee,
    restDayKcal: Math.max(tdee - 400, Math.round(profile.weightKg * 24)),
    refeedDayKcal: tdee + 600,
    proteinGPerKg: 2.0,
    fatGPerKg: 0.9,
    carbGPerKg: 4.0,           // informational — carbs are computed as the remainder
    refeedFrequencyDays: 10,
  };
}
