import { describe, it, expect } from 'vitest';
import { buildProgramProgress, blockLabel, blockCaption } from '../program-progress';
import type { TrainingBlock, TrainingCycle, Meet } from '@/lib/db/types';

function makeCycle(overrides: Partial<TrainingCycle> = {}): TrainingCycle {
  return {
    id: 'cycle-1',
    name: '12-Week Meet Prep',
    startDate: '2024-09-01',
    totalWeeks: 12,
    currentWeek: 1,
    status: 'ACTIVE',
    createdAt: '2024-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBlock(
  blockType: TrainingBlock['blockType'],
  weekStart: number,
  weekEnd: number,
  id = `b-${blockType}-${weekStart}`,
): TrainingBlock {
  return {
    id,
    cycleId: 'cycle-1',
    blockType,
    weekStart,
    weekEnd,
    volumeTarget: 1,
    intensityTarget: 0.78,
  };
}

const FULL_BLOCKS: TrainingBlock[] = [
  makeBlock('ACCUMULATION', 1, 3),
  makeBlock('DELOAD', 4, 4),
  makeBlock('INTENSIFICATION', 5, 7),
  makeBlock('DELOAD', 8, 8, 'b-d2'),
  makeBlock('REALIZATION', 9, 12),
];

describe('buildProgramProgress', () => {
  it('marks the current segment based on currentWeek', () => {
    const cycle = makeCycle({ currentWeek: 6 });
    const p = buildProgramProgress(cycle, FULL_BLOCKS);

    expect(p.currentBlock?.blockType).toBe('INTENSIFICATION');
    expect(p.segments.find((s) => s.isCurrent)?.block.blockType).toBe('INTENSIFICATION');
    expect(p.segments.filter((s) => s.isPast).map((s) => s.block.blockType))
      .toEqual(['ACCUMULATION', 'DELOAD']);
  });

  it('computes weeksRemaining and weeksToNextBlock', () => {
    const cycle = makeCycle({ currentWeek: 6 });
    const p = buildProgramProgress(cycle, FULL_BLOCKS);

    expect(p.weeksRemaining).toBe(6); // 12 - 6
    // Currently in INTENS week 6 (5–7) → 2 weeks left in block (6 and 7)
    expect(p.weeksToNextBlock).toBe(2);
    expect(p.nextBlock?.blockType).toBe('DELOAD');
  });

  it('clamps currentWeek to [1, totalWeeks]', () => {
    const overflow = buildProgramProgress(
      makeCycle({ currentWeek: 99 }),
      FULL_BLOCKS,
    );
    expect(overflow.currentWeek).toBe(12);
    expect(overflow.weeksRemaining).toBe(0);

    const underflow = buildProgramProgress(
      makeCycle({ currentWeek: 0 }),
      FULL_BLOCKS,
    );
    expect(underflow.currentWeek).toBe(1);
  });

  it('reports daysToMeet when a meet is provided in the future', () => {
    const cycle = makeCycle({ currentWeek: 1 });
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const meetDate = future.toISOString().slice(0, 10);

    const meet: Meet = {
      id: 'm1',
      name: 'Test Meet',
      date: meetDate,
      federation: 'IPF',
      weightClass: 83,
      weighIn: 'TWO_HOUR',
      status: 'UPCOMING',
    };
    const p = buildProgramProgress(cycle, FULL_BLOCKS, meet);
    expect(p.daysToMeet).toBeGreaterThanOrEqual(29);
    expect(p.daysToMeet).toBeLessThanOrEqual(31);
  });

  it('returns null daysToMeet when no meet is supplied', () => {
    const p = buildProgramProgress(makeCycle({ currentWeek: 4 }), FULL_BLOCKS);
    expect(p.daysToMeet).toBeNull();
  });

  it('produces segments whose fractions sum to 1', () => {
    const p = buildProgramProgress(makeCycle(), FULL_BLOCKS);
    const total = p.segments.reduce((s, x) => s + x.fraction, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('handles a cycle with no realization block', () => {
    const noPeakBlocks: TrainingBlock[] = [
      makeBlock('ACCUMULATION', 1, 6),
      makeBlock('DELOAD', 7, 7),
      makeBlock('INTENSIFICATION', 8, 8),
    ];
    const p = buildProgramProgress(
      makeCycle({ totalWeeks: 8, currentWeek: 4 }),
      noPeakBlocks,
    );
    expect(p.realizationBlock).toBeNull();
    expect(p.daysToPeak).toBeNull();
  });

  it('returns 0 weeksToNextBlock and null nextBlock in the final block', () => {
    const cycle = makeCycle({ currentWeek: 12 });
    const p = buildProgramProgress(cycle, FULL_BLOCKS);
    expect(p.currentBlock?.blockType).toBe('REALIZATION');
    expect(p.nextBlock).toBeNull();
  });
});

describe('block presentation helpers', () => {
  it('blockLabel gives a human label per block type', () => {
    expect(blockLabel('ACCUMULATION')).toBe('Accumulation');
    expect(blockLabel('REALIZATION')).toBe('Peak');
    expect(blockLabel('DELOAD')).toBe('Deload');
  });

  it('blockCaption is non-empty for every block type', () => {
    const types: Array<Parameters<typeof blockCaption>[0]> = [
      'ACCUMULATION', 'INTENSIFICATION', 'REALIZATION',
      'DELOAD', 'PIVOT', 'MAINTENANCE',
    ];
    for (const t of types) {
      expect(blockCaption(t).length).toBeGreaterThan(5);
    }
  });
});
