'use client';

/**
 * Session Logging Screen — /app/session/[id]
 *
 * Three states managed by local useState:
 *   'overview'  — exercise list, coach note, readiness, Start button
 *   'logging'   — set-by-set logging with fixed input panel + rest timer
 *   'complete'  — post-session summary, RPE accuracy, save + redirect
 *
 * Performance contract: all DB writes during 'logging' are fire-and-forget.
 * UI state updates happen synchronously; the user never waits for a write.
 */

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter }                                      from 'next/navigation';
import { toast }                                          from 'sonner';
import { db, today, newId, advanceCycleWeek }              from '@/lib/db/database';
import { SetLogSchema }                                   from '@/lib/db/schemas';
import { readinessLabel }                                 from '@/lib/engine/readiness';
import { detectMaxUpdate }                                from '@/lib/engine/calc';
import type { MaxUpdateSuggestion }                       from '@/lib/engine/calc';
import { C as _C }                                        from '@/lib/theme';
import type { TrainingSession, TrainingBlock, SessionExercise, SetLog, AthleteProfile, GearConfig }  from '@/lib/db/types';
import { DEFAULT_GEAR }                                   from '@/lib/db/types';
import { suggestSwaps }                                   from '@/lib/exercises/swap';
import { EXERCISE_BY_ID }                                 from '@/lib/exercises/index';
import type { SwapCandidate, UserEquipmentProfile }        from '@/lib/exercises/types';
import { ensureSessionFresh }                             from '@/lib/engine/ensure-session-fresh';
import { unpackReviewIssues }                             from '@/lib/engine/session-review';

// ── Design tokens (extends shared theme with session-specific colours) ───────
const C = { ..._C, amber: '#D97706', green: _C.greenDeep } as const;

// ── SVG rest-timer constants ───────────────────────────────────────────────────
const RING_R    = 80;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈ 502.65

// ── Types ─────────────────────────────────────────────────────────────────────
type PageState = 'overview' | 'logging' | 'complete';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Rest Timer Overlay
// ─────────────────────────────────────────────────────────────────────────────

interface RestTimerProps {
  secsRemaining: number;
  maxSecs:       number;
  onSkip:        () => void;
}

function RestTimerOverlay({ secsRemaining, maxSecs, onSkip }: RestTimerProps) {
  const progress    = secsRemaining / maxSecs;          // 1→0 as time passes
  const dashOffset  = RING_CIRC * (1 - progress);       // 0→CIRC: ring drains
  const mins        = Math.floor(secsRemaining / 60);
  const secs        = secsRemaining % 60;
  const display     = `${mins}:${String(secs).padStart(2, '0')}`;

  // Colour shifts from green → amber → red as time depletes
  const ringColour  = progress > 0.5 ? C.green : progress > 0.25 ? C.gold : C.accent;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rest timer"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(26,26,46,0.92)', backdropFilter: 'blur(4px)' }}
    >
      <p className="text-sm font-semibold uppercase tracking-widest mb-8" style={{ color: C.muted }}>
        Rest
      </p>

      {/* Ring + countdown */}
      <svg viewBox="0 0 200 200" className="w-52 h-52" aria-label={`Rest timer ${display}`}>
        {/* Track */}
        <circle cx="100" cy="100" r={RING_R} fill="none" stroke={C.dim} strokeWidth="10" />
        {/* Progress arc */}
        <circle
          cx="100" cy="100" r={RING_R}
          fill="none"
          stroke={ringColour}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s ease' }}
        />
        {/* Time digits */}
        <text
          x="100" y="95"
          textAnchor="middle" dominantBaseline="middle"
          fill={C.text} fontSize="42" fontWeight="bold" fontFamily="monospace"
        >
          {display}
        </text>
        <text
          x="100" y="125"
          textAnchor="middle" dominantBaseline="middle"
          fill={C.muted} fontSize="13" fontFamily="sans-serif"
        >
          rest
        </text>
      </svg>

      <button
        type="button"
        onClick={onSkip}
        className="mt-10 text-sm transition-colors active:opacity-70"
        style={{ color: C.muted }}
      >
        Skip rest →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Logged Set Row
// ─────────────────────────────────────────────────────────────────────────────

interface SetLogRowProps {
  setLog:    SetLog;
  rpeTarget: number;
  onTap?:    () => void;
}

function SetLogRow({ setLog, rpeTarget, onTap }: SetLogRowProps) {
  const overshoot = (setLog.rpeLogged ?? 0) - rpeTarget;
  const isCritical = setLog.rpeLogged !== undefined && overshoot > 2;
  const isWarning  = setLog.rpeLogged !== undefined && overshoot > 1 && !isCritical;

  let bg     = 'transparent';
  let border = 'transparent';
  if (isCritical) { bg = 'rgba(153,27,27,0.2)';  border = C.accent; }
  if (isWarning)  { bg = 'rgba(217,119,6,0.15)'; border = C.amber;  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-center justify-between rounded-lg px-4 py-3 text-sm border w-full text-left transition-all active:scale-[0.98]"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <span className="w-12 font-bold" style={{ color: C.muted }}>
        Set {setLog.setNumber}
      </span>
      <span className="flex-1 text-center font-semibold" style={{ color: C.text }}>
        {setLog.loadKg} kg
      </span>
      <span className="flex-1 text-center" style={{ color: C.text }}>
        {setLog.reps} reps
      </span>
      <span
        className="w-20 text-right font-semibold"
        style={{ color: isCritical ? C.accent : isWarning ? C.amber : C.gold }}
      >
        {setLog.rpeLogged !== undefined ? `RPE ${setLog.rpeLogged}` : '—'}
        {isCritical && ' ⚠'}
        {isWarning  && ' △'}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Exercise type badge
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseBadge({ type }: { type: SessionExercise['exerciseType'] }) {
  const map = {
    COMPETITION: { label: 'Comp',      bg: 'rgba(233,69,96,0.15)',  text: C.accent },
    VARIATION:   { label: 'Variation', bg: 'rgba(245,166,35,0.15)', text: C.gold   },
    ACCESSORY:   { label: 'Accessory', bg: 'rgba(154,160,180,0.1)', text: C.muted  },
  } as const;
  const { label, bg, text } = map[type];
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router            = useRouter();

  // ── Data ────────────────────────────────────────────────────────────────
  const [loading,          setLoading]          = useState(true);
  const [session,          setSession]          = useState<TrainingSession | null>(null);
  const [sessionBlock,     setSessionBlock]     = useState<TrainingBlock | null>(null);
  const [exercises,        setExercises]        = useState<SessionExercise[]>([]);
  const [setLogs,          setSetLogs]          = useState<SetLog[]>([]);
  const [todayReadiness,   setTodayReadiness]   = useState<number | undefined>();
  const [equipmentProfile, setEquipmentProfile] = useState<UserEquipmentProfile | null>(null);

  // ── Swap modal ───────────────────────────────────────────────────────────
  const [swapForExId,      setSwapForExId]      = useState<string | null>(null);
  const [swapCandidates,   setSwapCandidates]   = useState<SwapCandidate[]>([]);

  // ── Page flow ────────────────────────────────────────────────────────────
  const [pageState,        setPageState]        = useState<PageState>('overview');
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [showModifications,setShowModifications]= useState(false);

  // Gear for this session — initialised from profile.defaultGear (or DEFAULT_GEAR)
  // and editable per session via the overview chip strip. Persisted back to
  // the profile so the next session picks up the latest default.
  const [gear, setGear] = useState<GearConfig>(DEFAULT_GEAR);

  // ── Logging: exercise tracking ────────────────────────────────────────
  const [activeExIdx,      setActiveExIdx]      = useState(0);

  // ── Logging: draft inputs (refs for zero-latency read in logSet) ──────
  const [draftLoad,        setDraftLoad]        = useState(0);
  const [draftReps,        setDraftReps]        = useState(5);
  const [draftRpe,         setDraftRpe]         = useState(8);
  const draftLoadRef = useRef(0);
  const draftRepsRef = useRef(5);
  const draftRpeRef  = useRef(8);
  // Keep refs in sync with state
  draftLoadRef.current = draftLoad;
  draftRepsRef.current = draftReps;
  draftRpeRef.current  = draftRpe;

  // ── Rest timer ─────────────────────────────────────────────────────────
  const [restTimerSecs,    setRestTimerSecs]    = useState<number | null>(null);
  const [restTimerMax,     setRestTimerMax]     = useState(180);

  // ── Complete state ─────────────────────────────────────────────────────
  const [sessionNote,      setSessionNote]      = useState('');
  const [saving,           setSaving]           = useState(false);
  const [maxSuggestion,    setMaxSuggestion]    = useState<MaxUpdateSuggestion | null>(null);
  const [editingSetId,     setEditingSetId]     = useState<string | null>(null);
  const [editLoad,         setEditLoad]         = useState(0);
  const [editReps,         setEditReps]         = useState(0);
  const [editRpe,          setEditRpe]          = useState(0);

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // If this is today's session and the athlete hasn't started logging
      // yet, regenerate exercises from the live engine so stale content
      // from an old app version gets rebuilt on view.
      const preSession = await db.sessions.get(sessionId);
      if (preSession?.scheduledDate === today()) {
        await ensureSessionFresh(today()).catch((err) => {
          console.warn('[session] ensureSessionFresh failed:', err);
        });
      }

      const [sess, exs, sets, readiness, eqProfile, profileRow] = await Promise.all([
        db.sessions.get(sessionId),
        db.exercises.where('sessionId').equals(sessionId).sortBy('order'),
        db.sets.where('sessionId').equals(sessionId).toArray(),
        db.readiness.where('date').equals(today()).first(),
        db.equipmentProfile.get('me'),
        db.profile.get('me'),
      ]);
      if (cancelled) return;
      setSession(sess ?? null);
      setExercises(exs);
      setSetLogs(sets);
      setTodayReadiness(readiness?.readinessScore);
      setEquipmentProfile(eqProfile ?? null);
      setGear(profileRow?.defaultGear ?? DEFAULT_GEAR);
      // Fetch the block so we can use its blockType for swap suggestions
      if (sess?.blockId) {
        const blk = await db.blocks.get(sess.blockId);
        if (!cancelled) setSessionBlock(blk ?? null);
      }
      if (exs.length > 0) {
        const first = exs[0];
        setDraftLoad(first.estimatedLoadKg);
        setDraftReps(first.reps);
        setDraftRpe(first.rpeTarget);
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Rest timer countdown ───────────────────────────────────────────────
  useEffect(() => {
    if (restTimerSecs === null) return;
    if (restTimerSecs <= 0)    { setRestTimerSecs(null); return; }
    const t = setTimeout(
      () => setRestTimerSecs((s) => (s !== null && s > 0 ? s - 1 : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [restTimerSecs]);

  // ── Pre-fill draft when active exercise changes ────────────────────────
  useEffect(() => {
    if (exercises.length === 0) return;
    const ex = exercises[activeExIdx];
    if (!ex) return;
    setDraftLoad(ex.estimatedLoadKg);
    setDraftReps(ex.reps);
    setDraftRpe(ex.rpeTarget);
    // Dismiss rest timer when moving to a new exercise
    setRestTimerSecs(null);
  }, [activeExIdx, exercises]);

  // ── Derived ────────────────────────────────────────────────────────────
  const activeExercise    = exercises[activeExIdx] ?? null;
  const activeExSets      = activeExercise
    ? setLogs.filter((sl) => sl.exerciseId === activeExercise.id)
    : [];
  const completedCount    = activeExIdx; // exercises before current are done
  const exerciseCount     = exercises.length;

  // ── Handlers ────────────────────────────────────────────────────────────

  /** Fire-and-forget set log — must respond < 50ms. */
  const logSet = useCallback(() => {
    if (!activeExercise) return;
    const load = draftLoadRef.current;
    const reps = draftRepsRef.current;
    const rpe  = draftRpeRef.current;
    const setNumber = setLogs.filter((sl) => sl.exerciseId === activeExercise.id).length + 1;

    // Validate user-supplied values before writing
    const validation = SetLogSchema.pick({ loadKg: true, reps: true, rpeLogged: true }).safeParse({
      loadKg:    load,
      reps,
      rpeLogged: rpe,
    });
    if (!validation.success) {
      toast(`Invalid set: ${validation.error.issues[0]?.message ?? 'check your inputs'}`, { duration: 2500 });
      return;
    }

    const newLog: SetLog = {
      id:         newId(),
      exerciseId: activeExercise.id,
      sessionId,
      setNumber,
      reps,
      loadKg:     load,
      rpeLogged:  rpe,
      loggedAt:   new Date().toISOString(),
    };

    // Fire-and-forget — never await during logging
    void db.sets.add(newLog);

    // Synchronous UI update
    setSetLogs((prev) => [...prev, newLog]);

    // ── Intra-session autoregulation ───────────────────────────────────
    // Compare logged RPE to target and suggest load adjustment for next set.
    const rpeTarget = activeExercise.rpeTarget;
    const rpeDiff = rpe - rpeTarget; // positive = overshooting, negative = undershooting

    if (Math.abs(rpeDiff) >= 1) {
      // Significant deviation — adjust load by 2.5 kg per 0.5 RPE difference
      const adjustment = -Math.round(rpeDiff / 0.5) * 2.5;
      const newLoad = Math.max(20, Math.round((load + adjustment) / 2.5) * 2.5);

      if (newLoad !== load) {
        setDraftLoad(newLoad);

        if (rpeDiff >= 1.5) {
          toast(`RPE ${rpe} vs target ${rpeTarget} — dropping to ${newLoad} kg. Don't grind.`, { duration: 3500 });
        } else if (rpeDiff >= 1) {
          toast(`Felt heavy — next set at ${newLoad} kg`, { duration: 2500 });
        } else if (rpeDiff <= -1.5) {
          toast(`Too easy — bumping to ${newLoad} kg`, { duration: 2500 });
        } else {
          toast(`Light for you — next set at ${newLoad} kg`, { duration: 2500 });
        }
      }
    }

    // Start rest timer (duration scaled by actual RPE, not target)
    const dur = rpe < 8 ? 180 : rpe < 9 ? 240 : 300;
    setRestTimerMax(dur);
    setRestTimerSecs(dur);
  }, [activeExercise, sessionId, setLogs]);

  const completeExercise = useCallback(() => {
    setRestTimerSecs(null);
    if (activeExIdx + 1 >= exerciseCount) {
      setPageState('complete');
    } else {
      setActiveExIdx((i) => i + 1);
    }
  }, [activeExIdx, exerciseCount]);

  const skipExercise = useCallback(() => {
    completeExercise();
  }, [completeExercise]);

  /** Open the edit sheet for a logged set. */
  const openEditSet = useCallback((sl: SetLog) => {
    setEditingSetId(sl.id);
    setEditLoad(sl.loadKg);
    setEditReps(sl.reps);
    setEditRpe(sl.rpeLogged ?? 0);
  }, []);

  /** Save edits to a logged set. */
  const saveEditSet = useCallback(() => {
    if (!editingSetId) return;
    const patch = { loadKg: editLoad, reps: editReps, rpeLogged: editRpe || undefined };
    void db.sets.update(editingSetId, patch);
    setSetLogs((prev) =>
      prev.map((sl) => (sl.id === editingSetId ? { ...sl, ...patch } : sl)),
    );
    setEditingSetId(null);
    toast('Set updated', { duration: 2000 });
  }, [editingSetId, editLoad, editReps, editRpe]);

  /** Delete a logged set. */
  const deleteEditSet = useCallback(() => {
    if (!editingSetId) return;
    void db.sets.delete(editingSetId);
    setSetLogs((prev) => prev.filter((sl) => sl.id !== editingSetId));
    setEditingSetId(null);
    toast('Set deleted', { duration: 2000 });
  }, [editingSetId]);

  /** Save & Exit: mark session as MODIFIED and navigate home. */
  const saveAndExit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await db.sessions.update(sessionId, { status: 'MODIFIED' });
      router.push('/home');
    } catch (err) {
      console.error('[Session] save & exit failed:', err);
      setSaving(false);
    }
  }, [saving, sessionId, router]);

  // Run auto-max detection when entering the complete state
  useEffect(() => {
    if (pageState === 'complete') {
      void detectAndSuggestMaxUpdate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState]);

  /** Open swap modal for an exercise in the overview list. */
  const openSwapModal = useCallback((ex: SessionExercise) => {
    const libEx = ex.libraryExerciseId
      ? EXERCISE_BY_ID.get(ex.libraryExerciseId)
      : undefined;
    if (!libEx) {
      toast('No library entry for this exercise — can\'t suggest swaps.', { duration: 3000 });
      return;
    }
    const profile = equipmentProfile;
    const avail = profile?.availableEquipment ?? ['BARBELL', 'DUMBBELL', 'BODYWEIGHT', 'CABLE', 'MACHINE'];
    const blockType = sessionBlock?.blockType ?? 'ACCUMULATION';
    const candidates = suggestSwaps(libEx, {
      blockType,
      availableEquipment: avail,
      wearingBelt:        profile?.hasBelt ?? false,
      wearingKneeSleeves: profile?.hasKneeSleeves ?? false,
      wearingWristWraps:  profile?.hasWristWraps ?? false,
      remainingSystemic:  180,
      remainingLocal:     220,
    });
    setSwapCandidates(candidates);
    setSwapForExId(ex.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentProfile, sessionBlock]);

  /** Replace an exercise with the chosen swap candidate. */
  const confirmSwap = useCallback(async (candidate: SwapCandidate) => {
    if (!swapForExId) return;
    const ex = exercises.find((e) => e.id === swapForExId);
    if (!ex) return;

    const adjustedLoad = Math.round(ex.estimatedLoadKg * candidate.loadAdjustmentFactor / 2.5) * 2.5;
    const updated: Partial<SessionExercise> = {
      name:              candidate.exercise.name,
      libraryExerciseId: candidate.exercise.id,
      estimatedLoadKg:   adjustedLoad,
    };

    await db.exercises.update(swapForExId, updated);
    setExercises((prev) =>
      prev.map((e) => e.id === swapForExId ? { ...e, ...updated } : e),
    );
    setSwapForExId(null);
    setSwapCandidates([]);
    toast(`Swapped to ${candidate.exercise.name}`, { duration: 2000 });
  }, [swapForExId, exercises]);

  const startSession = useCallback(() => {
    setSessionStartTime(new Date());
    setPageState('logging');
  }, []);

  const finishSession = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const note = sessionNote.trim();
      await db.sessions.update(sessionId, {
        status:      'COMPLETED',
        completedAt: new Date().toISOString(),
        ...(note ? { coachNote: note } : {}),
      });
      await checkOvershooter();

      // ── Advance cycle week ──────────────────────────────────────────
      if (session?.cycleId) {
        try {
          const result = await advanceCycleWeek(session.cycleId);
          if (result.completed) {
            toast('🏁 Training cycle complete! Time to plan the next one.', { duration: 5000 });
          } else if (result.newBlockType) {
            toast(`Week ${result.newWeek} — moving to ${result.newBlockType.charAt(0) + result.newBlockType.slice(1).toLowerCase()} block`, { duration: 4000 });
          }
        } catch (e) {
          console.error('[Session] advanceCycleWeek failed:', e);
        }
      }

      router.push('/home');
    } catch (err) {
      console.error('[Session] finish failed:', err);
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, sessionId, sessionNote, router, session]);

  async function checkOvershooter() {
    const compExercises = await db.exercises
      .filter((e) => e.exerciseType === 'COMPETITION')
      .toArray();
    if (compExercises.length === 0) return;

    const rpeTargetMap = new Map(compExercises.map((e) => [e.id, e.rpeTarget]));

    // Collect all sets for competition exercises (across all sessions)
    const competitionSets: SetLog[] = [];
    for (const ex of compExercises) {
      const exSets = await db.sets
        .where('exerciseId')
        .equals(ex.id)
        .filter((s) => s.rpeLogged !== undefined)
        .toArray();
      competitionSets.push(...exSets);
    }

    const last20 = competitionSets
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
      .slice(0, 20);

    if (last20.length < 5) return; // insufficient data

    const overshootCount = last20.filter((s) => {
      const target = rpeTargetMap.get(s.exerciseId);
      return (
        target !== undefined &&
        s.rpeLogged !== undefined &&
        s.rpeLogged - target > 1.0
      );
    }).length;

    if (overshootCount / last20.length > 0.4) {
      void db.profile.update('me', {
        overshooter: true,
        updatedAt:   new Date().toISOString(),
      });
      toast(
        "Heads up — we noticed you're going harder than prescribed. Your coach will adjust future sessions.",
        { duration: 6000 },
      );
    }
  }

  /**
   * Check recent competition-lift sets and suggest a max update if the
   * athlete's estimated 1RM has drifted >3% above their stored max.
   */
  async function detectAndSuggestMaxUpdate() {
    if (!session) return;
    const profile = await db.profile.get('me');
    if (!profile) return;

    const liftField = session.primaryLift as 'SQUAT' | 'BENCH' | 'DEADLIFT';
    if (!['SQUAT', 'BENCH', 'DEADLIFT'].includes(liftField)) return;

    const maxKey = `max${liftField.charAt(0) + liftField.slice(1).toLowerCase()}` as
      'maxSquat' | 'maxBench' | 'maxDeadlift';
    const currentMax = profile[maxKey];
    if (!currentMax || currentMax <= 0) return;

    // Gather recent sets for competition exercises across last 2 weeks
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const cutoff = twoWeeksAgo.toISOString();

    const recentCompExercises = await db.exercises
      .where('sessionId')
      .anyOf(
        (await db.sessions
          .where('cycleId')
          .equals(session.cycleId)
          .toArray()
        ).map((s) => s.id),
      )
      .filter((e) => e.exerciseType === 'COMPETITION')
      .toArray();

    const recentSets: Array<{ loadKg: number; reps: number; rpeLogged?: number }> = [];
    for (const ex of recentCompExercises) {
      const sets = await db.sets
        .where('exerciseId')
        .equals(ex.id)
        .filter((s) => s.loggedAt >= cutoff)
        .toArray();
      recentSets.push(...sets.map((s) => ({
        loadKg: s.loadKg,
        reps: s.reps,
        rpeLogged: s.rpeLogged,
      })));
    }

    const suggestion = detectMaxUpdate(liftField, currentMax, recentSets);
    if (suggestion) {
      setMaxSuggestion(suggestion);
    }
  }

  // ── Parse AI modifications ────────────────────────────────────────────
  const modifications: string[] = (() => {
    if (!session?.aiModifications) return [];
    try   { return JSON.parse(session.aiModifications) as string[]; }
    catch { return []; }
  })();

  // ── Parse session-review issues ────────────────────────────────────────
  const reviewIssues = (() => {
    const raw = (session as unknown as { reviewIssues?: string } | null)?.reviewIssues;
    return unpackReviewIssues(raw);
  })();

  // ─────────────────────────────────────────────────────────────────────
  // Render: Loading
  // ─────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: C.bg }}
      >
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render: Session not found
  // ─────────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
        style={{ backgroundColor: C.bg, color: C.text }}
      >
        <p className="text-xl font-bold">Session not found</p>
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: C.accent, color: C.text }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render: OVERVIEW state
  // ─────────────────────────────────────────────────────────────────────
  if (pageState === 'overview') {
    const rdLabel =
      todayReadiness !== undefined ? readinessLabel(todayReadiness) : null;

    return (
      <div
        className="min-h-screen pb-8"
        style={{ backgroundColor: C.bg, color: C.text }}
      >
        <div className="max-w-lg mx-auto px-4">

          {/* Header */}
          <div className="pt-8 pb-4 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                Today&apos;s Session
              </p>
              <h1 className="text-2xl font-bold tracking-tight">
                {session.sessionType} SESSION
                {' '}&mdash;{' '}
                {session.primaryLift}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => {
                const qs = new URLSearchParams({
                  lift: session.primaryLift,
                  session_id: session.id,
                });
                router.push(`/form-check?${qs.toString()}`);
              }}
              className="mt-1 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
              aria-label="Record form check"
            >
              🎥 Form check
            </button>
          </div>

          {/* Review banner — surfaces what the session-review engine caught */}
          {reviewIssues.length > 0 && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: reviewIssues.some((i) => i.severity === 'BLOCK')
                  ? `${C.gold}18`
                  : `${C.blue}14`,
                border: `1px solid ${reviewIssues.some((i) => i.severity === 'BLOCK') ? C.gold : C.blue}`,
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-2"
                style={{
                  color: reviewIssues.some((i) => i.severity === 'BLOCK') ? C.gold : C.blue,
                }}
              >
                ✓ Session reviewed
              </p>
              <ul className="space-y-1.5">
                {reviewIssues.map((issue, i) => (
                  <li key={i} className="text-xs" style={{ color: C.text }}>
                    <span style={{
                      color: issue.severity === 'BLOCK' ? C.gold : issue.severity === 'WARN' ? C.accent : C.muted,
                    }}>
                      {issue.severity === 'BLOCK' ? '✦' : issue.severity === 'WARN' ? '⚠' : '•'}
                    </span>
                    {' '}
                    {issue.summary}
                    {issue.fix && (
                      <span style={{ color: C.muted }}> — {issue.fix}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI modifications banner */}
          {modifications.length > 0 && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: 'rgba(233,69,96,0.12)', border: `1px solid ${C.accent}` }}
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowModifications((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setShowModifications((v) => !v)}
              >
                <p className="text-sm font-semibold" style={{ color: C.accent }}>
                  ✦ Session adjusted based on your readiness
                </p>
                <span style={{ color: C.accent }}>{showModifications ? '▲' : '▼'}</span>
              </div>
              {showModifications && (
                <ul className="mt-3 space-y-1">
                  {modifications.map((m, i) => (
                    <li key={i} className="text-xs" style={{ color: C.muted }}>
                      • {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Readiness badge */}
          {rdLabel && todayReadiness !== undefined && (
            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between"
              style={{ backgroundColor: C.surface }}
            >
              <span className="text-sm" style={{ color: C.muted }}>Readiness today</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold" style={{ color: rdLabel.colour }}>
                  {todayReadiness}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${rdLabel.colour}22`, color: rdLabel.colour }}
                >
                  {rdLabel.label}
                </span>
              </div>
            </div>
          )}

          {/* Coach note */}
          {session.coachNote && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: C.surface,
                border:          `1px solid ${C.gold}`,
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.gold }}>
                Coach Note
              </p>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                {session.coachNote}
              </p>
            </div>
          )}

          {/* Exercise list */}
          <div className="flex flex-col gap-3 mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
              Exercises ({exercises.length})
            </p>
            {exercises.length === 0 ? (
              <div
                className="rounded-xl p-6 text-center"
                style={{ backgroundColor: C.surface }}
              >
                <p className="text-sm" style={{ color: C.muted }}>
                  No exercises found. Complete check-in first to generate your session.
                </p>
              </div>
            ) : (
              exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: C.surface }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-base" style={{ color: C.text }}>
                      {ex.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <ExerciseBadge type={ex.exerciseType} />
                      {ex.libraryExerciseId && (
                        <button
                          type="button"
                          onClick={() => openSwapModal(ex)}
                          className="text-xs px-2 py-0.5 rounded-full transition-colors active:opacity-70"
                          style={{ backgroundColor: 'rgba(245,166,35,0.15)', color: C.gold }}
                        >
                          Swap ↕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm" style={{ color: C.muted }}>
                      {ex.sets} × {ex.reps} @ RPE {ex.rpeTarget}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.dim, color: C.muted }}>
                      ~{ex.estimatedLoadKg} kg
                    </span>
                    {ex.tempo && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${C.accent}20`, color: C.accent }}
                        title="Eccentric-Pause-Concentric tempo (seconds)"
                      >
                        Tempo {ex.tempo}
                      </span>
                    )}
                    <span className="text-xs capitalize" style={{ color: C.muted }}>
                      {ex.setStructure.toLowerCase()} sets
                    </span>
                  </div>
                  {ex.notes && (
                    <p className="text-xs mt-2 italic" style={{ color: C.muted }}>
                      {ex.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Gear chips — tap to toggle. Persisted back to the profile. */}
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.muted }}>
              Gear today
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['belt',       'Belt',       '🔒'],
                ['sleeves',    'Sleeves',    '🦵'],
                ['chalk',      'Chalk',      '🧂'],
                ['wristWraps', 'Wrist wraps','🤚'],
                ['kneeWraps',  'Knee wraps', '🎗️'],
              ] as const).map(([key, label, icon]) => {
                const on = gear[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={async () => {
                      const next: GearConfig = { ...gear, [key]: !on };
                      setGear(next);
                      await db.profile.update('me', {
                        defaultGear: next,
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
                    style={{
                      backgroundColor: on ? `${C.accent}20` : C.dim,
                      color:           on ? C.accent : C.muted,
                      border:          `1px solid ${on ? C.accent : C.border}`,
                    }}
                    aria-pressed={on}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    {!on && <span>off</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: C.muted }}>
              Tap to flip. Defaults carry over; turn off for raw work.
            </p>
          </div>

          {/* Start Session CTA */}
          <button
            type="button"
            onClick={startSession}
            disabled={exercises.length === 0}
            className="w-full py-5 rounded-2xl text-lg font-bold tracking-wide transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: C.accent, color: C.text }}
          >
            Start Session
          </button>
        </div>

        {/* ── Swap Modal ────────────────────────────────────────────────── */}
        {swapForExId && (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => { setSwapForExId(null); setSwapCandidates([]); }}
            role="dialog"
            aria-modal="true"
            aria-label="Exercise swap suggestions"
          >
            <div
              className="rounded-t-3xl max-h-[80vh] overflow-y-auto pb-10"
              style={{ backgroundColor: C.surface }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 px-5 pt-5 pb-3" style={{ backgroundColor: C.surface }}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold" style={{ color: C.text }}>
                    Swap Exercise
                  </h2>
                  <button
                    type="button"
                    onClick={() => { setSwapForExId(null); setSwapCandidates([]); }}
                    className="text-sm px-3 py-1 rounded-lg"
                    style={{ color: C.muted, backgroundColor: C.dim }}
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs" style={{ color: C.muted }}>
                  Ranked by movement pattern, muscles, fatigue load, and available equipment
                </p>
              </div>

              {swapCandidates.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm" style={{ color: C.muted }}>
                    No good swaps found in the library for this exercise.
                  </p>
                </div>
              ) : (
                <div className="px-4 space-y-3">
                  {swapCandidates.map((c) => (
                    <button
                      key={c.exercise.id}
                      type="button"
                      onClick={() => void confirmSwap(c)}
                      className="w-full text-left rounded-xl p-4 transition-colors active:opacity-70"
                      style={{ backgroundColor: C.bg, border: `1px solid ${C.dim}` }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-sm" style={{ color: C.text }}>
                          {c.exercise.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.requiresEquipmentChange && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(217,119,6,0.2)', color: C.amber }}>
                              gear needed
                            </span>
                          )}
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: c.score >= 70 ? 'rgba(72,199,142,0.2)' : 'rgba(154,160,180,0.15)',
                              color: c.score >= 70 ? C.greenDeep : C.muted,
                            }}
                          >
                            {c.score}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                        {c.reason}
                      </p>
                      {c.loadAdjustmentFactor < 1 && (
                        <p className="text-xs mt-1 font-medium" style={{ color: C.gold }}>
                          Start at ~{Math.round(c.loadAdjustmentFactor * 100)}% of original load
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render: LOGGING state
  // ─────────────────────────────────────────────────────────────────────
  if (pageState === 'logging') {
    const isLastExercise = activeExIdx >= exerciseCount - 1;

    return (
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: '100dvh', backgroundColor: C.bg, color: C.text }}
      >
        {/* ── Rest Timer overlay ──────────────────────────────────────── */}
        {restTimerSecs !== null && restTimerSecs > 0 && (
          <RestTimerOverlay
            secsRemaining={restTimerSecs}
            maxSecs={restTimerMax}
            onSkip={() => setRestTimerSecs(null)}
          />
        )}

        {/* ── TOP BAR ─────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-4 pt-10 pb-3 border-b"
          style={{ borderColor: C.dim }}
        >
          {/* Exercise name + progress */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="text-xl font-bold leading-tight flex-1" style={{ color: C.text }}>
              {activeExercise?.name ?? '—'}
            </h2>
            <span
              className="text-sm font-semibold shrink-0 px-3 py-1 rounded-full"
              style={{ backgroundColor: C.dim, color: C.muted }}
            >
              {completedCount}/{exerciseCount}
            </span>
          </div>

          {/* Prescription */}
          {activeExercise && (
            <p className="text-sm" style={{ color: C.muted }}>
              {activeExercise.sets} sets × {activeExercise.reps} reps
              {' '}@ RPE {activeExercise.rpeTarget}
              {' '}&mdash;{' '}
              ~{activeExercise.estimatedLoadKg} kg
            </p>
          )}
        </div>

        {/* ── SCROLLABLE SET LOG ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {activeExSets.length === 0 ? (
            <p className="text-center text-sm pt-6" style={{ color: C.muted }}>
              No sets logged yet — let&apos;s go.
            </p>
          ) : (
            activeExSets.map((sl) => (
              <SetLogRow
                key={sl.id}
                setLog={sl}
                rpeTarget={activeExercise?.rpeTarget ?? 8}
                onTap={() => openEditSet(sl)}
              />
            ))
          )}
        </div>

        {/* ── FIXED BOTTOM PANEL ──────────────────────────────────────── */}
        <div
          className="flex-shrink-0 border-t px-4 pt-3 pb-6 space-y-3"
          style={{ backgroundColor: C.surface, borderColor: C.dim }}
        >
          {/* ROW 1: Load input ± 2.5 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftLoad((v) => Math.max(0, Math.round((v - 2.5) * 10) / 10))}
              className="w-14 h-14 rounded-xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text }}
              aria-label="Decrease load by 2.5 kg"
            >
              −
            </button>

            <div className="flex-1 relative">
              <input
                type="number"
                value={draftLoad}
                onChange={(e) => setDraftLoad(parseFloat(e.target.value) || 0)}
                className="w-full text-center text-3xl font-bold rounded-xl h-14 bg-transparent border outline-none"
                style={{ borderColor: C.accent, color: C.text }}
                aria-label="Load in kilograms"
                inputMode="decimal"
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                style={{ color: C.muted }}
              >
                kg
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDraftLoad((v) => Math.round((v + 2.5) * 10) / 10)}
              className="w-14 h-14 rounded-xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text }}
              aria-label="Increase load by 2.5 kg"
            >
              +
            </button>
          </div>

          {/* ROW 2: Reps stepper */}
          <div className="flex items-center gap-3">
            <span className="w-14 text-sm text-right" style={{ color: C.muted }}>
              Reps
            </span>
            <button
              type="button"
              onClick={() => setDraftReps((v) => Math.max(1, v - 1))}
              className="w-14 h-12 rounded-xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text }}
              aria-label="Decrease reps"
            >
              −
            </button>
            <div
              className="flex-1 h-12 flex items-center justify-center rounded-xl text-2xl font-bold"
              style={{ backgroundColor: C.bg, color: C.text }}
            >
              {draftReps}
            </div>
            <button
              type="button"
              onClick={() => setDraftReps((v) => v + 1)}
              className="w-14 h-12 rounded-xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text }}
              aria-label="Increase reps"
            >
              +
            </button>
          </div>

          {/* ROW 3: RPE slider */}
          <div className="flex items-center gap-3">
            <span className="w-14 text-sm text-right shrink-0" style={{ color: C.muted }}>
              RPE
            </span>
            <input
              type="range"
              min={6}
              max={10}
              step={0.5}
              value={draftRpe}
              onChange={(e) => setDraftRpe(parseFloat(e.target.value))}
              className="flex-1 h-10 cursor-pointer"
              style={{ accentColor: C.accent }}
              aria-label="RPE target"
            />
            <div
              className="w-14 h-12 flex items-center justify-center rounded-xl text-xl font-bold shrink-0"
              style={{ backgroundColor: C.bg, color: C.gold }}
            >
              {draftRpe}
            </div>
          </div>

          {/* RPE deviation feedback — shows after first set if deviating from target */}
          {activeExSets.length > 0 && (() => {
            const loggedRpes = activeExSets
              .filter((s) => s.rpeLogged !== undefined)
              .map((s) => s.rpeLogged as number);
            if (loggedRpes.length === 0) return null;
            const avgRpe = loggedRpes.reduce((a, b) => a + b, 0) / loggedRpes.length;
            const diff = avgRpe - (activeExercise?.rpeTarget ?? 8);
            if (Math.abs(diff) < 0.75) return null;
            const isOver = diff > 0;
            return (
              <div
                className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2"
                style={{
                  backgroundColor: isOver ? 'rgba(233,69,96,0.12)' : 'rgba(245,166,35,0.12)',
                  color: isOver ? C.accent : C.gold,
                }}
              >
                <span>{isOver ? '▲' : '▼'}</span>
                <span>
                  {isOver
                    ? `Averaging RPE ${avgRpe.toFixed(1)} vs target ${activeExercise?.rpeTarget} — consider dropping weight`
                    : `Averaging RPE ${avgRpe.toFixed(1)} vs target ${activeExercise?.rpeTarget} — you can push harder`}
                </span>
              </div>
            );
          })()}

          {/* Log Set button */}
          <button
            type="button"
            onClick={logSet}
            className="w-full h-14 rounded-2xl text-lg font-bold tracking-wide active:scale-[0.97] transition-transform"
            style={{ backgroundColor: C.accent, color: C.text }}
          >
            Log Set
          </button>

          {/* Exercise navigation */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={skipExercise}
              className="text-sm active:opacity-60"
              style={{ color: C.muted }}
            >
              Skip exercise
            </button>

            <button
              type="button"
              onClick={isLastExercise ? () => setPageState('complete') : completeExercise}
              className="px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text }}
            >
              {isLastExercise ? 'Finish Session' : 'Done with exercise →'}
            </button>
          </div>

          {/* Save & Exit */}
          <button
            type="button"
            onClick={() => void saveAndExit()}
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all mt-1 disabled:opacity-50"
            style={{ backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.dim}` }}
          >
            {saving ? 'Saving…' : 'Save & Exit'}
          </button>
        </div>

        {/* ── Edit Set Overlay ────────────────────────────────────────────── */}
        {editingSetId && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit set"
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: 'rgba(26,26,46,0.85)' }}
            onClick={() => setEditingSetId(null)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl p-5 space-y-4"
              style={{ backgroundColor: C.surface }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold" style={{ color: C.text }}>Edit Set</h3>

              {/* Load */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold block mb-1" style={{ color: C.muted }}>
                  Load (kg)
                </label>
                <input
                  type="number"
                  value={editLoad}
                  onChange={(e) => setEditLoad(Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
                  style={{ borderColor: C.dim, color: C.text }}
                  step={2.5}
                  min={0}
                />
              </div>

              {/* Reps */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold block mb-1" style={{ color: C.muted }}>
                  Reps
                </label>
                <input
                  type="number"
                  value={editReps}
                  onChange={(e) => setEditReps(Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
                  style={{ borderColor: C.dim, color: C.text }}
                  min={1}
                  max={30}
                />
              </div>

              {/* RPE */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold block mb-1" style={{ color: C.muted }}>
                  RPE
                </label>
                <input
                  type="number"
                  value={editRpe}
                  onChange={(e) => setEditRpe(Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
                  style={{ borderColor: C.dim, color: C.text }}
                  step={0.5}
                  min={0}
                  max={10}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={saveEditSet}
                  className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: C.accent, color: C.text }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={deleteEditSet}
                  className="py-3 px-5 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: 'rgba(153,27,27,0.3)', color: C.accent }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render: COMPLETE state
  // ─────────────────────────────────────────────────────────────────────

  const totalVolume  = setLogs.reduce((sum, sl) => sum + sl.loadKg * sl.reps, 0);
  const loggedRpes   = setLogs.filter((sl) => sl.rpeLogged !== undefined).map((sl) => sl.rpeLogged as number);
  const avgLoggedRpe = loggedRpes.length > 0
    ? loggedRpes.reduce((a, b) => a + b, 0) / loggedRpes.length
    : null;
  const avgPlannedRpe = exercises.length > 0
    ? exercises.reduce((sum, ex) => sum + ex.rpeTarget, 0) / exercises.length
    : 0;
  const setsCompleted = setLogs.length;
  const setsPlanned   = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const durationMins  = sessionStartTime
    ? Math.max(1, Math.floor((Date.now() - sessionStartTime.getTime()) / 60000))
    : 0;

  function getRpeAccuracy(): { message: string; colour: string } {
    if (avgLoggedRpe === null) return { message: 'No RPE data logged.', colour: C.muted };
    const diff = avgLoggedRpe - avgPlannedRpe;
    if (diff > 1)             return { message: 'You went harder than planned today.', colour: C.accent };
    if (Math.abs(diff) <= 0.5)return { message: 'Great RPE accuracy today! 🎯',        colour: C.green  };
    if (diff < -1)            return { message: 'Conservative session — consider going harder next time.', colour: C.gold };
    return { message: 'Good session. Keep dialling in the RPE.', colour: C.muted };
  }
  const { message: rpeMsg, colour: rpeColour } = getRpeAccuracy();

  return (
    <div
      className="min-h-screen pb-12 animate-fade-in"
      style={{ backgroundColor: C.bg, color: C.text }}
    >
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="pt-12 pb-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"
            style={{ backgroundColor: `${C.green}22`, border: `2px solid ${C.green}` }}
          >
            ✓
          </div>
          <h1 className="text-2xl font-bold">Session Complete</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats grid */}
        <div
          className="rounded-2xl p-5 mb-4 grid grid-cols-2 gap-4"
          style={{ backgroundColor: C.surface }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>Total Volume</p>
            <p className="text-xl font-bold" style={{ color: C.text }}>
              {totalVolume >= 1000
                ? `${(totalVolume / 1000).toFixed(1)}t`
                : `${Math.round(totalVolume)} kg`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>Duration</p>
            <p className="text-xl font-bold" style={{ color: C.text }}>{durationMins} min</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>Sets</p>
            <p className="text-xl font-bold" style={{ color: C.text }}>
              {setsCompleted}
              <span className="text-sm font-normal" style={{ color: C.muted }}> / {setsPlanned} planned</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>Avg RPE</p>
            <p className="text-xl font-bold" style={{ color: C.text }}>
              {avgLoggedRpe !== null ? avgLoggedRpe.toFixed(1) : '—'}
              <span className="text-sm font-normal" style={{ color: C.muted }}>
                {' '}/ {avgPlannedRpe.toFixed(1)} target
              </span>
            </p>
          </div>
        </div>

        {/* RPE accuracy */}
        <div
          className="rounded-xl px-5 py-4 mb-4"
          style={{ backgroundColor: `${rpeColour}15`, border: `1px solid ${rpeColour}` }}
        >
          <p className="text-sm font-semibold" style={{ color: rpeColour }}>
            {rpeMsg}
          </p>
        </div>

        {/* Max update suggestion */}
        {maxSuggestion && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: `${C.gold}15`, border: `1px solid ${C.gold}` }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.gold }}>
              Max Update Suggested
            </p>
            <p className="text-sm mb-1" style={{ color: C.text }}>
              Your recent training suggests a <strong>{maxSuggestion.lift.toLowerCase()}</strong> max of{' '}
              <strong>{maxSuggestion.suggestedMax} kg</strong>{' '}
              <span style={{ color: C.muted }}>(currently {maxSuggestion.currentMax} kg)</span>
            </p>
            <p className="text-xs mb-3" style={{ color: C.muted }}>
              {maxSuggestion.evidence}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ backgroundColor: C.gold, color: C.bg }}
                onClick={() => {
                  const key = `max${maxSuggestion.lift.charAt(0) + maxSuggestion.lift.slice(1).toLowerCase()}` as
                    'maxSquat' | 'maxBench' | 'maxDeadlift';
                  void db.profile.update('me', {
                    [key]: maxSuggestion.suggestedMax,
                    updatedAt: new Date().toISOString(),
                  } as Partial<AthleteProfile>);
                  toast(`${maxSuggestion.lift.toLowerCase()} max updated to ${maxSuggestion.suggestedMax} kg`, { duration: 3000 });
                  setMaxSuggestion(null);
                }}
              >
                Accept
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ backgroundColor: C.surface, color: C.muted, border: `1px solid ${C.dim}` }}
                onClick={() => setMaxSuggestion(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Session note */}
        <div
          className="rounded-xl p-4 mb-6"
          style={{ backgroundColor: C.surface }}
        >
          <label htmlFor="session-notes" className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: C.muted }}>
            Session Notes (optional)
          </label>
          <textarea
            id="session-notes"
            value={sessionNote}
            onChange={(e) => setSessionNote(e.target.value)}
            placeholder="How did it feel? Anything to flag for next time?"
            rows={3}
            className="w-full bg-transparent rounded-lg border px-3 py-2 text-sm resize-none outline-none transition-colors"
            style={{
              borderColor: sessionNote ? C.accent : C.dim,
              color:       C.text,
            }}
          />
        </div>

        {/* Done button */}
        <button
          type="button"
          onClick={() => void finishSession()}
          disabled={saving}
          className="w-full py-5 rounded-2xl text-lg font-bold tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: C.accent, color: C.text }}
        >
          {saving ? 'Saving…' : 'Done — Back to Home'}
        </button>

      </div>
    </div>
  );
}
