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
  suggestAttempts,
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

  it('RPE 9 × 1 rep returns 97% of max', () => {
    expect(prescribeLoad(180, 9, 1)).toBeCloseTo(174.6, 1);
  });

  it('RPE 8 × 1 rep returns 94% of max', () => {
    expect(prescribeLoad(180, 8, 1)).toBeCloseTo(169.2, 1);
  });

  it('RPE 7 × 1 rep returns 91% of max', () => {
    expect(prescribeLoad(180, 7, 1)).toBeCloseTo(163.8, 1);
  });

  it('RPE 6 × 1 rep returns 88% of max', () => {
    expect(prescribeLoad(180, 6, 1)).toBeCloseTo(158.4, 1);
  });

  it('applies rep offset: each rep beyond 1 reduces load by 2.5%', () => {
    const single  = prescribeLoad(180, 8, 1);
    const double  = prescribeLoad(180, 8, 2);
    const fiveRep = prescribeLoad(180, 8, 5);
    expect(double).toBeCloseTo(single - 180 * 0.025, 1);
    expect(fiveRep).toBeCloseTo(single - 180 * 0.025 * 4, 1);
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
