/**
 * ensure-session-fresh.ts — Make sure today's session row + exercises exist.
 *
 * Behaviour after the LLM-author migration:
 *   - The LLM session author runs ONLY at check-in submit. Page mounts no
 *     longer regenerate exercises.
 *   - This module's job shrinks to: create the session row if missing,
 *     and seed it with a deterministic rule-engine baseline IF AND ONLY IF
 *     the row has zero exercises (so users who skip check-in still see
 *     something to train against).
 *   - Once exercises exist (whether authored by the LLM or seeded by the
 *     engine), this function is a no-op. No more "I just opened the app
 *     and my session changed" surprises.
 *
 * Safety contract preserved:
 *   - Only touches sessions for the requested date.
 *   - NEVER mutates a session that has logged sets.
 *   - NEVER mutates COMPLETED or SKIPPED sessions.
 *   - Missing profile / block / cycle → no-op.
 */

import { db, newId }          from '@/lib/db/database';
import { generateSession, resolveArcMode }    from './session';
import { loadRecentLiftExposures } from './lift-exposures';
import { reviewSessionPure, packReviewIssues } from './session-review';
import type { Lift, SessionExercise, TrainingSession } from '@/lib/db/types';

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
  /** 'regenerated' = exercises seeded; 'skipped' = left as-is; 'missing' = no session for this date. */
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

  // Never touch completed or skipped sessions.
  if (session.status === 'COMPLETED' || session.status === 'SKIPPED') {
    return { status: 'skipped', reason: `session-${session.status.toLowerCase()}`, session };
  }

  // Don't touch a session the athlete has already started logging.
  const loggedSetCount = await db.sets.where('sessionId').equals(session.id).count();
  if (loggedSetCount > 0) {
    return { status: 'skipped', reason: 'sets-logged', session };
  }

  // ── New invariant (LLM-author migration) ────────────────────────────────
  // The LLM session author runs at check-in submit. If exercises already
  // exist for this session — whether authored by the LLM or seeded by a
  // previous ensureSessionFresh — we leave them alone. No more page-mount
  // regeneration replacing what the athlete just authored.
  const existingExerciseCount = await db.exercises
    .where('sessionId').equals(session.id).count();
  if (existingExerciseCount > 0) {
    return { status: 'skipped', reason: 'exercises-already-present', session };
  }

  // From here on we know exercises is empty — seed a deterministic baseline
  // so users who navigate to the session before doing check-in still see
  // something to train against.
  const earlyReadiness = await db.readiness.where('date').equals(dateStr).first();

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
  // earlyReadiness was already fetched for the in-sync check above; reuse it.
  const readinessRow = earlyReadiness;
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
  // v8: prepend dosed remedial prep for active injuries.
  const { listActiveInjuries } = await import('@/lib/injuries');
  const { getActiveArc } = await import('@/lib/arcs');
  const [activeInjuries, activeArc] = await Promise.all([
    listActiveInjuries().catch(() => []),
    getActiveArc().catch(() => null),
  ]);

  const arcMode = resolveArcMode(activeArc?.priorities);

  let generated = generateSession({
    profile,
    block,
    weekDayOfWeek,
    readinessScore,
    sessionNumber,
    weekWithinBlock,
    overshootHistory,
    recentLiftExposures,
    activeInjuries,
    arcPriorities: activeArc?.priorities,
  });

  // Post-generation sanity review. If the review flags a BLOCK-severity
  // primary-lift swap (bench drought, etc.) we re-run the generator with
  // the new primary pinned so the full accessory chain rebuilds cleanly.
  // The review itself is arc-aware now (drought rules suppressed on non-
  // BARBELL arcs), so this swap branch only fires when it should.
  const firstReview = reviewSessionPure({
    session: generated, profile, block, exposures: recentLiftExposures, weekDayOfWeek, arcMode,
  });
  const blockSwap = firstReview.issues.find(
    (i) => i.severity === 'BLOCK' && (
      i.code === 'BENCH_DROUGHT' || i.code === 'SQUAT_DROUGHT' || i.code === 'DEADLIFT_DROUGHT'
    ),
  );
  if (blockSwap) {
    const forced: Lift = blockSwap.code === 'BENCH_DROUGHT' ? 'BENCH'
                     : blockSwap.code === 'SQUAT_DROUGHT' ? 'SQUAT'
                     : 'DEADLIFT';
    generated = generateSession({
      profile,
      block,
      weekDayOfWeek,
      readinessScore,
      sessionNumber,
      weekWithinBlock,
      overshootHistory,
      recentLiftExposures,
      activeInjuries,
      arcPriorities: activeArc?.priorities,
      forcePrimary: forced,
    });
  }
  // Re-run review on the (possibly-regenerated) session to collect any
  // non-swap issues (face pulls, warnings, etc.) and apply their fixes.
  // skipDroughtCheck=true so we don't ping-pong between BENCH/SQUAT/DL
  // when the athlete is fresh and all three read Infinity-days-since.
  const finalReview = reviewSessionPure({
    session: generated, profile, block, exposures: recentLiftExposures, weekDayOfWeek, arcMode,
    skipDroughtCheck: true,
  });
  generated = finalReview.session;
  const reviewIssues = finalReview.issues;

  // The LLM author no longer runs from this path — it runs only from the
  // check-in submit handler. Page mounts get a clean rule-engine seed.

  // Update session meta and replace exercises atomically.
  await db.transaction('rw', db.sessions, db.exercises, async () => {
    await db.sessions.update(session.id, {
      readinessScore,
      primaryLift:     generated.primaryLift,
      secondaryLifts:  generated.secondaryLifts ?? [],
      sessionType:     generated.sessionType,
      coachNote:       generated.coachNote,
      aiModifications: JSON.stringify(generated.modifications),
      reviewIssues:    packReviewIssues(reviewIssues),
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
      ...(ex.tempo ? { tempo: ex.tempo } : {}),
    }));
    await db.exercises.bulkAdd(freshExercises);
  });

  return {
    status:        'regenerated',
    session:       { ...session, primaryLift: generated.primaryLift, coachNote: generated.coachNote },
    exerciseCount: generated.exercises.length,
  };
}

// ── Whole-session swap (v8) ──────────────────────────────────────────────────

export interface RegenerateWithPrimaryResult {
  status: 'regenerated' | 'refused';
  reason?: 'session-completed' | 'sets-logged' | 'session-not-found' | 'profile-missing' | 'block-missing';
  newPrimaryLift?: Lift;
  exerciseCount?: number;
}

/**
 * Re-author the session's exercises with a different primary lift. Used by
 * the in-session "Change focus" affordance — replaces the existing exercise
 * list (variation + accessories + remedial prep) with a fresh generation
 * pinned to `forcePrimary`.
 *
 * Safety contract — matching `ensureSessionFresh`:
 *   • Refuses to touch COMPLETED or SKIPPED sessions.
 *   • Refuses if ANY logged sets exist for this session — that work is real
 *     and must not be erased by a focus change.
 *
 * Does NOT consult the LLM session author — the change happens via the
 * deterministic rule engine, so the result is predictable and side-effect-
 * free (no Gemini call). The athlete can layer further changes via the
 * existing per-exercise swap modal.
 */
export async function regenerateSessionWithPrimary(
  sessionId: string,
  forcePrimary: Lift,
): Promise<RegenerateWithPrimaryResult> {
  const session = await db.sessions.get(sessionId);
  if (!session) return { status: 'refused', reason: 'session-not-found' };
  if (session.status === 'COMPLETED' || session.status === 'SKIPPED') {
    return { status: 'refused', reason: 'session-completed' };
  }
  const loggedSetCount = await db.sets.where('sessionId').equals(sessionId).count();
  if (loggedSetCount > 0) return { status: 'refused', reason: 'sets-logged' };

  const [profile, block, cycle] = await Promise.all([
    db.profile.get('me'),
    db.blocks.get(session.blockId),
    db.cycles.get(session.cycleId),
  ]);
  if (!profile) return { status: 'refused', reason: 'profile-missing' };
  if (!block)   return { status: 'refused', reason: 'block-missing' };

  const cycleWeek = cycle?.currentWeek ?? 1;
  const weekWithinBlock = Math.max(1, cycleWeek - block.weekStart + 1);

  const dateStr = session.scheduledDate;
  const readinessRow = await db.readiness.where('date').equals(dateStr).first();
  const readinessScore = readinessRow?.readinessScore ?? session.readinessScore ?? 70;
  const weekDayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
  const recentLiftExposures = await loadRecentLiftExposures(dateStr).catch(() => []);
  const { listActiveInjuries } = await import('@/lib/injuries');
  const { getActiveArc } = await import('@/lib/arcs');
  const [activeInjuries, activeArc] = await Promise.all([
    listActiveInjuries().catch(() => []),
    getActiveArc().catch(() => null),
  ]);

  const sessionNumber = 1; // exact value rarely matters with forcePrimary set

  const generated = generateSession({
    profile,
    block,
    weekDayOfWeek,
    readinessScore,
    sessionNumber,
    weekWithinBlock,
    recentLiftExposures,
    activeInjuries,
    arcPriorities: activeArc?.priorities,
    forcePrimary,
  });

  await db.transaction('rw', db.sessions, db.exercises, async () => {
    await db.sessions.update(sessionId, {
      primaryLift:     generated.primaryLift,
      secondaryLifts:  generated.secondaryLifts ?? [],
      sessionType:     generated.sessionType,
      coachNote:       generated.coachNote,
      aiModifications: JSON.stringify(generated.modifications),
      status:          'MODIFIED',
    });
    await db.exercises.where('sessionId').equals(sessionId).delete();
    const freshExercises: SessionExercise[] = generated.exercises.map((ex) => ({
      id:              newId(),
      sessionId,
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
      ...(ex.tempo ? { tempo: ex.tempo } : {}),
    }));
    await db.exercises.bulkAdd(freshExercises);
  });

  return {
    status:         'regenerated',
    newPrimaryLift: generated.primaryLift,
    exerciseCount:  generated.exercises.length,
  };
}
