'use client';

/**
 * Recover Stranded Workouts — /recover
 *
 * Surfaces any session whose scheduledDate is in the past but whose status is
 * still SCHEDULED or MODIFIED — i.e. the athlete logged sets but never tapped
 * "End Workout". Lets them:
 *   • Inspect what was already logged for each exercise
 *   • Add missing sets manually (load / reps / RPE / outcome)
 *   • Mark the session COMPLETED with a backdated completedAt timestamp
 *   • Mark the session SKIPPED if it never happened
 */

import { useMemo, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, Plus, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { db, today, newId } from '@/lib/db/database';
import { SetLogSchema } from '@/lib/db/schemas';
import { C } from '@/lib/theme';
import type {
  TrainingSession,
  SessionExercise,
  SetLog,
  SetOutcome,
} from '@/lib/db/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Combine a YYYY-MM-DD date with local noon → ISO string. */
function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

function formatDate(date: string): string {
  // YYYY-MM-DD → "Mon Apr 22"
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  });
}

function daysSince(date: string): number {
  const a = new Date(`${date}T12:00:00`).getTime();
  const b = new Date(`${today()}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ── Set entry form ──────────────────────────────────────────────────────────

interface AddSetFormProps {
  exercise: SessionExercise;
  existingCount: number;
  defaultLoadKg: number;
  defaultDate: string;
  onAdded: () => void;
  onCancel: () => void;
}

function AddSetForm({
  exercise,
  existingCount,
  defaultLoadKg,
  defaultDate,
  onAdded,
  onCancel,
}: AddSetFormProps) {
  const [load,    setLoad]    = useState<string>(String(defaultLoadKg || exercise.estimatedLoadKg || 0));
  const [reps,    setReps]    = useState<string>(String(exercise.reps || ''));
  const [rpe,     setRpe]     = useState<string>(String(exercise.rpeTarget || 8));
  const [outcome, setOutcome] = useState<SetOutcome>('COMPLETE');
  const [saving,  setSaving]  = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const loadNum = parseFloat(load);
    const repsNum = parseInt(reps, 10);
    const rpeNum  = parseFloat(rpe);

    const finalReps = outcome === 'MISS' ? 0 : repsNum;
    const finalRpe  = outcome === 'COMPLETE' ? rpeNum : 10;

    const candidate = {
      id:         newId(),
      exerciseId: exercise.id,
      sessionId:  exercise.sessionId,
      setNumber:  existingCount + 1,
      reps:       finalReps,
      loadKg:     loadNum,
      rpeLogged:  finalRpe,
      loggedAt:   localNoonIso(defaultDate),
      ...(outcome !== 'COMPLETE' ? { outcome } : {}),
    };

    const validation = SetLogSchema.safeParse(candidate);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? 'Invalid set');
      return;
    }

    setSaving(true);
    try {
      await db.sets.add(validation.data);
      // Bump session to MODIFIED so it's clear it was edited post hoc.
      await db.sessions.update(exercise.sessionId, { status: 'MODIFIED' });
      toast(`Set ${candidate.setNumber} added.`, { duration: 1500 });
      onAdded();
    } catch (e) {
      console.error('[recover] add set failed', e);
      toast.error('Could not add set.');
      setSaving(false);
    }
  }, [saving, load, reps, rpe, outcome, exercise, existingCount, defaultDate, onAdded]);

  const inputStyle: React.CSSProperties = {
    backgroundColor:    C.bg,
    borderColor:        C.border,
    color:              C.text,
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div
      className="rounded-xl p-3 mt-2"
      style={{ backgroundColor: C.dim, border: `1px dashed ${C.border}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
          Add set #{existingCount + 1}
        </span>
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="p-1 rounded-lg active:scale-95"
          style={{ color: C.muted }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Load (kg)</span>
          <input
            type="number"
            inputMode="decimal"
            step={2.5}
            min={0}
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm font-bold outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Reps</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm font-bold outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>RPE</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.5}
            min={5}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
            disabled={outcome !== 'COMPLETE'}
            className="rounded-lg border px-2 py-1.5 text-sm font-bold outline-none disabled:opacity-50"
            style={inputStyle}
          />
        </label>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {(['COMPLETE', 'PARTIAL', 'MISS'] as const).map((o) => {
          const active = outcome === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: active ? C.accent : C.bg,
                color:           active ? C.bg : C.muted,
                border:          `1px solid ${active ? C.accent : C.border}`,
              }}
            >
              {o === 'COMPLETE' ? 'Done' : o === 'PARTIAL' ? 'Partial' : 'Bail'}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: C.accent, color: C.bg }}
      >
        {saving ? 'Saving…' : 'Add set'}
      </button>
    </div>
  );
}

// ── Per-exercise block ──────────────────────────────────────────────────────

interface ExerciseRowProps {
  exercise: SessionExercise;
  sets:     SetLog[];
  date:     string;
}

function ExerciseRow({ exercise, sets, date }: ExerciseRowProps) {
  const [adding, setAdding] = useState(false);

  const ordered = useMemo(
    () => [...sets].sort((a, b) => a.setNumber - b.setNumber),
    [sets],
  );

  const handleDelete = useCallback(async (set: SetLog) => {
    if (!window.confirm(`Delete set ${set.setNumber}? This can't be undone.`)) return;
    try {
      await db.sets.delete(set.id);
      toast('Set removed.', { duration: 1500 });
    } catch {
      toast.error('Delete failed.');
    }
  }, []);

  const lastLoad = ordered.length > 0 ? ordered[ordered.length - 1].loadKg : 0;

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
            {exercise.name}
          </p>
          <p className="text-[11px]" style={{ color: C.muted }}>
            Target: {exercise.sets} × {exercise.reps} @ RPE {exercise.rpeTarget}
            {exercise.estimatedLoadKg > 0 ? ` · ~${exercise.estimatedLoadKg} kg` : ''}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
          style={{
            backgroundColor: ordered.length >= exercise.sets ? C.greenDim : C.dim,
            color:           ordered.length >= exercise.sets ? C.green : C.muted,
          }}
        >
          {ordered.length}/{exercise.sets} logged
        </span>
      </div>

      {ordered.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ backgroundColor: C.dim, color: C.muted }}>
                <th className="text-left px-2 py-1 font-medium">#</th>
                <th className="text-right px-2 py-1 font-medium">kg</th>
                <th className="text-right px-2 py-1 font-medium">reps</th>
                <th className="text-right px-2 py-1 font-medium">RPE</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.id} style={{ color: C.text, borderTop: `1px solid ${C.border}` }}>
                  <td className="px-2 py-1.5">{s.setNumber}</td>
                  <td className="text-right px-2 py-1.5">{s.loadKg}</td>
                  <td className="text-right px-2 py-1.5">
                    {s.reps}
                    {s.outcome === 'PARTIAL' && <span style={{ color: C.gold }}> *</span>}
                    {s.outcome === 'MISS'    && <span style={{ color: C.red }}> ✗</span>}
                  </td>
                  <td className="text-right px-2 py-1.5">{s.rpeLogged ?? '—'}</td>
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      aria-label={`Delete set ${s.setNumber}`}
                      onClick={() => void handleDelete(s)}
                      className="p-1 rounded active:scale-95"
                      style={{ color: C.muted }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <AddSetForm
          exercise={exercise}
          existingCount={ordered.length}
          defaultLoadKg={lastLoad}
          defaultDate={date}
          onAdded={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
          style={{ backgroundColor: C.dim, color: C.text, border: `1px dashed ${C.border}` }}
        >
          <Plus size={12} />
          Add set
        </button>
      )}
    </div>
  );
}

// ── Per-session card ────────────────────────────────────────────────────────

interface SessionCardProps {
  session:   TrainingSession;
  exercises: SessionExercise[];
  sets:      SetLog[];
}

function SessionCard({ session, exercises, sets }: SessionCardProps) {
  const [open,         setOpen]         = useState(false);
  const [completedAt,  setCompletedAt]  = useState(session.scheduledDate);
  const [busy,         setBusy]         = useState(false);

  const orderedExercises = useMemo(
    () => [...exercises].sort((a, b) => a.order - b.order),
    [exercises],
  );

  const totalSetsLogged = sets.length;
  const totalSetsTarget = exercises.reduce((acc, ex) => acc + ex.sets, 0);

  const handleMarkComplete = useCallback(async () => {
    if (busy) return;
    if (totalSetsLogged === 0) {
      const ok = window.confirm(
        'No sets are logged for this session. Mark it complete anyway?',
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await db.sessions.update(session.id, {
        status:      'COMPLETED',
        completedAt: localNoonIso(completedAt),
      });
      toast.success('Workout recovered. Nice catch.', { duration: 2500 });
    } catch (e) {
      console.error('[recover] mark complete failed', e);
      toast.error('Could not mark complete.');
    } finally {
      setBusy(false);
    }
  }, [busy, totalSetsLogged, session.id, completedAt]);

  const handleSkip = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(
      'Mark as SKIPPED? Logged sets stay in the database but the session won\'t count toward your training.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await db.sessions.update(session.id, { status: 'SKIPPED' });
      toast('Marked skipped.', { duration: 1500 });
    } catch {
      toast.error('Update failed.');
    } finally {
      setBusy(false);
    }
  }, [busy, session.id]);

  const exerciseSetsByExId = useMemo(() => {
    const map = new Map<string, SetLog[]>();
    for (const s of sets) {
      const arr = map.get(s.exerciseId) ?? [];
      arr.push(s);
      map.set(s.exerciseId, arr);
    }
    return map;
  }, [sets]);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:scale-[0.99] transition-transform"
      >
        <span style={{ color: C.muted }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: C.text }}>
            {formatDate(session.scheduledDate)}
            <span className="ml-2 text-xs font-normal" style={{ color: C.muted }}>
              {daysSince(session.scheduledDate)}d ago
            </span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            {session.primaryLift} · {session.sessionType.toLowerCase()} ·{' '}
            {totalSetsLogged}/{totalSetsTarget} sets
          </p>
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md"
          style={{
            backgroundColor: session.status === 'MODIFIED' ? C.yellowDim : C.dim,
            color:           session.status === 'MODIFIED' ? C.gold : C.muted,
          }}
        >
          {session.status}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3">
          {orderedExercises.length === 0 ? (
            <p className="text-xs italic" style={{ color: C.muted }}>
              No exercises were generated for this session.
            </p>
          ) : (
            orderedExercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                sets={exerciseSetsByExId.get(ex.id) ?? []}
                date={session.scheduledDate}
              />
            ))
          )}

          <div
            className="rounded-xl p-3 mt-1"
            style={{ backgroundColor: C.dim, border: `1px solid ${C.border}` }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
              Mark complete
            </p>
            <label className="flex items-center gap-2 mb-3">
              <span className="text-xs" style={{ color: C.muted }}>Completed on</span>
              <input
                type="date"
                value={completedAt}
                max={today()}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="rounded-lg border px-2 py-1 text-xs outline-none"
                style={{
                  backgroundColor: C.bg,
                  borderColor:     C.border,
                  color:           C.text,
                  colorScheme:     'dark',
                }}
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleMarkComplete()}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: C.accent, color: C.bg }}
              >
                <Check size={14} />
                Mark complete
              </button>
              <button
                type="button"
                onClick={() => void handleSkip()}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: C.bg, color: C.muted, border: `1px solid ${C.border}` }}
              >
                Skip instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function RecoverPage() {
  const router = useRouter();

  const stranded = useLiveQuery(async () => {
    const todayStr = today();
    const sessions = await db.sessions
      .filter(
        (s) =>
          (s.status === 'SCHEDULED' || s.status === 'MODIFIED') &&
          s.scheduledDate < todayStr,
      )
      .toArray();

    sessions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      return { sessions, exercisesBySession: new Map(), setsBySession: new Map() };
    }

    const [allExercises, allSets] = await Promise.all([
      db.exercises.where('sessionId').anyOf(sessionIds).toArray(),
      db.sets.where('sessionId').anyOf(sessionIds).toArray(),
    ]);

    const exercisesBySession = new Map<string, SessionExercise[]>();
    for (const ex of allExercises) {
      const arr = exercisesBySession.get(ex.sessionId) ?? [];
      arr.push(ex);
      exercisesBySession.set(ex.sessionId, arr);
    }

    const setsBySession = new Map<string, SetLog[]>();
    for (const s of allSets) {
      const arr = setsBySession.get(s.sessionId) ?? [];
      arr.push(s);
      setsBySession.set(s.sessionId, arr);
    }

    return { sessions, exercisesBySession, setsBySession };
  }, []);

  const loading = stranded === undefined;

  return (
    <div className="min-h-screen animate-fade-in" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4 pb-24">
        {/* Header */}
        <div className="pt-6 pb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="p-2 rounded-xl active:scale-95"
            style={{ color: C.muted, backgroundColor: C.surface }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: C.text }}>
              Recover workouts
            </h1>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Sessions you started but never ended.
            </p>
          </div>
        </div>

        {/* Explainer */}
        <div
          className="rounded-2xl p-4 mb-4 text-xs leading-relaxed"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          Logged sets are saved instantly — they don&apos;t disappear when you forget to
          tap <span style={{ color: C.text }}>End workout</span>. Below are sessions
          from past dates still marked <span style={{ color: C.text }}>Scheduled</span> or{' '}
          <span style={{ color: C.text }}>Modified</span>. Expand one to review what was
          logged, add any sets you missed, then mark it complete with the date you actually
          trained.
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 rounded-full border-4 animate-spin"
              style={{ borderColor: `${C.accent} transparent transparent transparent` }}
            />
          </div>
        )}

        {!loading && stranded.sessions.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>
              Nothing stranded.
            </p>
            <p className="text-xs" style={{ color: C.muted }}>
              Every past session is either completed or skipped.
            </p>
          </div>
        )}

        {!loading &&
          stranded.sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              exercises={stranded.exercisesBySession.get(s.id) ?? []}
              sets={stranded.setsBySession.get(s.id) ?? []}
            />
          ))}
      </div>
    </div>
  );
}
