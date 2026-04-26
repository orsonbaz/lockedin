import { describe, it, expect } from 'vitest';
import {
  plateBreakdown, formatPlateBreakdown, DEFAULT_KG_PLATES,
} from '../plate-math';

describe('plateBreakdown', () => {
  it('returns bar-only for loads ≤ the bar', () => {
    const b = plateBreakdown(20);
    expect(b.perSide).toEqual([]);
    expect(b.achievedKg).toBe(20);
  });

  it('decomposes a clean even load (greedy: fewest plates)', () => {
    // 180 kg = 20 bar + 80 per side. Greedy: 25+25+25+5.
    const b = plateBreakdown(180);
    expect(b.perSide).toEqual([25, 25, 25, 5]);
    expect(b.achievedKg).toBe(180);
    expect(b.remainderKg).toBe(0);
  });

  it('handles common warm-up load 60kg', () => {
    const b = plateBreakdown(60);
    expect(b.perSide).toEqual([20]);
    expect(b.achievedKg).toBe(60);
  });

  it('handles micro-plates for 102.5kg', () => {
    const b = plateBreakdown(102.5);
    expect(b.perSide).toEqual([25, 15, 1.25]);
    expect(b.achievedKg).toBe(102.5);
  });

  it('reports remainder when load isnt achievable with default plates', () => {
    // 21 kg → 0.5 per side, no 0.5 plate → bar only, remainder = 1
    const b = plateBreakdown(21);
    expect(b.perSide).toEqual([]);
    expect(b.achievedKg).toBe(20);
    expect(b.remainderKg).toBe(1);
  });

  it('respects a custom bar weight (15kg "women\'s" bar)', () => {
    const b = plateBreakdown(50, { barKg: 15 });
    // 50 - 15 = 35 → 17.5/side → 15 + 2.5
    expect(b.perSide).toEqual([15, 2.5]);
    expect(b.achievedKg).toBe(50);
  });

  it('respects a custom available plate set', () => {
    // Hotel gym with only 10kg pairs.
    const b = plateBreakdown(60, { available: [10] });
    expect(b.perSide).toEqual([10, 10]);
    expect(b.achievedKg).toBe(60);
  });

  it('formats nicely', () => {
    expect(formatPlateBreakdown(plateBreakdown(180))).toBe('25 + 25 + 25 + 5');
    expect(formatPlateBreakdown(plateBreakdown(20))).toBe('bar only');
  });

  it('default kg plate set covers the canonical sizes', () => {
    expect(DEFAULT_KG_PLATES).toContain(25);
    expect(DEFAULT_KG_PLATES).toContain(2.5);
    expect(DEFAULT_KG_PLATES).toContain(1.25);
  });
});
