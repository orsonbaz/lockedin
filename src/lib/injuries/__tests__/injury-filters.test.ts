import { describe, it, expect } from 'vitest';
import { applyInjuryFilters } from '../index';
import type { Injury } from '@/lib/db/types';

function makeInjury(overrides: Partial<Injury>): Injury {
  const iso = '2026-01-01T00:00:00.000Z';
  return {
    id: 'inj1',
    label: 'Test injury',
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

const baseCandidate = {
  movementPattern: 'SQUAT',
  swapGroups: ['SQUAT_PRIMARY'],
  spinalLoad: 'HIGH' as const,
  hasTempo: false,
  isUnilateral: false,
  isOverhead: false,
};

describe('applyInjuryFilters', () => {
  it('returns a no-op result when no injuries', () => {
    const result = applyInjuryFilters(baseCandidate, []);
    expect(result.blocked).toBe(false);
    expect(result.penalty).toBe(0);
    expect(result.boost).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  describe('hard contraindications', () => {
    it('blocks when movementPattern is contraindicated', () => {
      const injury = makeInjury({
        label: 'L4-L5 disc bulge',
        contraindicatedPatterns: ['SQUAT'],
      });
      const result = applyInjuryFilters(baseCandidate, [injury]);
      expect(result.blocked).toBe(true);
      expect(result.reasons[0]).toContain('L4-L5 disc bulge');
    });

    it('blocks when a contraindicated swap group matches', () => {
      const injury = makeInjury({
        contraindicatedSwapGroups: ['SQUAT_PRIMARY'],
      });
      const result = applyInjuryFilters(baseCandidate, [injury]);
      expect(result.blocked).toBe(true);
    });

    it('does NOT block when patterns / groups do not match', () => {
      const injury = makeInjury({
        contraindicatedPatterns: ['HINGE'],
        contraindicatedSwapGroups: ['HINGE_PRIMARY'],
      });
      const result = applyInjuryFilters(baseCandidate, [injury]);
      expect(result.blocked).toBe(false);
    });
  });

  describe('NO_AXIAL_LOAD constraint', () => {
    it('applies a large penalty for high spinal load', () => {
      const injury = makeInjury({ constraints: ['NO_AXIAL_LOAD'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, spinalLoad: 'HIGH' },
        [injury],
      );
      expect(result.penalty).toBeGreaterThanOrEqual(40);
      expect(result.reasons.some((r) => r.includes('NO_AXIAL_LOAD'))).toBe(true);
    });

    it('applies a smaller penalty for medium spinal load', () => {
      const injury = makeInjury({ constraints: ['NO_AXIAL_LOAD'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, spinalLoad: 'MEDIUM' },
        [injury],
      );
      expect(result.penalty).toBeGreaterThan(0);
      expect(result.penalty).toBeLessThan(40);
    });

    it('no penalty for low / none spinal load', () => {
      const injury = makeInjury({ constraints: ['NO_AXIAL_LOAD'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, spinalLoad: 'LOW' },
        [injury],
      );
      expect(result.penalty).toBe(0);
    });
  });

  describe('NO_OVERHEAD constraint', () => {
    it('penalises overhead candidates', () => {
      const injury = makeInjury({ constraints: ['NO_OVERHEAD'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, movementPattern: 'VERTICAL_PUSH', isOverhead: true },
        [injury],
      );
      expect(result.penalty).toBeGreaterThanOrEqual(50);
    });
  });

  describe('UNILATERAL_ONLY constraint', () => {
    it('boosts unilateral candidates', () => {
      const injury = makeInjury({ constraints: ['UNILATERAL_ONLY'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, isUnilateral: true, swapGroups: ['SINGLE_LEG_SQUAT'] },
        [injury],
      );
      expect(result.boost).toBeGreaterThan(0);
      expect(result.penalty).toBe(0);
    });

    it('penalises bilateral candidates', () => {
      const injury = makeInjury({ constraints: ['UNILATERAL_ONLY'] });
      const result = applyInjuryFilters(baseCandidate, [injury]);
      expect(result.penalty).toBeGreaterThan(0);
    });
  });

  describe('TEMPO_ONLY constraint', () => {
    it('boosts tempo candidates and penalises non-tempo', () => {
      const injury = makeInjury({ constraints: ['TEMPO_ONLY'] });
      const tempoResult = applyInjuryFilters(
        { ...baseCandidate, hasTempo: true },
        [injury],
      );
      const plainResult = applyInjuryFilters(baseCandidate, [injury]);
      expect(tempoResult.boost).toBeGreaterThan(0);
      expect(plainResult.penalty).toBeGreaterThan(0);
    });
  });

  describe('NO_BILATERAL_HINGE constraint', () => {
    it('penalises bilateral hinges, not unilateral hinges', () => {
      const injury = makeInjury({ constraints: ['NO_BILATERAL_HINGE'] });
      const bilateral = applyInjuryFilters(
        { ...baseCandidate, movementPattern: 'HINGE', isUnilateral: false },
        [injury],
      );
      const unilateral = applyInjuryFilters(
        { ...baseCandidate, movementPattern: 'HINGE', isUnilateral: true, swapGroups: ['SINGLE_LEG_HINGE'] },
        [injury],
      );
      expect(bilateral.penalty).toBeGreaterThan(0);
      expect(unilateral.penalty).toBe(0);
    });
  });

  describe('preferred patterns', () => {
    it('boosts a candidate matching the injury preferred pattern', () => {
      const injury = makeInjury({ preferredPatterns: ['SINGLE_LEG'] });
      const result = applyInjuryFilters(
        { ...baseCandidate, movementPattern: 'SINGLE_LEG', isUnilateral: true },
        [injury],
      );
      expect(result.boost).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes('preferred pattern'))).toBe(true);
    });
  });

  describe('multiple injuries', () => {
    it('accumulates penalties across injuries', () => {
      const a = makeInjury({ id: 'a', constraints: ['NO_AXIAL_LOAD'] });
      const b = makeInjury({ id: 'b', label: 'Knee', constraints: ['UNILATERAL_ONLY'] });
      const result = applyInjuryFilters(baseCandidate, [a, b]);
      // HIGH spinal load (penalty ≥ 40) + bilateral with UNILATERAL_ONLY (penalty 25) = 65+
      expect(result.penalty).toBeGreaterThanOrEqual(60);
    });

    it('any single hard contraindication wins over penalties', () => {
      const a = makeInjury({ id: 'a', constraints: ['NO_AXIAL_LOAD'] });
      const b = makeInjury({ id: 'b', label: 'Blown squat', contraindicatedPatterns: ['SQUAT'] });
      const result = applyInjuryFilters(baseCandidate, [a, b]);
      expect(result.blocked).toBe(true);
    });
  });
});
