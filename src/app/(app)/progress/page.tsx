'use client';

/**
 * Progress — /progress
 *
 * Chart 1: Weekly Training Volume (last 8 weeks) — bar chart, coloured by block
 * Chart 2: Estimated 1RM Trend (last 12 weeks) — line chart, one line per SBD
 * Chart 3: RPE Accuracy (last 20 sessions) — bar chart, deviation from target
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { db }             from '@/lib/db/database';
import { estimateMax, calcDots, calcWilks, calcIpfPoints } from '@/lib/engine/calc';
import { C }              from '@/lib/theme';
import { nWeeksAgo, shortDate, weekStart } from '@/lib/date-utils';
import type { BlockType, AthleteProfile, BodyweightEntry } from '@/lib/db/types';

const BLOCK_COLOURS: Record<BlockType, string> = {
  ACCUMULATION:    C.blue,
  INTENSIFICATION: C.gold,
  REALIZATION:     C.accent,
  DELOAD:          C.muted,
  PIVOT:           '#8B5CF6',
  MAINTENANCE:     C.green,
};

const LIFT_COLOURS = {
  SQUAT:    C.accent,
  BENCH:    C.blue,
  DEADLIFT: C.gold,
} as const;

// ── Date helpers ───────────────────────────────────────────────────────────────
/** Returns 0 for this week, 1 for last week, etc. */
function weekIndex(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr + 'T12:00:00').getTime();
  return Math.floor(ms / (7 * 86_400_000));
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>;
  label?:  string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: C.surface,
        border:          `1px solid ${C.border}`,
        borderRadius:    10,
        padding:         '8px 12px',
        fontSize:        12,
      }}
    >
      {label && <p style={{ color: C.muted, marginBottom: 4 }}>{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          {p.unit ?? ''}
        </p>
      ))}
    </div>
  );
}

// ── Chart skeleton ─────────────────────────────────────────────────────────────
function ChartCard({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl p-4 mb-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-sm font-bold mb-0.5" style={{ color: C.text }}>{title}</p>
      {subtitle && <p className="text-xs mb-4" style={{ color: C.muted }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-36">
      <p className="text-sm" style={{ color: C.muted }}>{message}</p>
    </div>
  );
}

// ── Data types ─────────────────────────────────────────────────────────────────
interface VolumePoint {
  week:      string;   // "Jun 2"
  volume:    number;   // total kg
  blockType: BlockType | null;
}

interface E1rmPoint {
  week:     string;
  squat?:   number;
  bench?:   number;
  deadlift?: number;
}

interface RpePoint {
  session:   string;   // "Mon Jun 2"
  deviation: number;   // logged − target
}

interface BwPoint {
  date:     string;   // "Mar 2"
  weightKg: number;
}

interface CompScores {
  total:     number;
  dots:      number;
  wilks:     number;
  ipfPoints: number;
  bodyweight: number;
}

interface ProgressData {
  volumeData: VolumePoint[];
  e1rmData:   E1rmPoint[];
  rpeData:    RpePoint[];
  bwData:     BwPoint[];
  compScores: CompScores | null;
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const DEFAULT_WEEKS = 12;
const LOAD_MORE_WEEKS = 12;

export default function ProgressPage() {
  const [loading, setLoading]  = useState(true);
  const [weeksBack, setWeeksBack] = useState(DEFAULT_WEEKS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chartData, setChartData] = useState<ProgressData>({
    volumeData: [], e1rmData: [], rpeData: [], bwData: [], compScores: null,
  });

  const loadData = useCallback(async (weeks: number) => {
    // ── Shared: completed sessions ────────────────────────────────────
    const cutoff8w  = nWeeksAgo(Math.min(8, weeks));
    const cutoffAll = nWeeksAgo(weeks);

    const allSessions = await db.sessions
      .where('scheduledDate').aboveOrEqual(cutoffAll)
      .filter((s) => s.status === 'COMPLETED')
      .toArray();

    // ── Profile + Bodyweight ──────────────────────────────────────────
    const profile: AthleteProfile | undefined = await db.profile.get('me');
    const bwEntries: BodyweightEntry[] = await db.bodyweight
      .where('date').aboveOrEqual(cutoffAll)
      .sortBy('date');

    const bwData: BwPoint[] = bwEntries.map((e) => ({
      date:     shortDate(e.date),
      weightKg: Math.round(e.weightKg * 10) / 10,
    }));

    // ── Competition Scores ────────────────────────────────────────────
    let compScores: CompScores | null = null;
    if (profile) {
      const total = profile.maxSquat + profile.maxBench + profile.maxDeadlift;
      const bw    = bwEntries.length > 0
        ? bwEntries[bwEntries.length - 1].weightKg
        : profile.weightKg;

      if (total > 0 && bw > 0) {
        compScores = {
          total,
          bodyweight: bw,
          dots:      Math.round(calcDots(total, bw, profile.sex) * 10) / 10,
          wilks:     Math.round(calcWilks(total, bw, profile.sex) * 10) / 10,
          ipfPoints: Math.round(calcIpfPoints(total, bw, profile.sex) * 10) / 10,
        };
      }
    }

    const sessionIds = allSessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      return { volumeData: [], e1rmData: [], rpeData: [], bwData, compScores };
    }

    // Get all exercises & sets for these sessions
    const allExercises = await db.exercises.where('sessionId').anyOf(sessionIds).toArray();
    const allSets      = await db.sets.where('sessionId').anyOf(sessionIds).toArray();

    // Get block types for sessions in the 8-week window
    const sessions8w = allSessions.filter((s) => s.scheduledDate >= cutoff8w);
    const uniqueBlockIds = [...new Set(sessions8w.map((s) => s.blockId).filter(Boolean))];
    const blocks = uniqueBlockIds.length > 0
      ? await db.blocks.where('id').anyOf(uniqueBlockIds).toArray()
      : [];
    const blockTypeMap = new Map(blocks.map((b) => [b.id, b.blockType as BlockType]));

    // ── CHART 1: Weekly Volume (8 weeks) ─────────────────────────────
    const volumeByWeek = new Map<string, { volume: number; blockType: BlockType | null }>();

    const volWeeks = Math.min(8, weeks);
    for (let i = volWeeks - 1; i >= 0; i--) {
      const ws = weekStart(nWeeksAgo(i));
      if (!volumeByWeek.has(ws)) volumeByWeek.set(ws, { volume: 0, blockType: null });
    }

    for (const session of sessions8w) {
      const ws       = weekStart(session.scheduledDate);
      const sesssets = allSets.filter((sl) => sl.sessionId === session.id);
      const vol      = sesssets.reduce((acc, sl) => acc + sl.loadKg * sl.reps, 0);
      const bt       = blockTypeMap.get(session.blockId) ?? null;
      const existing = volumeByWeek.get(ws) ?? { volume: 0, blockType: null };
      volumeByWeek.set(ws, {
        volume:    existing.volume + vol,
        blockType: existing.blockType ?? bt,
      });
    }

    const volumeData: VolumePoint[] = [...volumeByWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ws, { volume, blockType }]) => ({
        week:      shortDate(ws),
        volume:    Math.round(volume),
        blockType,
      }));

    // ── CHART 2: Estimated 1RM Trend ──────────────────────────────────
    const compExerciseIds = new Set(
      allExercises
        .filter((e) => e.exerciseType === 'COMPETITION')
        .map((e) => e.id),
    );
    const compExMap = new Map(
      allExercises
        .filter((e) => e.exerciseType === 'COMPETITION')
        .map((e) => [e.id, e]),
    );
    const compSets = allSets.filter((sl) => compExerciseIds.has(sl.exerciseId));

    const sessionLiftMap = new Map(allSessions.map((s) => [s.id, s.primaryLift]));

    type LiftKey = 'squat' | 'bench' | 'deadlift';
    const e1rmByWeek = new Map<string, Partial<Record<LiftKey, number>>>();

    for (let i = weeks - 1; i >= 0; i--) {
      const ws = weekStart(nWeeksAgo(i));
      if (!e1rmByWeek.has(ws)) e1rmByWeek.set(ws, {});
    }

    for (const sl of compSets) {
      if (sl.reps <= 0 || sl.loadKg <= 0) continue;
      const exercise = compExMap.get(sl.exerciseId);
      if (!exercise) continue;
      const lift  = sessionLiftMap.get(exercise.sessionId);
      if (!lift || !['SQUAT', 'BENCH', 'DEADLIFT'].includes(lift)) continue;

      const liftKey = lift.toLowerCase() as LiftKey;
      const session  = allSessions.find((s) => s.id === exercise.sessionId);
      if (!session) continue;
      const ws    = weekStart(session.scheduledDate);
      const e1rm  = Math.round(estimateMax(sl.loadKg, sl.reps));
      const entry = e1rmByWeek.get(ws) ?? {};
      const prev  = entry[liftKey] ?? 0;
      if (e1rm > prev) {
        entry[liftKey] = e1rm;
        e1rmByWeek.set(ws, entry);
      }
    }

    const e1rmData: E1rmPoint[] = [...e1rmByWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ws, lifts]) => ({
        week:     shortDate(ws),
        ...(lifts.squat    !== undefined ? { squat:    lifts.squat    } : {}),
        ...(lifts.bench    !== undefined ? { bench:    lifts.bench    } : {}),
        ...(lifts.deadlift !== undefined ? { deadlift: lifts.deadlift } : {}),
      }));

    // ── CHART 3: RPE Accuracy (last 20 completed sessions) ────────────
    const exerciseRpeMap = new Map(allExercises.map((e) => [e.id, e.rpeTarget]));

    const recentSessions = allSessions
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 20);

    const rpeData: RpePoint[] = [];
    for (const session of recentSessions.reverse()) {
      const sesssets = allSets.filter((sl) => sl.sessionId === session.id && sl.rpeLogged !== undefined);
      if (sesssets.length === 0) continue;
      const deviations = sesssets.map((sl) => {
        const target = exerciseRpeMap.get(sl.exerciseId) ?? 7;
        return (sl.rpeLogged ?? 0) - target;
      });
      const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      rpeData.push({
        session: new Date(session.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        }),
        deviation: +avgDev.toFixed(2),
      });
    }

    return { volumeData, e1rmData, rpeData, bwData, compScores };
  }, []);

  // Initial load
  useEffect(() => {
    loadData(weeksBack).then((data) => {
      setChartData(data);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Load More" handler
  const handleLoadMore = useCallback(async () => {
    const nextWeeks = weeksBack + LOAD_MORE_WEEKS;
    setLoadingMore(true);
    const data = await loadData(nextWeeks);
    setChartData(data);
    setWeeksBack(nextWeeks);
    setLoadingMore(false);
  }, [weeksBack, loadData]);

  if (loading) {
    return (
      <div className="min-h-screen pb-4" style={{ backgroundColor: C.bg }}>
        <div className="max-w-lg mx-auto px-4 pt-8">
          <Skeleton className="h-8 w-32 mb-1" />
          <Skeleton className="h-4 w-56 mb-6" />
          {[180, 200, 180].map((h, i) => (
            <div
              key={i}
              className="rounded-3xl p-4 mb-5"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
            >
              <Skeleton className="h-4 w-40 mb-1" />
              <Skeleton className="h-3 w-64 mb-4" />
              <Skeleton className={`w-full rounded-xl`} style={{ height: h }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { volumeData, e1rmData, rpeData, bwData, compScores } = chartData;
  const hasVolume = volumeData.some((d) => d.volume > 0);
  const hasE1rm   = e1rmData.some((d) => d.squat || d.bench || d.deadlift);
  const hasRpe    = rpeData.length > 0;
  const hasBw     = bwData.length > 0;

  const axisProps = {
    tick:   { fill: C.muted, fontSize: 10 },
    stroke: 'transparent',
  };

  return (
    <div className="min-h-screen pb-4" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">

        <div className="pt-8 pb-5">
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>Progress</h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            Your training trends over time
          </p>
        </div>

        {/* ── COMPETITION SCORES ─────────────────────────────────────────── */}
        {compScores && (
          <div
            className="rounded-3xl p-4 mb-5"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <p className="text-sm font-bold mb-0.5" style={{ color: C.text }}>
              Competition Scores
            </p>
            <p className="text-xs mb-4" style={{ color: C.muted }}>
              Based on {compScores.total} kg total @ {compScores.bodyweight} kg BW
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'DOTS',    value: compScores.dots,      colour: C.accent },
                { label: 'Wilks',   value: compScores.wilks,     colour: C.gold   },
                { label: 'IPF GL',  value: compScores.ipfPoints, colour: C.blue   },
              ].map(({ label, value, colour }) => (
                <div key={label} className="text-center">
                  <p
                    className="text-2xl font-black"
                    style={{ color: colour, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {value}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: C.muted }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHART 1: WEEKLY VOLUME ────────────────────────────────────── */}
        <ChartCard
          title="Weekly Training Volume"
          subtitle="Total kg lifted per week (last 8 weeks)"
        >
          {hasVolume ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={volumeData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis
                  {...axisProps}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="volume" name="Volume (kg)" radius={[4, 4, 0, 0]}>
                  {volumeData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.blockType
                          ? BLOCK_COLOURS[entry.blockType]
                          : C.accent
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Complete some sessions to see your volume trend." />
          )}

          {/* Block legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {(Object.keys(BLOCK_COLOURS) as BlockType[])
              .filter((bt) => volumeData.some((d) => d.blockType === bt))
              .map((bt) => (
                <div key={bt} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLOCK_COLOURS[bt] }} />
                  <span className="text-xs" style={{ color: C.muted }}>
                    {bt.charAt(0) + bt.slice(1).toLowerCase()}
                  </span>
                </div>
              ))
            }
          </div>
        </ChartCard>

        {/* ── CHART 2: ESTIMATED 1RM TREND ─────────────────────────────── */}
        <ChartCard
          title="Estimated 1RM Trend"
          subtitle="Squat · Bench · Deadlift (last 12 weeks)"
        >
          {hasE1rm ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={e1rmData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} unit=" kg" />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) =>
                    <span style={{ color: C.muted, fontSize: 11 }}>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </span>
                  }
                />
                <Line
                  dataKey="squat"
                  name="Squat"
                  stroke={LIFT_COLOURS.SQUAT}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  dataKey="bench"
                  name="Bench"
                  stroke={LIFT_COLOURS.BENCH}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  dataKey="deadlift"
                  name="Deadlift"
                  stroke={LIFT_COLOURS.DEADLIFT}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Log sets with competition exercises to see 1RM trends." />
          )}
        </ChartCard>

        {/* ── CHART 3: RPE ACCURACY ─────────────────────────────────────── */}
        <ChartCard
          title="RPE Accuracy"
          subtitle="Logged RPE − target RPE per session (last 20 sessions)"
        >
          {hasRpe ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rpeData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.border} strokeDasharray="3 3" />
                  <XAxis dataKey="session" {...axisProps} />
                  <YAxis
                    {...axisProps}
                    domain={[-2, 2]}
                    tickCount={5}
                    tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4" />
                  <Bar dataKey="deviation" name="RPE deviation" radius={[4, 4, 0, 0]}>
                    {rpeData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          Math.abs(entry.deviation) < 0.5
                            ? C.green
                            : entry.deviation > 0
                            ? C.accent
                            : C.blue
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="flex gap-4 mt-3">
                {[
                  { colour: C.green,  label: 'On target (±0.5)'  },
                  { colour: C.accent, label: 'Overshooting'       },
                  { colour: C.blue,   label: 'Sandbagging'        },
                ].map(({ colour, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colour }} />
                    <span className="text-xs" style={{ color: C.muted }}>{label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState message="Log RPE on sets to see accuracy trends." />
          )}
        </ChartCard>

        {/* ── Weekly summary stats ──────────────────────────────────────── */}
        {hasVolume && (() => {
          const thisWeek  = volumeData[volumeData.length - 1]?.volume ?? 0;
          const lastWeek  = volumeData[volumeData.length - 2]?.volume ?? 0;
          const delta     = thisWeek - lastWeek;
          const pct       = lastWeek > 0 ? Math.round((delta / lastWeek) * 100) : 0;

          return (
            <div
              className="rounded-3xl p-4 mb-4 flex gap-4"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                  This Week
                </p>
                <p className="text-2xl font-black" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                  {thisWeek.toLocaleString()}
                </p>
                <p className="text-xs" style={{ color: C.muted }}>kg volume</p>
              </div>
              <div className="w-px" style={{ backgroundColor: C.border }} />
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                  vs Last Week
                </p>
                <p
                  className="text-2xl font-black"
                  style={{
                    color: delta >= 0 ? C.green : C.accent,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {delta >= 0 ? '+' : ''}{pct}%
                </p>
                <p className="text-xs" style={{ color: C.muted }}>
                  {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toLocaleString()} kg
                </p>
              </div>
            </div>
          );
        })()}

        {/* ── CHART 4: BODYWEIGHT TREND ─────────────────────────────────── */}
        {hasBw && (
          <ChartCard
            title="Bodyweight Trend"
            subtitle={`Last ${weeksBack} weeks`}
          >
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={bwData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} unit=" kg" domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  dataKey="weightKg"
                  name="Bodyweight"
                  stroke={C.green}
                  strokeWidth={2}
                  dot={{ r: 3, fill: C.green }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* ── LOAD MORE ───────────────────────────────────────────────────── */}
        <div className="flex justify-center py-4">
          <button
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
            style={{
              backgroundColor: C.surface,
              color: C.muted,
              border: `1px solid ${C.border}`,
            }}
          >
            {loadingMore ? 'Loading…' : `Load More (${weeksBack}+ weeks)`}
          </button>
        </div>

      </div>
    </div>
  );
}
