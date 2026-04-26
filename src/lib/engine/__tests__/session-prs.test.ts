import { describe, it, expect } from 'vitest';
import { findSessionPRs, exerciseKey } from '../session-prs';
import type { SessionExercise, SetLog } from '@/lib/db/types';

function makeEx(
  id: string,
  name: string,
  opts: Partial<SessionExercise> = {},
): SessionExercise {
  return {
    id,
    sessionId: 'sess-1',
    name,
    exerciseType: 'COMPETITION',
    setStructure: 'STRAIGHT',
    sets: 3,
    reps: 5,
    rpeTarget: 8,
    estimatedLoadKg: 100,
    order: 1,
    ...opts,
  };
}

function makeSet(
  exerciseId: string,
  loadKg: number,
  reps: number,
  overrides: Partial<SetLog> = {},
): SetLog {
  return {
    id: `${exerciseId}-${loadKg}x${reps}`,
    exerciseId,
    sessionId: 'sess-1',
    setNumber: 1,
    loadKg,
    reps,
    loggedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('findSessionPRs', () => {
  it('flags a clear e1RM PR vs prior best', () => {
    const ex = makeEx('ex-1', 'Squat', { libraryExerciseId: 'competition_squat' });
    // 5×150 → e1RM ≈ 175. 5×140 → e1RM ≈ 163.3. Today is the PR.
    const sets = [makeSet('ex-1', 150, 5)];
    const prior = new Map<string, number>([['lib:competition_squat', 163.3]]);

    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: prior,
    });
    expect(out).toHaveLength(1);
    expect(out[0].exerciseName).toBe('Squat');
    expect(out[0].todayE1rm).toBeCloseTo(175, 1);
    expect(out[0].deltaKg).toBeGreaterThanOrEqual(1);
    expect(out[0].evidenceSet).toEqual({ loadKg: 150, reps: 5 });
  });

  it('treats a first-ever exercise (no prior history) as a PR', () => {
    const ex = makeEx('ex-1', 'Front Squat');
    const sets = [makeSet('ex-1', 100, 5)];
    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: new Map(),
    });
    expect(out).toHaveLength(1);
    expect(out[0].priorBestE1rm).toBe(0);
  });

  it('does not flag when delta is below the 1kg threshold', () => {
    const ex = makeEx('ex-1', 'Squat', { libraryExerciseId: 'competition_squat' });
    // Today: 5×141 → e1RM ≈ 164.5. Prior: 164.0 → delta 0.5kg.
    const sets = [makeSet('ex-1', 141, 5)];
    const prior = new Map<string, number>([['lib:competition_squat', 164]]);
    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: prior,
    });
    expect(out).toHaveLength(0);
  });

  it('ignores MISS sets when computing today\'s best', () => {
    const ex = makeEx('ex-1', 'Squat', { libraryExerciseId: 'competition_squat' });
    const sets = [
      makeSet('ex-1', 150, 5),                           // would be PR
      makeSet('ex-1', 200, 0, { outcome: 'MISS' }),      // bail — must not count
    ];
    const prior = new Map<string, number>([['lib:competition_squat', 163]]);
    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: prior,
    });
    expect(out).toHaveLength(1);
    // Evidence comes from the 150 set, not the 200 bail
    expect(out[0].evidenceSet.loadKg).toBe(150);
  });

  it('skips exercises with only 0-rep / 0-load sets', () => {
    const ex = makeEx('ex-1', 'Bench');
    const sets = [makeSet('ex-1', 0, 5), makeSet('ex-1', 100, 0)];
    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: new Map(),
    });
    expect(out).toHaveLength(0);
  });

  it('matches by name when there is no libraryExerciseId', () => {
    const ex = makeEx('ex-1', 'Pin Squat'); // no libraryExerciseId
    const sets = [makeSet('ex-1', 150, 3)];
    const prior = new Map<string, number>([['name:Pin Squat', 200]]);
    const out = findSessionPRs({
      exercises: [ex], sets, priorBestByKey: prior,
    });
    expect(out).toHaveLength(0); // 3×150 → e1RM 165 < 200
  });

  it('sorts results by deltaKg descending', () => {
    const ex1 = makeEx('ex-1', 'Squat', { libraryExerciseId: 'competition_squat' });
    const ex2 = makeEx('ex-2', 'Bench', { libraryExerciseId: 'competition_bench' });
    const sets = [
      makeSet('ex-1', 150, 5), // e1RM 175 vs prior 160 → +15
      makeSet('ex-2', 110, 3), // e1RM ~121 vs prior 118 → +3
    ];
    const prior = new Map<string, number>([
      ['lib:competition_squat', 160],
      ['lib:competition_bench', 118],
    ]);
    const out = findSessionPRs({
      exercises: [ex1, ex2], sets, priorBestByKey: prior,
    });
    expect(out.map((p) => p.exerciseName)).toEqual(['Squat', 'Bench']);
  });

  it('exerciseKey prefers libraryExerciseId over name', () => {
    expect(exerciseKey({ libraryExerciseId: 'competition_squat', name: 'Squat' }))
      .toBe('lib:competition_squat');
    expect(exerciseKey({ libraryExerciseId: undefined, name: 'Pin Squat' }))
      .toBe('name:Pin Squat');
  });
});
