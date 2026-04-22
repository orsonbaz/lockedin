'use client';

/**
 * Daily Check-In page.
 *
 * Shown once per day before training.  If today's readiness record already
 * exists the user is redirected straight to /home.
 *
 * Flow on submit:
 *  1. Persist ReadinessRecord → db.readiness
 *  2. Find today's SCHEDULED TrainingSession → db.sessions
 *  3. Re-generate exercises with the live readiness score (via generateSession)
 *  4. Persist updated session meta + fresh exercises → db
 *  5. Navigate to /home
 */

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, today, newId } from '@/lib/db/database';
import {
  calcHrvBaseline,
  calcHrvDeviation,
  calcReadinessScore,
  readinessLabel,
} from '@/lib/engine/readiness';
import { generateSession, abbreviateSession } from '@/lib/engine/session';
import { resolveReadinessInputs } from '@/lib/engine/wearables/wearables-db';
import { addOverride, loadOverridesFor } from '@/lib/engine/schedule';
import { RingProgress }    from '@/components/lockedin/RingProgress';
import { C }               from '@/lib/theme';
import type {
  HRVSource, ReadinessRecord, SessionExercise, BodyweightEntry,
  SessionModalityChoice,
} from '@/lib/db/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT  = C.accent;
const SURFACE = C.surface;
const TEXT    = C.text;
const MUTED   = C.muted;
const BG      = C.bg;
const GOLD    = C.gold;

const SLEEP_EMOJIS = ['😩', '😕', '😐', '🙂', '😁'] as const;

// ── Dot Rating Row ────────────────────────────────────────────────────────────

function DotRating({
  label,
  icon,
  value,
  onChange,
  colour,
  hint,
}: {
  label: string;
  icon: string;
  value: number | undefined;
  onChange: (v: number) => void;
  colour: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {/* Label */}
      <div className="flex items-center gap-2 w-36 shrink-0">
        <span className="text-lg leading-none">{icon}</span>
        <div>
          <p className="text-sm font-medium" style={{ color: TEXT }}>
            {label}
          </p>
          {hint && (
            <p className="text-xs" style={{ color: MUTED }}>
              {hint}
            </p>
          )}
        </div>
      </div>

      {/* 5 dots */}
      <div className="flex gap-3">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const filled = value !== undefined && n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${label} ${n} out of 5`}
              className="w-8 h-8 rounded-full border-2 transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2"
              style={{
                backgroundColor: filled ? colour : 'transparent',
                borderColor:      filled ? colour : MUTED,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Section Wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{ backgroundColor: SURFACE }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── HRV Deviation Badge ───────────────────────────────────────────────────────

function HrvDeviationBadge({ deviation }: { deviation: number }) {
  let colour: string;
  let bg: string;

  if (deviation > 15)       { colour = '#22C55E'; bg = 'rgba(34,197,94,0.15)';  }
  else if (deviation > 5)   { colour = '#22C55E'; bg = 'rgba(34,197,94,0.10)';  }
  else if (deviation >= -5) { colour = MUTED;     bg = 'rgba(120,120,130,0.10)'; }
  else if (deviation >= -15){ colour = GOLD;      bg = 'rgba(229,168,75,0.15)';  }
  else                      { colour = ACCENT;    bg = 'rgba(212,132,76,0.15)';  }

  const sign = deviation > 0 ? '+' : '';
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: colour, backgroundColor: bg }}
    >
      {sign}{deviation.toFixed(1)}% vs 7d avg
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const MODALITY_OPTIONS: {
  key: SessionModalityChoice;
  label: string;
  sub: string;
  emoji: string;
  minutes?: number;
  equipment?: string[];
}[] = [
  { key: 'FULL',         label: 'Full gym',      sub: 'Barbell + accessories as programmed.', emoji: '🏋️' },
  { key: 'QUICK',        label: '30-min squeeze',sub: 'Keep comp lifts, drop accessories.',  emoji: '⏱️', minutes: 30 },
  { key: 'CALISTHENICS', label: 'Calisthenics',  sub: 'Bars / rings — weighted pull-ups, dips, skills.', emoji: '🤸', equipment: ['pullup_bar', 'dip_station', 'rings'] },
  { key: 'BODYWEIGHT',   label: 'Bodyweight',    sub: 'No gear at all. Push/pull/squat with what you have.', emoji: '💪', equipment: ['bodyweight'] },
  { key: 'TRAVEL',       label: 'Travel / hotel',sub: 'Dumbbells or bands, limited room.',   emoji: '🧳', equipment: ['dumbbell', 'band'], minutes: 45 },
];

export default function CheckInPage() {
  // useSearchParams needs a Suspense boundary for Next 16 static prerender.
  return (
    <Suspense fallback={<CheckInFallback />}>
      <CheckInInner />
    </Suspense>
  );
}

function CheckInFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: BG }}
    >
      <div
        className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: `${ACCENT} transparent transparent transparent` }}
      />
    </div>
  );
}

function CheckInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextHref = searchParams.get('next');

  // ── Form state ──────────────────────────────────────────────────────────
  const [hrv,          setHrv]          = useState('');
  const [sleepHours,   setSleepHours]   = useState(7.5);
  const [sleepQuality, setSleepQuality] = useState<number | undefined>();
  const [energy,       setEnergy]       = useState<number | undefined>();
  const [motivation,   setMotivation]   = useState<number | undefined>();
  const [soreness,     setSoreness]     = useState<number | undefined>();
  const [stress,       setStress]       = useState<number | undefined>();
  const [note,         setNote]         = useState('');
  const [bodyweight,   setBodyweight]   = useState('');
  const [modality,     setModality]     = useState<SessionModalityChoice>('FULL');

  // ── Async state ─────────────────────────────────────────────────────────
  const [hrvBaseline, setHrvBaseline] = useState<number | undefined>();
  const [ready,       setReady]       = useState(false); // init done, safe to render
  const [submitting,  setSubmitting]  = useState(false);
  const [autoFilled,  setAutoFilled]  = useState<HRVSource | null>(null);

  // ── HRV tooltip ─────────────────────────────────────────────────────────
  const [showHrvTip, setShowHrvTip] = useState(false);

  // ── Initialisation: check existing record + fetch HRV baseline ──────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // If already checked in today → honor `next` param (came from "Train"),
      // otherwise go home. No longer a gate — home is viewable without it.
      const existing = await db.readiness.where('date').equals(today()).first();
      if (existing) {
        router.replace(nextHref ?? '/home');
        return;
      }

      // Prefer wearable-derived readings over manual. `resolveReadinessInputs`
      // looks back 7 days for an HRV baseline + most-recent sleep stats.
      const wearable = await resolveReadinessInputs(today());

      // Fetch last 7 days of readiness records that have an HRV value — used
      // as a fallback baseline when no wearable HRV is present.
      const recentWithHrv = await db.readiness
        .orderBy('date')
        .reverse()
        .limit(14) // over-fetch, then filter
        .toArray();

      const hrvVals = recentWithHrv
        .filter((r) => r.hrv !== undefined)
        .slice(0, 7)
        .map((r) => r.hrv as number);

      if (!cancelled) {
        // Wearable baseline wins when present; otherwise manual history.
        setHrvBaseline(wearable.hrvBaseline7d ?? calcHrvBaseline(hrvVals));

        if (wearable.hrv !== undefined) setHrv(String(Math.round(wearable.hrv)));
        if (wearable.input.sleepHours   !== undefined) setSleepHours(wearable.input.sleepHours);
        if (wearable.input.sleepQuality !== undefined) setSleepQuality(wearable.input.sleepQuality);

        if (wearable.hrvSource && wearable.hrvSource !== 'MANUAL') {
          setAutoFilled(wearable.hrvSource);
        }

        setReady(true);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [router, nextHref]);

  // ── Derived: HRV deviation ────────────────────────────────────────────
  const hrvNum = hrv.trim() !== '' ? parseFloat(hrv) : undefined;

  const hrvDeviation = useMemo<number | undefined>(() => {
    if (hrvNum !== undefined && !isNaN(hrvNum) && hrvBaseline !== undefined) {
      return calcHrvDeviation(hrvNum, hrvBaseline);
    }
    return undefined;
  }, [hrvNum, hrvBaseline]);

  // ── Derived: live readiness score ─────────────────────────────────────
  const readinessScore = useMemo(
    () =>
      calcReadinessScore({
        hrvDeviation,
        sleepHours,
        sleepQuality,
        energy,
        motivation,
        soreness,
        stress,
      }),
    [hrvDeviation, sleepHours, sleepQuality, energy, motivation, soreness, stress],
  );

  const { label: rdLabel, colour: rdColour } = readinessLabel(readinessScore);

  // True once the user has touched at least one input beyond the sleep-hours default
  const hasAnyInput =
    hrv.trim() !== '' ||
    sleepQuality !== undefined ||
    energy !== undefined ||
    motivation !== undefined ||
    soreness !== undefined ||
    stress !== undefined;

  // ── Helper: ISO week start (Monday) ───────────────────────────────────
  function getWeekStart(dateStr: string): string {
    // Use noon local time to avoid any DST-induced date boundary issues
    const d   = new Date(`${dateStr}T12:00:00`);
    const day = d.getDay(); // 0 = Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const dateStr = today();

      // 1. Build and save readiness record
      const record: ReadinessRecord = {
        id:            newId(),
        date:          dateStr,
        hrv:           hrvNum !== undefined && !isNaN(hrvNum) ? hrvNum : undefined,
        hrvBaseline7d: hrvBaseline,
        hrvDeviation,
        hrvSource:     hrvNum !== undefined && !isNaN(hrvNum)
                         ? (autoFilled ?? 'MANUAL')
                         : undefined,
        sleepHours,
        sleepQuality,
        energy,
        motivation,
        soreness,
        stress,
        note:          note.trim() !== '' ? note.trim() : undefined,
        readinessScore,
        sessionModality: modality,
        createdAt:     new Date().toISOString(),
      };
      await db.readiness.add(record);

      // 1b. Translate modality into a schedule override so the engine +
      // abbreviator + coach prompt all see the same constraint.
      const modalityDef = MODALITY_OPTIONS.find((m) => m.key === modality);
      if (modalityDef && modality !== 'FULL') {
        const existingOverrides = await loadOverridesFor(dateStr);
        const hasEquipmentOverride = existingOverrides.some((o) => o.kind === 'EQUIPMENT_ONLY');
        const hasTimeBoxOverride   = existingOverrides.some((o) => o.kind === 'TIME_BOX');
        if (modalityDef.equipment && !hasEquipmentOverride) {
          await addOverride({
            date: dateStr,
            kind: 'EQUIPMENT_ONLY',
            allowedEquipment: modalityDef.equipment,
            note: `Check-in modality: ${modalityDef.label.toLowerCase()}`,
          });
        }
        if (modalityDef.minutes && !hasTimeBoxOverride) {
          await addOverride({
            date: dateStr,
            kind: 'TIME_BOX',
            minutesAvailable: modalityDef.minutes,
            note: `Check-in modality: ${modalityDef.label.toLowerCase()}`,
          });
        }
      }

      // 1b. Save bodyweight entry if provided
      const bwNum = bodyweight.trim() !== '' ? parseFloat(bodyweight) : undefined;
      if (bwNum !== undefined && !isNaN(bwNum) && bwNum >= 30 && bwNum <= 250) {
        const bwEntry: BodyweightEntry = {
          id:        newId(),
          date:      dateStr,
          weightKg:  bwNum,
          createdAt: new Date().toISOString(),
        };
        await db.bodyweight.add(bwEntry);
      }

      // 2. Find today's scheduled session
      const session = await db.sessions
        .where('scheduledDate')
        .equals(dateStr)
        .filter((s) => s.status === 'SCHEDULED')
        .first();

      if (session) {
        // 3. Fetch profile + block in parallel
        const [profile, block] = await Promise.all([
          db.profile.get('me'),
          db.blocks.get(session.blockId),
        ]);

        if (profile && block) {
          // Determine which session number within the current week
          const weekStart    = getWeekStart(dateStr);
          const weekSessions = await db.sessions
            .where('cycleId')
            .equals(session.cycleId)
            .filter(
              (s) =>
                s.scheduledDate >= weekStart &&
                s.scheduledDate <= dateStr,
            )
            .sortBy('scheduledDate');

          const sessionIdx    = weekSessions.findIndex((s) => s.id === session.id);
          const sessionNumber = sessionIdx >= 0 ? sessionIdx + 1 : 1;
          const weekDayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();

          // Compute weekWithinBlock from cycle's currentWeek and block boundaries
          const cycle = await db.cycles.get(session.cycleId);
          const cycleWeek      = cycle?.currentWeek ?? 1;
          const weekWithinBlock = Math.max(1, cycleWeek - block.weekStart + 1);

          // Compute overshootHistory: avg RPE overshoot from recent competition sets
          let overshootHistory: number | undefined;
          try {
            const compExercises = await db.exercises
              .filter((e) => e.exerciseType === 'COMPETITION')
              .toArray();
            const rpeTargetMap = new Map(compExercises.map((e) => [e.id, e.rpeTarget]));
            const recentSets: Array<{ overshoot: number }> = [];
            for (const ex of compExercises.slice(-30)) {
              const exSets = await db.sets
                .where('exerciseId').equals(ex.id)
                .filter((s) => s.rpeLogged !== undefined)
                .toArray();
              for (const s of exSets) {
                const target = rpeTargetMap.get(s.exerciseId);
                if (target !== undefined && s.rpeLogged !== undefined) {
                  recentSets.push({ overshoot: s.rpeLogged - target });
                }
              }
            }
            // Use the last 10 sets for the average
            const last10 = recentSets.slice(-10);
            if (last10.length >= 3) {
              const avg = last10.reduce((sum, s) => sum + s.overshoot, 0) / last10.length;
              if (avg > 0) overshootHistory = avg;
            }
          } catch { /* non-critical — fall back to undefined */ }

          // 4. Re-generate session with live readiness data
          let generated = generateSession({
            profile,
            block,
            weekDayOfWeek,
            readinessScore,
            sessionNumber,
            weekWithinBlock,
            overshootHistory,
          });

          // 4b. If the athlete picked a time-capped modality, trim now so the
          // session they walk into matches what they said they could do.
          const modalityDef = MODALITY_OPTIONS.find((m) => m.key === modality);
          if (modalityDef?.minutes) {
            generated = abbreviateSession(generated, { maxMinutes: modalityDef.minutes });
          }

          // 5a. Update session metadata
          await db.sessions.update(session.id, {
            readinessScore,
            coachNote:        generated.coachNote,
            aiModifications:  JSON.stringify(generated.modifications),
            status:           generated.modifications.length > 0 ? 'MODIFIED' : 'SCHEDULED',
          });

          // 5b. Replace exercises with readiness-adjusted versions
          await db.exercises.where('sessionId').equals(session.id).delete();

          const freshExercises: SessionExercise[] = generated.exercises.map((ex) => ({
            id:                newId(),
            sessionId:         session.id,
            name:              ex.name,
            exerciseType:      ex.exerciseType,
            setStructure:      ex.setStructure,
            sets:              ex.sets,
            reps:              ex.reps,
            rpeTarget:         ex.rpeTarget,
            estimatedLoadKg:   ex.estimatedLoadKg,
            order:             ex.order,
            notes:             ex.notes,
            ...(ex.libraryExerciseId ? { libraryExerciseId: ex.libraryExerciseId } : {}),
          }));
          await db.exercises.bulkAdd(freshExercises);
        }
      }

      router.push(nextHref ?? '/home');
    } catch (err) {
      console.error('[CheckIn] save failed:', err);
      setSubmitting(false);
    }
  }, [
    submitting,
    hrvNum,
    hrvBaseline,
    hrvDeviation,
    sleepHours,
    sleepQuality,
    energy,
    motivation,
    soreness,
    stress,
    note,
    bodyweight,
    readinessScore,
    autoFilled,
    router,
    modality,
    nextHref,
  ]);

  // ── Skip ───────────────────────────────────────────────────────────────
  const handleSkip = useCallback(async () => {
    try {
      await db.readiness.add({
        id:            newId(),
        date:          today(),
        readinessScore: 70,
        sessionModality: modality,
        createdAt:     new Date().toISOString(),
      });
    } catch {
      // already exists or other error — still navigate
    }
    router.push(nextHref ?? '/home');
  }, [router, nextHref, modality]);

  // ── Loading guard ──────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: BG }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: `${ACCENT} transparent transparent transparent` }}
          />
          <p className="text-sm" style={{ color: MUTED }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  // ── Date string for header ─────────────────────────────────────────────
  const dateDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  });

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen pb-12 animate-fade-in"
      style={{ backgroundColor: BG, color: TEXT }}
    >
      <div className="max-w-lg mx-auto px-4">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="pt-8 pb-6">
          <h1 className="text-2xl font-bold tracking-tight">Daily Check-In</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            {dateDisplay}
          </p>
        </div>

        <div className="flex flex-col gap-4">

          {/* ── SECTION 1: HRV ────────────────────────────────────────── */}
          <Section title="Heart Rate Variability">
            <div className="flex flex-col gap-3">
              {/* Label row */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" htmlFor="hrv-input">
                  This morning&apos;s HRV
                </label>
                <button
                  type="button"
                  onClick={() => setShowHrvTip((p) => !p)}
                  className="w-5 h-5 rounded-full border text-xs font-bold leading-none flex items-center justify-center transition-colors"
                  style={{
                    borderColor:     showHrvTip ? ACCENT : MUTED,
                    color:           showHrvTip ? ACCENT : MUTED,
                    backgroundColor: showHrvTip ? 'rgba(233,69,96,0.12)' : 'transparent',
                  }}
                  aria-label="What is HRV?"
                >
                  ?
                </button>
              </div>

              {/* Tooltip */}
              {showHrvTip && (
                <div
                  className="rounded-lg p-3 text-xs leading-relaxed"
                  style={{ backgroundColor: 'rgba(15,52,96,0.7)', color: MUTED, borderLeft: `3px solid ${ACCENT}` }}
                >
                  <strong style={{ color: TEXT }}>RMSSD</strong> (Root Mean Square of Successive Differences)
                  is the gold-standard measure of heart rate variability.
                  A higher value = better recovery. Find it in{' '}
                  <strong style={{ color: TEXT }}>Oura Ring</strong>,{' '}
                  <strong style={{ color: TEXT }}>Polar</strong>,{' '}
                  <strong style={{ color: TEXT }}>WHOOP</strong>, or Apple Health.
                </div>
              )}

              {/* Input row */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    id="hrv-input"
                    type="number"
                    min={10}
                    max={200}
                    step={1}
                    value={hrv}
                    onChange={(e) => setHrv(e.target.value)}
                    placeholder="e.g. 58"
                    className="w-full rounded-lg border px-3 py-2 text-2xl font-bold text-right pr-14 bg-transparent outline-none transition-colors"
                    style={{
                      borderColor:  hrv ? ACCENT : MUTED,
                      color:        TEXT,
                    }}
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none"
                    style={{ color: MUTED }}
                  >
                    ms
                  </span>
                </div>
              </div>

              {/* Hint */}
              <p className="text-xs" style={{ color: MUTED }}>
                Find RMSSD in your Oura, Polar, or WHOOP app each morning before getting up.
              </p>

              {/* Auto-fill banner */}
              {autoFilled && (
                <p className="text-xs" style={{ color: GOLD }}>
                  Auto-filled from {autoFilled.replace('_', ' ').toLowerCase()} — edit if needed.
                </p>
              )}

              {/* Baseline + deviation */}
              {hrvBaseline !== undefined ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: MUTED }}>
                    7-day avg: <strong style={{ color: TEXT }}>{Math.round(hrvBaseline)} ms</strong>
                  </span>
                  {hrvDeviation !== undefined && (
                    <HrvDeviationBadge deviation={hrvDeviation} />
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: MUTED }}>
                  No HRV baseline yet — your average will build after a few check-ins.
                </p>
              )}
            </div>
          </Section>

          {/* ── SECTION 1a: Training style today ─────────────────────── */}
          <Section title="How are you training today?">
            <div className="grid grid-cols-1 gap-2">
              {MODALITY_OPTIONS.map((m) => {
                const on = modality === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModality(m.key)}
                    className="text-left rounded-xl p-3 transition-all active:scale-[0.99]"
                    style={{
                      backgroundColor: on ? `${ACCENT}14` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${on ? ACCENT : C.border}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: on ? ACCENT : TEXT }}>
                          {m.label}
                          {m.minutes && (
                            <span className="ml-2 text-xs font-semibold" style={{ color: MUTED }}>
                              · {m.minutes} min
                            </span>
                          )}
                        </p>
                        <p className="text-xs" style={{ color: MUTED }}>{m.sub}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              Session adapts — we&apos;ll trim or swap exercises to match what you&apos;ve got.
            </p>
          </Section>

          {/* ── SECTION 1b: Bodyweight (optional) ───────────────────── */}
          <Section title="Bodyweight (optional)">
            <div className="flex items-center gap-3">
              <label htmlFor="bw-input" className="sr-only">Bodyweight in kilograms</label>
              <div className="relative flex-1">
                <input
                  id="bw-input"
                  type="number"
                  min={30}
                  max={250}
                  step={0.1}
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  placeholder="e.g. 83.0"
                  className="w-full rounded-lg border px-3 py-2 text-2xl font-bold text-right pr-14 bg-transparent outline-none transition-colors"
                  style={{
                    borderColor: bodyweight ? ACCENT : MUTED,
                    color:       TEXT,
                  }}
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none"
                  style={{ color: MUTED }}
                >
                  kg
                </span>
              </div>
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              Weigh yourself each morning before eating for the most consistent tracking.
            </p>
          </Section>

          {/* ── SECTION 2: Sleep ──────────────────────────────────────── */}
          <Section title="Sleep">
            {/* Hours slider */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="sleep-hours" className="text-sm font-medium">
                  Hours of sleep last night
                </label>
                <span
                  className="text-xl font-bold"
                  style={{ color: ACCENT }}
                >
                  {sleepHours.toFixed(1)}h
                </span>
              </div>

              {/* Native range — styled via accentColor */}
              <input
                id="sleep-hours"
                type="range"
                min={3}
                max={12}
                step={0.5}
                value={sleepHours}
                onChange={(e) => setSleepHours(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer appearance-none"
                style={{
                  accentColor:     ACCENT,
                  backgroundColor: '#252529',
                }}
                aria-label="Hours of sleep"
              />

              <div className="flex justify-between text-xs" style={{ color: MUTED }}>
                <span>3 h</span>
                <span>12 h</span>
              </div>
            </div>

            {/* Quality emoji buttons */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Sleep quality</label>
              <div className="flex gap-2">
                {SLEEP_EMOJIS.map((emoji, idx) => {
                  const val      = idx + 1;
                  const selected = sleepQuality === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSleepQuality(val)}
                      aria-label={`Sleep quality ${val} of 5`}
                      className="flex-1 py-2.5 rounded-xl text-2xl transition-all duration-150 active:scale-95 border-2"
                      style={{
                        borderColor:     selected ? ACCENT : 'transparent',
                        backgroundColor: selected ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                        outline:         selected ? `0` : undefined,
                        boxShadow:       selected ? `0 0 0 2px ${ACCENT}` : undefined,
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ── SECTION 3: Subjective ─────────────────────────────────── */}
          <Section title="How do you feel?">
            <div className="flex flex-col gap-5">
              <DotRating
                label="Energy"
                icon="⚡"
                value={energy}
                onChange={setEnergy}
                colour={ACCENT}
              />
              <DotRating
                label="Motivation"
                icon="🎯"
                value={motivation}
                onChange={setMotivation}
                colour={ACCENT}
              />
              <DotRating
                label="Soreness"
                icon="💪"
                value={soreness}
                onChange={setSoreness}
                colour={MUTED}
                hint="5 = very sore"
              />
              <DotRating
                label="Stress"
                icon="🧠"
                value={stress}
                onChange={setStress}
                colour={MUTED}
                hint="5 = very stressed"
              />
            </div>
          </Section>

          {/* ── SECTION 4: Note ────────────────────────────────────────── */}
          <Section title="Notes (optional)">
            <textarea
              id="checkin-notes"
              aria-label="Check-in notes"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Anything to flag? (optional)"
              rows={3}
              maxLength={200}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent resize-none outline-none transition-colors"
              style={{
                borderColor: note ? ACCENT : MUTED,
                color:       TEXT,
              }}
            />
            <p className="text-right text-xs" style={{ color: MUTED }}>
              {note.length} / 200
            </p>
          </Section>

          {/* ── SECTION 5: Readiness Gauge ───────────────────────────── */}
          <div
            className="rounded-xl p-6 flex flex-col items-center gap-2"
            style={{ backgroundColor: SURFACE }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: MUTED }}>
              Today&apos;s Readiness
            </p>
            <RingProgress
              score={hasAnyInput ? readinessScore : 0}
              color={hasAnyInput ? rdColour : MUTED}
              label={hasAnyInput ? rdLabel : '—'}
              hasData={hasAnyInput}
              strokeWidth={9}
              size={120}
              ariaLabel={hasAnyInput ? `Readiness score ${readinessScore} out of 100` : 'Fill in the form to see your readiness score'}
            />
            <p className="text-xs text-center mt-2 max-w-xs" style={{ color: MUTED }}>
              {hasAnyInput ? 'Updates live as you fill in the form above.' : 'Fill in at least one field to see your score.'}
            </p>
          </div>

          {/* ── Submit + Skip ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="w-full py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: ACCENT,
                color:           TEXT,
              }}
            >
              {submitting ? 'Saving…' : 'Lock In Today'}
            </button>

            <button
              type="button"
              onClick={() => void handleSkip()}
              disabled={submitting}
              className="w-full py-2 text-sm transition-colors disabled:opacity-50"
              style={{ color: MUTED }}
            >
              Skip for today
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
