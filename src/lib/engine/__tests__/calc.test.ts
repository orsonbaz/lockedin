import { describe, it, expect } from 'vitest';
import {
  estimateMax,
  prescribeLoad,
  roundLoad,
  readinessToVolumeMultiplier,
  readinessToRpeOffset,
  blockToIntensity,
  blockToSets,
  bottleneckToReps,
  responderMultiplier,
  overshooterRpeAdjust,
  calcDots,
  calcWilks,
  calcIpfPoints,
  suggestAttempts,
  estimateMaxFromRpe,
  detectMaxUpdate,
  detectNeuralGap,
} from '../calc';

// ── estimateMax ───────────────────────────────────────────────────────────────

describe('estimateMax', () => {
  it('matches spec example: 100 kg × 5 reps ≈ 117 kg', () => {
    expect(estimateMax(100, 5)).toBeCloseTo(116.67, 1);
  });

  it('returns load unchanged for 1 rep (load IS the 1RM)', () => {
    expect(estimateMax(100, 1)).toBe(100);
    expect(estimateMax(200, 1)).toBe(200);
  });

  it('scales up correctly for higher reps', () => {
    // Epley: load * (1 + reps/30)
    expect(estimateMax(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimateMax(100, 3)).toBeCloseTo(110.0, 1);
  });

  it('produces higher estimates for heavier loads', () => {
    expect(estimateMax(150, 5)).toBeGreaterThan(estimateMax(100, 5));
  });

  it('produces higher estimates for more reps at the same load', () => {
    expect(estimateMax(100, 8)).toBeGreaterThan(estimateMax(100, 5));
  });
});

// ── prescribeLoad ─────────────────────────────────────────────────────────────

describe('prescribeLoad', () => {
  it('RPE 10 × 1 rep returns 100% of max', () => {
    expect(prescribeLoad(180, 10, 1)).toBeCloseTo(180, 1);
  });

  it('RPE 9 × 1 rep returns 96% of max (RTS table)', () => {
    expect(prescribeLoad(180, 9, 1)).toBeCloseTo(172.8, 1);
  });

  it('RPE 8 × 1 rep returns 92% of max (RTS table)', () => {
    expect(prescribeLoad(180, 8, 1)).toBeCloseTo(165.6, 1);
  });

  it('RPE 7 × 1 rep returns 86% of max (RTS table)', () => {
    expect(prescribeLoad(180, 7, 1)).toBeCloseTo(154.8, 1);
  });

  it('RPE 6 × 1 rep returns 80% of max (RTS table)', () => {
    expect(prescribeLoad(180, 6, 1)).toBeCloseTo(144.0, 1);
  });

  it('load decreases monotonically as reps increase at fixed RPE', () => {
    const rpe8 = (r: number) => prescribeLoad(200, 8, r);
    expect(rpe8(1)).toBeGreaterThan(rpe8(3));
    expect(rpe8(3)).toBeGreaterThan(rpe8(5));
    expect(rpe8(5)).toBeGreaterThan(rpe8(8));
    expect(rpe8(8)).toBeGreaterThan(rpe8(10));
  });

  it('supports fractional RPE (interpolation)', () => {
    const at8  = prescribeLoad(200, 8, 1);
    const at85 = prescribeLoad(200, 8.5, 1);
    const at9  = prescribeLoad(200, 9, 1);
    // 8.5 must sit between 8 and 9
    expect(at85).toBeGreaterThan(at8);
    expect(at85).toBeLessThan(at9);
    // 8.5 should be exactly the midpoint (linear interpolation)
    expect(at85).toBeCloseTo((at8 + at9) / 2, 1);
  });

  it('clamps RPE below 5 to RPE 5', () => {
    expect(prescribeLoad(180, 3, 1)).toEqual(prescribeLoad(180, 5, 1));
  });

  it('clamps RPE above 10 to RPE 10', () => {
    expect(prescribeLoad(180, 12, 1)).toEqual(prescribeLoad(180, 10, 1));
  });

  it('never returns a negative load', () => {
    expect(prescribeLoad(180, 5, 100)).toBeGreaterThanOrEqual(0);
  });
});

// ── prescribeLoad — RTS table accuracy ───────────────────────────────────────

describe('prescribeLoad — RTS table accuracy', () => {
  it('5 reps @ RPE 7.5 = ~79.5% of max (accumulation zone)', () => {
    // Key anchor: midpoint of (75%+84%)/2 = 79.5%
    expect(prescribeLoad(100, 7.5, 5)).toBeCloseTo(79.5, 0);
  });

  it('5 reps @ RPE 8 = 84% of max (intensification zone)', () => {
    expect(prescribeLoad(100, 8, 5)).toBeCloseTo(84, 0);
  });

  it('1 rep @ RPE 8 = 92% of max', () => {
    expect(prescribeLoad(100, 8, 1)).toBeCloseTo(92, 0);
  });

  it('10 reps @ RPE 7.5 is less than 5 reps @ RPE 7.5', () => {
    expect(prescribeLoad(200, 7.5, 10)).toBeLessThan(prescribeLoad(200, 7.5, 5));
  });

  it('load increases as RPE increases at fixed reps', () => {
    expect(prescribeLoad(200, 7, 5)).toBeLessThan(prescribeLoad(200, 8, 5));
    expect(prescribeLoad(200, 8, 5)).toBeLessThan(prescribeLoad(200, 9, 5));
    expect(prescribeLoad(200, 9, 5)).toBeLessThan(prescribeLoad(200, 10, 5));
  });

  it('fractional interpolation is strictly between integer endpoints', () => {
    const at8  = prescribeLoad(200, 8,   1);
    const at85 = prescribeLoad(200, 8.5, 1);
    const at9  = prescribeLoad(200, 9,   1);
    expect(at85).toBeGreaterThan(at8);
    expect(at85).toBeLessThan(at9);
    expect(at85).toBeCloseTo((at8 + at9) / 2, 1); // linear midpoint
  });
});

// ── roundLoad ────────────────────────────────────────────────────────────────

describe('roundLoad', () => {
  it('leaves exact multiples unchanged', () => {
    expect(roundLoad(100)).toBe(100);
    expect(roundLoad(102.5)).toBe(102.5);
    expect(roundLoad(0)).toBe(0);
  });

  it('rounds 101 down to 100', () => {
    expect(roundLoad(101)).toBe(100);
  });

  it('rounds 102 up to 102.5', () => {
    expect(roundLoad(102)).toBe(102.5);
  });

  it('rounds 103.7 to 102.5 (41.48 multiples → floor to 41 × 2.5)', () => {
    expect(roundLoad(103.7)).toBe(102.5);
  });

  it('rounds 151.2 to 150', () => {
    expect(roundLoad(151.2)).toBe(150);
  });

  it('always returns a multiple of 2.5', () => {
    [97, 98.6, 103.1, 119.9, 166.4, 201.8].forEach((kg) => {
      expect(roundLoad(kg) % 2.5).toBeCloseTo(0, 5);
    });
  });
});

// ── readinessToVolumeMultiplier ───────────────────────────────────────────────

describe('readinessToVolumeMultiplier', () => {
  it('returns 1.0 for high readiness (80–100)', () => {
    expect(readinessToVolumeMultiplier(100)).toBe(1.0);
    expect(readinessToVolumeMultiplier(85)).toBe(1.0);
    expect(readinessToVolumeMultiplier(80)).toBe(1.0);
  });

  it('returns 0.9 for moderate readiness (60–79)', () => {
    expect(readinessToVolumeMultiplier(79)).toBe(0.9);
    expect(readinessToVolumeMultiplier(70)).toBe(0.9);
    expect(readinessToVolumeMultiplier(60)).toBe(0.9);
  });

  it('returns 0.8 for low readiness (40–59)', () => {
    expect(readinessToVolumeMultiplier(59)).toBe(0.8);
    expect(readinessToVolumeMultiplier(50)).toBe(0.8);
    expect(readinessToVolumeMultiplier(40)).toBe(0.8);
  });

  it('returns 0.6 for very low readiness (0–39)', () => {
    expect(readinessToVolumeMultiplier(39)).toBe(0.6);
    expect(readinessToVolumeMultiplier(20)).toBe(0.6);
    expect(readinessToVolumeMultiplier(0)).toBe(0.6);
  });
});

// ── readinessToRpeOffset ──────────────────────────────────────────────────────

describe('readinessToRpeOffset', () => {
  it('returns 0 for 80–100', () => {
    expect(readinessToRpeOffset(100)).toBe(0);
    expect(readinessToRpeOffset(80)).toBe(0);
  });

  it('returns -0.5 for 60–79', () => {
    expect(readinessToRpeOffset(79)).toBe(-0.5);
    expect(readinessToRpeOffset(60)).toBe(-0.5);
  });

  it('returns -1.0 for 40–59', () => {
    expect(readinessToRpeOffset(59)).toBe(-1.0);
    expect(readinessToRpeOffset(40)).toBe(-1.0);
  });

  it('returns -1.5 for 0–39', () => {
    expect(readinessToRpeOffset(39)).toBe(-1.5);
    expect(readinessToRpeOffset(0)).toBe(-1.5);
  });
});

// ── blockToIntensity ──────────────────────────────────────────────────────────

describe('blockToIntensity', () => {
  it('returns correct intensity targets', () => {
    expect(blockToIntensity('ACCUMULATION')).toBe(0.73);
    expect(blockToIntensity('INTENSIFICATION')).toBe(0.82);
    expect(blockToIntensity('REALIZATION')).toBe(0.90);
    expect(blockToIntensity('DELOAD')).toBe(0.65);
    expect(blockToIntensity('PIVOT')).toBe(0.70);
    expect(blockToIntensity('MAINTENANCE')).toBe(0.75);
  });

  it('intensity increases from DELOAD through REALIZATION', () => {
    expect(blockToIntensity('DELOAD')).toBeLessThan(blockToIntensity('ACCUMULATION'));
    expect(blockToIntensity('ACCUMULATION')).toBeLessThan(blockToIntensity('INTENSIFICATION'));
    expect(blockToIntensity('INTENSIFICATION')).toBeLessThan(blockToIntensity('REALIZATION'));
  });
});

// ── blockToSets ───────────────────────────────────────────────────────────────

describe('blockToSets', () => {
  it('returns correct set counts', () => {
    expect(blockToSets('ACCUMULATION')).toBe(5);
    expect(blockToSets('INTENSIFICATION')).toBe(4);
    expect(blockToSets('REALIZATION')).toBe(3);
    expect(blockToSets('DELOAD')).toBe(2);
    expect(blockToSets('PIVOT')).toBe(3);
    expect(blockToSets('MAINTENANCE')).toBe(3);
  });

  it('volume decreases from accumulation to realization', () => {
    expect(blockToSets('ACCUMULATION')).toBeGreaterThan(blockToSets('INTENSIFICATION'));
    expect(blockToSets('INTENSIFICATION')).toBeGreaterThan(blockToSets('REALIZATION'));
    expect(blockToSets('REALIZATION')).toBeGreaterThan(blockToSets('DELOAD'));
  });
});

// ── bottleneckToReps ──────────────────────────────────────────────────────────

describe('bottleneckToReps', () => {
  it('HYPERTROPHY → 6 reps', () => expect(bottleneckToReps('HYPERTROPHY')).toBe(6));
  it('NEURAL → 3 reps',       () => expect(bottleneckToReps('NEURAL')).toBe(3));
  it('BALANCED → 5 reps',     () => expect(bottleneckToReps('BALANCED')).toBe(5));
});

// ── responderMultiplier ───────────────────────────────────────────────────────

describe('responderMultiplier', () => {
  it('HIGH → 1.2',     () => expect(responderMultiplier('HIGH')).toBe(1.2));
  it('STANDARD → 1.0', () => expect(responderMultiplier('STANDARD')).toBe(1.0));
  it('LOW → 0.8',      () => expect(responderMultiplier('LOW')).toBe(0.8));
});

// ── overshooterRpeAdjust ──────────────────────────────────────────────────────

describe('overshooterRpeAdjust', () => {
  it('subtracts 0.5 when overshooter is true', () => {
    expect(overshooterRpeAdjust(8, true)).toBe(7.5);
    expect(overshooterRpeAdjust(9, true)).toBe(8.5);
  });

  it('returns unchanged RPE when not an overshooter', () => {
    expect(overshooterRpeAdjust(8, false)).toBe(8);
    expect(overshooterRpeAdjust(7.5, false)).toBe(7.5);
  });
});

// ── calcDots ──────────────────────────────────────────────────────────────────

describe('calcDots', () => {
  it('produces a plausible score for an intermediate male (83 kg, 510 kg total)', () => {
    const dots = calcDots(510, 83, 'MALE');
    // Elite open = ~500+, intermediate = ~300-380
    expect(dots).toBeGreaterThan(300);
    expect(dots).toBeLessThan(420);
    expect(dots).toBeCloseTo(344, 0);
  });

  it('produces a higher score for the same total at lower bodyweight (male)', () => {
    const heavy  = calcDots(510, 93, 'MALE');
    const lighter = calcDots(510, 83, 'MALE');
    expect(lighter).toBeGreaterThan(heavy);
  });

  it('produces a higher score for a bigger total at the same bodyweight', () => {
    const low  = calcDots(400, 83, 'MALE');
    const high = calcDots(600, 83, 'MALE');
    expect(high).toBeGreaterThan(low);
  });

  it('uses female formula for FEMALE sex', () => {
    // Same total and bodyweight should give a different score for female
    const male   = calcDots(500, 75, 'MALE');
    const female = calcDots(500, 75, 'FEMALE');
    expect(male).not.toBeCloseTo(female, 0);
  });

  it('uses female formula for OTHER sex', () => {
    const female = calcDots(500, 75, 'FEMALE');
    const other  = calcDots(500, 75, 'OTHER');
    expect(other).toBeCloseTo(female, 3);
  });

  it('clamps male bodyweight to 40–210 kg range', () => {
    expect(calcDots(600, 30, 'MALE')).toEqual(calcDots(600, 40, 'MALE'));
    expect(calcDots(600, 250, 'MALE')).toEqual(calcDots(600, 210, 'MALE'));
  });
});

// ── calcWilks ────────────────────────────────────────────────────────────────

describe('calcWilks', () => {
  it('produces a plausible score for an intermediate male (83 kg, 510 total)', () => {
    const wilks = calcWilks(510, 83, 'MALE');
    expect(wilks).toBeGreaterThan(250);
    expect(wilks).toBeLessThan(450);
  });

  it('higher total at same bodyweight gives higher score', () => {
    expect(calcWilks(600, 83, 'MALE')).toBeGreaterThan(calcWilks(500, 83, 'MALE'));
  });

  it('same total at lower bodyweight gives higher score (male)', () => {
    expect(calcWilks(510, 75, 'MALE')).toBeGreaterThan(calcWilks(510, 93, 'MALE'));
  });

  it('uses female formula for FEMALE sex', () => {
    const male   = calcWilks(400, 65, 'MALE');
    const female = calcWilks(400, 65, 'FEMALE');
    expect(male).not.toBeCloseTo(female, 0);
  });

  it('uses female formula for OTHER sex', () => {
    expect(calcWilks(400, 65, 'OTHER')).toBeCloseTo(calcWilks(400, 65, 'FEMALE'), 3);
  });

  it('clamps bodyweight to valid range', () => {
    expect(calcWilks(500, 30, 'MALE')).toEqual(calcWilks(500, 40, 'MALE'));
    expect(calcWilks(500, 250, 'MALE')).toEqual(calcWilks(500, 200, 'MALE'));
  });

  it('returns 0 or positive (never negative)', () => {
    expect(calcWilks(0, 83, 'MALE')).toBeGreaterThanOrEqual(0);
  });
});

// ── calcIpfPoints ─────────────────────────────────────────────────────────────

describe('calcIpfPoints', () => {
  it('produces a plausible score for an intermediate male (83 kg, 510 total)', () => {
    const gl = calcIpfPoints(510, 83, 'MALE');
    expect(gl).toBeGreaterThan(40);
    expect(gl).toBeLessThan(120);
  });

  it('higher total gives higher points', () => {
    expect(calcIpfPoints(600, 83, 'MALE')).toBeGreaterThan(calcIpfPoints(500, 83, 'MALE'));
  });

  it('same total at lower bodyweight gives higher points', () => {
    expect(calcIpfPoints(510, 75, 'MALE')).toBeGreaterThan(calcIpfPoints(510, 100, 'MALE'));
  });

  it('uses female coefficients for FEMALE', () => {
    const male   = calcIpfPoints(400, 65, 'MALE');
    const female = calcIpfPoints(400, 65, 'FEMALE');
    expect(male).not.toBeCloseTo(female, 0);
  });

  it('clamps bodyweight to 40–250 range', () => {
    expect(calcIpfPoints(500, 30, 'MALE')).toEqual(calcIpfPoints(500, 40, 'MALE'));
    expect(calcIpfPoints(500, 300, 'MALE')).toEqual(calcIpfPoints(500, 250, 'MALE'));
  });
});

// ── suggestAttempts ───────────────────────────────────────────────────────────

describe('suggestAttempts', () => {
  it('returns three attempts in ascending order', () => {
    const [opener, second, third] = suggestAttempts(180);
    expect(opener).toBeLessThan(second);
    expect(second).toBeLessThan(third);
  });

  it('opener is ~92% of max', () => {
    const [opener] = suggestAttempts(180);
    expect(opener).toBeCloseTo(180 * 0.92, 0);
  });

  it('second attempt is ~99% of max', () => {
    const [, second] = suggestAttempts(180);
    expect(second).toBeCloseTo(180 * 0.99, 0);
  });

  it('third attempt is ~103% of max', () => {
    const [,, third] = suggestAttempts(180);
    expect(third).toBeCloseTo(180 * 1.03, 0);
  });

  it('all attempts are rounded to nearest 0.5 kg', () => {
    const attempts = suggestAttempts(183);
    attempts.forEach((kg) => {
      expect((kg * 2) % 1).toBeCloseTo(0, 5);
    });
  });

  it('specific values for 180 kg max: [165.5, 178, 185.5]', () => {
    const [opener, second, third] = suggestAttempts(180);
    expect(opener).toBe(165.5);
    expect(second).toBe(178);
    expect(third).toBe(185.5);
  });
});

// ── estimateMaxFromRpe ──────────────────────────────────────────────────────

describe('estimateMaxFromRpe', () => {
  it('inverse of prescribeLoad: 5×140 @ RPE 8 → ~167 kg', () => {
    // RPE_TABLE[5][8] = 0.84, so 140/0.84 ≈ 166.67
    const e1rm = estimateMaxFromRpe(140, 5, 8);
    expect(e1rm).not.toBeNull();
    expect(e1rm!).toBeCloseTo(166.67, 0);
  });

  it('1 rep @ RPE 10 → load IS the max', () => {
    const e1rm = estimateMaxFromRpe(180, 1, 10);
    expect(e1rm).not.toBeNull();
    expect(e1rm!).toBeCloseTo(180, 1);
  });

  it('1 rep @ RPE 9 → load / 0.96', () => {
    const e1rm = estimateMaxFromRpe(172.8, 1, 9);
    expect(e1rm).not.toBeNull();
    expect(e1rm!).toBeCloseTo(180, 0);
  });

  it('handles fractional RPE (interpolation)', () => {
    const at8 = estimateMaxFromRpe(140, 5, 8)!;
    const at9 = estimateMaxFromRpe(140, 5, 9)!;
    const at85 = estimateMaxFromRpe(140, 5, 8.5)!;
    // 8.5 estimate should sit between 8 and 9
    expect(at85).toBeGreaterThan(at9); // lower table % → higher estimated max
    expect(at85).toBeLessThan(at8);
  });

  it('clamps reps to 1–10 range', () => {
    // 0 reps → clamped to 1
    expect(estimateMaxFromRpe(180, 0, 10)).toBeCloseTo(180, 1);
    // 12 reps → clamped to 10
    expect(estimateMaxFromRpe(100, 12, 8)).toBe(estimateMaxFromRpe(100, 10, 8));
  });

  it('clamps RPE to 6–10 (below 6 treated as 6)', () => {
    expect(estimateMaxFromRpe(100, 5, 4)).toBe(estimateMaxFromRpe(100, 5, 6));
  });
});

// ── detectMaxUpdate ─────────────────────────────────────────────────────────

describe('detectMaxUpdate', () => {
  it('returns suggestion when e1rm > 103% of current max', () => {
    // 5 × 145 @ RPE 8 → e1rm = 145/0.84 ≈ 172.6 (current max: 160, 172.6 > 164.8)
    const sets = [
      { loadKg: 145, reps: 5, rpeLogged: 8 },
      { loadKg: 147.5, reps: 5, rpeLogged: 8 },
      { loadKg: 142.5, reps: 5, rpeLogged: 8 },
      { loadKg: 140, reps: 5, rpeLogged: 8 },
    ];
    const result = detectMaxUpdate('SQUAT', 160, sets);
    expect(result).not.toBeNull();
    expect(result!.suggestedMax).toBeGreaterThan(160 * 1.03);
    expect(result!.lift).toBe('SQUAT');
    expect(result!.evidence).toContain('RPE 8');
  });

  it('returns null for insufficient data (< 3 sets)', () => {
    const sets = [
      { loadKg: 145, reps: 5, rpeLogged: 8 },
      { loadKg: 147.5, reps: 5, rpeLogged: 8 },
    ];
    expect(detectMaxUpdate('SQUAT', 160, sets)).toBeNull();
  });

  it('returns null when improvement is marginal (< 3%)', () => {
    // 5 × 136 @ RPE 8 → e1rm = 136/0.84 ≈ 161.9 (< 160 × 1.03 = 164.8)
    const sets = [
      { loadKg: 136, reps: 5, rpeLogged: 8 },
      { loadKg: 135, reps: 5, rpeLogged: 8 },
      { loadKg: 137, reps: 5, rpeLogged: 8 },
    ];
    expect(detectMaxUpdate('SQUAT', 160, sets)).toBeNull();
  });

  it('ignores sets without RPE logged', () => {
    const sets = [
      { loadKg: 200, reps: 1, rpeLogged: undefined },
      { loadKg: 200, reps: 1, rpeLogged: undefined },
      { loadKg: 200, reps: 1, rpeLogged: undefined },
    ];
    expect(detectMaxUpdate('BENCH', 160, sets)).toBeNull();
  });

  it('rounds suggestion to nearest 0.5 kg', () => {
    const sets = [
      { loadKg: 150, reps: 3, rpeLogged: 8 },
      { loadKg: 152.5, reps: 3, rpeLogged: 8 },
      { loadKg: 148, reps: 3, rpeLogged: 8 },
      { loadKg: 151, reps: 3, rpeLogged: 8 },
    ];
    const result = detectMaxUpdate('DEADLIFT', 160, sets);
    if (result) {
      expect((result.suggestedMax * 2) % 1).toBeCloseTo(0, 5);
    }
  });
});

// ── detectNeuralGap ─────────────────────────────────────────────────────────

describe('detectNeuralGap', () => {
  it('returns positive gap when gym max is >5% above meet max', () => {
    expect(detectNeuralGap(180, 195)).toBeGreaterThan(0);
    expect(detectNeuralGap(180, 195)).toBeCloseTo(8, 0); // (195-180)/180 = 8.3%
  });

  it('returns 0 when gym max equals meet max', () => {
    expect(detectNeuralGap(180, 180)).toBe(0);
  });

  it('returns 0 when gym max is within 5% of meet max', () => {
    expect(detectNeuralGap(180, 188)).toBe(0); // 4.4% — within threshold
  });

  it('returns 0 when gym max is below meet max', () => {
    expect(detectNeuralGap(180, 170)).toBe(0);
  });

  it('returns 0 when meet max is 0 (guard)', () => {
    expect(detectNeuralGap(0, 200)).toBe(0);
  });
});
