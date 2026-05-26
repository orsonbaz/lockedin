'use client';

/**
 * /mobility — Today landing.
 *
 * Three layers:
 *   1. Today's mobility flow — picks a tagged template (AM if pre-noon, PM
 *      otherwise) and offers a one-tap start.
 *   2. Routine library — all available routines (templates + custom),
 *      sorted by duration.
 *   3. Recent ROM card — most recent self-ratings, links to the library.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sunrise, Moon, Play, BookOpen, BarChart3, ArrowLeft, Flame } from 'lucide-react';
import { db } from '@/lib/db/database';
import {
  ensureSeeded,
  listRoutines,
  MOBILITY_BY_ID,
  MOBILITY_CATEGORY_LABELS,
} from '@/lib/mobility';
import { recentRatings, computeCarStreak } from '@/lib/mobility/rom-assessment';
import { getActiveArc } from '@/lib/arcs';
import { C } from '@/lib/theme';
import type { MobilityRoutine, MobilityRomEntry, TrainingArc } from '@/lib/db/types';

export default function MobilityHomePage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<MobilityRoutine[] | null>(null);
  const [recent, setRecent] = useState<MobilityRomEntry[]>([]);
  const [activeArc, setActiveArc] = useState<TrainingArc | null>(null);
  const [carStreak, setCarStreak] = useState<{ current: number; daysWithCarsLast7: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureSeeded();
      const [list, rom, arc, streak] = await Promise.all([
        listRoutines(),
        recentRatings(8),
        getActiveArc(),
        computeCarStreak(),
      ]);
      if (!cancelled) {
        setRoutines(list);
        setRecent(rom);
        setActiveArc(arc);
        setCarStreak(streak);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Sessions completed today — drives "done already" affordance.
  const completedTodayCount = useLiveQuery(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = await db.mobilitySessions.where('date').equals(today).toArray();
    return sessions.filter((s) => s.completedAt).length;
  }, []) ?? 0;

  const isAm = new Date().getHours() < 12;
  const recommended = pickRecommendedRoutine(routines ?? [], isAm);

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: C.bg, color: C.text }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: C.bg, borderColor: C.border }}
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
        <h1 className="flex-1 text-base font-semibold">Mobility</h1>
        <button
          type="button"
          onClick={() => router.push('/mobility/library')}
          className="text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
          style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
        >
          <BookOpen size={14} /> Library
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Phase D — Daily CARs card. Surfaces specifically when the active arc
            puts mobility in its priorities (FRC daily-input philosophy).
            Shows current streak; one-tap to the AM Reset routine. */}
        {activeArc && activeArc.priorities.includes('MOBILITY') && carStreak && (
          <button
            type="button"
            onClick={() => router.push('/mobility/am_reset_12min/run')}
            className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
            aria-label="Start AM Reset (daily CARs)"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${C.accent}20` }}
              >
                <Flame size={20} color={C.accent} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
                  Today's CARs · FRC daily input
                </p>
                <p className="text-base font-semibold mt-0.5" style={{ color: C.text }}>
                  {carStreak.current > 0
                    ? `${carStreak.current}-day CAR streak`
                    : 'Start the streak'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                  {carStreak.daysWithCarsLast7}/7 days this week · tap to run AM Reset
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Today's recommended flow */}
        {recommended ? (
          <RecommendedCard
            routine={recommended}
            isAm={isAm}
            completedToday={completedTodayCount}
            onStart={() => router.push(`/mobility/${recommended.id}/run`)}
          />
        ) : (
          <div
            className="rounded-2xl p-5 text-center text-sm"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
          >
            {routines === null ? 'Loading…' : 'No routines available yet.'}
          </div>
        )}

        {/* All routines */}
        <section>
          <SectionHeader>All routines</SectionHeader>
          <div className="grid grid-cols-2 gap-2">
            {(routines ?? []).map((r) => (
              <RoutineTile
                key={r.id}
                routine={r}
                onClick={() => router.push(`/mobility/${r.id}/run`)}
              />
            ))}
          </div>
        </section>

        {/* Recent ROM */}
        <section>
          <SectionHeader>
            <span className="inline-flex items-center gap-2">
              <BarChart3 size={14} style={{ color: C.muted }} /> Recent ROM
            </span>
          </SectionHeader>
          {recent.length === 0 ? (
            <div
              className="rounded-2xl p-4 text-xs"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
            >
              Log a routine — movements with a slider icon track your self-rating over time.
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden divide-y"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
            >
              {recent.map((r) => (
                <RomRow key={r.id} entry={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
      style={{ color: C.muted }}
    >
      {children}
    </p>
  );
}

function RecommendedCard({
  routine,
  isAm,
  completedToday,
  onStart,
}: {
  routine: MobilityRoutine;
  isAm: boolean;
  completedToday: number;
  onStart: () => void;
}) {
  const Icon = isAm ? Sunrise : Moon;
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${C.accent}1A`, color: C.accent }}
        >
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
            {isAm ? "Today's AM flow" : "Today's evening flow"}
          </p>
          <p className="text-base font-bold" style={{ color: C.text }}>{routine.name}</p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            ~{routine.durationMin} min · {routine.movementIds.length} movements
            {completedToday > 0 && ` · ${completedToday} done today`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.99]"
        style={{ backgroundColor: C.accent, color: '#1a1000' }}
      >
        <Play size={15} fill="#1a1000" /> Start flow
      </button>
    </div>
  );
}

function RoutineTile({
  routine,
  onClick,
}: {
  routine: MobilityRoutine;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-3 transition-all active:scale-[0.98]"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-sm font-semibold truncate" style={{ color: C.text }}>{routine.name}</p>
      <p className="text-[11px] mt-1" style={{ color: C.muted }}>
        {routine.durationMin} min · {routine.movementIds.length} mvts
      </p>
    </button>
  );
}

function RomRow({ entry }: { entry: MobilityRomEntry }) {
  const movement = MOBILITY_BY_ID.get(entry.movementId);
  const label = movement?.name ?? entry.movementId;
  const cat = movement ? MOBILITY_CATEGORY_LABELS[movement.category] : '';
  const rating = entry.selfRating;
  const ratingColor = rating === undefined
    ? C.muted
    : rating >= 75 ? C.green : rating >= 50 ? C.gold : C.red;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: C.text }}>{label}</p>
        <p className="text-[11px]" style={{ color: C.muted }}>
          {cat}{entry.side ? ` · ${entry.side}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <p className="text-sm font-bold tabular-nums" style={{ color: ratingColor }}>
          {rating ?? entry.measuredDegrees ?? '—'}
          <span className="text-[10px] font-normal ml-1" style={{ color: C.muted }}>
            {rating !== undefined ? '/100' : entry.measuredDegrees !== undefined ? '°' : ''}
          </span>
        </p>
        <p className="text-[10px]" style={{ color: C.muted }}>{entry.date}</p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickRecommendedRoutine(
  routines: MobilityRoutine[],
  isAm: boolean,
): MobilityRoutine | undefined {
  if (routines.length === 0) return undefined;
  const tag = isAm ? 'AM' : 'PM';
  const tagged = routines.find((r) => r.tags?.includes(tag));
  if (tagged) return tagged;
  // Fall back to the shortest daily routine, then the shortest overall.
  const daily = routines.find((r) => r.tags?.includes('daily'));
  return daily ?? routines[0];
}
