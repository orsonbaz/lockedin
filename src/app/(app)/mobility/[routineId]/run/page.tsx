'use client';

/**
 * /mobility/[routineId]/run — step through a routine.
 *
 * One movement on screen at a time with a timer for time-based moves and
 * a "next" button for rep-based ones. Movements with hasRomAssessment=true
 * surface a 0-100 self-rating slider before the athlete can advance.
 *
 * Completing the last movement records a MobilitySession row and routes
 * back to /mobility.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, ChevronRight, Pause, Play, SkipForward, X,
} from 'lucide-react';
import {
  getRoutine,
  MOBILITY_BY_ID,
  startSession,
  completeSession,
} from '@/lib/mobility';
import { logSelfRating } from '@/lib/mobility/rom-assessment';
import { C } from '@/lib/theme';
import type { MobilityMovement, MobilityRoutine } from '@/lib/db/types';

interface PageProps {
  params: Promise<{ routineId: string }>;
}

export default function MobilityRunnerPage({ params }: PageProps) {
  const { routineId } = use(params);
  const router = useRouter();

  const [routine, setRoutine] = useState<MobilityRoutine | null>(null);
  const [movements, setMovements] = useState<MobilityMovement[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // For ROM-tracked movements
  const [rating, setRating] = useState<number>(70);
  const [ratingLogged, setRatingLogged] = useState(false);

  // Boot — load routine, start session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await getRoutine(routineId);
      if (!r) {
        toast.error('Routine not found');
        router.replace('/mobility');
        return;
      }
      const m = r.movementIds
        .map((id) => MOBILITY_BY_ID.get(id))
        .filter((x): x is MobilityMovement => Boolean(x));
      if (m.length === 0) {
        toast.error('Routine has no movements');
        router.replace('/mobility');
        return;
      }
      const session = await startSession(routineId);
      if (cancelled) return;
      setRoutine(r);
      setMovements(m);
      setSessionId(session.id);
    })();
    return () => { cancelled = true; };
  }, [routineId, router]);

  const current = movements[index];

  // Reset per-movement state when index changes.
  useEffect(() => {
    if (!current) return;
    setSecondsLeft(current.durationSec ?? null);
    setRunning(true);
    setRating(70);
    setRatingLogged(false);
  }, [current]);

  // Timer tick — 1Hz interval, only running when `running` and a duration is set.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (!running || !current) return;
    tickRef.current = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
      setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running, current]);

  // Auto-stop timer at 0 (athlete can still advance manually).
  useEffect(() => {
    if (secondsLeft === 0 && running) setRunning(false);
  }, [secondsLeft, running]);

  const totalMinutes = useMemo(() => Math.max(1, Math.round(secondsElapsed / 60)), [secondsElapsed]);

  const handleAdvance = useCallback(async () => {
    if (!current || !sessionId) return;
    // Log ROM rating first if applicable and not yet logged.
    if (current.hasRomAssessment && !ratingLogged) {
      try {
        await logSelfRating({
          movementId: current.id,
          region: current.regions[0],
          selfRating: rating,
        });
        setRatingLogged(true);
      } catch {
        // non-blocking
      }
    }
    if (index >= movements.length - 1) {
      await completeSession(sessionId, totalMinutes);
      toast.success(`Flow complete — ${totalMinutes} min logged`);
      router.replace('/mobility');
    } else {
      setIndex((i) => i + 1);
    }
  }, [current, sessionId, ratingLogged, rating, index, movements.length, totalMinutes, router]);

  const handleSkip = useCallback(() => {
    if (index >= movements.length - 1) {
      void handleAdvance();
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, movements.length, handleAdvance]);

  const handleAbort = useCallback(() => {
    if (!confirm('End the flow now? Partial sessions are still logged.')) return;
    void (async () => {
      if (sessionId) await completeSession(sessionId, totalMinutes, 'Aborted early');
      router.replace('/mobility');
    })();
  }, [sessionId, totalMinutes, router]);

  if (!routine || !current) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  const progressPct = ((index + 1) / movements.length) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bg, color: C.text }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: C.border }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm"
          style={{ color: C.muted }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold truncate">{routine.name}</p>
          <p className="text-xs" style={{ color: C.muted }}>
            {index + 1} / {movements.length} · {totalMinutes} min in
          </p>
        </div>
        <button
          type="button"
          onClick={handleAbort}
          className="p-2 rounded-lg"
          style={{ color: C.muted, backgroundColor: C.dim }}
          aria-label="End flow"
        >
          <X size={16} />
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full" style={{ backgroundColor: C.dim }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progressPct}%`, backgroundColor: C.accent }}
        />
      </div>

      {/* Main */}
      <main className="flex-1 max-w-lg mx-auto w-full px-5 pt-8 pb-32 flex flex-col">
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: C.accent }}
        >
          {current.category.replace('_', ' ')}
          {current.sides === 'UNILATERAL' && ' · Both sides'}
        </p>
        <h2 className="text-2xl font-bold leading-tight mb-2">{current.name}</h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
          {current.cueShort}
        </p>

        {/* Timer / dose */}
        <DoseDisplay
          movement={current}
          secondsLeft={secondsLeft}
          running={running}
          onTogglePause={() => setRunning((r) => !r)}
        />

        {/* ROM slider */}
        {current.hasRomAssessment && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.muted }}>
              How did it feel? <span style={{ color: C.text, fontWeight: 700 }}>{rating}</span>
              <span style={{ color: C.muted, fontWeight: 400 }}> /100</span>
            </p>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rating}
              onChange={(e) => setRating(parseInt(e.target.value, 10))}
              className="w-full"
              aria-label="Self-rating slider (0-100)"
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: C.muted }}>
              <span>Locked / painful</span>
              <span>Full ROM</span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t flex gap-2"
        style={{
          backgroundColor: C.bg,
          borderColor: C.border,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px + 72px)',
        }}
      >
        <div className="max-w-lg mx-auto w-full flex gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
          >
            <SkipForward size={15} /> Skip
          </button>
          <button
            type="button"
            onClick={() => void handleAdvance()}
            className="flex-[2] inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold"
            style={{ backgroundColor: C.accent, color: '#1a1000' }}
          >
            {index >= movements.length - 1
              ? <><Check size={15} /> Finish flow</>
              : <>Next <ChevronRight size={15} /></>}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function DoseDisplay({
  movement,
  secondsLeft,
  running,
  onTogglePause,
}: {
  movement: MobilityMovement;
  secondsLeft: number | null;
  running: boolean;
  onTogglePause: () => void;
}) {
  // Time-based movement → big countdown + pause control.
  if (secondsLeft !== null) {
    const mm = Math.floor(secondsLeft / 60).toString().padStart(1, '0');
    const ss = (secondsLeft % 60).toString().padStart(2, '0');
    return (
      <div
        className="rounded-3xl p-6 flex flex-col items-center gap-3"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      >
        <p
          className="text-6xl font-black tabular-nums leading-none"
          style={{ color: secondsLeft === 0 ? C.green : C.text }}
        >
          {mm}:{ss}
        </p>
        <button
          type="button"
          onClick={onTogglePause}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
        >
          {running
            ? <><Pause size={14} /> Pause</>
            : <><Play size={14} /> Resume</>}
        </button>
      </div>
    );
  }
  // Rep-based — just show the rep prescription, no timer.
  return (
    <div
      className="rounded-3xl p-6 flex flex-col items-center gap-3"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-5xl font-black leading-none" style={{ color: C.text }}>
        {movement.reps ?? '—'} <span className="text-xl" style={{ color: C.muted }}>reps</span>
      </p>
      {movement.sides === 'UNILATERAL' && (
        <p className="text-xs" style={{ color: C.muted }}>each side</p>
      )}
    </div>
  );
}
