/**
 * form-check-db.ts — Dexie helpers for persisting form-check analyses.
 *
 * Separates IO from the pure `capture.ts` / `analyze.ts` modules so those
 * can be unit-tested in Node without fake-indexeddb.
 */

import { db, newId, today } from '@/lib/db/database';
import type { FormCheck, FormCheckKeyframe, Lift } from '@/lib/db/types';
import type { AnalysisResult } from './analyze';
import type { Keyframe } from './capture';

export interface SaveFormCheckInput {
  lift: Lift;
  note?: string;
  sessionId?: string;
  exerciseId?: string;
  analysis: AnalysisResult;
  keyframes: Keyframe[];
}

/**
 * Persists a FormCheck + its keyframes in a single transaction and returns
 * the new row ids.
 */
export async function saveFormCheck(input: SaveFormCheckInput): Promise<FormCheck> {
  const { lift, note, sessionId, exerciseId, analysis, keyframes } = input;
  const id = newId();
  const now = new Date().toISOString();

  const row: FormCheck = {
    id,
    date: today(),
    sessionId,
    exerciseId,
    lift,
    note,
    verdict: analysis.verdict,
    cues: analysis.cues,
    safetyFlags: analysis.safetyFlags,
    score: analysis.score,
    model: analysis.model,
    analyzedAt: now,
  };

  const frameRows: FormCheckKeyframe[] = keyframes.map((kf, i) => ({
    id: newId(),
    formCheckId: id,
    index: i,
    timestamp: kf.timestamp,
    dataUri: kf.dataUri,
  }));

  await db.transaction('rw', db.formChecks, db.formCheckKeyframes, async () => {
    await db.formChecks.put(row);
    if (frameRows.length > 0) await db.formCheckKeyframes.bulkPut(frameRows);
  });

  return row;
}

/** Load the form-check + its keyframes by id. */
export async function loadFormCheck(id: string): Promise<{
  check: FormCheck;
  keyframes: FormCheckKeyframe[];
} | null> {
  const check = await db.formChecks.get(id);
  if (!check) return null;
  const keyframes = await db.formCheckKeyframes
    .where('formCheckId')
    .equals(id)
    .sortBy('index');
  return { check, keyframes };
}

/** Delete a form-check and its keyframes. */
export async function deleteFormCheck(id: string): Promise<void> {
  await db.transaction('rw', db.formChecks, db.formCheckKeyframes, async () => {
    await db.formChecks.delete(id);
    const frames = await db.formCheckKeyframes.where('formCheckId').equals(id).toArray();
    await db.formCheckKeyframes.bulkDelete(frames.map((f) => f.id));
  });
}

/** List form-checks sorted newest-first, optionally scoped to a session. */
export async function listFormChecks(opts: { sessionId?: string; limit?: number } = {}): Promise<FormCheck[]> {
  const { sessionId, limit = 50 } = opts;
  const collection = sessionId
    ? db.formChecks.where('sessionId').equals(sessionId)
    : db.formChecks.orderBy('date').reverse();
  const rows = await collection.toArray();
  rows.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  return rows.slice(0, limit);
}
