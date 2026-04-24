import { describe, it, expect } from 'vitest';
import { generateSession, abbreviateSession, estimateSessionMinutes } from '../session';
import type { AthleteProfile, TrainingBlock } from '@/lib/db/types';

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

function makeBlock(
  blockType: TrainingBlock['blockType'],
  overrides?: Partial<TrainingBlock>,
): TrainingBlock {
  const baseMap: Record<TrainingBlock['blockType'], Partial<TrainingBlock>> = {
    ACCUMULATION:    { volumeTarget: 1.1, intensityTarget: 0.73 },
    INTENSIFICATION: { volumeTarget: 0.9, intensityTarget: 0.82 },
    REALIZATION:     { volumeTarget: 0.65, intensityTarget: 0.90 },
    DELOAD:          { volumeTarget: 0.5, intensityTarget: 0.65 },
    PIVOT:           { volumeTarget: 0.8, intensityTarget: 0.70 },
    MAINTENANCE:     { volumeTarget: 0.75, intensityTarget: 0.75 },
  };
  const base = baseMap[blockType];
  return {
    id:              'block-1',
    cycleId:         'cycle-1',
    blockType,
    weekStart:       1,
    weekEnd:         4,
    volumeTarget:    base.volumeTarget    ?? 1.0,
    intensityTarget: base.intensityTarget ?? 0.75,
    ...overrides,
  };
}

const goodReadiness = 85;
const lowReadiness  = 45;
const mondayDOW     = 1;

// ── Primary lift rotation ─────────────────────────────────────────────────────

describe('generateSession — variation selector + tempo', () => {
  it('picks a tempo/pause variation by week parity so the athlete rotates 2 variants per block', () => {
    const block = makeBlock('ACCUMULATION', { weekStart: 1, weekEnd: 4 });
    const wk1 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2, weekWithinBlock: 1,
    });
    const wk2 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2, weekWithinBlock: 2,
    });
    const v1 = wk1.exercises.find((e) => e.exerciseType === 'VARIATION')!;
    const v2 = wk2.exercises.find((e) => e.exerciseType === 'VARIATION')!;
    expect(v1.name).not.toBe(v2.name);
  });

  it('NEURAL bottleneck in INTENSIFICATION picks pin press or board press (lockout-biased)', () => {
    const neuralProfile = { ...baseProfile, bottleneck: 'NEURAL' as const };
    const block = makeBlock('INTENSIFICATION');
    const s = generateSession({
      profile: neuralProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2, weekWithinBlock: 1,
    });
    const v = s.exercises.find((e) => e.exerciseType === 'VARIATION')!;
    expect(['Pin Press', 'Board Press']).toContain(v.name);
  });

  it('attaches a tempo string when a tempo variation is picked', () => {
    // HYPERTROPHY + SQUAT accumulation, even week -> Pause Squat; odd week -> High-Bar.
    // Check BALANCED + SQUAT odd week (Pause Squat) vs even (Tempo Squat).
    const block = makeBlock('ACCUMULATION');
    const even = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 1, weekWithinBlock: 2,
    });
    const v = even.exercises.find((e) => e.exerciseType === 'VARIATION')!;
    if (v.tempo !== undefined) {
      expect(v.tempo).toMatch(/^\d+-\d+-\d+$/);
    }
  });
});

describe('generateSession — set-count undulation across block weeks', () => {
  it('Week 3 of a 4-week accumulation drops at least one set vs week 1', () => {
    const block = makeBlock('ACCUMULATION', { weekStart: 1, weekEnd: 4 });
    const wk1 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 1, weekWithinBlock: 1,
    });
    const wk3 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 1, weekWithinBlock: 3,
    });
    const c1 = wk1.exercises.find((e) => e.exerciseType === 'COMPETITION')!;
    const c3 = wk3.exercises.find((e) => e.exerciseType === 'COMPETITION')!;
    expect(c3.sets).toBeLessThanOrEqual(c1.sets);
    expect(c3.reps).toBeGreaterThanOrEqual(c1.reps);
  });
});

describe('generateSession — cross-discipline accessory overlay', () => {
  it('bench day auto-adds face pulls', () => {
    const block = makeBlock('ACCUMULATION');
    const s = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2,
    });
    const hasFacePulls = s.exercises.some((e) => e.name === 'Face Pull');
    expect(hasFacePulls).toBe(true);
  });

  it('squat day adds a weighted pull-up when street-lift is a discipline', () => {
    const p = { ...baseProfile, disciplines: ['POWERLIFTING', 'STREET_LIFT'] satisfies AthleteProfile['disciplines'] };
    const block = makeBlock('ACCUMULATION');
    const s = generateSession({
      profile: p, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 1,
    });
    const hasPullUp = s.exercises.some((e) => e.name === 'Weighted Pull-Up');
    expect(hasPullUp).toBe(true);
  });

  it('REALIZATION skips the overlay (comp focus)', () => {
    const block = makeBlock('REALIZATION', { weekStart: 10, weekEnd: 12 });
    const s = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2, weekWithinBlock: 1,
    });
    const hasFacePulls = s.exercises.some((e) => e.name === 'Face Pull');
    expect(hasFacePulls).toBe(false);
  });
});

describe('generateSession — adaptive primary-lift selection', () => {
  const block = makeBlock('ACCUMULATION');

  it('picks the most-due lift when exposures are provided', () => {
    // DEADLIFT hasn't happened in 9 days, others are recent → adaptive selector
    // should pick DEADLIFT regardless of sessionNumber.
    const out = generateSession({
      profile: baseProfile,
      block,
      weekDayOfWeek: 1,
      readinessScore: 80,
      sessionNumber: 1, // rotation would say SQUAT
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 1, weekCount: 2 },
        { lift: 'BENCH',    daysSince: 2, weekCount: 3 },
        { lift: 'DEADLIFT', daysSince: 9, weekCount: 0 },
      ],
    });
    expect(out.primaryLift).toBe('DEADLIFT');
  });

  it('honors an explicit SBD day request with two secondary lifts', () => {
    const out = generateSession({
      profile: baseProfile,
      block,
      weekDayOfWeek: 6,
      readinessScore: 80,
      sessionNumber: 1,
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 5, weekCount: 1 },
        { lift: 'BENCH',    daysSince: 5, weekCount: 1 },
        { lift: 'DEADLIFT', daysSince: 5, weekCount: 1 },
      ],
      sbdToday: true,
    });
    expect(out.secondaryLifts?.length ?? 0).toBe(2);
    expect(out.exercises.filter((e) => e.exerciseType === 'COMPETITION').length)
      .toBeGreaterThanOrEqual(3);
  });

  it('stays single-lift when readiness is low even with roughly equal need', () => {
    const out = generateSession({
      profile: baseProfile,
      block,
      weekDayOfWeek: 3,
      readinessScore: 40,
      sessionNumber: 1,
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 4, weekCount: 1 },
        { lift: 'BENCH',    daysSince: 4, weekCount: 1 },
        { lift: 'DEADLIFT', daysSince: 4, weekCount: 1 },
      ],
    });
    expect(out.secondaryLifts ?? []).toEqual([]);
  });
});

describe('generateSession — primary lift rotation', () => {
  const block = makeBlock('ACCUMULATION');

  describe('4-day week', () => {
    const freq4 = { ...baseProfile, weeklyFrequency: 4 };
    it('S1 = SQUAT',     () => expect(generateSession({ profile: freq4, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 1 }).primaryLift).toBe('SQUAT'));
    it('S2 = BENCH',     () => expect(generateSession({ profile: freq4, block, weekDayOfWeek: 2, readinessScore: 80, sessionNumber: 2 }).primaryLift).toBe('BENCH'));
    it('S3 = DEADLIFT',  () => expect(generateSession({ profile: freq4, block, weekDayOfWeek: 4, readinessScore: 80, sessionNumber: 3 }).primaryLift).toBe('DEADLIFT'));
    it('S4 = BENCH',     () => expect(generateSession({ profile: freq4, block, weekDayOfWeek: 6, readinessScore: 80, sessionNumber: 4 }).primaryLift).toBe('BENCH'));
  });

  describe('3-day week', () => {
    const freq3 = { ...baseProfile, weeklyFrequency: 3 };
    it('S1 = SQUAT',    () => expect(generateSession({ profile: freq3, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 1 }).primaryLift).toBe('SQUAT'));
    it('S2 = BENCH',    () => expect(generateSession({ profile: freq3, block, weekDayOfWeek: 3, readinessScore: 80, sessionNumber: 2 }).primaryLift).toBe('BENCH'));
    it('S3 = DEADLIFT', () => expect(generateSession({ profile: freq3, block, weekDayOfWeek: 5, readinessScore: 80, sessionNumber: 3 }).primaryLift).toBe('DEADLIFT'));
    // wraps around
    it('S4 wraps to SQUAT', () => expect(generateSession({ profile: freq3, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 4 }).primaryLift).toBe('SQUAT'));
  });

  describe('5-day week', () => {
    const freq5 = { ...baseProfile, weeklyFrequency: 5 };
    it('S1 = SQUAT',    () => expect(generateSession({ profile: freq5, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 1 }).primaryLift).toBe('SQUAT'));
    it('S4 = UPPER',    () => expect(generateSession({ profile: freq5, block, weekDayOfWeek: 4, readinessScore: 80, sessionNumber: 4 }).primaryLift).toBe('UPPER'));
    it('S5 = SQUAT',    () => expect(generateSession({ profile: freq5, block, weekDayOfWeek: 5, readinessScore: 80, sessionNumber: 5 }).primaryLift).toBe('SQUAT'));
  });

  describe('6-day week', () => {
    const freq6 = { ...baseProfile, weeklyFrequency: 6 };
    it('S1 = SQUAT',    () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 1 }).primaryLift).toBe('SQUAT'));
    it('S2 = BENCH',    () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 2, readinessScore: 80, sessionNumber: 2 }).primaryLift).toBe('BENCH'));
    it('S3 = DEADLIFT', () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 3, readinessScore: 80, sessionNumber: 3 }).primaryLift).toBe('DEADLIFT'));
    it('S4 = UPPER',    () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 4, readinessScore: 80, sessionNumber: 4 }).primaryLift).toBe('UPPER'));
    it('S5 = SQUAT',    () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 5, readinessScore: 80, sessionNumber: 5 }).primaryLift).toBe('SQUAT'));
    it('S6 = DEADLIFT', () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 6, readinessScore: 80, sessionNumber: 6 }).primaryLift).toBe('DEADLIFT'));
    // Rotation wraps on session 7
    it('S7 wraps to SQUAT', () => expect(generateSession({ profile: freq6, block, weekDayOfWeek: 1, readinessScore: 80, sessionNumber: 7 }).primaryLift).toBe('SQUAT'));
  });
});

// ── Session type mapping ──────────────────────────────────────────────────────

describe('generateSession — session type from block', () => {
  it('ACCUMULATION block → ACCUMULATION session', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.sessionType).toBe('ACCUMULATION');
  });

  it('INTENSIFICATION block → TECHNICAL session', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('INTENSIFICATION'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.sessionType).toBe('TECHNICAL');
  });

  it('REALIZATION block → PEAK session', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('REALIZATION'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.sessionType).toBe('PEAK');
  });

  it('DELOAD block → RECOVERY session', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('DELOAD'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.sessionType).toBe('RECOVERY');
  });
});

// ── Exercise structure ────────────────────────────────────────────────────────

describe('generateSession — exercise structure', () => {
  it('always returns at least one exercise', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.exercises.length).toBeGreaterThan(0);
  });

  it('exercise order values are sequential starting at 1', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
    s.exercises.forEach((ex, i) => expect(ex.order).toBe(i + 1));
  });

  it('all exercises have positive sets and reps', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
    s.exercises.forEach((ex) => {
      expect(ex.sets).toBeGreaterThan(0);
      expect(ex.reps).toBeGreaterThan(0);
    });
  });

  it('all exercises have positive load estimates', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
    s.exercises.forEach((ex) => {
      expect(ex.estimatedLoadKg).toBeGreaterThan(0);
    });
  });

  it('all estimated loads are multiples of 2.5', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
    s.exercises.forEach((ex) => {
      expect(ex.estimatedLoadKg % 2.5).toBeCloseTo(0, 5);
    });
  });

  it('all RPE targets are within 5–10 range', () => {
    ['ACCUMULATION', 'INTENSIFICATION', 'REALIZATION', 'DELOAD'].forEach((bt) => {
      const s = generateSession({
        profile: baseProfile,
        block: makeBlock(bt as TrainingBlock['blockType']),
        weekDayOfWeek: mondayDOW,
        readinessScore: 80,
        sessionNumber: 1,
      });
      s.exercises.forEach((ex) => {
        expect(ex.rpeTarget).toBeGreaterThanOrEqual(5);
        expect(ex.rpeTarget).toBeLessThanOrEqual(10);
      });
    });
  });
});

// ── ACCUMULATION block specifics ──────────────────────────────────────────────

describe('generateSession — ACCUMULATION block', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1, // SQUAT day
  });

  it('first exercise is COMPETITION type', () => {
    expect(s.exercises[0].exerciseType).toBe('COMPETITION');
  });

  it('first exercise is straight sets', () => {
    expect(s.exercises[0].setStructure).toBe('STRAIGHT');
  });

  it('includes a VARIATION exercise', () => {
    const variation = s.exercises.find((e) => e.exerciseType === 'VARIATION');
    expect(variation).toBeDefined();
  });

  it('includes ACCESSORY exercises', () => {
    const accessories = s.exercises.filter((e) => e.exerciseType === 'ACCESSORY');
    expect(accessories.length).toBeGreaterThan(0);
  });

  it('primary sets reflect BALANCED bottleneck (5 reps)', () => {
    expect(s.exercises[0].reps).toBe(5);
  });

  it('comp exercise load is based on squat max (180 kg)', () => {
    // Load should be sub-max (RPE 7.5 at 5 reps ≈ 130–145 kg range)
    const compLoad = s.exercises[0].estimatedLoadKg;
    expect(compLoad).toBeGreaterThan(100);
    expect(compLoad).toBeLessThan(180);
  });
});

// ── INTENSIFICATION block ─────────────────────────────────────────────────────

describe('generateSession — INTENSIFICATION block', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('INTENSIFICATION'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  it('prescribes a variation (pin press / block pull / pause variant) for lockout and position work', () => {
    const variation = s.exercises.find((e) => e.exerciseType === 'VARIATION');
    expect(variation).toBeDefined();
    // Intensification keeps sets lean so the athlete can hit the top comp work.
    expect(variation!.sets).toBeLessThanOrEqual(2);
  });

  it('primary reps are lower than ACCUMULATION (BALANCED = 4 in intensification)', () => {
    const accSession = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness,
      sessionNumber: 1,
    });
    expect(s.exercises[0].reps).toBeLessThanOrEqual(accSession.exercises[0].reps);
  });

  it('primary RPE is higher than ACCUMULATION', () => {
    const accSession = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness,
      sessionNumber: 1,
    });
    expect(s.exercises[0].rpeTarget).toBeGreaterThan(accSession.exercises[0].rpeTarget);
  });
});

// ── REALIZATION block ─────────────────────────────────────────────────────────

describe('generateSession — REALIZATION block', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('REALIZATION'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  it('has only COMPETITION exercises (no accessories)', () => {
    s.exercises.forEach((ex) => {
      expect(ex.exerciseType).toBe('COMPETITION');
    });
  });

  it('primary exercise uses ASCENDING set structure', () => {
    expect(s.exercises[0].setStructure).toBe('ASCENDING');
  });

  it('RPE target is high (≥ 8.5 with good readiness)', () => {
    expect(s.exercises[0].rpeTarget).toBeGreaterThanOrEqual(8.5);
  });

  it('3 working sets prescribed', () => {
    expect(s.exercises[0].sets).toBe(3);
  });
});

// ── DELOAD block ──────────────────────────────────────────────────────────────

describe('generateSession — DELOAD block', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('DELOAD'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  it('primary exercise has only 2 sets', () => {
    expect(s.exercises[0].sets).toBe(2);
  });

  it('primary RPE is low (≤ 7)', () => {
    expect(s.exercises[0].rpeTarget).toBeLessThanOrEqual(7);
  });

  it('primary is 5 reps', () => {
    expect(s.exercises[0].reps).toBe(5);
  });
});

// ── Readiness-based volume reduction ─────────────────────────────────────────

describe('generateSession — readiness adjustments', () => {
  const block = makeBlock('ACCUMULATION');

  it('low readiness reduces total sets vs normal readiness', () => {
    const normal = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
    const low    = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: lowReadiness, sessionNumber: 1 });

    const totalNormal = normal.exercises.reduce((s, e) => s + e.sets, 0);
    const totalLow    = low.exercises.reduce((s, e) => s + e.sets, 0);
    expect(totalLow).toBeLessThan(totalNormal);
  });

  it('low readiness adds a modification entry', () => {
    const s = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: lowReadiness, sessionNumber: 1 });
    expect(s.modifications.length).toBeGreaterThan(0);
  });

  it('high readiness has no modifications', () => {
    const s = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 95, sessionNumber: 1 });
    expect(s.modifications).toHaveLength(0);
  });

  it('low readiness lowers RPE target vs normal', () => {
    const normal = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const low    = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: lowReadiness, sessionNumber: 1 });
    expect(low.exercises[0].rpeTarget).toBeLessThan(normal.exercises[0].rpeTarget);
  });
});

// ── Overshooter flag ──────────────────────────────────────────────────────────

describe('generateSession — overshooter flag', () => {
  const block = makeBlock('ACCUMULATION');

  it('overshooter=true lowers RPE targets by 0.5 vs non-overshooter', () => {
    const normal     = generateSession({ profile: { ...baseProfile, overshooter: false }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const overshoot  = generateSession({ profile: { ...baseProfile, overshooter: true  }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(overshoot.exercises[0].rpeTarget).toBeCloseTo(normal.exercises[0].rpeTarget - 0.5, 5);
  });
});

// ── Overshoot history ─────────────────────────────────────────────────────────

describe('generateSession — overshootHistory', () => {
  const block = makeBlock('ACCUMULATION');

  it('positive overshoot history reduces RPE further', () => {
    const noHistory   = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const withHistory = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1, overshootHistory: 1.5 });
    expect(withHistory.exercises[0].rpeTarget).toBeLessThan(noHistory.exercises[0].rpeTarget);
  });

  it('overshoot history adds a modification message', () => {
    const s = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1, overshootHistory: 2.0 });
    const hasOvershootMsg = s.modifications.some((m) => /overshoot/i.test(m));
    expect(hasOvershootMsg).toBe(true);
  });

  it('zero overshoot history has no effect', () => {
    const base = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const zero = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1, overshootHistory: 0 });
    expect(zero.exercises[0].rpeTarget).toBe(base.exercises[0].rpeTarget);
  });
});

// ── Responder phenotype ───────────────────────────────────────────────────────

describe('generateSession — responder phenotype on sets', () => {
  const block = makeBlock('ACCUMULATION');

  it('HIGH responder gets more sets than STANDARD', () => {
    const std  = generateSession({ profile: { ...baseProfile, responder: 'STANDARD' }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const high = generateSession({ profile: { ...baseProfile, responder: 'HIGH'     }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const stdSets  = std.exercises[0].sets;
    const highSets = high.exercises[0].sets;
    expect(highSets).toBeGreaterThanOrEqual(stdSets);
  });

  it('LOW responder gets fewer or equal sets vs STANDARD', () => {
    const std = generateSession({ profile: { ...baseProfile, responder: 'STANDARD' }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    const low = generateSession({ profile: { ...baseProfile, responder: 'LOW'      }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(low.exercises[0].sets).toBeLessThanOrEqual(std.exercises[0].sets);
  });
});

// ── Bottleneck phenotype ──────────────────────────────────────────────────────

describe('generateSession — bottleneck phenotype on reps', () => {
  const block = makeBlock('ACCUMULATION');

  it('HYPERTROPHY bottleneck → 6 reps', () => {
    const s = generateSession({ profile: { ...baseProfile, bottleneck: 'HYPERTROPHY' }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(s.exercises[0].reps).toBe(6);
  });

  it('NEURAL bottleneck → 3 reps', () => {
    const s = generateSession({ profile: { ...baseProfile, bottleneck: 'NEURAL' }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(s.exercises[0].reps).toBe(3);
  });

  it('BALANCED bottleneck → 5 reps', () => {
    const s = generateSession({ profile: { ...baseProfile, bottleneck: 'BALANCED' }, block, weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(s.exercises[0].reps).toBe(5);
  });
});

// ── Coach notes ───────────────────────────────────────────────────────────────

describe('generateSession — coach notes', () => {
  it('always returns a non-empty coach note', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: 80, sessionNumber: 1 });
    expect(s.coachNote.length).toBeGreaterThan(0);
  });

  it('low readiness (<60) note mentions readiness reduction', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: 45, sessionNumber: 1 });
    expect(s.coachNote).toMatch(/readiness|reduced|quality/i);
  });

  it('REALIZATION block note mentions peak week', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('REALIZATION'), weekDayOfWeek: mondayDOW, readinessScore: 85, sessionNumber: 1 });
    expect(s.coachNote).toMatch(/peak week/i);
  });

  it('high readiness (>85) note is encouraging', () => {
    const s = generateSession({ profile: baseProfile, block: makeBlock('ACCUMULATION'), weekDayOfWeek: mondayDOW, readinessScore: 90, sessionNumber: 1 });
    expect(s.coachNote).toMatch(/great|prescribed|quality/i);
  });

  it('low readiness overrides REALIZATION note', () => {
    // Safety over psychology
    const s = generateSession({ profile: baseProfile, block: makeBlock('REALIZATION'), weekDayOfWeek: mondayDOW, readinessScore: 40, sessionNumber: 1 });
    expect(s.coachNote).toMatch(/readiness|reduced/i);
    expect(s.coachNote).not.toMatch(/peak week/i);
  });
});

// ── Bench and Deadlift sessions ───────────────────────────────────────────────

describe('generateSession — bench day (S2)', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: 2,
    readinessScore: goodReadiness,
    sessionNumber: 2,
  });

  it('primary lift is BENCH', () => {
    expect(s.primaryLift).toBe('BENCH');
  });

  it('first exercise contains "Bench"', () => {
    expect(s.exercises[0].name).toMatch(/bench/i);
  });

  it('accessories are upper-body (no RDL or Leg Press)', () => {
    const names = s.exercises.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('rdl') || n.includes('romanian') || n.includes('leg press'))).toBe(false);
  });
});

describe('generateSession — deadlift day (S3)', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: 4,
    readinessScore: goodReadiness,
    sessionNumber: 3,
  });

  it('primary lift is DEADLIFT', () => {
    expect(s.primaryLift).toBe('DEADLIFT');
  });

  it('first exercise contains "Deadlift"', () => {
    expect(s.exercises[0].name).toMatch(/deadlift/i);
  });

  it('accessories include a pull movement (lat pulldowns or rows)', () => {
    const names = s.exercises.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('pulldown') || n.includes('row'))).toBe(true);
  });
});

describe('generateSession — squat day includes upper back pulling', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  it('accessories include a row or pulldown movement', () => {
    const names = s.exercises.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('row') || n.includes('pulldown'))).toBe(true);
  });

  it('has 5 or more exercises total (comp + variation + ≥3 accessories)', () => {
    expect(s.exercises.length).toBeGreaterThanOrEqual(5);
  });
});

describe('generateSession — UPPER day (5-day or 6-day rotation)', () => {
  const freq5 = { ...baseProfile, weeklyFrequency: 5 };
  const s = generateSession({
    profile: freq5,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: 4,
    readinessScore: goodReadiness,
    sessionNumber: 4, // UPPER day in 5-day rotation
  });

  it('primary lift is UPPER', () => {
    expect(s.primaryLift).toBe('UPPER');
  });

  it('first exercise is a bench or press variant', () => {
    expect(s.exercises[0].name).toMatch(/bench|press/i);
  });

  it('accessories include a row or pulldown movement', () => {
    const names = s.exercises.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('row') || n.includes('pulldown'))).toBe(true);
  });
});

// ── Variation exercise discount ───────────────────────────────────────────────

describe('generateSession — variation exercise load discount', () => {
  const block = makeBlock('ACCUMULATION');

  // Squat S1: includes Pause Squat as the variation
  const s = generateSession({
    profile: baseProfile, // SQ=180
    block,
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  const compExercise = s.exercises[0]; // Squat
  const variation    = s.exercises.find((e) => e.exerciseType === 'VARIATION');

  it('variation exercise exists on squat accumulation day', () => {
    expect(variation).toBeDefined();
  });

  it('variation load is strictly less than competition squat load', () => {
    expect(variation!.estimatedLoadKg).toBeLessThan(compExercise.estimatedLoadKg);
  });

  it('pause squat load reflects ~87% max discount (< 135 kg for 180 kg squatter)', () => {
    // Old formula (no varCoeff): prescribeLoad(180, 7.0, 6) ≈ 130 kg
    // New formula (varCoeff=0.87): prescribeLoad(180×0.87, 7.0, 6) ≈ 112.5 kg
    // Either way it must be well below 135 to prove the 87% discount is in effect
    // and above 90 to confirm a reasonable training load
    expect(variation!.estimatedLoadKg).toBeLessThan(135);
    expect(variation!.estimatedLoadKg).toBeGreaterThan(85);
  });

  it('variation RPE is lower than competition RPE', () => {
    expect(variation!.rpeTarget).toBeLessThan(compExercise.rpeTarget);
  });
});

// ── Accessory readiness-responsiveness ───────────────────────────────────────

describe('generateSession — accessory loads respond to readiness', () => {
  const block = makeBlock('ACCUMULATION');

  // Squat day S1: includes RDL and Lat Pulldowns as accessories
  const goodSession = generateSession({
    profile: baseProfile, // DL=210
    block,
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness, // 85
    sessionNumber: 1,
  });

  const lowSession = generateSession({
    profile: baseProfile,
    block,
    weekDayOfWeek: mondayDOW,
    readinessScore: lowReadiness, // 45
    sessionNumber: 1,
  });

  const goodRdl = goodSession.exercises.find((e) => /romanian|rdl/i.test(e.name));
  const lowRdl  = lowSession.exercises.find((e)  => /romanian|rdl/i.test(e.name));

  it('RDL is present on squat day', () => {
    expect(goodRdl).toBeDefined();
  });

  it('RDL load decreases when readiness is low', () => {
    expect(lowRdl!.estimatedLoadKg).toBeLessThan(goodRdl!.estimatedLoadKg);
  });

  it('RDL load at good readiness is plausible (> 100 kg for DL=210)', () => {
    // Old hardcoded formula: dl × 0.42 = 210 × 0.42 = 88 kg — fails this check
    // New formula: prescribeLoad(210×0.85, 7.5, 10) ≈ 115 kg ✓
    expect(goodRdl!.estimatedLoadKg).toBeGreaterThan(100);
  });

  it('RDL load at good readiness is not unrealistically heavy (< 180 kg)', () => {
    expect(goodRdl!.estimatedLoadKg).toBeLessThan(180);
  });

  // Deadlift day S3: includes Lat Pulldowns
  const dlGoodSession = generateSession({
    profile: baseProfile,
    block,
    weekDayOfWeek: 4,
    readinessScore: goodReadiness,
    sessionNumber: 3,
  });

  const dlLowSession = generateSession({
    profile: baseProfile,
    block,
    weekDayOfWeek: 4,
    readinessScore: lowReadiness,
    sessionNumber: 3,
  });

  const goodLat = dlGoodSession.exercises.find((e) => /lat/i.test(e.name));
  const lowLat  = dlLowSession.exercises.find((e)  => /lat/i.test(e.name));

  it('Lat Pulldowns present on deadlift day', () => {
    expect(goodLat).toBeDefined();
  });

  it('Lat Pulldown load decreases when readiness is low', () => {
    expect(lowLat!.estimatedLoadKg).toBeLessThan(goodLat!.estimatedLoadKg);
  });

  it('Lat Pulldown load is plausible (50–90 kg for DL=210)', () => {
    // Old formula: dl × 0.25 = 52.5 kg (borderline); new: prescribeLoad(210×0.45, 7.5, 10) ≈ 60 kg
    expect(goodLat!.estimatedLoadKg).toBeGreaterThan(45);
    expect(goodLat!.estimatedLoadKg).toBeLessThan(95);
  });
});

// ── DUP (Daily Undulating Periodization) variation ───────────────────────────

describe('generateSession — DUP second-occurrence volume day', () => {
  const block  = makeBlock('ACCUMULATION');
  const freq5  = { ...baseProfile, weeklyFrequency: 5 };
  const freq6  = { ...baseProfile, weeklyFrequency: 6 };

  // 5-day rotation: S1=SQ, S2=BP, S3=DL, S4=UPPER, S5=SQ (repeat)
  const s1 = generateSession({ profile: freq5, block, weekDayOfWeek: 1, readinessScore: goodReadiness, sessionNumber: 1 });
  const s5 = generateSession({ profile: freq5, block, weekDayOfWeek: 5, readinessScore: goodReadiness, sessionNumber: 5 });

  it('S1 and S5 both target SQUAT', () => {
    expect(s1.primaryLift).toBe('SQUAT');
    expect(s5.primaryLift).toBe('SQUAT');
  });

  it('S5 (DUP volume day) prescribes more reps than S1 (intensity day)', () => {
    expect(s5.exercises[0].reps).toBeGreaterThan(s1.exercises[0].reps);
  });

  it('S5 (DUP volume day) prescribes lower RPE than S1', () => {
    expect(s5.exercises[0].rpeTarget).toBeLessThan(s1.exercises[0].rpeTarget);
  });

  it('S5 reps are exactly S1 reps + 1', () => {
    expect(s5.exercises[0].reps).toBe(s1.exercises[0].reps + 1);
  });

  it('S5 RPE is exactly S1 RPE − 0.5', () => {
    expect(s5.exercises[0].rpeTarget).toBeCloseTo(s1.exercises[0].rpeTarget - 0.5, 5);
  });

  // 6-day rotation: S3=DL, S6=DL (repeat)
  const s3 = generateSession({ profile: freq6, block, weekDayOfWeek: 3, readinessScore: goodReadiness, sessionNumber: 3 });
  const s6 = generateSession({ profile: freq6, block, weekDayOfWeek: 6, readinessScore: goodReadiness, sessionNumber: 6 });

  it('S3 and S6 both target DEADLIFT in 6-day rotation', () => {
    expect(s3.primaryLift).toBe('DEADLIFT');
    expect(s6.primaryLift).toBe('DEADLIFT');
  });

  it('S6 (DUP volume day) prescribes more reps than S3 (intensity day)', () => {
    expect(s6.exercises[0].reps).toBeGreaterThan(s3.exercises[0].reps);
  });

  it('S6 (DUP volume day) prescribes lower RPE than S3', () => {
    expect(s6.exercises[0].rpeTarget).toBeLessThan(s3.exercises[0].rpeTarget);
  });

  // Non-repeat sessions in 4-day rotation should NOT apply DUP
  it('S1 in 4-day rotation is NOT a DUP repeat (no rep bump)', () => {
    const freq4s1 = generateSession({ profile: baseProfile, block, weekDayOfWeek: 1, readinessScore: goodReadiness, sessionNumber: 1 });
    const freq4s5 = generateSession({ profile: baseProfile, block, weekDayOfWeek: 1, readinessScore: goodReadiness, sessionNumber: 5 }); // wraps: 5%4=1 → index 0 = S1 again
    expect(freq4s5.exercises[0].reps).toBe(freq4s1.exercises[0].reps);
    expect(freq4s5.exercises[0].rpeTarget).toBe(freq4s1.exercises[0].rpeTarget);
  });
});

// ── Reward System wiring ──────────────────────────────────────────────────────

describe('generateSession — rewardSystem', () => {
  // ── HIGH_VOLUME: +1 accessory set ──────────────────────────────────────────
  describe('HIGH_VOLUME', () => {
    const hvProfile = { ...baseProfile, rewardSystem: 'HIGH_VOLUME' as const };
    const block = makeBlock('ACCUMULATION');

    it('produces more accessory sets than CONSISTENCY', () => {
      const standard = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const highVol  = generateSession({ profile: hvProfile,   block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });

      const stdAccSets  = standard.exercises.filter(e => e.exerciseType === 'ACCESSORY').reduce((s, e) => s + e.sets, 0);
      const hvAccSets   = highVol.exercises.filter(e => e.exerciseType === 'ACCESSORY').reduce((s, e) => s + e.sets, 0);

      expect(hvAccSets).toBeGreaterThan(stdAccSets);
    });

    it('accessory set count is exactly 1 more per exercise', () => {
      const standard = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const highVol  = generateSession({ profile: hvProfile,   block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });

      const stdAcc = standard.exercises.filter(e => e.exerciseType === 'ACCESSORY');
      const hvAcc  = highVol.exercises.filter(e => e.exerciseType === 'ACCESSORY');

      expect(stdAcc.length).toBe(hvAcc.length); // same number of exercises
      for (let i = 0; i < stdAcc.length; i++) {
        expect(hvAcc[i].sets).toBe(stdAcc[i].sets + 1);
      }
    });
  });

  // ── HEAVY_SINGLES: top single in INTENSIFICATION ──────────────────────────
  describe('HEAVY_SINGLES', () => {
    const hsProfile = { ...baseProfile, rewardSystem: 'HEAVY_SINGLES' as const };
    const intBlock  = makeBlock('INTENSIFICATION');
    const accBlock  = makeBlock('ACCUMULATION');

    it('adds a top single in INTENSIFICATION', () => {
      const session = generateSession({ profile: hsProfile, block: intBlock, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const compExercises = session.exercises.filter(e => e.exerciseType === 'COMPETITION');
      // First comp exercise should be the top single (1 rep)
      expect(compExercises.length).toBeGreaterThanOrEqual(2);
      expect(compExercises[0].reps).toBe(1);
      expect(compExercises[0].sets).toBe(1);
    });

    it('does NOT add top single in ACCUMULATION', () => {
      const session = generateSession({ profile: hsProfile, block: accBlock, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const compExercises = session.exercises.filter(e => e.exerciseType === 'COMPETITION');
      // All comp exercises should have reps > 1 in accumulation
      expect(compExercises[0].reps).toBeGreaterThan(1);
    });

    it('CONSISTENCY profile has no top single in INTENSIFICATION', () => {
      const session = generateSession({ profile: baseProfile, block: intBlock, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const compExercises = session.exercises.filter(e => e.exerciseType === 'COMPETITION');
      expect(compExercises.length).toBe(1);
    });
  });

  // ── VARIETY: accessories rotate order by session number ────────────────────
  describe('VARIETY', () => {
    const varProfile = { ...baseProfile, rewardSystem: 'VARIETY' as const };
    const block = makeBlock('ACCUMULATION');

    it('changes accessory order between sessions with same lift', () => {
      // Use 3-day frequency: sessionNumber 1 and 4 both map to SQUAT
      const freq3Profile = { ...varProfile, weeklyFrequency: 3 };
      const s1 = generateSession({ profile: freq3Profile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const s4 = generateSession({ profile: freq3Profile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 4 });

      expect(s1.primaryLift).toBe('SQUAT');
      expect(s4.primaryLift).toBe('SQUAT');

      const acc1Names = s1.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      const acc4Names = s4.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);

      // Same exercises, different order
      expect([...acc1Names].sort()).toEqual([...acc4Names].sort());
      expect(acc1Names).not.toEqual(acc4Names);
    });

    it('CONSISTENCY keeps same order across sessions with same lift', () => {
      // Use 3-day frequency: sessionNumber 1 and 4 both map to SQUAT
      const freq3Profile = { ...baseProfile, weeklyFrequency: 3 };
      const s1 = generateSession({ profile: freq3Profile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const s4 = generateSession({ profile: freq3Profile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 4 });

      expect(s1.primaryLift).toBe('SQUAT');
      expect(s4.primaryLift).toBe('SQUAT');

      const acc1Names = s1.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      const acc4Names = s4.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);

      expect(acc1Names).toEqual(acc4Names);
    });
  });
});

// ── Progressive RPE Ramp Within Blocks ────────────────────────────────────────

describe('generateSession — progressive RPE ramp', () => {
  it('RPE increases across weeks within a 4-week accumulation block', () => {
    const block = makeBlock('ACCUMULATION', { weekStart: 1, weekEnd: 4 });

    const week1 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1, weekWithinBlock: 1,
    });
    const week4 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1, weekWithinBlock: 4,
    });

    const comp1 = week1.exercises.find(e => e.exerciseType === 'COMPETITION')!;
    const comp4 = week4.exercises.find(e => e.exerciseType === 'COMPETITION')!;

    // Week 4 should have higher RPE than week 1
    expect(comp4.rpeTarget).toBeGreaterThan(comp1.rpeTarget);
    // Load stays in the same neighbourhood — undulation trades a set for a rep
    // in late weeks so load isn't strictly monotonic, just within ~15%.
    const ratio = comp4.estimatedLoadKg / comp1.estimatedLoadKg;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.20);
  });

  it('RPE is flat (no ramp) during deload blocks', () => {
    const block = makeBlock('DELOAD', { weekStart: 1, weekEnd: 2 });

    const week1 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1, weekWithinBlock: 1,
    });
    const week2 = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1, weekWithinBlock: 2,
    });

    const comp1 = week1.exercises.find(e => e.exerciseType === 'COMPETITION')!;
    const comp2 = week2.exercises.find(e => e.exerciseType === 'COMPETITION')!;

    expect(comp1.rpeTarget).toBe(comp2.rpeTarget);
  });

  it('REALIZATION taper: meet week produces 1×1 opener rehearsal', () => {
    const block = makeBlock('REALIZATION', { weekStart: 1, weekEnd: 4 });

    const meetWeek = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1, weekWithinBlock: 4,
    });

    const comp = meetWeek.exercises.find(e => e.exerciseType === 'COMPETITION')!;
    expect(comp.sets).toBe(1);
    expect(comp.reps).toBe(1);
    expect(comp.notes).toContain('Opener rehearsal');
  });

  it('overshootHistory reduces RPE targets', () => {
    const block = makeBlock('ACCUMULATION');

    const normal = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1,
    });
    const overshooter = generateSession({
      profile: baseProfile, block, weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness, sessionNumber: 1,
      overshootHistory: 1.5,
    });

    const compNormal = normal.exercises.find(e => e.exerciseType === 'COMPETITION')!;
    const compOver   = overshooter.exercises.find(e => e.exerciseType === 'COMPETITION')!;

    expect(compOver.rpeTarget).toBeLessThan(compNormal.rpeTarget);
  });
});

// ── abbreviateSession ────────────────────────────────────────────────────────

describe('abbreviateSession', () => {
  const block = makeBlock('ACCUMULATION');

  function base() {
    return generateSession({
      profile: baseProfile,
      block,
      weekDayOfWeek: mondayDOW,
      readinessScore: goodReadiness,
      sessionNumber: 1,
    });
  }

  it('is a no-op when the session already fits the budget', () => {
    const session = base();
    const before = session.exercises.length;
    const out = abbreviateSession(session, { maxMinutes: 999 });
    expect(out.exercises.length).toBe(before);
    expect(out.modifications).toEqual(session.modifications);
  });

  it('drops accessories first when over budget', () => {
    const session = base();
    const out = abbreviateSession(session, { maxMinutes: 30 });

    // Comp lift must survive.
    const comp = out.exercises.find((e) => e.exerciseType === 'COMPETITION');
    expect(comp).toBeDefined();

    // Fewer accessories than the full session.
    const fullAccessories = session.exercises.filter((e) => e.exerciseType === 'ACCESSORY').length;
    const trimmedAccessories = out.exercises.filter((e) => e.exerciseType === 'ACCESSORY').length;
    expect(trimmedAccessories).toBeLessThan(fullAccessories);

    expect(out.modifications.some((m) => m.includes('Abbreviated'))).toBe(true);
  });

  it('preserves competition lifts even at very tight budgets', () => {
    const session = base();
    const out = abbreviateSession(session, { maxMinutes: 15 });
    const comp = out.exercises.find((e) => e.exerciseType === 'COMPETITION');
    expect(comp).toBeDefined();
  });

  it('estimated minutes shrinks after abbreviation', () => {
    const session = base();
    const before = estimateSessionMinutes(session.exercises);
    const out = abbreviateSession(session, { maxMinutes: 30 });
    const after = estimateSessionMinutes(out.exercises);
    expect(after).toBeLessThan(before);
  });
});
