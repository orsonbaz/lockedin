import { describe, it, expect } from 'vitest';
import {
  buildStableCore,
  computeHash,
  aggregateStats,
  PROMPT_VERSION,
  type StableCoreInputs,
} from '../coach-cache';
import type {
  AthleteProfile, TrainingArc, Injury, AthleteMemory,
  TrainingCycle, TrainingBlock, CoachCallStats,
} from '@/lib/db/types';

const iso = '2026-01-01T00:00:00.000Z';

function makeProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: 'me',
    name: 'Alex',
    weightKg: 80,
    targetWeightClass: 83,
    sex: 'MALE',
    federation: 'IPF',
    equipment: 'RAW',
    weighIn: 'TWO_HOUR',
    trainingAgeMonths: 48,
    maxSquat: 180,
    maxBench: 130,
    maxDeadlift: 220,
    bottleneck: 'BALANCED',
    rewardSystem: 'CONSISTENCY',
    responder: 'STANDARD',
    overshooter: false,
    timeToPeakWeeks: 3,
    weeklyFrequency: 4,
    peakDayOfWeek: 6,
    unitSystem: 'KG',
    onboardingComplete: true,
    createdAt: iso,
    updatedAt: iso,
    trainingGoal: 'LONGEVITY',
    ...overrides,
  };
}

function makeArc(overrides: Partial<TrainingArc> = {}): TrainingArc {
  return {
    id: 'arc1',
    name: 'Get Healthy',
    intent: 'Rebuild durable joint health',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    primaryGoal: 'LONGEVITY',
    priorities: ['INJURY_HEALING', 'MOBILITY'],
    deprioritized: ['COMPETITION'],
    constraints: ['POST_INJURY'],
    coachDirective: 'Prioritize joint health over peak performance.',
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<StableCoreInputs> = {}): StableCoreInputs {
  return {
    profile: makeProfile(),
    arc: makeArc(),
    injuries: [],
    memorySnapshot: [],
    cycle: null,
    currentBlock: null,
    ...overrides,
  };
}

describe('buildStableCore', () => {
  it('is deterministic — same inputs produce identical output', () => {
    const a = buildStableCore(makeInputs());
    const b = buildStableCore(makeInputs());
    expect(a).toBe(b);
  });

  it('includes the PROMPT_VERSION at the top so prompt edits invalidate cleanly', () => {
    const core = buildStableCore(makeInputs());
    expect(core.startsWith(`PROMPT_VERSION=${PROMPT_VERSION}`)).toBe(true);
  });

  it('changes when arc priorities reorder', () => {
    const a = buildStableCore(makeInputs({
      arc: makeArc({ priorities: ['INJURY_HEALING', 'MOBILITY'] }),
    }));
    const b = buildStableCore(makeInputs({
      arc: makeArc({ priorities: ['MOBILITY', 'INJURY_HEALING'] }),
    }));
    expect(a).not.toBe(b);
  });

  it('changes when athlete maxes change', () => {
    const a = buildStableCore(makeInputs({ profile: makeProfile({ maxSquat: 180 }) }));
    const b = buildStableCore(makeInputs({ profile: makeProfile({ maxSquat: 200 }) }));
    expect(a).not.toBe(b);
  });

  it('changes when an injury is added', () => {
    const injury: Injury = {
      id: 'inj1',
      label: 'Left knee tendinopathy',
      regions: ['LEFT_KNEE'],
      status: 'MANAGING',
      severity: 3,
      onsetDate: '2026-01-01',
      contraindicatedPatterns: ['SQUAT'],
      contraindicatedSwapGroups: [],
      preferredPatterns: ['SINGLE_LEG'],
      constraints: ['UNILATERAL_ONLY'],
      createdAt: iso,
      updatedAt: iso,
    };
    const without = buildStableCore(makeInputs({ injuries: [] }));
    const withInjury = buildStableCore(makeInputs({ injuries: [injury] }));
    expect(without).not.toBe(withInjury);
  });

  it('is stable regardless of injury list order (sorts internally)', () => {
    const a: Injury = {
      id: 'a', label: 'A', regions: ['LEFT_KNEE'], status: 'MANAGING', severity: 2,
      onsetDate: '2026-01-01', contraindicatedPatterns: [], contraindicatedSwapGroups: [],
      preferredPatterns: [], constraints: [], createdAt: iso, updatedAt: iso,
    };
    const b: Injury = { ...a, id: 'b', label: 'B', regions: ['LEFT_SHOULDER'] };
    const ab = buildStableCore(makeInputs({ injuries: [a, b] }));
    const ba = buildStableCore(makeInputs({ injuries: [b, a] }));
    expect(ab).toBe(ba);
  });

  it('only includes top-12 memories sorted by id', () => {
    // Use distinguishable content strings so we can verify which 12 made it in.
    const memories: AthleteMemory[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i.toString().padStart(2, '0')}`,
      kind: 'GOAL',
      content: `MARKER-${i.toString().padStart(2, '0')}`,
      tags: [],
      importance: 3,
      createdAt: iso,
    }));
    const core = buildStableCore(makeInputs({ memorySnapshot: memories }));
    // Sorted by id ascending — first 12 are 00..11
    expect(core).toContain('MARKER-00');
    expect(core).toContain('MARKER-11');
    expect(core).not.toContain('MARKER-12');
    expect(core).not.toContain('MARKER-19');
  });

  it('handles null profile / arc gracefully', () => {
    const core = buildStableCore(makeInputs({ profile: null, arc: null }));
    expect(core).toContain(`PROMPT_VERSION=${PROMPT_VERSION}`);
    expect(core).not.toContain('## Athlete Profile');
    expect(core).not.toContain('## Active Arc');
  });

  it('serializes block context when current block is set', () => {
    const block: TrainingBlock = {
      id: 'b1',
      cycleId: 'c1',
      blockType: 'HEALTH_BASE',
      weekStart: 1,
      weekEnd: 4,
      volumeTarget: 0.85,
      intensityTarget: 0.70,
    };
    const core = buildStableCore(makeInputs({ currentBlock: block }));
    expect(core).toContain('HEALTH_BASE');
    expect(core).toContain('0.85');
  });
});

describe('computeHash', () => {
  it('produces a 16-char hex string', async () => {
    const h = await computeHash('hello world');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', async () => {
    const a = await computeHash('hello world');
    const b = await computeHash('hello world');
    expect(a).toBe(b);
  });

  it('changes when input changes', async () => {
    const a = await computeHash('hello world');
    const b = await computeHash('hello world!');
    expect(a).not.toBe(b);
  });
});

describe('aggregateStats', () => {
  const makeStat = (overrides: Partial<CoachCallStats>): CoachCallStats => ({
    id: 'x', timestamp: iso, cacheHit: false,
    cachedTokens: 0, uncachedInputTokens: 0, outputTokens: 0,
    model: 'gemini-2.5-flash', ...overrides,
  });

  it('returns zeros for empty input', () => {
    const agg = aggregateStats([]);
    expect(agg.callCount).toBe(0);
    expect(agg.hitRatePct).toBe(0);
    expect(agg.estimatedSavingsUsd).toBe(0);
  });

  it('computes hit rate', () => {
    const stats = [
      makeStat({ cacheHit: true }),
      makeStat({ cacheHit: true }),
      makeStat({ cacheHit: false }),
      makeStat({ cacheHit: true }),
    ];
    expect(aggregateStats(stats).hitRatePct).toBe(75);
  });

  it('estimates savings — every cached token saves $0.27e-6 (2.5 Flash rates)', () => {
    const stats = [makeStat({ cacheHit: true, cachedTokens: 1_000_000 })];
    expect(aggregateStats(stats).estimatedSavingsUsd).toBeCloseTo(0.27, 5);
  });

  it('sums per-category tokens across calls', () => {
    const stats = [
      makeStat({ cachedTokens: 100, uncachedInputTokens: 50, outputTokens: 200 }),
      makeStat({ cachedTokens: 200, uncachedInputTokens: 80, outputTokens: 100 }),
    ];
    const agg = aggregateStats(stats);
    expect(agg.totalCachedTokens).toBe(300);
    expect(agg.totalUncachedInputTokens).toBe(130);
    expect(agg.totalOutputTokens).toBe(300);
  });
});
