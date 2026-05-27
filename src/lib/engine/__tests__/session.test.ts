import { describe, it, expect } from 'vitest';
import { generateSession, abbreviateSession, estimateSessionMinutes, resolveArcMode } from '../session';
import type { AthleteProfile, TrainingBlock, Injury } from '@/lib/db/types';

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
    HEALTH_BASE:     { volumeTarget: 0.85, intensityTarget: 0.70 },
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

describe('generateSession — discipline-aware accessory selection', () => {
  // The old hardcoded "cross-discipline overlay" (auto-adding Face Pulls
  // on bench, Weighted Pull-Ups on squat for street-lift athletes) was
  // replaced (commit 51e92ce) with a discipline-aware library selector.
  // Library exercises tagged with `disciplines: [STREET_LIFT, ...]` only
  // surface for athletes whose profile includes a matching discipline.
  // The pure-powerlifter session no longer auto-attaches calisthenics
  // movements; instead, the bench day picks a rear-delt accessory from
  // the PULL_H_REAR_DELT swap group (Rear Delt Fly or Face Pull),
  // rotated by session number.

  it('bench day includes a rear-delt / shoulder-health accessory', () => {
    const block = makeBlock('ACCUMULATION');
    const s = generateSession({
      profile: baseProfile, block, weekDayOfWeek: 1,
      readinessScore: 80, sessionNumber: 2,
    });
    // Either Face Pull or Rear Delt Fly satisfies the rear-delt slot.
    const hasRearDelt = s.exercises.some(
      (e) => e.name === 'Face Pull' || e.name === 'Rear Delt Fly',
    );
    expect(hasRearDelt).toBe(true);
  });

  it('street-lift discipline unlocks pull-up variants as accessory candidates', () => {
    // Pull-up variants (Weighted Pull-Up, Ring Pull-Up, etc.) are tagged
    // disciplines: [STREET_LIFT, CALISTHENICS, HYBRID]. A pure powerlifter
    // never sees them; an athlete with STREET_LIFT has one surface on a
    // deadlift day (the swap-group rotation picks among pull-up members).
    const p = { ...baseProfile, disciplines: ['POWERLIFTING', 'STREET_LIFT'] satisfies AthleteProfile['disciplines'] };
    const block = makeBlock('ACCUMULATION');
    const s = generateSession({
      profile: p, block, weekDayOfWeek: 4,
      readinessScore: 80, sessionNumber: 3, // deadlift day
    });
    const hasPullUpVariant = s.exercises.some((e) =>
      /pull-up|chin-up|muscle-up/i.test(e.name),
    );
    expect(hasPullUpVariant).toBe(true);
  });

  it('pure powerlifter never sees street-lift movements', () => {
    // Sanity check on the discipline gate: with no STREET_LIFT discipline,
    // pull-up / dip / muscle-up variants must never appear on any day.
    const block = makeBlock('ACCUMULATION');
    for (const sessionNumber of [1, 2, 3, 4]) {
      const s = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 1,
        readinessScore: 80, sessionNumber,
      });
      const hasStreetLift = s.exercises.some((e) =>
        /pull-up|chin-up|muscle-up|ring dip|bar dip/i.test(e.name),
      );
      expect(hasStreetLift).toBe(false);
    }
  });

  it('REALIZATION skips accessories entirely (comp focus)', () => {
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

  it('honors an explicit full-SBD day request with two secondary lifts', () => {
    // sbdToday is deprecated — full SBD rehearsals now require forceSBD: true.
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
      forceSBD: true,
    });
    expect(out.secondaryLifts?.length ?? 0).toBe(2);
    expect(out.exercises.filter((e) => e.exerciseType === 'COMPETITION').length)
      .toBeGreaterThanOrEqual(3);
  });

  // The old generator's "stay single-lift at low readiness" heuristic is
  // gone with the Sheiko multi-lift methodology — every comp-lift session
  // now pairs with a BENCH (or SQ/DL) secondary by default. Single-lift
  // sessions only happen via REALIZATION/DELOAD (handled in their own
  // describe blocks). Test deleted; original intent ("low readiness should
  // not surface a second comp lift") is no longer applicable.

  describe('preferredSecondary override', () => {
    const block = makeBlock('ACCUMULATION');
    const exposures = [
      { lift: 'SQUAT' as const,    daysSince: 2, weekCount: 1 },
      { lift: 'BENCH' as const,    daysSince: 5, weekCount: 0 },
      { lift: 'DEADLIFT' as const, daysSince: 6, weekCount: 0 },
    ];

    it("'NONE' produces no secondary comp lift on a bench-primary session", () => {
      const out = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 2, readinessScore: 80,
        sessionNumber: 2, recentLiftExposures: exposures,
        forcePrimary: 'BENCH', preferredSecondary: 'NONE',
      });
      expect(out.primaryLift).toBe('BENCH');
      expect(out.secondaryLifts ?? []).toEqual([]);
    });

    it("'NONE' also strips the auto-paired BENCH off a squat or deadlift primary", () => {
      const sq = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 1, readinessScore: 80,
        sessionNumber: 1, forcePrimary: 'SQUAT', preferredSecondary: 'NONE',
      });
      expect(sq.secondaryLifts ?? []).toEqual([]);
      const dl = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 4, readinessScore: 80,
        sessionNumber: 3, forcePrimary: 'DEADLIFT', preferredSecondary: 'NONE',
      });
      expect(dl.secondaryLifts ?? []).toEqual([]);
    });

    it("'AUTO' / undefined keeps the legacy auto-pick behaviour", () => {
      const out = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 2, readinessScore: 80,
        sessionNumber: 2, recentLiftExposures: exposures,
        forcePrimary: 'BENCH', preferredSecondary: 'AUTO',
      });
      expect((out.secondaryLifts ?? []).length).toBe(1);
    });

    it('pinning a specific lift overrides the auto pick', () => {
      const out = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 2, readinessScore: 80,
        sessionNumber: 2, recentLiftExposures: exposures,
        forcePrimary: 'BENCH', preferredSecondary: 'SQUAT',
      });
      expect(out.secondaryLifts).toEqual(['SQUAT']);
    });

    it('pinning the same lift as primary falls through to the auto pick', () => {
      const out = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 2, readinessScore: 80,
        sessionNumber: 2, recentLiftExposures: exposures,
        forcePrimary: 'BENCH', preferredSecondary: 'BENCH',
      });
      expect((out.secondaryLifts ?? []).length).toBe(1);
      expect(out.secondaryLifts?.[0]).not.toBe('BENCH');
    });

    it('forceSBD wins over preferredSecondary=NONE', () => {
      const out = generateSession({
        profile: baseProfile, block, weekDayOfWeek: 6, readinessScore: 80,
        sessionNumber: 1, recentLiftExposures: exposures,
        forceSBD: true, preferredSecondary: 'NONE',
      });
      expect((out.secondaryLifts ?? []).length).toBe(2);
    });
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

  it('high readiness has no readiness/RPE modifications', () => {
    // Multi-lift sessions auto-add an informational "Session includes …
    // primary + … secondary" mod that is structural, not a readiness
    // adjustment. Assert no readiness/volume/RPE-driven mods are present.
    const s = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: 95, sessionNumber: 1 });
    const adjustmentMods = s.modifications.filter((m) =>
      /volume reduced|rpe targets reduced|rpe reduced/i.test(m),
    );
    expect(adjustmentMods).toHaveLength(0);
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

  it('session includes a Bench Press competition exercise', () => {
    // Multi-lift sessions place exercises in S→B→D order. With BENCH primary
    // and SQUAT secondary, the squat appears first; the bench is later.
    const benchExercise = s.exercises.find(
      (e) => e.exerciseType === 'COMPETITION' && /bench/i.test(e.name),
    );
    expect(benchExercise).toBeDefined();
  });

  it('bench is the heavier-volume competition exercise (primary block)', () => {
    // The primary lift gets the full block-volume comp block; the secondary
    // gets only 3 working sets. Assert bench has at least as many sets as
    // any other competition exercise.
    const compExercises = s.exercises.filter((e) => e.exerciseType === 'COMPETITION');
    const bench = compExercises.find((e) => /bench/i.test(e.name))!;
    for (const c of compExercises) {
      expect(bench.sets).toBeGreaterThanOrEqual(c.sets);
    }
  });

  it('accessories are upper-body (no RDL or Leg Press)', () => {
    // Filter to ACCESSORY only — secondary comp lifts (e.g. Squat) are
    // COMPETITION type and shouldn't count.
    const accNames = s.exercises
      .filter((e) => e.exerciseType === 'ACCESSORY')
      .map((e) => e.name.toLowerCase());
    expect(accNames.some((n) => n.includes('rdl') || n.includes('romanian') || n.includes('leg press'))).toBe(false);
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

  it('session includes a Deadlift competition exercise', () => {
    // Multi-lift sessions place exercises in S→B→D order. With DEADLIFT
    // primary and BENCH secondary, bench appears first; deadlift is later.
    const dlExercise = s.exercises.find(
      (e) => e.exerciseType === 'COMPETITION' && /deadlift/i.test(e.name),
    );
    expect(dlExercise).toBeDefined();
  });

  it('deadlift is the heavier-volume competition exercise (primary block)', () => {
    const compExercises = s.exercises.filter((e) => e.exerciseType === 'COMPETITION');
    const dl = compExercises.find((e) => /deadlift/i.test(e.name))!;
    for (const c of compExercises) {
      expect(dl.sets).toBeGreaterThanOrEqual(c.sets);
    }
  });

  it('accessories include a pull movement (lat pulldowns or rows)', () => {
    const names = s.exercises.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('pulldown') || n.includes('row'))).toBe(true);
  });
});

describe('generateSession — squat day posterior-chain emphasis', () => {
  const s = generateSession({
    profile: baseProfile,
    block: makeBlock('ACCUMULATION'),
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness,
    sessionNumber: 1,
  });

  // Old intent: "squat day must include a row/pulldown for back balance".
  // New intent (Sheiko multi-lift methodology): squat day pairs with a BENCH
  // secondary which provides the upper-body work; squat-day accessories
  // target the squat pattern (single leg, posterior chain hinge, hamstring
  // isolation). Cross-pattern pulling work belongs on the bench-primary day
  // and the deadlift-primary day, not squat day.
  it('accessories include posterior-chain hinge or hamstring work', () => {
    const accNames = s.exercises
      .filter((e) => e.exerciseType === 'ACCESSORY')
      .map((e) => e.name.toLowerCase());
    expect(
      accNames.some((n) =>
        /good morning|romanian|rdl|glute ham|leg curl|hip thrust|glute bridge/.test(n),
      ),
    ).toBe(true);
  });

  it('has 5 or more exercises total (comp + variation + accessories + bench secondary)', () => {
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

  it('accessories include some upper-body work', () => {
    // The library-driven selector picks accessories by SFR + pattern caps,
    // not by hand-curated lists. UPPER day's accessory budget goes mostly
    // to push patterns, with occasional pulling/isolation rotations through
    // swap groups. Assert at least one upper-body accessory is present;
    // the specific exercise rotates by session number.
    const accNames = s.exercises
      .filter((e) => e.exerciseType === 'ACCESSORY')
      .map((e) => e.name.toLowerCase());
    expect(
      accNames.some((n) =>
        /row|pulldown|push press|tricep|fly|lateral|press|delt/.test(n),
      ),
    ).toBe(true);
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

  // The library-driven accessory selector picks exercises by SFR + pattern
  // caps + swap-group rotation, not from a hand-curated "RDL on squat day,
  // Lat Pulldown on DL day" list. Squat day surfaces Good Morning (HINGE
  // posterior-chain accessory targeting SQUAT); DL day surfaces a row from
  // the PULL_H_ROW group (Barbell Row in this profile). The intent these
  // tests originally protected — "accessory loads track readiness, are in
  // a sensible range" — is preserved against the new exercise picks.

  const goodSession = generateSession({
    profile: baseProfile,
    block,
    weekDayOfWeek: mondayDOW,
    readinessScore: goodReadiness, // 85
    sessionNumber: 1, // squat day
  });

  const lowSession = generateSession({
    profile: baseProfile,
    block,
    weekDayOfWeek: mondayDOW,
    readinessScore: lowReadiness, // 45
    sessionNumber: 1,
  });

  // Pick the posterior-chain hinge accessory on squat day. The selector
  // currently lands on Good Morning (primaryLiftTarget=SQUAT, HINGE pattern).
  const goodHinge = goodSession.exercises.find(
    (e) => e.exerciseType === 'ACCESSORY' && /good morning|romanian|rdl/i.test(e.name),
  );
  const lowHinge  = lowSession.exercises.find(
    (e) => e.exerciseType === 'ACCESSORY' && /good morning|romanian|rdl/i.test(e.name),
  );

  it('a posterior-chain hinge accessory is present on squat day', () => {
    expect(goodHinge).toBeDefined();
  });

  it('hinge accessory load decreases when readiness is low', () => {
    expect(lowHinge!.estimatedLoadKg).toBeLessThan(goodHinge!.estimatedLoadKg);
  });

  it('hinge accessory load at good readiness is in a plausible range', () => {
    // Good Morning anchor: 0.35 × 180 (squat max) ≈ 63 kg target → after
    // prescribeLoad at RPE 7.5 × 10 reps, ~40-60 kg. Allow a wide envelope
    // because the picker may rotate between Good Morning / RDL / etc.
    expect(goodHinge!.estimatedLoadKg).toBeGreaterThan(20);
    expect(goodHinge!.estimatedLoadKg).toBeLessThan(180);
  });

  // Deadlift day S3: pulling accessory present (Barbell Row in current pick).
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

  const goodPull = dlGoodSession.exercises.find(
    (e) => e.exerciseType === 'ACCESSORY' && /row|pulldown|pull-up/i.test(e.name),
  );
  const lowPull  = dlLowSession.exercises.find(
    (e) => e.exerciseType === 'ACCESSORY' && /row|pulldown|pull-up/i.test(e.name),
  );

  it('a pulling accessory (row or pulldown) is present on deadlift day', () => {
    expect(goodPull).toBeDefined();
  });

  it('pulling accessory load decreases when readiness is low', () => {
    expect(lowPull!.estimatedLoadKg).toBeLessThan(goodPull!.estimatedLoadKg);
  });

  it('pulling accessory load at good readiness is in a plausible range', () => {
    // Barbell Row anchor: 0.95 × 120 (bench max) → ~70-90 kg working load.
    // Lat Pulldown anchor: 0.45 × 210 (DL max) → ~55-75 kg.
    // Allow a generous envelope because the picker rotates the row variant.
    expect(goodPull!.estimatedLoadKg).toBeGreaterThan(30);
    expect(goodPull!.estimatedLoadKg).toBeLessThan(140);
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

  // Multi-lift sessions place exercises in S→B→D order, so on a DEADLIFT-
  // primary day the BENCH secondary appears first. Pull out the actual
  // deadlift competition exercise instead of relying on exercises[0].
  const s3Dl = s3.exercises.find(
    (e) => e.exerciseType === 'COMPETITION' && /deadlift/i.test(e.name),
  )!;
  const s6Dl = s6.exercises.find(
    (e) => e.exerciseType === 'COMPETITION' && /deadlift/i.test(e.name),
  )!;

  it('S3 and S6 both target DEADLIFT in 6-day rotation', () => {
    expect(s3.primaryLift).toBe('DEADLIFT');
    expect(s6.primaryLift).toBe('DEADLIFT');
  });

  it('S6 (DUP volume day) prescribes more reps than S3 (intensity day)', () => {
    expect(s6Dl.reps).toBeGreaterThan(s3Dl.reps);
  });

  it('S6 (DUP volume day) prescribes lower RPE than S3', () => {
    expect(s6Dl.rpeTarget).toBeLessThan(s3Dl.rpeTarget);
  });

  // Non-repeat sessions in 4-day rotation should NOT apply DUP
  it('S1 in 4-day rotation is NOT a DUP repeat (no rep bump)', () => {
    const freq4s1 = generateSession({ profile: baseProfile, block, weekDayOfWeek: 1, readinessScore: goodReadiness, sessionNumber: 1 });
    const freq4s5 = generateSession({ profile: baseProfile, block, weekDayOfWeek: 1, readinessScore: goodReadiness, sessionNumber: 5 }); // wraps: 5%4=1 → index 0 = S1 again
    expect(freq4s5.exercises[0].reps).toBe(freq4s1.exercises[0].reps);
    expect(freq4s5.exercises[0].rpeTarget).toBe(freq4s1.exercises[0].rpeTarget);
  });
});

// ── Multi-frequency role per appearance (recentLiftExposures-driven) ─────────

describe('generateSession — multi-frequency appearance roles', () => {
  const block = makeBlock('ACCUMULATION');

  // Baseline: SQUAT primary, no exposures (= PRIMARY appearance)
  const primary = generateSession({
    profile: baseProfile, block,
    weekDayOfWeek: 1,
    readinessScore: goodReadiness,
    sessionNumber: 1,
    forcePrimary: 'SQUAT',
  });

  // Exposures showing this is the SECONDARY appearance (1 prior squat day)
  const secondary = generateSession({
    profile: baseProfile, block,
    weekDayOfWeek: 4,
    readinessScore: goodReadiness,
    sessionNumber: 4,
    forcePrimary: 'SQUAT',
    recentLiftExposures: [
      { lift: 'SQUAT',    daysSince: 3, weekCount: 1 },
      { lift: 'BENCH',    daysSince: 1, weekCount: 1 },
      { lift: 'DEADLIFT', daysSince: 2, weekCount: 1 },
    ],
  });

  // Exposures showing this is the TERTIARY appearance (2 prior squat days)
  const tertiary = generateSession({
    profile: baseProfile, block,
    weekDayOfWeek: 6,
    readinessScore: goodReadiness,
    sessionNumber: 6,
    forcePrimary: 'SQUAT',
    recentLiftExposures: [
      { lift: 'SQUAT',    daysSince: 1, weekCount: 2 },
      { lift: 'BENCH',    daysSince: 1, weekCount: 1 },
      { lift: 'DEADLIFT', daysSince: 2, weekCount: 1 },
    ],
  });

  it('SECONDARY appearance prescribes -0.5 RPE vs PRIMARY (Stanek / DUP convention)', () => {
    expect(secondary.exercises[0].rpeTarget).toBeCloseTo(primary.exercises[0].rpeTarget - 0.5, 5);
  });

  it('TERTIARY appearance keeps RPE at -0.5 vs PRIMARY (matches Calgary 4× bench / Sheiko)', () => {
    // Engine differentiates TERTIARY by VOLUME cut + skip top single, not by
    // a deeper RPE drop. Calgary Barbell keeps top sets at 76-82% across the
    // week's bench days; Sheiko keeps all 3 bench days submaximal at uniform
    // intensity. A reflexive -1.0 RPE drop here would be unsupported.
    expect(tertiary.exercises[0].rpeTarget).toBeCloseTo(primary.exercises[0].rpeTarget - 0.5, 5);
  });

  it('TERTIARY appearance caps comp sets at 3 (volume cut, not intensity cut)', () => {
    expect(tertiary.exercises[0].sets).toBeLessThanOrEqual(3);
  });

  it('TERTIARY appearance has NO heavier top single in INTENSIFICATION + HEAVY_SINGLES', () => {
    const intBlock = makeBlock('INTENSIFICATION');
    const hsProfile = { ...baseProfile, rewardSystem: 'HEAVY_SINGLES' as const };
    const tertiaryHS = generateSession({
      profile: hsProfile, block: intBlock,
      weekDayOfWeek: 6,
      readinessScore: goodReadiness,
      sessionNumber: 6,
      forcePrimary: 'SQUAT',
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 1, weekCount: 2 },
        { lift: 'BENCH',    daysSince: 1, weekCount: 1 },
        { lift: 'DEADLIFT', daysSince: 2, weekCount: 1 },
      ],
    });
    // No COMPETITION exercise prescribed at 1 set × 1 rep (the top-single shape).
    const topSingle = tertiaryHS.exercises.find(
      (e) => e.exerciseType === 'COMPETITION' && e.sets === 1 && e.reps === 1,
    );
    expect(topSingle).toBeUndefined();
  });

  it('QUATERNARY appearance prescribes -1.0 RPE vs PRIMARY and caps sets at 2', () => {
    // The -1.0 drop here is the engine producing a low-cost shape that's
    // safe whether the LLM elects Westside-style speed work (RPE 5-6 by
    // intent) or a skill-accessory day (RPE 6-7). The intent-specific RPE
    // gets dialled in by the LLM author; the engine just stays conservative.
    const quaternary = generateSession({
      profile: baseProfile, block,
      weekDayOfWeek: 7,
      readinessScore: goodReadiness,
      sessionNumber: 7,
      forcePrimary: 'BENCH',
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 1, weekCount: 1 },
        { lift: 'BENCH',    daysSince: 1, weekCount: 3 },
        { lift: 'DEADLIFT', daysSince: 2, weekCount: 1 },
      ],
    });
    const benchPrimary = generateSession({
      profile: baseProfile, block,
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      forcePrimary: 'BENCH',
    });
    expect(quaternary.exercises[0].rpeTarget).toBeCloseTo(benchPrimary.exercises[0].rpeTarget - 1.0, 5);
    expect(quaternary.exercises[0].sets).toBeLessThanOrEqual(2);
  });
});

// ── Secondary-appearance tracking (fatigue awareness) ────────────────────────

describe('lift-exposures — secondary appearance tracking', () => {
  // The scenario: bench-as-secondary yesterday + bench-primary today.
  // weekCount alone misses this — secondaryCount + daysSinceAny capture it.

  it('formatExposureLines surfaces secondary count when > 0', async () => {
    const { formatExposureLines } = await import('../lift-exposures');
    const lines = formatExposureLines([
      { lift: 'BENCH', daysSince: 5, weekCount: 1, daysSinceAny: 1, secondaryCount: 1 },
      { lift: 'SQUAT', daysSince: 3, weekCount: 1, daysSinceAny: 3, secondaryCount: 0 },
      { lift: 'DEADLIFT', daysSince: 2, weekCount: 1 }, // legacy: optional fields default
    ]);
    // Mixed primary + secondary: shows both counts and "since last (primary X ago)"
    expect(lines[0]).toContain('1d since last');
    expect(lines[0]).toContain('primary 5d ago');
    expect(lines[0]).toContain('1× primary + 1× secondary this week');
    // Pure primary: simpler "since primary" form
    expect(lines[1]).toContain('3d since primary');
    expect(lines[1]).toContain('1× this week');
    expect(lines[1]).not.toContain('secondary');
    // Legacy / fallback: still works without new fields
    expect(lines[2]).toContain('2d since primary');
  });

  it('recencyTagFor uses daysSinceAny so secondary yesterday → not FRESH-blocked', async () => {
    const { recencyTagFor } = await import('../lift-exposures');
    // weekCount=0, primary 5d ago, but secondary YESTERDAY → not OVERDUE; FRESH
    expect(recencyTagFor({
      lift: 'BENCH', daysSince: 5, weekCount: 0, daysSinceAny: 1, secondaryCount: 1,
    })).toBe('FRESH');
    // weekCount=1, primary today → still FRESH regardless of secondary
    expect(recencyTagFor({
      lift: 'BENCH', daysSince: 0, weekCount: 1, daysSinceAny: 0, secondaryCount: 0,
    })).toBe('FRESH');
    // No secondary signal → behaves as before (legacy fallback)
    expect(recencyTagFor({
      lift: 'BENCH', daysSince: 6, weekCount: 0,
    })).toBe('OVERDUE');
  });

  it('recencyTagFor flags STACKED when total weekly exposure ≥ 4 (primary + secondary)', async () => {
    const { recencyTagFor } = await import('../lift-exposures');
    // 2 primary + 2 secondary = 4 total → STACKED
    expect(recencyTagFor({
      lift: 'BENCH', daysSince: 1, weekCount: 2, daysSinceAny: 0, secondaryCount: 2,
    })).toBe('STACKED');
    // 2 primary + 1 secondary = 3 total → NOT yet STACKED (only primary count gates the lower threshold)
    expect(recencyTagFor({
      lift: 'BENCH', daysSince: 1, weekCount: 2, daysSinceAny: 1, secondaryCount: 1,
    })).not.toBe('STACKED');
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

    it('HIGH_VOLUME adds +1 set per accessory (same slot count)', () => {
      // HIGH_VOLUME bumps each accessory's set count by 1. Slot count is
      // left for the AI session advisor to shape via principle — so the
      // accessory roster matches CONSISTENCY exactly, with 1 extra set each.
      const standard = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const highVol  = generateSession({ profile: hvProfile,   block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });

      const stdAcc = standard.exercises.filter(e => e.exerciseType === 'ACCESSORY');
      const hvAcc  = highVol.exercises.filter(e => e.exerciseType === 'ACCESSORY');

      expect(hvAcc.length).toBe(stdAcc.length);
      for (let i = 0; i < hvAcc.length; i++) {
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
      // Multi-lift sessions add a BENCH secondary (3 working sets) on a
      // SQUAT-primary day — so CONSISTENCY has 2 COMPETITION exercises by
      // default. Assert that none of them is a 1×1 top single (the marker
      // of the HEAVY_SINGLES reward path).
      const session = generateSession({ profile: baseProfile, block: intBlock, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const compExercises = session.exercises.filter(e => e.exerciseType === 'COMPETITION');
      const hasTopSingle = compExercises.some((e) => e.sets === 1 && e.reps === 1);
      expect(hasTopSingle).toBe(false);
    });
  });

  // ── VARIETY / CONSISTENCY: behavior is identical under the new selector ────
  describe('VARIETY / CONSISTENCY', () => {
    // The library-driven accessory selector rotates swap-group members by
    // sessionNumber for ALL profiles — the rewardSystem param is read only
    // to bump targetCount for HIGH_VOLUME. The old "VARIETY reorders the
    // same accessories, CONSISTENCY locks them" semantics no longer apply;
    // both rewards now share the same session-number rotation. Tests below
    // document the actual behavior.
    const varProfile = { ...baseProfile, rewardSystem: 'VARIETY' as const };
    const block = makeBlock('ACCUMULATION');

    it('VARIETY and CONSISTENCY produce the same accessory pool', () => {
      // Both reward systems run through the same selection path — only
      // HIGH_VOLUME differs (+1 set per accessory). VARIETY === CONSISTENCY here.
      const sCons = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const sVar  = generateSession({ profile: varProfile,  block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });

      const consNames = sCons.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      const varNames  = sVar .exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      expect(varNames).toEqual(consNames);
    });

    it('repeating the same session number deterministically picks the same accessories', () => {
      // The selector is pure — same input → same picks. Re-running session 1
      // produces the identical accessory list.
      const a = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const b = generateSession({ profile: baseProfile, block, weekDayOfWeek: mondayDOW, readinessScore: goodReadiness, sessionNumber: 1 });
      const aNames = a.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      const bNames = b.exercises.filter(e => e.exerciseType === 'ACCESSORY').map(e => e.name);
      expect(aNames).toEqual(bNames);
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

// ── Arc-aware primary-lift selection ──────────────────────────────────────────

describe('resolveArcMode', () => {
  it('returns BARBELL when priorities are omitted', () => {
    expect(resolveArcMode(undefined)).toBe('BARBELL');
    expect(resolveArcMode([])).toBe('BARBELL');
  });

  it('returns BARBELL when COMPETITION is in the top 3 priorities', () => {
    expect(resolveArcMode(['COMPETITION', 'STRENGTH_BARBELL'])).toBe('BARBELL');
    expect(resolveArcMode(['MOBILITY', 'STRENGTH_CALISTHENICS', 'COMPETITION'])).toBe('BARBELL');
  });

  it('returns CALISTHENICS when STRENGTH_CALISTHENICS outranks STRENGTH_BARBELL', () => {
    expect(resolveArcMode(['STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL', 'MOBILITY']))
      .toBe('CALISTHENICS');
    expect(resolveArcMode(['MOBILITY', 'STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL']))
      .toBe('CALISTHENICS');
  });

  it('returns BARBELL when STRENGTH_BARBELL outranks STRENGTH_CALISTHENICS', () => {
    expect(resolveArcMode(['STRENGTH_BARBELL', 'STRENGTH_CALISTHENICS']))
      .toBe('BARBELL');
  });

  it('returns REHAB when INJURY_HEALING/MOBILITY is dominant and no strength priority', () => {
    expect(resolveArcMode(['INJURY_HEALING', 'MOBILITY'])).toBe('REHAB');
    expect(resolveArcMode(['MOBILITY', 'STRESS_REDUCTION'])).toBe('REHAB');
  });
});

describe('generateSession — arc-aware primary lift', () => {
  it('CALISTHENICS arc routes UPPER → Weighted Pull-Up as primary', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,            // odd → UPPER per selectArcPrimary
      arcPriorities: ['STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL', 'MOBILITY'],
    });

    expect(result.primaryLift).toBe('UPPER');
    const comp = result.exercises.find((e) => e.exerciseType === 'COMPETITION');
    expect(comp?.name).toBe('Weighted Pull-Up');
    expect(comp?.libraryExerciseId).toBe('weighted_pull_up');
    // No SBD secondaries should be appended on a cali day.
    expect(result.secondaryLifts ?? []).toEqual([]);
  });

  it('CALISTHENICS arc routes LOWER → Pistol Squat as primary', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 2,
      readinessScore: goodReadiness,
      sessionNumber: 2,            // even → LOWER per selectArcPrimary
      arcPriorities: ['STRENGTH_CALISTHENICS', 'MOBILITY'],
    });

    expect(result.primaryLift).toBe('LOWER');
    const comp = result.exercises.find((e) => e.exerciseType === 'COMPETITION');
    expect(comp?.name).toBe('Pistol Squat');
    expect(comp?.libraryExerciseId).toBe('pistol_squat');
  });

  it('BARBELL arc (default) keeps the SBD rotation', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      // no arcPriorities → legacy default
    });
    expect(['SQUAT', 'BENCH', 'DEADLIFT'] as const).toContain(result.primaryLift);
  });

  it('REHAB arc still produces a session even when accessories are sparse', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY'],
    });
    expect(['UPPER', 'LOWER', 'FULL'] as const).toContain(result.primaryLift);
    expect(result.exercises.length).toBeGreaterThan(0);
  });
});

describe('generateSession — forcePrimary on non-BARBELL arc', () => {
  // Regression for the "I picked Get Healthy but check-in still gave me bench"
  // bug: forcePrimary=BENCH was overriding the cali rotation. Cali / rehab
  // arcs now ignore SBD forcePrimary and surface a modification note.
  it('CALISTHENICS arc rejects forcePrimary=BENCH and rotates UPPER/LOWER', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY', 'STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL'],
      forcePrimary: 'BENCH',
    });
    expect(result.primaryLift).not.toBe('BENCH');
    expect(['UPPER', 'LOWER', 'FULL'] as const).toContain(result.primaryLift);
    expect(result.secondaryLifts ?? []).toEqual([]);
    expect(result.modifications.some((m) => m.toLowerCase().includes('ignored'))).toBe(true);
  });

  it('REHAB arc rejects forcePrimary=SQUAT and rotates UPPER/LOWER', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 2,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY'],
      forcePrimary: 'SQUAT',
    });
    expect(result.primaryLift).not.toBe('SQUAT');
    expect(['UPPER', 'LOWER', 'FULL'] as const).toContain(result.primaryLift);
  });

  it('BARBELL arc still honors forcePrimary=BENCH', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      arcPriorities: ['STRENGTH_BARBELL'],
      forcePrimary: 'BENCH',
    });
    expect(result.primaryLift).toBe('BENCH');
    expect(result.modifications.some((m) => m.toLowerCase().includes('ignored'))).toBe(false);
  });

  it('Non-SBD forcePrimary (UPPER) is honored on a CALISTHENICS arc', () => {
    // Athlete on cali arc explicitly pinning UPPER should still work — the
    // reroute only fires for SBD picks that conflict with the arc.
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 2,    // would default to LOWER without forcePrimary
      arcPriorities: ['STRENGTH_CALISTHENICS', 'MOBILITY'],
      forcePrimary: 'UPPER',
    });
    expect(result.primaryLift).toBe('UPPER');
  });
});

describe('generateSession — injury vetoes primary lift', () => {
  function makeInjury(overrides: Partial<Injury>): Injury {
    return {
      id: 'inj-1',
      label: 'Test injury',
      regions: ['LEFT_KNEE'],
      status: 'MANAGING',
      severity: 3,
      onsetDate: '2024-01-01',
      contraindicatedPatterns: [],
      contraindicatedSwapGroups: [],
      preferredPatterns: [],
      constraints: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('SQUAT-contraindicated injury demotes the SBD primary away from SQUAT', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,            // would normally rotate to SQUAT
      activeInjuries: [makeInjury({ contraindicatedPatterns: ['SQUAT'] })],
    });
    expect(result.primaryLift).not.toBe('SQUAT');
  });

  it('VERTICAL_PULL-contraindicated injury demotes UPPER on a CALISTHENICS arc', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,            // odd → would pick UPPER
      arcPriorities: ['STRENGTH_CALISTHENICS', 'MOBILITY'],
      activeInjuries: [
        makeInjury({
          regions: ['LEFT_SHOULDER'],
          contraindicatedPatterns: ['VERTICAL_PULL'],
        }),
      ],
    });
    // UPPER (pull-up) is blocked; selector should fall through to LOWER/FULL.
    expect(result.primaryLift).not.toBe('UPPER');
  });

  it('adaptive scorer demotes SQUAT when a SQUAT-pattern injury is active', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      // Force the adaptive path by supplying exposures.
      recentLiftExposures: [
        { lift: 'SQUAT',    daysSince: 12, weekCount: 0 },
        { lift: 'BENCH',    daysSince: 2,  weekCount: 1 },
        { lift: 'DEADLIFT', daysSince: 2,  weekCount: 1 },
      ],
      activeInjuries: [makeInjury({ contraindicatedPatterns: ['SQUAT'] })],
    });
    // Despite SQUAT having the highest dueness, the injury must veto it.
    expect(result.primaryLift).not.toBe('SQUAT');
  });
});

describe('generateSession — arc-aware length cap', () => {
  function makeInjury(overrides: Partial<Injury>): Injury {
    return {
      id: 'inj-cap',
      label: 'Cap test injury',
      regions: ['LEFT_SHOULDER'],
      status: 'MANAGING',
      severity: 4,                 // sev ≥ 3 → 2 remedies allocated
      onsetDate: '2024-01-01',
      contraindicatedPatterns: [],
      contraindicatedSwapGroups: [],
      preferredPatterns: [],
      constraints: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('caps a BARBELL session at 8 exercises when prep would push it past', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      activeInjuries: [
        makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'], severity: 4 }),
        makeInjury({ id: 'b', regions: ['LEFT_KNEE'],     severity: 4 }),
      ],
    });
    expect(result.exercises.length).toBeLessThanOrEqual(8);
  });

  it('caps a REHAB arc session more aggressively (6 exercises)', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('HEALTH_BASE'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY'],
      activeInjuries: [
        makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'], severity: 4 }),
        makeInjury({ id: 'b', regions: ['LEFT_KNEE'],     severity: 4 }),
      ],
    });
    expect(result.exercises.length).toBeLessThanOrEqual(6);
  });

  it('trim only drops accessories — competition and remedial prep are protected', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      activeInjuries: [
        makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'], severity: 4 }),
        makeInjury({ id: 'b', regions: ['LEFT_KNEE'],     severity: 4 }),
      ],
    });
    // Comp lift survives no matter what.
    expect(result.exercises.some((e) => e.exerciseType === 'COMPETITION')).toBe(true);
    // Rehab prep survives — at least one row has the "Rehab" notes prefix.
    expect(result.exercises.some((e) => /^rehab/i.test(e.notes ?? ''))).toBe(true);
  });

  it('annotates modifications when a trim happens', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('ACCUMULATION'),
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY'],
      activeInjuries: [
        makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'], severity: 4 }),
        makeInjury({ id: 'b', regions: ['LEFT_KNEE'],     severity: 4 }),
        makeInjury({ id: 'c', regions: ['L_SPINE'],       severity: 3 }),
      ],
    });
    expect(result.modifications.some((m) => /trimmed/i.test(m))).toBe(true);
  });

  it('no cap message when the session is already under the ceiling', () => {
    const result = generateSession({
      profile: baseProfile,
      block: makeBlock('DELOAD'),  // smaller accessory budget
      weekDayOfWeek: 1,
      readinessScore: goodReadiness,
      sessionNumber: 1,
    });
    expect(result.modifications.every((m) => !/trimmed/i.test(m))).toBe(true);
  });
});
