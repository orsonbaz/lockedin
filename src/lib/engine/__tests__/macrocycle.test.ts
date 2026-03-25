import { describe, it, expect } from 'vitest';
import { generateMacrocycle } from '../macrocycle';
import type { AthleteProfile } from '@/lib/db/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseProfile: AthleteProfile = {
  id: 'me',
  name: 'Test Athlete',
  weightKg: 82,
  targetWeightClass: 83,
  sex: 'MALE',
  federation: 'IPF',
  equipment: 'RAW',
  weighIn: 'TWO_HOUR',
  trainingAgeMonths: 24,
  maxSquat: 180,
  maxBench: 120,
  maxDeadlift: 210,
  bottleneck: 'BALANCED',
  rewardSystem: 'CONSISTENCY',
  responder: 'STANDARD',
  overshooter: false,
  timeToPeakWeeks: 3,
  weeklyFrequency: 4,
  peakDayOfWeek: 6,
  unitSystem: 'KG',
  onboardingComplete: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const START_DATE = '2024-09-01';
const MEET_DATE  = '2024-11-24'; // ~12 weeks after start

// ── Shared assertions ────────────────────────────────────────────────────────

function assertNoGaps(blocks: { weekStart: number; weekEnd: number }[], totalWeeks: number) {
  expect(blocks[0].weekStart).toBe(1);
  for (let i = 1; i < blocks.length; i++) {
    expect(blocks[i].weekStart).toBe(blocks[i - 1].weekEnd + 1);
  }
  expect(blocks[blocks.length - 1].weekEnd).toBe(totalWeeks);
}

// ── Meet-prep macrocycle (12 weeks) ─────────────────────────────────────────

describe('generateMacrocycle — with meetDate (12 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    meetDate: MEET_DATE,
    startDate: START_DATE,
    totalWeeks: 12,
  });

  it('produces 5 blocks (ACCUM + DELOAD + INTENS + DELOAD + REAL)', () => {
    expect(result.blocks).toHaveLength(5);
  });

  it('block order includes deloads', () => {
    expect(result.blocks.map((b) => b.blockType)).toEqual([
      'ACCUMULATION',
      'DELOAD',
      'INTENSIFICATION',
      'DELOAD',
      'REALIZATION',
    ]);
  });

  it('blocks cover weeks 1–12 with no gaps or overlaps', () => {
    assertNoGaps(result.blocks, 12);
  });

  it('ACCUMULATION is 3 weeks (1–3)', () => {
    const accum = result.blocks[0];
    expect(accum.weekStart).toBe(1);
    expect(accum.weekEnd).toBe(3);
  });

  it('first DELOAD is week 4', () => {
    const deload = result.blocks[1];
    expect(deload.blockType).toBe('DELOAD');
    expect(deload.weekStart).toBe(4);
    expect(deload.weekEnd).toBe(4);
  });

  it('INTENSIFICATION is 3 weeks (5–7)', () => {
    const intens = result.blocks[2];
    expect(intens.weekStart).toBe(5);
    expect(intens.weekEnd).toBe(7);
  });

  it('second DELOAD is week 8', () => {
    const deload = result.blocks[3];
    expect(deload.blockType).toBe('DELOAD');
    expect(deload.weekStart).toBe(8);
    expect(deload.weekEnd).toBe(8);
  });

  it('REALIZATION spans last 4 weeks (9–12)', () => {
    const real = result.blocks[4];
    expect(real.blockType).toBe('REALIZATION');
    expect(real.weekStart).toBe(9);
    expect(real.weekEnd).toBe(12);
  });

  it('non-deload intensity targets increase block-to-block', () => {
    const training = result.blocks.filter((b) => b.blockType !== 'DELOAD');
    for (let i = 1; i < training.length; i++) {
      expect(training[i].intensityTarget).toBeGreaterThanOrEqual(training[i - 1].intensityTarget);
    }
  });

  it('non-deload volume targets decrease block-to-block', () => {
    const training = result.blocks.filter((b) => b.blockType !== 'DELOAD');
    for (let i = 1; i < training.length; i++) {
      expect(training[i].volumeTarget).toBeLessThanOrEqual(training[i - 1].volumeTarget);
    }
  });

  it('cycle is ACTIVE with totalWeeks = 12', () => {
    expect(result.cycle.status).toBe('ACTIVE');
    expect(result.cycle.totalWeeks).toBe(12);
    expect(result.cycle.currentWeek).toBe(1);
  });

  it('cycle name includes "Meet Prep"', () => {
    expect(result.cycle.name).toMatch(/meet prep/i);
  });

  it('cycle startDate matches input', () => {
    expect(result.cycle.startDate).toBe(START_DATE);
  });

  it('cycleId is empty string (caller sets it on DB insert)', () => {
    result.blocks.forEach((b) => expect(b.cycleId).toBe(''));
  });
});

// ── Shorter meet-prep (8 weeks) ───────────────────────────────────────────────

describe('generateMacrocycle — with meetDate (8 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    meetDate: '2024-10-27',
    startDate: START_DATE,
    totalWeeks: 8,
  });

  it('covers exactly 8 weeks', () => {
    const last = result.blocks[result.blocks.length - 1];
    expect(last.weekEnd).toBe(8);
    expect(result.cycle.totalWeeks).toBe(8);
  });

  it('last block is REALIZATION', () => {
    const last = result.blocks[result.blocks.length - 1];
    expect(last.blockType).toBe('REALIZATION');
  });

  it('includes a DELOAD week', () => {
    expect(result.blocks.some((b) => b.blockType === 'DELOAD')).toBe(true);
  });

  it('no gaps in week coverage', () => {
    assertNoGaps(result.blocks, 8);
  });
});

// ── 10-week meet-prep ─────────────────────────────────────────────────────────

describe('generateMacrocycle — with meetDate (10 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    meetDate: '2024-11-10',
    startDate: START_DATE,
    totalWeeks: 10,
  });

  it('covers exactly 10 weeks', () => {
    assertNoGaps(result.blocks, 10);
  });

  it('includes one DELOAD (remaining = 6, medium prep)', () => {
    const deloads = result.blocks.filter((b) => b.blockType === 'DELOAD');
    expect(deloads).toHaveLength(1);
  });

  it('ends with REALIZATION', () => {
    const last = result.blocks[result.blocks.length - 1];
    expect(last.blockType).toBe('REALIZATION');
  });
});

// ── Very short meet-prep (4 weeks — only REALIZATION) ────────────────────────

describe('generateMacrocycle — with meetDate (4 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    meetDate: '2024-09-29',
    startDate: START_DATE,
    totalWeeks: 4,
  });

  it('last block is REALIZATION covering all 4 weeks', () => {
    const real = result.blocks[result.blocks.length - 1];
    expect(real.blockType).toBe('REALIZATION');
    expect(real.weekEnd).toBe(4);
  });

  it('no DELOAD weeks in very short preps', () => {
    expect(result.blocks.every((b) => b.blockType !== 'DELOAD')).toBe(true);
  });

  it('weeks 1-4 are fully covered', () => {
    assertNoGaps(result.blocks, 4);
  });
});

// ── No-meet general block ────────────────────────────────────────────────────

describe('generateMacrocycle — no meetDate (default 8 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    startDate: START_DATE,
  });

  it('defaults to 8 total weeks', () => {
    expect(result.cycle.totalWeeks).toBe(8);
  });

  it('produces 3 blocks (ACCUM + DELOAD + INTENS)', () => {
    expect(result.blocks).toHaveLength(3);
  });

  it('block order is ACCUMULATION → DELOAD → INTENSIFICATION', () => {
    expect(result.blocks.map((b) => b.blockType)).toEqual([
      'ACCUMULATION',
      'DELOAD',
      'INTENSIFICATION',
    ]);
  });

  it('blocks cover weeks 1–8 with no gap', () => {
    assertNoGaps(result.blocks, 8);
  });

  it('INTENSIFICATION is last 2 weeks (7–8)', () => {
    const intens = result.blocks[2];
    expect(intens.weekStart).toBe(7);
    expect(intens.weekEnd).toBe(8);
  });

  it('ACCUMULATION covers weeks 1–5', () => {
    const accum = result.blocks[0];
    expect(accum.weekStart).toBe(1);
    expect(accum.weekEnd).toBe(5);
  });

  it('DELOAD is week 6', () => {
    expect(result.blocks[1].blockType).toBe('DELOAD');
    expect(result.blocks[1].weekStart).toBe(6);
    expect(result.blocks[1].weekEnd).toBe(6);
  });

  it('cycle name includes the week count', () => {
    expect(result.cycle.name).toMatch(/8/);
  });
});

// ── No-meet, explicit totalWeeks ──────────────────────────────────────────────

describe('generateMacrocycle — no meetDate, totalWeeks = 6', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    startDate: START_DATE,
    totalWeeks: 6,
  });

  it('covers exactly 6 weeks', () => {
    assertNoGaps(result.blocks, 6);
  });

  it('includes a DELOAD week', () => {
    expect(result.blocks.some((b) => b.blockType === 'DELOAD')).toBe(true);
  });

  it('last block is INTENSIFICATION', () => {
    const last = result.blocks[result.blocks.length - 1];
    expect(last.blockType).toBe('INTENSIFICATION');
  });
});

// ── Short general block (4 weeks — no deload) ────────────────────────────────

describe('generateMacrocycle — no meetDate, totalWeeks = 4', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    startDate: START_DATE,
    totalWeeks: 4,
  });

  it('covers exactly 4 weeks', () => {
    assertNoGaps(result.blocks, 4);
  });

  it('no DELOAD (too short)', () => {
    expect(result.blocks.every((b) => b.blockType !== 'DELOAD')).toBe(true);
  });

  it('exactly 2 blocks: ACCUM + INTENS', () => {
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].blockType).toBe('ACCUMULATION');
    expect(result.blocks[1].blockType).toBe('INTENSIFICATION');
  });
});

// ── Default totalWeeks resolves correctly ─────────────────────────────────────

describe('generateMacrocycle — default totalWeeks', () => {
  it('defaults to 12 when meetDate is supplied', () => {
    const { cycle } = generateMacrocycle({
      profile: baseProfile,
      meetDate: '2024-11-24',
      startDate: START_DATE,
    });
    expect(cycle.totalWeeks).toBe(12);
  });

  it('defaults to 8 when no meetDate', () => {
    const { cycle } = generateMacrocycle({
      profile: baseProfile,
      startDate: START_DATE,
    });
    expect(cycle.totalWeeks).toBe(8);
  });
});
