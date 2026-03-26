'use client';

/**
 * Meet Dashboard — /app/meet
 *
 * Empty state → "Add a Meet" sheet.
 * Upcoming meet → countdown + attempt planner + peaking timeline.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import { toast }                             from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { db, newId }                         from '@/lib/db/database';
import { suggestAttempts, blockToIntensity, calcDots } from '@/lib/engine/calc';
import { C }                                 from '@/lib/theme';
import { daysUntil, todayIso }               from '@/lib/date-utils';
import type {
  Meet, MeetAttempt, AthleteProfile,
  TrainingCycle, TrainingBlock,
  Federation, WeighIn, BlockType, Lift,
} from '@/lib/db/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const FEDERATIONS: Federation[] = ['IPF', 'USAPL', 'USPA', 'RPS', 'CPU', 'OTHER'];

// Weight classes keyed by federation group and sex.
// Sentinel values (120.1, 84.1, 140.1, 90.1) represent the open "+" class.
const WEIGHT_CLASS_LABELS: Record<number, string> = {
  120.1: '120+', 84.1: '84+', 140.1: '140+', 90.1: '90+',
};

type SexKey = 'MALE' | 'FEMALE' | 'OTHER';

function getWeightClasses(federation: Federation, sex?: SexKey): number[] {
  const female = sex === 'FEMALE';

  // USPA / RPS use the old IPF weight classes
  if (federation === 'USPA' || federation === 'RPS') {
    return female
      ? [44, 48, 52, 56, 60, 67.5, 75, 82.5, 90, 90.1]
      : [52, 56, 60, 67.5, 75, 82.5, 90, 100, 110, 125, 140, 140.1];
  }

  // IPF, USAPL, CPU, and default (OTHER) use current IPF classes
  return female
    ? [47, 52, 57, 63, 69, 76, 84, 84.1]
    : [59, 66, 74, 83, 93, 105, 120, 120.1];
}

const MEET_LIFTS: Array<{ lift: 'SQUAT' | 'BENCH' | 'DEADLIFT'; label: string; max: keyof AthleteProfile }> = [
  { lift: 'SQUAT',    label: 'Squat',       max: 'maxSquat'    },
  { lift: 'BENCH',    label: 'Bench Press', max: 'maxBench'    },
  { lift: 'DEADLIFT', label: 'Deadlift',    max: 'maxDeadlift' },
];

const ATTEMPT_LABELS: Record<1 | 2 | 3, string> = { 1: 'Opener', 2: '2nd', 3: '3rd' };

const BLOCK_COLORS: Record<BlockType, string> = {
  ACCUMULATION:    '#60A5FA',
  INTENSIFICATION: '#E5A84B',
  REALIZATION:     '#D4844C',
  DELOAD:          '#787882',
  PIVOT:           '#8B5CF6',
  MAINTENANCE:     '#22C55E',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeMax(val: unknown): number {
  const n = typeof val === 'number' ? val : 0;
  return n > 0 ? n : 100;
}

// ── Form defaults ─────────────────────────────────────────────────────────────
interface MeetForm {
  name:        string;
  date:        string;
  location:    string;
  federation:  Federation;
  weightClass: number;
  weighIn:     WeighIn;
}

function defaultForm(profile: AthleteProfile | null): MeetForm {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 3);
  return {
    name:        '',
    date:        nextMonth.toISOString().split('T')[0],
    location:    '',
    federation:  profile?.federation  ?? 'IPF',
    weightClass: profile?.targetWeightClass ?? 83,
    weighIn:     profile?.weighIn     ?? 'TWO_HOUR',
  };
}

// ── Attempt Card ──────────────────────────────────────────────────────────────
interface AttemptCardProps {
  liftLabel:   string;
  trainingMax: number;
  attempts:    MeetAttempt[];
  localLoads:  Record<string, number>;
  onChange:    (id: string, kg: number) => void;
  onBlur:      (id: string, kg: number) => void;
}

function AttemptCard({
  liftLabel, trainingMax, attempts, localLoads, onChange, onBlur,
}: AttemptCardProps) {
  const sorted = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: C.border, backgroundColor: C.dim }}
      >
        <span className="text-sm font-bold uppercase tracking-widest" style={{ color: C.text }}>
          {liftLabel}
        </span>
        <span className="text-xs" style={{ color: C.muted }}>
          Max: {trainingMax} kg
        </span>
      </div>

      {/* Attempt rows */}
      <div className="divide-y" style={{ borderColor: C.border }}>
        {sorted.map((attempt) => {
          const load    = localLoads[attempt.id] ?? attempt.plannedKg;
          const pct     = trainingMax > 0 ? Math.round((load / trainingMax) * 100) : 0;
          const numKey  = attempt.attemptNumber as 1 | 2 | 3;
          const hasResult = attempt.result !== undefined;

          return (
            <div
              key={attempt.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              {/* Attempt number tag */}
              <div
                className="flex-shrink-0 w-16 text-xs font-semibold text-center py-1 rounded-full"
                style={{ backgroundColor: `${C.accent}20`, color: C.accent }}
              >
                {ATTEMPT_LABELS[numKey]}
              </div>

              {/* Load input */}
              <div className="flex-1 relative">
                <input
                  type="number"
                  value={load}
                  step={0.5}
                  min={0}
                  onChange={(e) => onChange(attempt.id, parseFloat(e.target.value) || 0)}
                  onBlur={(e)   => onBlur(attempt.id,   parseFloat(e.target.value) || 0)}
                  aria-label={`${ATTEMPT_LABELS[numKey]} load in kilograms`}
                  className="w-full rounded-lg border px-3 py-2 text-right text-base font-bold outline-none transition-colors"
                  style={{
                    backgroundColor: C.bg,
                    borderColor:     C.border,
                    color:           C.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ color: C.muted }}
                >
                  kg
                </span>
              </div>

              {/* % of max */}
              <div className="flex-shrink-0 w-12 text-right">
                <span className="text-sm font-semibold" style={{ color: C.gold }}>
                  {pct}%
                </span>
              </div>

              {/* Result badge (post-meet) */}
              {hasResult && (
                <div
                  className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor:
                      attempt.result === 'GOOD'    ? `${C.greenDeep}30` :
                      attempt.result === 'NO_LIFT' ? `${C.gold}30`  : `${C.accent}30`,
                    color:
                      attempt.result === 'GOOD'    ? C.greenDeep :
                      attempt.result === 'NO_LIFT' ? C.gold   : C.accent,
                  }}
                >
                  {attempt.result === 'GOOD' ? '✓ Good' : attempt.result === 'NO_LIFT' ? '✗ No lift' : '💥 Bomb'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Peaking Timeline ──────────────────────────────────────────────────────────
interface PeakingTimelineProps {
  cycle:       TrainingCycle;
  blocks:      TrainingBlock[];
  meetDate:    string;
}

function PeakingTimeline({ cycle, blocks, meetDate }: PeakingTimelineProps) {
  const weeksLeft = Math.max(1, Math.ceil(
    (new Date(meetDate).getTime() - Date.now()) / (7 * 86_400_000),
  ));
  const maxWeeks = Math.min(weeksLeft, 14);

  const entries = Array.from({ length: maxWeeks }, (_, i) => {
    const weekNum    = cycle.currentWeek + i;
    const weeksOut   = weeksLeft - i;
    const block      = blocks.find((b) => b.weekStart <= weekNum && b.weekEnd >= weekNum);
    const isCurrent  = i === 0;
    const intensity  = block ? Math.round(blockToIntensity(block.blockType) * 100) : 0;
    return { weekNum, weeksOut, block, isCurrent, intensity };
  });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
        Peaking Timeline
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
          {entries.map(({ weekNum, weeksOut, block, isCurrent, intensity }) => (
            <div
              key={weekNum}
              className="flex-shrink-0 w-32 rounded-xl p-3 flex flex-col gap-1.5"
              style={{
                backgroundColor: isCurrent ? `${C.accent}20` : C.surface,
                border: `1.5px solid ${isCurrent ? C.accent : C.border}`,
              }}
            >
              <p
                className="text-xs font-bold"
                style={{ color: isCurrent ? C.accent : C.muted }}
              >
                {weeksOut === 1 ? 'Meet week' : `${weeksOut}w out`}
              </p>
              {block ? (
                <>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full self-start"
                    style={{
                      backgroundColor: `${BLOCK_COLORS[block.blockType]}25`,
                      color:           BLOCK_COLORS[block.blockType],
                    }}
                  >
                    {block.blockType.charAt(0) + block.blockType.slice(1).toLowerCase()}
                  </span>
                  <p className="text-xs" style={{ color: C.muted }}>
                    {intensity}% 1RM
                  </p>
                </>
              ) : (
                <span className="text-xs" style={{ color: C.muted }}>Unplanned</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MeetDashboardPage() {
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [meet,         setMeet]         = useState<Meet | null>(null);
  const [attempts,     setAttempts]     = useState<MeetAttempt[]>([]);
  const [profile,      setProfile]      = useState<AthleteProfile | null>(null);
  const [cycle,        setCycle]        = useState<TrainingCycle | null>(null);
  const [blocks,       setBlocks]       = useState<TrainingBlock[]>([]);
  const [localLoads,   setLocalLoads]   = useState<Record<string, number>>({});
  const [pastMeets,    setPastMeets]    = useState<Array<{
    meet: Meet;
    bestSquat?: number; bestBench?: number; bestDeadlift?: number;
    total: number; dots?: number;
  }>>([]);

  // ── Sheet ─────────────────────────────────────────────────────────────────
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [form,         setForm]         = useState<MeetForm>(defaultForm(null));
  const [saving,       setSaving]       = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadData() {
    const [allMeets, prof, activeCycle] = await Promise.all([
      db.meets.filter((m) => m.status === 'UPCOMING').toArray(),
      db.profile.get('me'),
      db.cycles.filter((c) => c.status === 'ACTIVE').first(),
    ]);

    const upcoming = allMeets.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )[0] ?? null;

    setProfile(prof ?? null);
    setMeet(upcoming);

    if (upcoming) {
      const meetAttempts = await db.attempts
        .where('meetId').equals(upcoming.id)
        .toArray();
      setAttempts(meetAttempts);

      const loads: Record<string, number> = {};
      for (const a of meetAttempts) loads[a.id] = a.plannedKg;
      setLocalLoads(loads);
    }

    if (activeCycle) {
      const cycleBlocks = await db.blocks
        .where('cycleId').equals(activeCycle.id)
        .toArray();
      setCycle(activeCycle);
      setBlocks(cycleBlocks);
    }

    // ── Past meets ─────────────────────────────────────────────────────
    const completedMeets = await db.meets
      .filter((m) => m.status === 'COMPLETED')
      .toArray();

    const pastMeetData = await Promise.all(
      completedMeets
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(async (m) => {
          const meetAttempts = await db.attempts
            .where('meetId').equals(m.id)
            .toArray();

          const bestLift = (lift: string) => {
            const good = meetAttempts.filter(
              (a) => a.lift === lift && a.result === 'GOOD' && a.actualKg,
            );
            return good.length > 0
              ? Math.max(...good.map((a) => a.actualKg!))
              : undefined;
          };

          const bestSquat    = bestLift('SQUAT');
          const bestBench    = bestLift('BENCH');
          const bestDeadlift = bestLift('DEADLIFT');
          const total = (bestSquat ?? 0) + (bestBench ?? 0) + (bestDeadlift ?? 0);
          const dots = total > 0 && prof
            ? Math.round(calcDots(total, prof.weightKg, prof.sex) * 10) / 10
            : undefined;

          return { meet: m, bestSquat, bestBench, bestDeadlift, total, dots };
        }),
    );
    setPastMeets(pastMeetData);

    if (prof) setForm(defaultForm(prof));
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Attempt editing ───────────────────────────────────────────────────────
  const handleAttemptChange = useCallback((id: string, kg: number) => {
    setLocalLoads((prev) => ({ ...prev, [id]: kg }));
  }, []);

  const handleAttemptBlur = useCallback(async (id: string, kg: number) => {
    void db.attempts.update(id, { plannedKg: kg });
  }, []);

  // ── Create meet ───────────────────────────────────────────────────────────
  const handleCreateMeet = useCallback(async () => {
    if (!form.name.trim() || !form.date) {
      toast('Please fill in meet name and date.', { duration: 3000 });
      return;
    }
    if (saving) return;
    setSaving(true);

    try {
      const meetId = newId();
      const prof   = profile;

      const newMeet: Meet = {
        id:         meetId,
        cycleId:    cycle?.id,
        name:       form.name.trim(),
        date:       form.date,
        location:   form.location.trim() || undefined,
        federation: form.federation,
        weightClass: form.weightClass,
        weighIn:    form.weighIn,
        status:     'UPCOMING',
      };

      await db.meets.add(newMeet);

      // Link cycle to this meet
      if (cycle) {
        void db.cycles.update(cycle.id, { meetId });
      }

      // Generate 9 attempts (3 lifts × 3 attempts each)
      const attemptRecords: MeetAttempt[] = [];
      for (const { lift, max } of MEET_LIFTS) {
        const trainingMax = safeMax(prof?.[max]);
        const [a1, a2, a3] = suggestAttempts(trainingMax);
        ([1, 2, 3] as const).forEach((num, i) => {
          attemptRecords.push({
            id:            newId(),
            meetId,
            lift:          lift as Lift,
            attemptNumber: num,
            plannedKg:     [a1, a2, a3][i],
          });
        });
      }
      await db.attempts.bulkAdd(attemptRecords);

      toast(`Meet "${form.name}" created!`, { duration: 3000 });
      setSheetOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving, profile, cycle]);

  // ── Render: Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  // ── Shared: Add Meet Sheet ─────────────────────────────────────────────────
  const addMeetSheet = (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger
        className="px-6 py-3 rounded-2xl text-base font-bold transition-all active:scale-95"
        style={{ backgroundColor: C.accent, color: C.text }}
      >
        Add a Meet
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="px-4 pb-10 rounded-t-3xl max-h-[92dvh] overflow-y-auto"
        style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.text }}
      >
        <SheetHeader className="mb-5">
          <SheetTitle style={{ color: C.text }}>Add a Meet</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 max-w-lg mx-auto">
          {/* Meet name */}
          <div>
            <label htmlFor="meet-name" className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: C.muted }}>
              Meet Name *
            </label>
            <input
              id="meet-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. State Championship 2025"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
            />
          </div>

          {/* Date */}
          <div>
            <label htmlFor="meet-date" className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: C.muted }}>
              Meet Date *
            </label>
            <input
              id="meet-date"
              type="date"
              value={form.date}
              min={todayIso()}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
            />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="meet-location" className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: C.muted }}>
              Location (optional)
            </label>
            <input
              id="meet-location"
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="City, State"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
            />
          </div>

          {/* Federation + Weight class (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="meet-federation" className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: C.muted }}>
                Federation
              </label>
              <select
                id="meet-federation"
                value={form.federation}
                onChange={(e) => {
                  const fed = e.target.value as Federation;
                  const classes = getWeightClasses(fed, profile?.sex as SexKey | undefined);
                  setForm((f) => ({
                    ...f,
                    federation: fed,
                    // Reset weight class to nearest valid class for the new federation
                    weightClass: classes.includes(f.weightClass) ? f.weightClass : (classes[classes.length - 2] ?? classes[0]),
                  }));
                }}
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none appearance-none"
                style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
              >
                {FEDERATIONS.map((fed) => (
                  <option key={fed} value={fed}>{fed}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="meet-weight-class" className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: C.muted }}>
                Weight Class
              </label>
              <select
                id="meet-weight-class"
                value={form.weightClass}
                onChange={(e) => setForm((f) => ({ ...f, weightClass: parseFloat(e.target.value) }))}
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none appearance-none"
                style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
              >
                {getWeightClasses(form.federation, profile?.sex as SexKey | undefined).map((wc) => (
                  <option key={wc} value={wc}>
                    {WEIGHT_CLASS_LABELS[wc] ?? `${wc} kg`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Weigh-in format */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: C.muted }}>
              Weigh-in Format
            </label>
            <div className="flex gap-2">
              {(['TWO_HOUR', 'TWENTY_FOUR_HOUR'] as WeighIn[]).map((wi) => (
                <button
                  key={wi}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, weighIn: wi }))}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-all"
                  style={{
                    backgroundColor: form.weighIn === wi ? C.accent : C.surface,
                    borderColor:     form.weighIn === wi ? C.accent : C.border,
                    color:           form.weighIn === wi ? '#fff' : C.muted,
                  }}
                >
                  {wi === 'TWO_HOUR' ? '2-Hour' : '24-Hour'}
                </button>
              ))}
            </div>
          </div>

          {/* Projected attempts preview */}
          {profile && (
            <div
              className="rounded-xl p-3 text-xs"
              style={{ backgroundColor: C.dim, color: C.muted }}
            >
              <p className="font-semibold mb-1" style={{ color: C.gold }}>Projected openers</p>
              {MEET_LIFTS.map(({ lift, label, max }) => {
                const tMax = safeMax(profile[max]);
                const [opener] = suggestAttempts(tMax);
                return (
                  <p key={lift}>{label}: {opener} kg ({Math.round((opener / tMax) * 100)}% of {tMax} kg)</p>
                );
              })}
            </div>
          )}

          {/* Save */}
          <button
            type="button"
            onClick={() => void handleCreateMeet()}
            disabled={saving || !form.name.trim() || !form.date}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            {saving ? 'Creating…' : 'Create Meet'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );

  // ── Render: Empty state ───────────────────────────────────────────────────
  if (!meet) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ backgroundColor: C.bg }}>
        <div
          className="w-full max-w-sm rounded-3xl p-8 text-center"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <p className="text-4xl mb-4">🏋️</p>
          <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>No meet scheduled</h2>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            Add a competition to unlock attempt planning, peaking timeline, and meet-day tools.
          </p>
          {addMeetSheet}
        </div>
      </div>
    );
  }

  // ── Render: Meet dashboard ────────────────────────────────────────────────
  const days           = daysUntil(meet.date);
  const meetAttemptsByLift = (lift: 'SQUAT' | 'BENCH' | 'DEADLIFT') =>
    attempts.filter((a) => a.lift === lift);

  return (
    <div className="min-h-screen pb-10 animate-fade-in" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">

        {/* ── COUNTDOWN CARD ─────────────────────────────────────────── */}
        <div
          className="mt-8 rounded-3xl p-6 mb-6 relative overflow-hidden"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          {/* Red glow accent */}
          <div
            className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 pointer-events-none"
            style={{ backgroundColor: C.accent, filter: 'blur(40px)' }}
          />

          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
            Next Meet
          </p>
          <h1 className="text-xl font-bold mb-4 leading-tight" style={{ color: C.text }}>
            {meet.name}
          </h1>

          {/* Days counter — dramatic */}
          <div className="flex items-end gap-3 mb-4">
            <span
              className="font-black leading-none"
              style={{
                fontSize:    'clamp(4rem, 20vw, 7rem)',
                color:       C.accent,
                textShadow:  `0 0 40px ${C.accent}60`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {days}
            </span>
            <span className="text-xl font-semibold pb-3" style={{ color: C.muted }}>
              days
            </span>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-2">
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${C.accent}20`, color: C.accent }}
            >
              {meet.federation}
            </span>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${C.gold}20`, color: C.gold }}
            >
              {meet.weightClass} kg class
            </span>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${C.muted}15`, color: C.muted }}
            >
              {meet.weighIn === 'TWO_HOUR' ? '2-hour weigh-in' : '24-hour weigh-in'}
            </span>
            {meet.location && (
              <span
                className="text-xs px-3 py-1 rounded-full"
                style={{ backgroundColor: C.dim, color: C.muted }}
              >
                📍 {meet.location}
              </span>
            )}
          </div>
        </div>

        {/* ── ATTEMPT PLANNER ─────────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
          Attempt Planner
        </p>
        <div className="flex flex-col gap-4 mb-8">
          {MEET_LIFTS.map(({ lift, label, max }) => (
            <AttemptCard
              key={lift}
              liftLabel={label}
              trainingMax={safeMax(profile?.[max])}
              attempts={meetAttemptsByLift(lift)}
              localLoads={localLoads}
              onChange={handleAttemptChange}
              onBlur={handleAttemptBlur}
            />
          ))}
        </div>

        {/* ── PEAKING TIMELINE ─────────────────────────────────────────── */}
        {cycle && blocks.length > 0 && (
          <div className="mb-8">
            <PeakingTimeline cycle={cycle} blocks={blocks} meetDate={meet.date} />
          </div>
        )}

        {/* ── MEET DAY GUIDE ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => router.push(`/meet/${meet.id}`)}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98]"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            Meet Day Guide →
          </button>

          {/* Add another meet option */}
          <div className="flex justify-center">
            {addMeetSheet}
          </div>
        </div>

        {/* ── PAST MEETS ──────────────────────────────────────────────── */}
        {pastMeets.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-3" style={{ color: C.text }}>Past Meets</h2>
            <div className="space-y-3">
              {pastMeets.map(({ meet: pm, bestSquat, bestBench, bestDeadlift, total, dots }) => (
                <div
                  key={pm.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold" style={{ color: C.text }}>{pm.name}</p>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {new Date(pm.date + 'T12:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        {' · '}{pm.federation}{' · '}{WEIGHT_CLASS_LABELS[pm.weightClass] ?? `${pm.weightClass} kg`}
                      </p>
                    </div>
                    {dots !== undefined && dots > 0 && (
                      <div className="text-right">
                        <p className="text-lg font-black" style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {dots}
                        </p>
                        <p className="text-xs" style={{ color: C.muted }}>DOTS</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'SQ', value: bestSquat },
                      { label: 'BP', value: bestBench },
                      { label: 'DL', value: bestDeadlift },
                      { label: 'Total', value: total > 0 ? total : undefined },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-sm font-bold" style={{ color: value ? C.text : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                          {value ? `${value}` : '—'}
                        </p>
                        <p className="text-xs" style={{ color: C.muted }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
