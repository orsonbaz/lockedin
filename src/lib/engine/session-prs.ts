/**
 * session-prs.ts — Detect personal records hit during a single session.
 *
 * Compares today's logged sets against the athlete's prior best e1RM for
 * each exercise. Catches PRs that detectMaxUpdate misses: variations,
 * sub-3% gains, and any non-comp lift.
 *
 * The pure `findSessionPRs` works on plain data and is tested in isolation.
 * `detectSessionPRs` wraps it with the Dexie queries needed for live use.
 */

import { db } from '@/lib/db/database';
import { estimateMax } from '@/lib/engine/calc';
import type { SessionExercise, SetLog } from '@/lib/db/types';

export interface SessionPR {
  exerciseName: string;
  /** Library id when the exercise originated from the engine. */
  libraryExerciseId?: string;
  /** Best e1RM achieved in the just-completed session, kg. */
  todayE1rm: number;
  /** Athlete's previous best e1RM for the same exercise (0 if first time). */
  priorBestE1rm: number;
  /** todayE1rm - priorBestE1rm, kg. Always > 0 for items in the result. */
  deltaKg: number;
  /** Heaviest single set this session, used as the "evidence" line. */
  evidenceSet: { loadKg: number; reps: number };
}

const MIN_DELTA_KG = 1;

/**
 * Pure: given the current session's exercises + sets and the prior-best
 * e1RM map (key = libraryExerciseId or name), return PR events.
 */
export function findSessionPRs(input: {
  exercises: SessionExercise[];
  sets: SetLog[];
  priorBestByKey: Map<string, number>;
}): SessionPR[] {
  const { exercises, sets, priorBestByKey } = input;
  if (exercises.length === 0 || sets.length === 0) return [];

  const setsByEx = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.outcome === 'MISS' || s.reps < 1 || s.loadKg <= 0) continue;
    const arr = setsByEx.get(s.exerciseId) ?? [];
    arr.push(s);
    setsByEx.set(s.exerciseId, arr);
  }

  const prs: SessionPR[] = [];

  for (const ex of exercises) {
    const exSets = setsByEx.get(ex.id) ?? [];
    if (exSets.length === 0) continue;

    let todayE1rm = 0;
    let evidence: { loadKg: number; reps: number } | null = null;
    for (const s of exSets) {
      const e1 = estimateMax(s.loadKg, s.reps);
      if (e1 > todayE1rm) {
        todayE1rm = e1;
        evidence = { loadKg: s.loadKg, reps: s.reps };
      }
    }
    if (!evidence || todayE1rm <= 0) continue;

    const key = exerciseKey(ex);
    const priorBest = priorBestByKey.get(key) ?? 0;

    const delta = todayE1rm - priorBest;
    if (priorBest === 0 || delta >= MIN_DELTA_KG) {
      prs.push({
        exerciseName: ex.name,
        libraryExerciseId: ex.libraryExerciseId,
        todayE1rm: round1(todayE1rm),
        priorBestE1rm: round1(priorBest),
        deltaKg: round1(delta),
        evidenceSet: evidence,
      });
    }
  }

  prs.sort((a, b) => b.deltaKg - a.deltaKg);
  return prs;
}

export function exerciseKey(ex: Pick<SessionExercise, 'libraryExerciseId' | 'name'>): string {
  return ex.libraryExerciseId ? `lib:${ex.libraryExerciseId}` : `name:${ex.name}`;
}

/** Live db wrapper around findSessionPRs. Used by the session/[id] page. */
export async function detectSessionPRs(sessionId: string): Promise<SessionPR[]> {
  const exercises = await db.exercises.where('sessionId').equals(sessionId).toArray();
  if (exercises.length === 0) return [];

  const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
  if (sets.length === 0) return [];

  const priorBestByKey = await loadPriorBests(exercises, sessionId);
  return findSessionPRs({ exercises, sets, priorBestByKey });
}

async function loadPriorBests(
  currentExercises: SessionExercise[],
  currentSessionId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Bucket the current exercises by their lookup key so each unique
  // exercise gets one Dexie scan.
  const keyToCurrent = new Map<string, SessionExercise>();
  for (const ex of currentExercises) keyToCurrent.set(exerciseKey(ex), ex);

  for (const [key, ex] of keyToCurrent) {
    const matched = ex.libraryExerciseId
      ? await db.exercises.filter((e) =>
          e.libraryExerciseId === ex.libraryExerciseId &&
          e.sessionId !== currentSessionId,
        ).toArray()
      : await db.exercises.filter((e) =>
          e.name === ex.name &&
          e.sessionId !== currentSessionId,
        ).toArray();

    if (matched.length === 0) {
      result.set(key, 0);
      continue;
    }

    const priorSets = await db.sets
      .where('exerciseId').anyOf(matched.map((e) => e.id))
      .toArray();

    let best = 0;
    for (const s of priorSets) {
      if (s.outcome === 'MISS' || s.reps < 1 || s.loadKg <= 0) continue;
      const e1 = estimateMax(s.loadKg, s.reps);
      if (e1 > best) best = e1;
    }
    result.set(key, best);
  }

  return result;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
