import { describe, it, expect } from 'vitest';
import { suggestSwaps } from '../swap';
import { EXERCISE_BY_ID, EXERCISE_LIBRARY } from '../index';
import { computeSessionBudget, budgetHeadroom } from '../fatigue-budget';
import { effectiveMax, gearLabel } from '../equipment-modifiers';
import type { SwapContext } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const accumulationContext: SwapContext = {
  blockType: 'ACCUMULATION',
  availableEquipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
  wearingBelt: true,
  wearingKneeSleeves: true,
  wearingWristWraps: false,
  remainingSystemic: 180,
  remainingLocal: 220,
};

const realizationContext: SwapContext = {
  ...accumulationContext,
  blockType: 'REALIZATION',
  remainingSystemic: 80,
  remainingLocal: 100,
};

// ── Exercise Library ──────────────────────────────────────────────────────────

describe('EXERCISE_LIBRARY', () => {
  it('contains at least 40 exercises', () => {
    expect(EXERCISE_LIBRARY.length).toBeGreaterThanOrEqual(40);
  });

  it('has no duplicate ids', () => {
    const ids = EXERCISE_LIBRARY.map((ex) => ex.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('EXERCISE_BY_ID resolves competition_squat', () => {
    const ex = EXERCISE_BY_ID.get('competition_squat');
    expect(ex).toBeDefined();
    expect(ex?.name).toBe('Competition Back Squat');
    expect(ex?.specificity).toBe(5);
  });

  it('all exercises have at least one swap group', () => {
    for (const ex of EXERCISE_LIBRARY) {
      expect(ex.swapGroups.length).toBeGreaterThan(0);
    }
  });

  it('all exercises with isWeightedCalisthenics include BODYWEIGHT in equipment', () => {
    for (const ex of EXERCISE_LIBRARY) {
      if (ex.modifiers.isWeightedCalisthenics) {
        expect(ex.equipment).toContain('BODYWEIGHT');
      }
    }
  });

  it('belt modifier is null for exercises with beltCompatible = false', () => {
    for (const ex of EXERCISE_LIBRARY) {
      if (!ex.modifiers.beltCompatible) {
        expect(ex.modifiers.beltStrengthModifier).toBeNull();
      }
    }
  });

  it('specificity 5 exercises all have a primaryLiftTarget', () => {
    const comp = EXERCISE_LIBRARY.filter((ex) => ex.specificity === 5);
    for (const ex of comp) {
      expect(ex.primaryLiftTarget).not.toBeNull();
    }
  });
});

// ── Swap suggestions ──────────────────────────────────────────────────────────

describe('suggestSwaps', () => {
  it('returns results for competition_squat', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const results = suggestSwaps(source, accumulationContext);
    expect(results.length).toBeGreaterThan(0);
  });

  it('never includes the source exercise itself', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const results = suggestSwaps(source, accumulationContext);
    expect(results.find((r) => r.exercise.id === source.id)).toBeUndefined();
  });

  it('returns at most 8 candidates', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const results = suggestSwaps(source, accumulationContext);
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('scores are all >= 30 (threshold filter)', () => {
    const source = EXERCISE_BY_ID.get('competition_bench_press')!;
    const results = suggestSwaps(source, accumulationContext);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(30);
    }
  });

  it('results are sorted descending by score', () => {
    const source = EXERCISE_BY_ID.get('competition_deadlift')!;
    const results = suggestSwaps(source, accumulationContext);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('pause_squat is a top swap for competition_squat', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const results = suggestSwaps(source, accumulationContext);
    const topIds = results.slice(0, 5).map((r) => r.exercise.id);
    expect(topIds).toContain('pause_squat');
  });

  it('pause_bench_press is a top swap for competition_bench_press', () => {
    const source = EXERCISE_BY_ID.get('competition_bench_press')!;
    const results = suggestSwaps(source, accumulationContext);
    const topIds = results.slice(0, 5).map((r) => r.exercise.id);
    expect(topIds).toContain('pause_bench_press');
  });

  it('every candidate has a non-empty reason string', () => {
    const source = EXERCISE_BY_ID.get('romanian_deadlift')!;
    const results = suggestSwaps(source, accumulationContext);
    for (const r of results) {
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });

  it('loadAdjustmentFactor is ≤ 1 when specificity decreases', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;  // specificity 5
    const results = suggestSwaps(source, accumulationContext);
    for (const r of results) {
      if (r.exercise.specificity < source.specificity) {
        expect(r.loadAdjustmentFactor).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('requiresEquipmentChange is true when exercise needs unavailable gear', () => {
    const noBarbell: SwapContext = {
      ...accumulationContext,
      availableEquipment: ['BODYWEIGHT', 'DUMBBELL'],
    };
    const source = EXERCISE_BY_ID.get('competition_bench_press')!;
    const results = suggestSwaps(source, noBarbell);
    const barbellOnlyEx = results.find((r) => {
      const equipNames = (r.exercise.equipment as string[]).join(',');
      return equipNames === 'BARBELL';  // only BARBELL, nothing else
    });
    if (barbellOnlyEx) {
      expect(barbellOnlyEx.requiresEquipmentChange).toBe(true);
    }
  });

  it('REALIZATION context favours high-specificity swaps', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const results = suggestSwaps(source, realizationContext);
    if (results.length > 0) {
      // Top result should have high specificity (4 or 5)
      expect(results[0].exercise.specificity).toBeGreaterThanOrEqual(4);
    }
  });
});

// ── Fatigue budget ────────────────────────────────────────────────────────────

describe('computeSessionBudget', () => {
  it('returns correct caps for ACCUMULATION', () => {
    const budget = computeSessionBudget('ACCUMULATION', []);
    expect(budget.systemicCap).toBe(180);
    expect(budget.localCap).toBe(220);
    expect(budget.systemicUsed).toBe(0);
    expect(budget.systemicRemaining).toBe(180);
  });

  it('returns correct caps for DELOAD', () => {
    const budget = computeSessionBudget('DELOAD', []);
    expect(budget.systemicCap).toBe(60);
    expect(budget.localCap).toBe(80);
  });

  it('accounts for existing exercises', () => {
    const squat = EXERCISE_BY_ID.get('competition_squat')!;
    const budget = computeSessionBudget('ACCUMULATION', [
      { exercise: squat, sets: 5 },
    ]);
    // competition_squat systemicFatigue = 9, 5 sets = 45
    expect(budget.systemicUsed).toBe(45);
    expect(budget.systemicRemaining).toBe(135);
  });

  it('remaining never goes negative', () => {
    const squat = EXERCISE_BY_ID.get('competition_squat')!;
    const budget = computeSessionBudget('DELOAD', [
      { exercise: squat, sets: 10 },  // blows the deload budget
    ]);
    expect(budget.systemicRemaining).toBe(0);
    expect(budget.localRemaining).toBe(0);
  });
});

describe('budgetHeadroom', () => {
  it('returns 1 when headroom is abundant', () => {
    const budget = computeSessionBudget('ACCUMULATION', []);
    const goblet = EXERCISE_BY_ID.get('goblet_squat')!;  // systemicFatigue = 4
    const score = budgetHeadroom(goblet, 3, budget);
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns 0 when budget is blown', () => {
    const squat = EXERCISE_BY_ID.get('competition_squat')!;
    // Force budget to near-zero
    const budget = computeSessionBudget('DELOAD', [
      { exercise: squat, sets: 7 },  // 63 systemic > 60 cap
    ]);
    const score = budgetHeadroom(squat, 3, budget);
    expect(score).toBe(0);
  });
});

// ── Equipment modifiers ───────────────────────────────────────────────────────

describe('effectiveMax', () => {
  const squat = EXERCISE_BY_ID.get('competition_squat')!;

  it('returns base max when no gear worn', () => {
    const result = effectiveMax(200, squat, {
      usingBelt: false, usingKneeSleeves: false, usingWristWraps: false,
    });
    expect(result).toBe(200);
  });

  it('applies belt modifier for belt-compatible exercise', () => {
    const result = effectiveMax(200, squat, {
      usingBelt: true, usingKneeSleeves: false, usingWristWraps: false,
    });
    // belt modifier = 0.07
    expect(result).toBeCloseTo(214, 0);
  });

  it('stacks belt and sleeve modifiers additively', () => {
    const result = effectiveMax(200, squat, {
      usingBelt: true, usingKneeSleeves: true, usingWristWraps: false,
    });
    // 0.07 + 0.03 = 0.10 → 200 * 1.10 = 220
    expect(result).toBeCloseTo(220, 0);
  });

  it('does not apply belt modifier for non-belt-compatible exercise', () => {
    const bench = EXERCISE_BY_ID.get('competition_bench_press')!;
    const result = effectiveMax(150, bench, {
      usingBelt: true, usingKneeSleeves: false, usingWristWraps: false,
    });
    expect(result).toBe(150);  // bench is not belt-compatible
  });
});

describe('gearLabel', () => {
  const squat = EXERCISE_BY_ID.get('competition_squat')!;
  const bench = EXERCISE_BY_ID.get('competition_bench_press')!;

  it('returns null when no gear is worn', () => {
    expect(gearLabel(squat, { usingBelt: false, usingKneeSleeves: false, usingWristWraps: false })).toBeNull();
  });

  it('returns Belt + Sleeves for squat with both', () => {
    const label = gearLabel(squat, { usingBelt: true, usingKneeSleeves: true, usingWristWraps: false });
    expect(label).toBe('Belt + Sleeves');
  });

  it('returns Wraps for bench press (only wraps compatible)', () => {
    const label = gearLabel(bench, { usingBelt: false, usingKneeSleeves: false, usingWristWraps: true });
    expect(label).toBe('Wraps');
  });

  it('returns null for bench when belt is worn but not compatible', () => {
    const label = gearLabel(bench, { usingBelt: true, usingKneeSleeves: false, usingWristWraps: false });
    expect(label).toBeNull();
  });
});
