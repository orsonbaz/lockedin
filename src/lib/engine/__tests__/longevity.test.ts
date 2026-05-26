import { describe, it, expect } from 'vitest';
import {
  scoreSleep,
  scoreCardio,
  scoreStrength,
  scoreMobility,
  scoreRecovery,
  scoreNutrition,
  scoreInjuryRisk,
  composeLongevityScore,
  PILLAR_WEIGHTS,
} from '../longevity';
import type { Injury } from '@/lib/db/types';

function makeInjury(overrides: Partial<Injury>): Injury {
  const iso = '2026-01-01T00:00:00.000Z';
  return {
    id: 'a',
    label: 'Test',
    regions: ['LEFT_KNEE'],
    status: 'MANAGING',
    severity: 3,
    onsetDate: '2026-01-01',
    contraindicatedPatterns: [],
    contraindicatedSwapGroups: [],
    preferredPatterns: [],
    constraints: [],
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

describe('PILLAR_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const total = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

describe('scoreSleep', () => {
  it('returns 0 when no data', () => {
    expect(scoreSleep({ hoursLast7d: [] })).toBe(0);
  });

  it('returns 0 for averages below 6h', () => {
    expect(scoreSleep({ hoursLast7d: [5, 5, 5] })).toBe(0);
  });

  it('hits 100 for averages at or above 8h', () => {
    expect(scoreSleep({ hoursLast7d: [8, 8, 9] })).toBe(100);
  });

  it('scales linearly between 6-8h', () => {
    // 7h average = 60 pts
    expect(scoreSleep({ hoursLast7d: [7, 7, 7] })).toBe(60);
    // 7.5h average = 80 pts
    expect(scoreSleep({ hoursLast7d: [7.5, 7.5] })).toBe(80);
  });

  it('averages with quality when present', () => {
    // 8h hours (100) + 50 quality → 75
    expect(scoreSleep({
      hoursLast7d: [8, 8],
      qualitiesLast7d: [50, 50],
    })).toBe(75);
  });
});

describe('scoreCardio', () => {
  it('returns 0 with no minutes', () => {
    expect(scoreCardio({ zone2MinutesLast7d: 0 })).toBe(0);
  });

  it('hits target = 100 (back-compat path, no vo2max input)', () => {
    expect(scoreCardio({ zone2MinutesLast7d: 150 })).toBe(100);
  });

  it('half-credits minutes beyond target', () => {
    expect(scoreCardio({ zone2MinutesLast7d: 300 })).toBeLessThanOrEqual(100);
    expect(scoreCardio({ zone2MinutesLast7d: 300 })).toBeGreaterThanOrEqual(100);
  });

  it('respects a custom target', () => {
    expect(scoreCardio({ zone2MinutesLast7d: 100, weeklyTargetMin: 100 })).toBe(100);
  });

  // Phase B — polarized cardio scoring.
  it('Phase B: polarized — full zone-2 + full vo2max = 100', () => {
    expect(scoreCardio({
      zone2MinutesLast7d: 150,
      vo2maxSessionsLast7d: 1,
    })).toBe(100);
  });

  it('Phase B: 70/30 weighting — full zone-2 only ≈ 70', () => {
    expect(scoreCardio({
      zone2MinutesLast7d: 150,
      vo2maxSessionsLast7d: 0,
    })).toBe(70);
  });

  it('Phase B: 70/30 weighting — full vo2max only ≈ 30', () => {
    expect(scoreCardio({
      zone2MinutesLast7d: 0,
      vo2maxSessionsLast7d: 1,
    })).toBe(30);
  });

  it('Phase B: 2× VO2max sessions does not exceed 1× weighting', () => {
    // VO2max sub-score caps at 100 even with 2 sessions — recovery cost is real.
    expect(scoreCardio({
      zone2MinutesLast7d: 150,
      vo2maxSessionsLast7d: 2,
    })).toBe(100);
  });
});

describe('scoreStrength', () => {
  it('scales linearly to weekly target', () => {
    expect(scoreStrength({ sessionsLast7d: 0 })).toBe(0);
    expect(scoreStrength({ sessionsLast7d: 1 })).toBe(33);
    expect(scoreStrength({ sessionsLast7d: 3 })).toBe(100);
    expect(scoreStrength({ sessionsLast7d: 5 })).toBe(100);
  });
});

describe('scoreMobility', () => {
  it('scales linearly to weekly target (back-compat path)', () => {
    expect(scoreMobility({ routinesLast7d: 0 })).toBe(0);
    expect(scoreMobility({ routinesLast7d: 5 })).toBe(100);
  });

  // Phase B — FRC-aware composite.
  it('Phase B: composite — full routines + full CAR streak + gap closing', () => {
    expect(scoreMobility({
      routinesLast7d: 5,
      carDaysLast7: 5,
      activeRomGapClosureDelta: -2,
    })).toBe(100);
  });

  it('Phase B: CAR-only — no routines, daily CARs still scores meaningfully', () => {
    // 0 routines (0% of 60% weight) + 5 CAR days (100% of 25% weight) + neutral gap (50% of 15% weight)
    // = 0 + 25 + 7.5 ≈ 33
    const score = scoreMobility({
      routinesLast7d: 0,
      carDaysLast7: 5,
      activeRomGapClosureDelta: null,
    });
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(36);
  });

  it('Phase B: gap widening costs points vs closing', () => {
    const closing = scoreMobility({
      routinesLast7d: 5,
      carDaysLast7: 5,
      activeRomGapClosureDelta: -2,
    });
    const widening = scoreMobility({
      routinesLast7d: 5,
      carDaysLast7: 5,
      activeRomGapClosureDelta: 5,
    });
    expect(widening).toBeLessThan(closing);
  });

  it('Phase B: null gap delta is neutral (50%), not penalized', () => {
    const withData = scoreMobility({
      routinesLast7d: 5,
      carDaysLast7: 5,
      activeRomGapClosureDelta: -2,
    });
    const noData = scoreMobility({
      routinesLast7d: 5,
      carDaysLast7: 5,
      activeRomGapClosureDelta: null,
    });
    // No-data should be lower than full closing (50% < 100% on that sub-score)
    // but still strong (≥ 90).
    expect(noData).toBeLessThan(withData);
    expect(noData).toBeGreaterThanOrEqual(90);
  });
});

describe('scoreRecovery', () => {
  it('returns 50 when no HRV data', () => {
    expect(scoreRecovery({})).toBe(50);
  });

  it('100 when HRV is +10% above baseline', () => {
    expect(scoreRecovery({ hrvToday: 55, hrvBaseline28d: 50 })).toBe(100);
  });

  it('80 at baseline (zero deviation)', () => {
    expect(scoreRecovery({ hrvToday: 50, hrvBaseline28d: 50 })).toBe(80);
  });

  it('decreases as HRV drops below baseline', () => {
    expect(scoreRecovery({ hrvToday: 45, hrvBaseline28d: 50 })).toBeLessThan(80);
    expect(scoreRecovery({ hrvToday: 40, hrvBaseline28d: 50 })).toBeLessThan(50);
  });

  it('subtracts subjective stress', () => {
    const a = scoreRecovery({ hrvToday: 50, hrvBaseline28d: 50, stress: 1 });
    const b = scoreRecovery({ hrvToday: 50, hrvBaseline28d: 50, stress: 5 });
    expect(b).toBeLessThan(a);
  });
});

describe('scoreNutrition', () => {
  it('returns 50 when no data', () => {
    expect(scoreNutrition({})).toBe(50);
  });

  it('averages protein and kcal adherence', () => {
    expect(scoreNutrition({ proteinAdherence7d: 80, kcalBandAdherence7d: 60 })).toBe(70);
  });
});

describe('scoreInjuryRisk', () => {
  it('hits 100 when no active injuries', () => {
    expect(scoreInjuryRisk([])).toBe(100);
  });

  it('subtracts 8 per severity point', () => {
    expect(scoreInjuryRisk([makeInjury({ severity: 3 })])).toBe(76);
    expect(scoreInjuryRisk([makeInjury({ severity: 5 })])).toBe(60);
  });

  it('floors at 0', () => {
    const many = [
      makeInjury({ id: 'a', severity: 5 }),
      makeInjury({ id: 'b', severity: 5 }),
      makeInjury({ id: 'c', severity: 5 }),
    ];
    expect(scoreInjuryRisk(many)).toBe(0);
  });

  it('ignores RESOLVED injuries', () => {
    const resolved = makeInjury({ status: 'RESOLVED', severity: 5 });
    const active = makeInjury({ id: 'b', severity: 2 });
    expect(scoreInjuryRisk([resolved, active])).toBe(84);
  });
});

describe('composeLongevityScore', () => {
  it('returns 100 when every pillar is 100', () => {
    expect(composeLongevityScore({
      sleep: 100, cardio: 100, strength: 100, mobility: 100,
      recovery: 100, nutrition: 100, injuryRisk: 100,
    })).toBe(100);
  });

  it('returns 0 when every pillar is 0', () => {
    expect(composeLongevityScore({
      sleep: 0, cardio: 0, strength: 0, mobility: 0,
      recovery: 0, nutrition: 0, injuryRisk: 0,
    })).toBe(0);
  });

  it('weights according to PILLAR_WEIGHTS', () => {
    // Only sleep is 100, others are 0 → expect ≈ 20.
    const score = composeLongevityScore({
      sleep: 100, cardio: 0, strength: 0, mobility: 0,
      recovery: 0, nutrition: 0, injuryRisk: 0,
    });
    expect(score).toBe(20);
  });
});
