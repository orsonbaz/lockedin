import { describe, it, expect } from 'vitest';
import {
  calcHrvBaseline,
  calcHrvDeviation,
  calcReadinessScore,
  readinessLabel,
  type ReadinessInput,
} from '../readiness';

// ── calcHrvBaseline ──────────────────────────────────────────────────────────

describe('calcHrvBaseline', () => {
  it('returns undefined for an empty array', () => {
    expect(calcHrvBaseline([])).toBeUndefined();
  });

  it('returns the single value for a one-element array', () => {
    expect(calcHrvBaseline([65])).toBe(65);
  });

  it('returns the average of multiple values', () => {
    expect(calcHrvBaseline([60, 70, 80])).toBeCloseTo(70);
  });

  it('handles large HRV values', () => {
    expect(calcHrvBaseline([120, 130])).toBeCloseTo(125);
  });
});

// ── calcHrvDeviation ─────────────────────────────────────────────────────────

describe('calcHrvDeviation', () => {
  it('returns 0 when baseline is 0 (safety guard)', () => {
    expect(calcHrvDeviation(50, 0)).toBe(0);
  });

  it('returns 0% when today equals baseline', () => {
    expect(calcHrvDeviation(70, 70)).toBe(0);
  });

  it('returns positive % when above baseline', () => {
    expect(calcHrvDeviation(77, 70)).toBeCloseTo(10);
  });

  it('returns negative % when below baseline', () => {
    expect(calcHrvDeviation(63, 70)).toBeCloseTo(-10);
  });

  it('handles large positive deviations', () => {
    expect(calcHrvDeviation(140, 70)).toBeCloseTo(100);
  });
});

// ── calcReadinessScore ───────────────────────────────────────────────────────

describe('calcReadinessScore', () => {
  it('returns base score of 60 with all neutral/no data', () => {
    expect(calcReadinessScore({})).toBe(60);
  });

  it('returns 60 when all subjective values are at midpoint (3)', () => {
    const input: ReadinessInput = {
      energy: 3,
      motivation: 3,
      soreness: 3,
      stress: 3,
    };
    expect(calcReadinessScore(input)).toBe(60);
  });

  it('produces high score (~95) with excellent inputs', () => {
    const input: ReadinessInput = {
      hrvDeviation: 20,     // well above baseline → +20
      sleepHours: 9,
      sleepQuality: 5,      // great sleep → +15
      energy: 5,
      motivation: 5,
      soreness: 1,
      stress: 1,            // subjective max → +15
    };
    const score = calcReadinessScore(input);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('produces very low score (~25) with terrible inputs', () => {
    const input: ReadinessInput = {
      hrvDeviation: -20,    // far below baseline → -20
      sleepHours: 4,
      sleepQuality: 1,      // terrible sleep → -15
      energy: 1,
      motivation: 1,
      soreness: 5,
      stress: 5,            // subjective min → -15
    };
    const score = calcReadinessScore(input);
    expect(score).toBeLessThanOrEqual(30);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('clamps score to 0 (never negative)', () => {
    const input: ReadinessInput = {
      hrvDeviation: -30,
      sleepHours: 2,
      sleepQuality: 1,
      energy: 1,
      motivation: 1,
      soreness: 5,
      stress: 5,
    };
    // 60 - 20 - 15 - 15 = 10 (floored by subjective rounding)
    // Verify it's clamped: ≥ 0 and low
    expect(calcReadinessScore(input)).toBeGreaterThanOrEqual(0);
    expect(calcReadinessScore(input)).toBeLessThanOrEqual(15);
  });

  it('clamps score to 100 (never over)', () => {
    // 60 + 20 + 15 + 15 = 110 → clamped to 100
    const input: ReadinessInput = {
      hrvDeviation: 20,
      sleepHours: 9,
      sleepQuality: 5,
      energy: 5,
      motivation: 5,
      soreness: 1,
      stress: 1,
    };
    expect(calcReadinessScore(input)).toBeLessThanOrEqual(100);
  });

  it('HRV only: above-baseline gives boost', () => {
    expect(calcReadinessScore({ hrvDeviation: 10 })).toBe(70); // 60 + 10
  });

  it('HRV only: below-baseline gives penalty', () => {
    expect(calcReadinessScore({ hrvDeviation: -10 })).toBe(50); // 60 - 10
  });

  it('HRV in neutral zone (±5%) has no effect', () => {
    expect(calcReadinessScore({ hrvDeviation: 3 })).toBe(60);
    expect(calcReadinessScore({ hrvDeviation: -3 })).toBe(60);
  });

  it('sleep component: good hours + quality gives +7', () => {
    expect(calcReadinessScore({ sleepHours: 7.5, sleepQuality: 3 })).toBe(67);
  });

  it('sleep component: poor sleep gives -15', () => {
    expect(calcReadinessScore({ sleepHours: 5, sleepQuality: 2 })).toBe(45);
  });

  it('missing subjective values default to neutral', () => {
    // Only energy provided (5), others default to 3
    // raw = (5 + 3) - (3 + 3) = 2 → normalised: 2/8 * 15 ≈ 3.75
    const score = calcReadinessScore({ energy: 5 });
    expect(score).toBeCloseTo(64, 0);
  });
});

// ── readinessLabel ───────────────────────────────────────────────────────────

describe('readinessLabel', () => {
  it('80+ is Excellent (green)', () => {
    const r = readinessLabel(85);
    expect(r.label).toBe('Excellent');
    expect(r.colour).toBe('#22C55E');
  });

  it('boundary: 80 is Excellent', () => {
    expect(readinessLabel(80).label).toBe('Excellent');
  });

  it('65–79 is Good (amber)', () => {
    expect(readinessLabel(70).label).toBe('Good');
    expect(readinessLabel(65).label).toBe('Good');
  });

  it('50–64 is Moderate (red accent)', () => {
    expect(readinessLabel(55).label).toBe('Moderate');
    expect(readinessLabel(50).label).toBe('Moderate');
  });

  it('30–49 is Low (dark red)', () => {
    expect(readinessLabel(40).label).toBe('Low');
    expect(readinessLabel(30).label).toBe('Low');
  });

  it('0–29 is Rest Day (dim)', () => {
    expect(readinessLabel(20).label).toBe('Rest Day');
    expect(readinessLabel(0).label).toBe('Rest Day');
  });

  it('boundary: 79 is Good (not Excellent)', () => {
    expect(readinessLabel(79).label).toBe('Good');
  });

  it('boundary: 64 is Moderate (not Good)', () => {
    expect(readinessLabel(64).label).toBe('Moderate');
  });

  it('boundary: 49 is Low (not Moderate)', () => {
    expect(readinessLabel(49).label).toBe('Low');
  });

  it('boundary: 29 is Rest Day (not Low)', () => {
    expect(readinessLabel(29).label).toBe('Rest Day');
  });
});
