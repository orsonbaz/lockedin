/**
 * reset-session.ts — Wipe today's session state so the athlete can redo
 * check-in with fresh choices (different primary, different secondary, or
 * a clean slate for a new readiness score).
 *
 * Removes for the given date:
 *   - All exercises attached to today's session row
 *   - All logged sets in today's session
 *   - Today's readiness row
 *   - Today's bodyweight log entry
 *   - The session-meta fields (primaryLift, secondaryLifts, coachNote, etc.)
 *     are reset to defaults; the session row itself is kept and returned to
 *     status SCHEDULED so the athlete lands back on a fresh check-in.
 *
 * Returns information about what was wiped so the UI / chat coach can
 * confirm the action to the athlete.
 *
 * Refuses to wipe a session that is already COMPLETED — the athlete
 * shouldn't lose finished training data by accident.
 */

import { db } from '@/lib/db/database';
import type { TrainingSession } from '@/lib/db/types';

export interface ResetSessionResult {
  status:
    | 'reset'
    | 'no-session'
    | 'session-completed';
  /** What was actually deleted — for audit / toast text. */
  cleared?: {
    exercises:  number;
    sets:       number;
    readiness:  boolean;
    bodyweight: boolean;
  };
  session?: TrainingSession;
}

export async function resetTodaySession(dateStr: string): Promise<ResetSessionResult> {
  const session = await db.sessions.where('scheduledDate').equals(dateStr).first();
  if (!session) return { status: 'no-session' };

  // Don't let the athlete clobber a completed session — that's lost log data.
  if (session.status === 'COMPLETED') {
    return { status: 'session-completed', session };
  }

  const [exerciseCount, setCount, readinessRow, bodyweightRow] = await Promise.all([
    db.exercises.where('sessionId').equals(session.id).count(),
    db.sets.where('sessionId').equals(session.id).count(),
    db.readiness.where('date').equals(dateStr).first(),
    db.bodyweight.where('date').equals(dateStr).first(),
  ]);

  await db.transaction(
    'rw',
    [db.sessions, db.exercises, db.sets, db.readiness, db.bodyweight],
    async () => {
      await db.exercises.where('sessionId').equals(session.id).delete();
      await db.sets.where('sessionId').equals(session.id).delete();
      if (readinessRow)  await db.readiness.delete(readinessRow.id);
      if (bodyweightRow) await db.bodyweight.delete(bodyweightRow.id);

      // Reset the session metadata so the athlete sees a clean slate when
      // they land back on /checkin. Keep the row so the cycle / block
      // wiring stays intact.
      await db.sessions.update(session.id, {
        status:           'SCHEDULED',
        readinessScore:   undefined as unknown as number,
        coachNote:        '',
        aiModifications:  undefined,
        reviewIssues:     undefined,
        secondaryLifts:   [],
      });
    },
  );

  return {
    status: 'reset',
    cleared: {
      exercises:  exerciseCount,
      sets:       setCount,
      readiness:  !!readinessRow,
      bodyweight: !!bodyweightRow,
    },
    session,
  };
}
