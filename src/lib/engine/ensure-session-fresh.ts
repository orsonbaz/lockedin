/**
 * ensure-session-fresh.ts — Regenerate today's session exercises from the
 * live engine every time the user opens Home or the session page.
 *
 * Motivation:
 *   Seed creates exactly one session row. Onboarding and check-in regenerate
 *   exercises, but if neither fires (e.g. cycle has advanced, a previous
 *   session was carried over, or the engine has been updated since the rows
 *   were written) the user sees stale exercises.
 *
 * Safety contract:
 *   - Only touches sessions for the requested date.
 *   - NEVER mutates a session that has logged sets (the athlete is mid-workout).
 *   - NEVER mutates COMPLETED or SKIPPED sessions.
 *   - Missing profile / block / cycle → no-op (caller handles empty state).
 *
 * The helper is cheap enough to run on every page mount: one indexed lookup,
 * one profile fetch, a pure generator, then a delete + bulkAdd of exercises.
 */

import { db, newId }          from '@/lib/db/database';
import { generateSession }    from './session';
import { loadRecentLiftExposures } from './lift-exposures';
import type { SessionExercise, TrainingSession } from '@/lib/db/types';

export interface EnsureTodayResult {
  session: TrainingSession;
  /** True if a brand-new session row was created by this call. */
  created: boolean;
}

/**
 * Make sure today has a trainable session row. Creates one from the active
 * cycle + current block if none exists, then runs ensureSessionFresh to
 * populate exercises from the live engine.
 *
 * Returns the session. Throws if there's no active cycle / block — the caller
 * should surface that as an onboarding error.
 */
export async function ensureTodaySession(dateStr: string): Promise<EnsureTodayResult> {
  const existing = await db.sessions.where('scheduledDate').equals(dateStr).first();
  if (existing) {
    await ensureSessionFresh(dateStr).catch(() => { /* best-effort */ });
    const refreshed = await db.sessions.get(existing.id);
    return { session: refreshed ?? existing, created: false };
  }

  const cycle = await db.cycles.filter((c) => c.status === 'ACTIVE').first();
  if (!cycle) {
    throw new Error('No active training cycle — finish onboarding first.');
  }
  const block = await db.blocks
    .where('cycleId').equals(cycle.id)
    .filter((b) => b.weekStart <= cycle.currentWeek && b.weekEnd >= cycle.currentWeek)
    .first();
  if (!block) {
    throw new Error('No current training block — rebuild your cycle.');
  }

  const session: TrainingSession = {
    id: newId(),
    blockId: block.id,
    cycleId: cycle.id,
    scheduledDate: dateStr,
    sessionType: 'ACCUMULATION',
    primaryLift: 'SQUAT',
    status: 'SCHEDULED',
    coachNote: '',
  };
  await db.sessions.put(session);

  await ensureSessionFresh(dateStr).catch(() => { /* exercises stay empty */ });
  const refreshed = (await db.sessions.get(session.id)) ?? session;
  return { session: refreshed, created: true };
}

/** Monday-based ISO week start. Mirrors the helper inlined in checkin/page.tsx. */
function weekStartOf(dateStr: string): string {
  const d    = new Date(`${dateStr}T12:00:00`);
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface EnsureResult {
  /** 'regenerated' = exercises rebuilt; 'skipped' = left as-is; 'missing' = no session for this date. */
  status:       'regenerated' | 'skipped' | 'missing';
  reason?:      string;
  session?:     TrainingSession;
  exerciseCount?: number;
}

/**
 * Regenerate today's session exercises from the live engine if (and only if)
 * the session exists, is not yet in progress, and we have the data to do so.
 *
 * Callers should await this before reading exercises to avoid a flash of
 * stale content.
 */
export async function ensureSessionFresh(dateStr: string): Promise<EnsureResult> {
  const session = await db.sessions.where('scheduledDate').equals(dateStr).first();
  if (!session) return { status: 'missing', reason: 'no-session' };

  // Don't touch a completed session; the athlete's log is the record of truth.
  if (session.status === 'COMPLETED' || session.status === 'SKIPPED') {
    return { status: 'skipped', reason: `session-${session.status.toLowerCase()}`, session };
  }

  // Don't touch a session the athlete has already started logging.
  const loggedSetCount = await db.sets.where('sessionId').equals(session.id).count();
  if (loggedSetCount > 0) {
    return { status: 'skipped', reason: 'sets-logged', session };
  }

  const [profile, block, cycle] = await Promise.all([
    db.profile.get('me'),
    db.blocks.get(session.blockId),
    db.cycles.get(session.cycleId),
  ]);
  if (!profile || !block) {
    return { status: 'skipped', reason: 'missing-profile-or-block', session };
  }

  // Work out where this session sits in the week so the engine picks the
  // right primary lift rotation + DUP adjustment.
  const ws           = weekStartOf(dateStr);
  const weekSessions = await db.sessions
    .where('cycleId').equals(session.cycleId)
    .filter((s) => s.scheduledDate >= ws && s.scheduledDate <= dateStr)
    .sortBy('scheduledDate');
  const sessionIdx   = weekSessions.findIndex((s) => s.id === session.id);
  const sessionNumber = sessionIdx >= 0 ? sessionIdx + 1 : 1;
  const weekDayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();

  const cycleWeek       = cycle?.currentWeek ?? 1;
  const weekWithinBlock = Math.max(1, cycleWeek - block.weekStart + 1);

  // Latest readiness score for today if present (falls back to session value or 70).
  const readinessRow = await db.readiness.where('date').equals(dateStr).first();
  const readinessScore =
    readinessRow?.readinessScore ?? session.readinessScore ?? 70;

  // Rolling overshoot history (last 10 comp sets that reported RPE).
  let overshootHistory: number | undefined;
  try {
    const compExercises = await db.exercises
      .filter((e) => e.exerciseType === 'COMPETITION')
      .toArray();
    const rpeTargetMap = new Map(compExercises.map((e) => [e.id, e.rpeTarget]));
    const recentOvershoots: number[] = [];
    for (const ex of compExercises.slice(-30)) {
      const exSets = await db.sets
        .where('exerciseId').equals(ex.id)
        .filter((s) => s.rpeLogged !== undefined)
        .toArray();
      for (const s of exSets) {
        const target = rpeTargetMap.get(s.exerciseId);
        if (target !== undefined && s.rpeLogged !== undefined) {
          recentOvershoots.push(s.rpeLogged - target);
        }
      }
    }
    const last10 = recentOvershoots.slice(-10);
    if (last10.length >= 3) {
      const avg = last10.reduce((sum, x) => sum + x, 0) / last10.length;
      if (avg > 0) overshootHistory = avg;
    }
  } catch {
    // Non-critical — fall back to undefined.
  }

  const recentLiftExposures = await loadRecentLiftExposures(dateStr).catch(() => []);
  const readinessRow2 = await db.readiness.where('date').equals(dateStr).first().catch(() => undefined);
  const sbdToday = readinessRow2?.sessionModality === 'SBD';

  const generated = generateSession({
    profile,
    block,
    weekDayOfWeek,
    readinessScore,
    sessionNumber,
    weekWithinBlock,
    overshootHistory,
    recentLiftExposures,
    sbdToday,
  });

  // Update session meta and replace exercises atomically.
  await db.transaction('rw', db.sessions, db.exercises, async () => {
    await db.sessions.update(session.id, {
      readinessScore,
      primaryLift:     generated.primaryLift,
      sessionType:     generated.sessionType,
      coachNote:       generated.coachNote,
      aiModifications: JSON.stringify(generated.modifications),
      status:          generated.modifications.length > 0 ? 'MODIFIED' : session.status === 'MODIFIED' ? 'SCHEDULED' : session.status,
    });

    await db.exercises.where('sessionId').equals(session.id).delete();

    const freshExercises: SessionExercise[] = generated.exercises.map((ex) => ({
      id:              newId(),
      sessionId:       session.id,
      name:            ex.name,
      exerciseType:    ex.exerciseType,
      setStructure:    ex.setStructure,
      sets:            ex.sets,
      reps:            ex.reps,
      rpeTarget:       ex.rpeTarget,
      estimatedLoadKg: ex.estimatedLoadKg,
      order:           ex.order,
      notes:           ex.notes,
      ...(ex.libraryExerciseId ? { libraryExerciseId: ex.libraryExerciseId } : {}),
    }));
    await db.exercises.bulkAdd(freshExercises);
  });

  return {
    status:        'regenerated',
    session:       { ...session, primaryLift: generated.primaryLift, coachNote: generated.coachNote },
    exerciseCount: generated.exercises.length,
  };
}
