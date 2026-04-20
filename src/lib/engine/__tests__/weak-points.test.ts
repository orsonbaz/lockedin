import { describe, it, expect } from 'vitest';
import {
  detectRpeCreep,
  detectMissedReps,
  detectLoadPlateau,
  detectLiftImbalance,
  type EnrichedExercise,
} from '../weak-points';
import type {
  SessionExercise,
  SetLog,
  TrainingSession,
  ExerciseType,
  Lift,
} from '@/lib/db/types';

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeSession(date: string, primaryLift: Lift = 'SQUAT'): TrainingSession {
  return {
    id: `sess-${date}-${primaryLift}`,
    blockId: 'block-1',
    cycleId: 'cycle-1',
    scheduledDate: date,
    sessionType: 'ACCUMULATION',
    primaryLift,
    status: 'COMPLETED',
    completedAt: `${date}T12:00:00.000Z`,
  };
}

function makeExercise(
  sessionId: string,
  name: string,
  opts?: Partial<SessionExercise> & { exerciseType?: ExerciseType },
): SessionExercise {
  return {
    id: `${sessionId}-${name}`,
    sessionId,
    name,
    exerciseType: opts?.exerciseType ?? 'COMPETITION',
    setStructure: 'STRAIGHT',
    sets: opts?.sets ?? 3,
    reps: opts?.reps ?? 5,
    rpeTarget: opts?.rpeTarget ?? 8,
    estimatedLoadKg: opts?.estimatedLoadKg ?? 150,
    order: opts?.order ?? 1,
    ...opts,
  };
}

function makeSet(
  exerciseId: string,
  sessionId: string,
  setNumber: number,
  overrides: Partial<SetLog>,
): SetLog {
  return {
    id: `${exerciseId}-s${setNumber}`,
    exerciseId,
    sessionId,
    setNumber,
    reps: 5,
    loadKg: 150,
    loggedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEntry(
  date: string,
  name: string,
  sets: Array<Partial<SetLog>>,
  exerciseOpts?: Partial<SessionExercise>,
  primaryLift: Lift = 'SQUAT',
): EnrichedExercise {
  const session = makeSession(date, primaryLift);
  const exercise = makeExercise(session.id, name, exerciseOpts);
  const setLogs = sets.map((s, i) => makeSet(exercise.id, session.id, i + 1, s));
  return { exercise, sets: setLogs, session };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('detectRpeCreep', () => {
  it('flags a comp lift when RPE trends up at flat load', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Competition Back Squat', [
        { loadKg: 150, rpeLogged: 7 },
        { loadKg: 150, rpeLogged: 7 },
        { loadKg: 150, rpeLogged: 7 },
      ]),
      makeEntry('2026-04-08', 'Competition Back Squat', [
        { loadKg: 150, rpeLogged: 8 },
        { loadKg: 150, rpeLogged: 8 },
        { loadKg: 150, rpeLogged: 8 },
      ]),
      makeEntry('2026-04-15', 'Competition Back Squat', [
        { loadKg: 150, rpeLogged: 9 },
        { loadKg: 150, rpeLogged: 9 },
        { loadKg: 150, rpeLogged: 9 },
      ]),
    ];

    const findings = detectRpeCreep(data);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('RPE_CREEP');
    expect(findings[0].exerciseName).toBe('Competition Back Squat');
    expect(findings[0].severity).toBeGreaterThan(0);
  });

  it('does not flag when load is rising alongside RPE', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Competition Back Squat', [
        { loadKg: 140, rpeLogged: 7 },
      ]),
      makeEntry('2026-04-08', 'Competition Back Squat', [
        { loadKg: 150, rpeLogged: 8 },
      ]),
      makeEntry('2026-04-15', 'Competition Back Squat', [
        { loadKg: 160, rpeLogged: 9 },
      ]),
    ];
    expect(detectRpeCreep(data)).toHaveLength(0);
  });

  it('skips non-competition exercises', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Pause Bench', [{ loadKg: 100, rpeLogged: 7 }], { exerciseType: 'VARIATION' }),
      makeEntry('2026-04-08', 'Pause Bench', [{ loadKg: 100, rpeLogged: 8 }], { exerciseType: 'VARIATION' }),
      makeEntry('2026-04-15', 'Pause Bench', [{ loadKg: 100, rpeLogged: 9 }], { exerciseType: 'VARIATION' }),
    ];
    expect(detectRpeCreep(data)).toHaveLength(0);
  });
});

describe('detectMissedReps', () => {
  it('flags when prescribed reps are missed in multiple sessions', () => {
    // Target: 3 sets × 5 reps; "short" = reps < target.
    const mkShort = (date: string) =>
      makeEntry(
        date,
        'Competition Back Squat',
        [
          { reps: 4, loadKg: 160 },
          { reps: 3, loadKg: 160 },
          { reps: 3, loadKg: 160 },
        ],
        { sets: 3, reps: 5 },
      );
    const data: EnrichedExercise[] = [
      mkShort('2026-04-01'),
      mkShort('2026-04-08'),
      mkShort('2026-04-15'),
    ];
    const findings = detectMissedReps(data);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('MISSED_REPS');
    expect(findings[0].severity).toBeGreaterThan(0);
  });

  it('does not flag when all sets hit the target', () => {
    const mkHit = (date: string) =>
      makeEntry(
        date,
        'Competition Back Squat',
        [
          { reps: 5, loadKg: 160 },
          { reps: 5, loadKg: 160 },
          { reps: 5, loadKg: 160 },
        ],
        { sets: 3, reps: 5 },
      );
    expect(detectMissedReps([mkHit('2026-04-01'), mkHit('2026-04-08'), mkHit('2026-04-15')])).toHaveLength(0);
  });
});

describe('detectLoadPlateau', () => {
  it('flags when top load is flat over many sessions', () => {
    const mkFlat = (date: string) =>
      makeEntry(date, 'Competition Back Squat', [
        { loadKg: 180 },
        { loadKg: 180 },
      ]);
    const data: EnrichedExercise[] = [
      mkFlat('2026-03-25'),
      mkFlat('2026-04-01'),
      mkFlat('2026-04-08'),
      mkFlat('2026-04-15'),
    ];
    const findings = detectLoadPlateau(data);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('LOAD_PLATEAU');
  });

  it('does not flag when load progresses session-over-session', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-03-25', 'Competition Back Squat', [{ loadKg: 170 }]),
      makeEntry('2026-04-01', 'Competition Back Squat', [{ loadKg: 175 }]),
      makeEntry('2026-04-08', 'Competition Back Squat', [{ loadKg: 180 }]),
      makeEntry('2026-04-15', 'Competition Back Squat', [{ loadKg: 185 }]),
    ];
    expect(detectLoadPlateau(data)).toHaveLength(0);
  });
});

describe('detectLiftImbalance', () => {
  it('flags bench when ratio to squat is well below typical', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Competition Back Squat', [{ loadKg: 200 }], undefined, 'SQUAT'),
      makeEntry('2026-04-02', 'Competition Bench Press', [{ loadKg: 80 }], undefined, 'BENCH'),
    ];
    const findings = detectLiftImbalance(data);
    expect(findings.some((f) => f.lift === 'BENCH')).toBe(true);
  });

  it('flags deadlift when ratio to squat is well below typical', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Competition Back Squat', [{ loadKg: 200 }], undefined, 'SQUAT'),
      makeEntry('2026-04-02', 'Competition Deadlift',   [{ loadKg: 180 }], undefined, 'DEADLIFT'),
    ];
    const findings = detectLiftImbalance(data);
    expect(findings.some((f) => f.lift === 'DEADLIFT')).toBe(true);
  });

  it('does not flag when ratios are in the normal band', () => {
    const data: EnrichedExercise[] = [
      makeEntry('2026-04-01', 'Competition Back Squat', [{ loadKg: 200 }], undefined, 'SQUAT'),
      makeEntry('2026-04-02', 'Competition Bench Press', [{ loadKg: 130 }], undefined, 'BENCH'),
      makeEntry('2026-04-03', 'Competition Deadlift',    [{ loadKg: 230 }], undefined, 'DEADLIFT'),
    ];
    expect(detectLiftImbalance(data)).toHaveLength(0);
  });
});
