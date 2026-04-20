import { describe, it, expect } from 'vitest';
import {
  resolveDailyTarget,
  shouldRefeed,
  bmrMifflinStJeor,
  bmrKatchMcArdle,
  defaultNutritionProfile,
  estimateTdee,
} from '../nutrition';
import type { NutritionProfile } from '@/lib/db/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseProfile = {
  weightKg: 82,
  heightCm: 180,
  sex: 'MALE' as const,
  trainingAgeMonths: 24,
  age: 28,
};

function nutrition(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    id: 'me',
    dietPhase: 'MAINTAIN',
    bmrFormula: 'MIFFLIN_ST_JEOR',
    activityFactor: 1.55,
    trainingDayKcal: 3000,
    restDayKcal: 2600,
    refeedDayKcal: 3600,
    proteinGPerKg: 2.0,
    fatGPerKg: 0.9,
    carbGPerKg: 4.0,
    refeedFrequencyDays: 10,
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── BMR formulas ─────────────────────────────────────────────────────────────

describe('BMR formulas', () => {
  it('Mifflin for a male athlete', () => {
    // 10*82 + 6.25*180 − 5*28 + 5 = 820 + 1125 − 140 + 5 = 1810
    expect(bmrMifflinStJeor(82, 180, 28, 'MALE')).toBe(1810);
  });

  it('Mifflin for a female athlete', () => {
    // 10*65 + 6.25*165 − 5*30 − 161 = 650 + 1031.25 − 150 − 161 = 1370.25
    expect(Math.round(bmrMifflinStJeor(65, 165, 30, 'FEMALE'))).toBe(1370);
  });

  it('Katch-McArdle uses lean body mass', () => {
    // lbm = 82 * (1 − 0.15) = 69.7 → 370 + 21.6 * 69.7 = 1875.52
    expect(Math.round(bmrKatchMcArdle(82, 15))).toBe(1876);
  });

  it('estimateTdee multiplies BMR by activity factor', () => {
    const tdee = estimateTdee(baseProfile, nutrition({ activityFactor: 1.5 }));
    // 1810 * 1.5 = 2715
    expect(tdee).toBe(2715);
  });
});

// ── Refeed rule ──────────────────────────────────────────────────────────────

describe('shouldRefeed', () => {
  it('never refeeds on a rest day', () => {
    expect(shouldRefeed('ACCUMULATION', false, undefined, 10, '2026-04-20')).toBe(false);
  });

  it('refeeds when frequency elapsed', () => {
    expect(shouldRefeed('ACCUMULATION', true, '2026-04-09', 10, '2026-04-20')).toBe(true);
  });

  it('does not refeed when frequency not elapsed', () => {
    expect(shouldRefeed('ACCUMULATION', true, '2026-04-18', 10, '2026-04-20')).toBe(false);
  });

  it('suppresses refeed during REALIZATION', () => {
    expect(shouldRefeed('REALIZATION', true, '2026-04-01', 10, '2026-04-20')).toBe(false);
  });

  it('suppresses refeed during DELOAD', () => {
    expect(shouldRefeed('DELOAD', true, '2026-04-01', 10, '2026-04-20')).toBe(false);
  });

  it('frequency 0 disables refeeds entirely', () => {
    expect(shouldRefeed('ACCUMULATION', true, '2026-01-01', 0, '2026-04-20')).toBe(false);
  });

  it('does not auto-refeed when no prior refeed has been logged', () => {
    // Athlete opts in to the first refeed manually; cadence applies afterwards.
    expect(shouldRefeed('ACCUMULATION', true, undefined, 10, '2026-04-20')).toBe(false);
  });
});

// ── Resolver ─────────────────────────────────────────────────────────────────

describe('resolveDailyTarget', () => {
  it('uses training-day kcal on a training day', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition(),
      isTrainingDay: true,
      blockType: 'ACCUMULATION',
    });
    // 3000 * 1.00 (MAINTAIN)
    expect(t.kcal).toBe(3000);
    expect(t.isTrainingDay).toBe(true);
    expect(t.isRefeed).toBe(false);
  });

  it('uses rest-day kcal on a rest day', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition(),
      isTrainingDay: false,
      blockType: 'ACCUMULATION',
    });
    expect(t.kcal).toBe(2600);
    expect(t.isTrainingDay).toBe(false);
  });

  it('uses refeed kcal when refeed cadence triggers', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition({ lastRefeedDate: '2026-04-09' }),
      isTrainingDay: true,
      blockType: 'ACCUMULATION',
    });
    expect(t.isRefeed).toBe(true);
    expect(t.kcal).toBe(3600);
  });

  it('applies phase multiplier on CUT', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition({ dietPhase: 'CUT' }),
      isTrainingDay: true,
      blockType: 'ACCUMULATION',
    });
    // 3000 * 0.80 = 2400
    expect(t.kcal).toBe(2400);
  });

  it('computes protein and fat from body weight', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition(),
      isTrainingDay: true,
    });
    // protein: 82 * 2.0 = 164
    expect(t.proteinG).toBe(164);
    // fat: 82 * 0.9 = 73.8 → 74
    expect(t.fatG).toBe(74);
    // carbs fill remainder: kcal − 4*164 − 9*74 = 3000 − 656 − 666 = 1678 → 1678/4 ≈ 420
    expect(t.carbG).toBeGreaterThan(400);
    expect(t.carbG).toBeLessThan(450);
  });

  it('returns non-negative carbs even if protein + fat exceed kcal', () => {
    const t = resolveDailyTarget({
      date: '2026-04-20',
      profile: baseProfile,
      nutrition: nutrition({
        proteinGPerKg: 6,   // extreme
        fatGPerKg: 3,
        trainingDayKcal: 1000,
      }),
      isTrainingDay: true,
    });
    expect(t.carbG).toBeGreaterThanOrEqual(0);
  });
});

// ── Defaults ─────────────────────────────────────────────────────────────────

describe('defaultNutritionProfile', () => {
  it('scales training-day kcal with body weight', () => {
    const d82 = defaultNutritionProfile({ weightKg: 82 });
    const d100 = defaultNutritionProfile({ weightKg: 100 });
    expect(d100.trainingDayKcal).toBeGreaterThan(d82.trainingDayKcal);
  });

  it('rest-day kcal is less than training-day kcal', () => {
    const d = defaultNutritionProfile({ weightKg: 82 });
    expect(d.restDayKcal).toBeLessThan(d.trainingDayKcal);
  });

  it('refeed-day kcal is greater than training-day kcal', () => {
    const d = defaultNutritionProfile({ weightKg: 82 });
    expect(d.refeedDayKcal).toBeGreaterThan(d.trainingDayKcal);
  });
});
