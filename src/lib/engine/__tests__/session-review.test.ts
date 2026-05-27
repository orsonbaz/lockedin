import { describe, it, expect } from 'vitest';
import { reviewSessionPure } from '../session-review';
import type { GeneratedSession, LiftExposure } from '../session';
import type { AthleteProfile, TrainingBlock } from '@/lib/db/types';

const profile: AthleteProfile = {
  id: 'me',
  name: 'Test',
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

const block: TrainingBlock = {
  id: 'b',
  cycleId: 'c',
  blockType: 'ACCUMULATION',
  weekStart: 1,
  weekEnd: 4,
  volumeTarget: 1.0,
  intensityTarget: 0.75,
};

const squatSession: GeneratedSession = {
  sessionType: 'ACCUMULATION',
  primaryLift: 'SQUAT',
  exercises: [
    {
      name: 'Competition Back Squat',
      exerciseType: 'COMPETITION',
      setStructure: 'STRAIGHT',
      sets: 5, reps: 5, rpeTarget: 7, estimatedLoadKg: 140, order: 1,
    },
  ],
  modifications: [],
  coachNote: '',
};

const benchSession: GeneratedSession = {
  sessionType: 'ACCUMULATION',
  primaryLift: 'BENCH',
  exercises: [
    {
      name: 'Competition Bench Press',
      exerciseType: 'COMPETITION',
      setStructure: 'STRAIGHT',
      sets: 4, reps: 5, rpeTarget: 7, estimatedLoadKg: 90, order: 1,
    },
    {
      name: 'Face Pull',
      exerciseType: 'ACCESSORY',
      setStructure: 'STRAIGHT',
      sets: 3, reps: 15, rpeTarget: 7, estimatedLoadKg: 15, order: 2,
    },
  ],
  modifications: [],
  coachNote: '',
};

describe('session-review — bench drought', () => {
  it('BLOCKs a squat day when bench has been absent for 6 days', () => {
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 1, weekCount: 2 },
      { lift: 'BENCH',    daysSince: 6, weekCount: 0 },
      { lift: 'DEADLIFT', daysSince: 3, weekCount: 1 },
    ];
    const result = reviewSessionPure({
      session: squatSession, profile, block, exposures, weekDayOfWeek: 3,
    });
    const benchDrought = result.issues.find((i) => i.code === 'BENCH_DROUGHT');
    expect(benchDrought).toBeDefined();
    expect(benchDrought!.severity).toBe('BLOCK');
  });

  it('does not flag when bench was yesterday', () => {
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 2, weekCount: 1 },
      { lift: 'BENCH',    daysSince: 1, weekCount: 2 },
      { lift: 'DEADLIFT', daysSince: 4, weekCount: 1 },
    ];
    const result = reviewSessionPure({
      session: squatSession, profile, block, exposures, weekDayOfWeek: 3,
    });
    expect(result.issues.find((i) => i.code === 'BENCH_DROUGHT')).toBeUndefined();
  });
});

describe('session-review — missing face pulls', () => {
  it('BLOCKs + appends face pulls to a bench day that has none', () => {
    const benchNoFace: GeneratedSession = {
      ...benchSession,
      exercises: benchSession.exercises.filter((e) => e.name !== 'Face Pull'),
    };
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 2, weekCount: 1 },
      { lift: 'BENCH',    daysSince: 1, weekCount: 2 },
      { lift: 'DEADLIFT', daysSince: 3, weekCount: 1 },
    ];
    const result = reviewSessionPure({
      session: benchNoFace, profile, block, exposures, weekDayOfWeek: 2,
    });
    expect(result.issues.find((i) => i.code === 'NO_FACE_PULLS')?.severity).toBe('BLOCK');
    expect(result.session.exercises.some((e) => e.name === 'Face Pull')).toBe(true);
  });
});

describe('session-review — empty session', () => {
  it('flags empty session as WARN', () => {
    const empty: GeneratedSession = { ...squatSession, exercises: [] };
    const result = reviewSessionPure({
      session: empty, profile, block, exposures: [], weekDayOfWeek: 3,
    });
    expect(result.issues.find((i) => i.code === 'EMPTY_SESSION')).toBeDefined();
  });
});

describe('session-review — weekly bench target', () => {
  it('WARNs late in the week when bench count is under target', () => {
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 1, weekCount: 2 },
      { lift: 'BENCH',    daysSince: 2, weekCount: 1 },
      { lift: 'DEADLIFT', daysSince: 3, weekCount: 1 },
    ];
    // Today is Thursday, today's primary is squat, only 1 bench this week.
    const result = reviewSessionPure({
      session: squatSession, profile, block, exposures, weekDayOfWeek: 4,
    });
    expect(result.issues.some((i) => i.code === 'BENCH_UNDER_TARGET')).toBe(true);
  });
});

describe('session-review — arc-aware suppression', () => {
  // Drought, BENCH_UNDER_TARGET, and NO_FACE_PULLS are SBD-pattern rules.
  // They only make sense on a BARBELL arc. On a CALISTHENICS / REHAB arc
  // the engine is deliberately rotating UPPER/LOWER and bench is not a
  // weekly target — the review must stop firing these.
  const caliSession: GeneratedSession = {
    sessionType: 'ACCUMULATION',
    primaryLift: 'UPPER',
    exercises: [
      {
        name: 'Weighted Pull-Up',
        exerciseType: 'COMPETITION',
        setStructure: 'STRAIGHT',
        sets: 4, reps: 6, rpeTarget: 7, estimatedLoadKg: 20, order: 1,
      },
    ],
    modifications: [],
    coachNote: '',
  };

  it('suppresses BENCH_DROUGHT on a CALISTHENICS arc', () => {
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 30, weekCount: 0 },
      { lift: 'BENCH',    daysSince: 30, weekCount: 0 },
      { lift: 'DEADLIFT', daysSince: 30, weekCount: 0 },
    ];
    const result = reviewSessionPure({
      session: caliSession, profile, block, exposures, weekDayOfWeek: 3,
      arcMode: 'CALISTHENICS',
    });
    expect(result.issues.find((i) => i.code === 'BENCH_DROUGHT')).toBeUndefined();
    expect(result.issues.find((i) => i.code === 'SQUAT_DROUGHT')).toBeUndefined();
    expect(result.issues.find((i) => i.code === 'DEADLIFT_DROUGHT')).toBeUndefined();
  });

  it('suppresses NO_FACE_PULLS when primary is a cali lift on a CALISTHENICS arc', () => {
    // A pull-up day shouldn't get a "missing face pull" auto-append — that
    // rule is specifically about barbell bench.
    const result = reviewSessionPure({
      session: { ...caliSession, primaryLift: 'BENCH' }, // simulate odd state
      profile, block, exposures: [], weekDayOfWeek: 3,
      arcMode: 'CALISTHENICS',
    });
    expect(result.issues.find((i) => i.code === 'NO_FACE_PULLS')).toBeUndefined();
  });

  it('still fires BENCH_DROUGHT when arcMode defaults to BARBELL', () => {
    // Regression: omitting arcMode must preserve the existing barbell-arc
    // behaviour. Drought still fires.
    const exposures: LiftExposure[] = [
      { lift: 'SQUAT',    daysSince: 1,  weekCount: 2 },
      { lift: 'BENCH',    daysSince: 6,  weekCount: 0 },
      { lift: 'DEADLIFT', daysSince: 3,  weekCount: 1 },
    ];
    const result = reviewSessionPure({
      session: squatSession, profile, block, exposures, weekDayOfWeek: 3,
    });
    expect(result.issues.find((i) => i.code === 'BENCH_DROUGHT')).toBeDefined();
  });
});
