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

// ── Meet-prep macrocycle ──────────────────────────────────────────────────────

describe('generateMacrocycle — with meetDate (12 weeks)', () => {
  const result = generateMacrocycle({
    profile: baseProfile,
    meetDate: MEET_DATE,
    startDate: START_DATE,
    totalWeeks: 12,
  });

  it('produces exactly 3 blocks', () => {
    expect(result.blocks).toHaveLength(3);
  });

  it('block order is ACCUMULATION → INTENSIFICATION → REALIZATION', () => {
    expect(result.blocks[0].blockType).toBe('ACCUMULATION');
    expect(result.blocks[1].blockType).toBe('INTENSIFICATION');
    expect(result.blocks[2].blockType).toBe('REALIZATION');
  });

  it('blocks cover weeks 1–12 with no gaps or overlaps', () => {
    const blocks = result.blocks;
    expect(blocks[0].weekStart).toBe(1);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].weekStart).toBe(blocks[i - 1].weekEnd + 1);
    }
    expect(blocks[blocks.length - 1].weekEnd).toBe(12);
  });

  it('REALIZATION block spans last 4 weeks (9–12)', () => {
    const real = result.blocks[2];
    expect(real.weekStart).toBe(9);
    expect(real.weekEnd).toBe(12);
  });

  it('INTENSIFICATION block spans 4 weeks (5–8)', () => {
    const intens = result.blocks[1];
    expect(intens.weekStart).toBe(5);
    expect(intens.weekEnd).toBe(8);
  });

  it('ACCUMULATION block spans remaining weeks (1–4)', () => {
    const accum = result.blocks[0];
    expect(accum.weekStart).toBe(1);
    expect(accum.weekEnd).toBe(4);
  });

  it('intensity targets increase block-to-block', () => {
    const [a, b, c] = result.blocks;
    expect(a.intensityTarget).toBeLessThan(b.intensityTarget);
    expect(b.intensityTarget).toBeLessThan(c.intensityTarget);
  });

  it('volume targets decrease block-to-block', () => {
    const [a, b, c] = result.blocks;
    expect(a.volumeTarget).toBeGreaterThan(b.volumeTarget);
    expect(b.volumeTarget).toBeGreaterThan(c.volumeTarget);
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

  it('no gaps in week coverage', () => {
    const blocks = result.blocks;
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].weekStart).toBe(blocks[i - 1].weekEnd + 1);
    }
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

  it('weeks 1-4 are fully covered', () => {
    const first = result.blocks[0];
    const last  = result.blocks[result.blocks.length - 1];
    expect(first.weekStart).toBe(1);
    expect(last.weekEnd).toBe(4);
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

  it('produces exactly 2 blocks', () => {
    expect(result.blocks).toHaveLength(2);
  });

  it('block order is ACCUMULATION → INTENSIFICATION', () => {
    expect(result.blocks[0].blockType).toBe('ACCUMULATION');
    expect(result.blocks[1].blockType).toBe('INTENSIFICATION');
  });

  it('blocks cover weeks 1–8 with no gap', () => {
    const [a, b] = result.blocks;
    expect(a.weekStart).toBe(1);
    expect(b.weekStart).toBe(a.weekEnd + 1);
    expect(b.weekEnd).toBe(8);
  });

  it('INTENSIFICATION is last 2 weeks (7–8)', () => {
    const b = result.blocks[1];
    expect(b.weekStart).toBe(7);
    expect(b.weekEnd).toBe(8);
  });

  it('ACCUMULATION covers weeks 1–6', () => {
    const a = result.blocks[0];
    expect(a.weekStart).toBe(1);
    expect(a.weekEnd).toBe(6);
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
    const last = result.blocks[result.blocks.length - 1];
    expect(last.weekEnd).toBe(6);
  });

  it('last block is INTENSIFICATION', () => {
    const last = result.blocks[result.blocks.length - 1];
    expect(last.blockType).toBe('INTENSIFICATION');
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
