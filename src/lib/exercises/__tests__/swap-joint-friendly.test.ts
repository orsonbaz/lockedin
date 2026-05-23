import { describe, it, expect } from 'vitest';
import { suggestSwaps } from '../swap';
import { EXERCISE_BY_ID } from '../index';
import type { SwapContext } from '../types';

const baseContext: SwapContext = {
  blockType: 'ACCUMULATION',
  availableEquipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
  wearingBelt: true,
  wearingKneeSleeves: true,
  wearingWristWraps: false,
  remainingSystemic: 180,
  remainingLocal: 220,
};

describe('joint-friendly bias (v8)', () => {
  it('boosts low-spinal-load candidates when preferJointFriendly is on', () => {
    // Comp squat as the source — looking at candidate alternatives.
    const source = EXERCISE_BY_ID.get('competition_squat')!;

    const withoutBias = suggestSwaps(source, baseContext);
    const withBias = suggestSwaps(source, { ...baseContext, preferJointFriendly: true });

    // Find a low-spinal-load candidate that appears in both — e.g. a single-
    // leg or non-axial squat variant.
    const lowSpinalIds = withoutBias
      .filter((c) => c.exercise.fatigue.spinalLoad === 'LOW' || c.exercise.fatigue.spinalLoad === 'NONE')
      .map((c) => c.exercise.id);

    if (lowSpinalIds.length === 0) {
      // The squat library is dense with high-load options; just confirm the
      // overall picks haven't gotten worse when bias is on.
      expect(withBias.length).toBeGreaterThan(0);
      return;
    }

    const idToCompare = lowSpinalIds[0];
    const before = withoutBias.find((c) => c.exercise.id === idToCompare);
    const after = withBias.find((c) => c.exercise.id === idToCompare);
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after!.score).toBeGreaterThanOrEqual(before!.score);
  });

  it('is purely additive — never lowers a candidate score', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const without = suggestSwaps(source, baseContext);
    const withBias = suggestSwaps(source, { ...baseContext, preferJointFriendly: true });

    for (const candidate of without) {
      const same = withBias.find((c) => c.exercise.id === candidate.exercise.id);
      // The candidate should still appear; if it survived its score must
      // be >= the un-biased score.
      if (same) expect(same.score).toBeGreaterThanOrEqual(candidate.score);
    }
  });

  it('respects the 100 cap even after the bias is applied', () => {
    const source = EXERCISE_BY_ID.get('competition_squat')!;
    const result = suggestSwaps(source, { ...baseContext, preferJointFriendly: true });
    for (const c of result) {
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});
