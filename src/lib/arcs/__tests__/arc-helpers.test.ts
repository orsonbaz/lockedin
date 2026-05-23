import { describe, it, expect } from 'vitest';
import { arcDayCount, ARC_PRESETS } from '../index';
import type { TrainingArc } from '@/lib/db/types';

function makeArc(overrides: Partial<TrainingArc>): TrainingArc {
  return {
    id: 'a1',
    name: 'Test',
    intent: 'test intent',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    primaryGoal: 'LONGEVITY',
    priorities: [],
    deprioritized: [],
    constraints: [],
    coachDirective: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('arcDayCount', () => {
  it('reports day 1 on the start day', () => {
    const arc = makeArc({ startDate: '2026-05-23' });
    expect(arcDayCount(arc, '2026-05-23')).toBe(1);
  });

  it('counts day inclusively against today', () => {
    const arc = makeArc({ startDate: '2026-05-20' });
    expect(arcDayCount(arc, '2026-05-23')).toBe(4);
  });

  it('uses arc.endDate when set (history view)', () => {
    const arc = makeArc({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(arcDayCount(arc, '2026-12-31')).toBe(31);
  });

  it('never returns less than 1', () => {
    const arc = makeArc({ startDate: '2026-05-23' });
    expect(arcDayCount(arc, '2026-05-22')).toBe(1);
  });
});

describe('ARC_PRESETS', () => {
  it('includes all four key archetypes', () => {
    const keys = ARC_PRESETS.map((p) => p.key);
    expect(keys).toContain('get_healthy');
    expect(keys).toContain('get_strong');
    expect(keys).toContain('back_to_powerlifting');
    expect(keys).toContain('new_dad');
  });

  it('every preset has a non-empty coachDirective', () => {
    for (const preset of ARC_PRESETS) {
      expect(preset.coachDirective.length).toBeGreaterThan(20);
    }
  });

  it('back_to_powerlifting includes COMPETITION as a priority', () => {
    const preset = ARC_PRESETS.find((p) => p.key === 'back_to_powerlifting');
    expect(preset?.priorities).toContain('COMPETITION');
  });

  it('get_healthy explicitly deprioritizes COMPETITION', () => {
    const preset = ARC_PRESETS.find((p) => p.key === 'get_healthy');
    expect(preset?.deprioritized).toContain('COMPETITION');
  });

  it('new_dad has a tight weekly time budget', () => {
    const preset = ARC_PRESETS.find((p) => p.key === 'new_dad');
    expect(preset?.weeklyTimeBudgetMin).toBeLessThanOrEqual(180);
  });
});
