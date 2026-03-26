'use client';

/**
 * Home Screen — /home
 *
 * Sections:
 *   1. Header (greeting + date + block label + settings icon)
 *   2. Readiness Ring (SVG, animated on mount)
 *   3. Today's Session Card
 *   4. Meet Countdown (if upcoming meet exists)
 *   5. Recent Training (horizontal scroll, last 3 sessions)
 */

import { useState, useEffect } from 'react';
import { useRouter }                    from 'next/navigation';
import { Skeleton }                     from '@/components/ui/skeleton';
import { Settings, ChevronRight }       from 'lucide-react';
import { db, today }                    from '@/lib/db/database';
import { readinessLabel }               from '@/lib/engine/readiness';
import { RingProgress }                 from '@/components/lockedin/RingProgress';
import { C }                            from '@/lib/theme';
import { greeting, daysUntil }          from '@/lib/date-utils';
import type {
  AthleteProfile, ReadinessRecord, TrainingSession,
  SessionExercise, TrainingBlock, TrainingCycle, Meet,
} from '@/lib/db/types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateFull(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function estimateDuration(exercises: SessionExercise[]): number {
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets, 0);
  return totalSets * 4 + exercises.length * 2;
}


// ── Main page ──────────────────────────────────────────────────────────────────
interface HomeData {
  profile:        AthleteProfile | null;
  readiness:      ReadinessRecord | null;
  session:        TrainingSession | null;
  exercises:      SessionExercise[];
  block:          TrainingBlock | null;
  cycle:          TrainingCycle | null;
  upcomingMeet:   Meet | null;
  recentSessions: Array<{ session: TrainingSession; volume: number; avgRpe?: number }>;
}

export default function HomePage() {
  const router              = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [data,    setData]    = useState<HomeData>({
    profile: null, readiness: null, session: null, exercises: [],
    block: null, cycle: null, upcomingMeet: null, recentSessions: [],
  });

  useEffect(() => {
    async function load() {
      const todayStr = today();

      const [profile, readiness, activeCycle, upcomingMeet] = await Promise.all([
        db.profile.get('me'),
        db.readiness.where('date').equals(todayStr).first(),
        db.cycles.filter((c) => c.status === 'ACTIVE').first(),
        db.meets.filter((m) => m.status === 'UPCOMING').first(),
      ]);

      const session = (await db.sessions.where('scheduledDate').equals(todayStr).first()) ?? null;

      const exercises = session
        ? await db.exercises.where('sessionId').equals(session.id).toArray()
        : [];

      let block: TrainingBlock | null = null;
      if (activeCycle) {
        block = (await db.blocks
          .where('cycleId').equals(activeCycle.id)
          .filter((b) =>
            b.weekStart <= activeCycle.currentWeek &&
            b.weekEnd   >= activeCycle.currentWeek,
          )
          .first()) ?? null;
      }

      const completedAll = await db.sessions
        .filter((s) => s.status === 'COMPLETED' && s.scheduledDate < todayStr)
        .toArray();
      const last3 = completedAll
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, 3);

      const recentSessions = await Promise.all(
        last3.map(async (s) => {
          const sets   = await db.sets.where('sessionId').equals(s.id).toArray();
          const volume = sets.reduce((acc, sl) => acc + sl.loadKg * sl.reps, 0);
          const rpeSets = sets.filter((sl) => sl.rpeLogged !== undefined);
          const avgRpe  = rpeSets.length > 0
            ? rpeSets.reduce((acc, sl) => acc + (sl.rpeLogged ?? 0), 0) / rpeSets.length
            : undefined;
          return { session: s, volume, avgRpe };
        }),
      );

      setData({
        profile: profile ?? null,
        readiness: readiness ?? null,
        session, exercises, block,
        cycle: activeCycle ?? null,
        upcomingMeet: upcomingMeet ?? null,
        recentSessions,
      });
      setLoading(false);
    }
    load().catch((err) => {
      console.error('[Home] load failed:', err);
      setLoadError(true);
      setLoading(false);
    });
  }, []);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-center px-6">
          <p className="text-lg font-semibold mb-2" style={{ color: C.text }}>
            Couldn&apos;t load your data
          </p>
          <p className="text-sm mb-4" style={{ color: C.muted }}>
            There was a problem reading from the local database.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
        <div className="max-w-lg mx-auto px-4 pt-8">
          {/* Header skeleton */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <Skeleton className="h-7 w-52 mb-2" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
          {/* Readiness ring skeleton */}
          <div
            className="rounded-3xl p-5 mb-4 flex items-center gap-5"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <Skeleton className="w-[120px] h-[120px] rounded-full flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          {/* Session card skeleton */}
          <div
            className="rounded-3xl p-5 mb-4"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <Skeleton className="h-5 w-28 rounded-full mb-3" />
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-3/4 mb-4" />
            <Skeleton className="h-16 w-full rounded-2xl mb-4" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const { profile, readiness, session, exercises, block, upcomingMeet, recentSessions } = data;
  const rdScore   = readiness?.readinessScore ?? 0;
  const rdInfo    = readinessLabel(rdScore);
  const hasCheckin = readiness !== null;

  const isCompleted = session?.status === 'COMPLETED';
  const isRest      = !session;

  const totalSets   = exercises.reduce((acc, ex) => acc + ex.sets, 0);
  const estDuration = estimateDuration(exercises);

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">

        {/* ── 1. HEADER ────────────────────────────────────────────────── */}
        <div className="pt-8 pb-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: C.text }}>
              {greeting()}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}.
            </h1>
            <p className="text-sm mt-0.5 flex items-center gap-2" style={{ color: C.muted }}>
              {formatDateFull()}
              {block && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${C.gold}20`, color: C.gold }}
                >
                  {block.blockType.charAt(0) + block.blockType.slice(1).toLowerCase()}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="mt-1 p-2 rounded-xl transition-all active:scale-95"
            style={{ color: C.muted, backgroundColor: C.surface }}
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* ── 2. READINESS RING ─────────────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 mb-4 flex items-center gap-5"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <RingProgress
            score={rdScore}
            color={rdInfo.colour}
            label={rdInfo.label}
            hasData={hasCheckin}
            animate
          />

          <div className="flex-1">
            {hasCheckin ? (
              <>
                <p className="text-sm font-semibold mb-2" style={{ color: C.text }}>
                  Today: <span style={{ color: rdInfo.colour }}>{rdInfo.label}</span>
                </p>
                <div className="flex flex-col gap-0.5">
                  {readiness?.sleepHours !== undefined && (
                    <p className="text-xs" style={{ color: C.muted }}>
                      😴 {readiness.sleepHours}h sleep
                      {readiness.sleepQuality !== undefined && ` · quality ${readiness.sleepQuality}/5`}
                    </p>
                  )}
                  {readiness?.hrv !== undefined && (
                    <p className="text-xs" style={{ color: C.muted }}>
                      💓 HRV {readiness.hrv} ms
                    </p>
                  )}
                  {readiness?.energy !== undefined && (
                    <p className="text-xs" style={{ color: C.muted }}>
                      ⚡ Energy {readiness.energy}/5 · Motivation {readiness.motivation}/5
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>
                  Check in to unlock today's session
                </p>
                <p className="text-xs mb-3" style={{ color: C.muted }}>
                  Log HRV, sleep and energy to personalise your training load.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/checkin')}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{ backgroundColor: C.accent, color: '#fff' }}
                >
                  Check In Now
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── 3. TODAY'S SESSION ────────────────────────────────────────── */}
        {isRest ? (
          <div
            className="rounded-3xl p-5 mb-4 text-center"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <p className="text-4xl mb-2">🛋️</p>
            <p className="text-base font-bold mb-1" style={{ color: C.text }}>Rest Day</p>
            <p className="text-sm" style={{ color: C.muted }}>
              Let the adaptations happen. Eat, sleep, recover.
            </p>
          </div>
        ) : (
          <div
            className="rounded-3xl overflow-hidden mb-4 relative"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-[0.06] pointer-events-none"
              style={{ backgroundColor: C.accent, filter: 'blur(40px)' }}
            />
            <div className="p-5">
              <span
                className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                style={{ backgroundColor: `${C.gold}20`, color: C.gold }}
              >
                {session!.sessionType}
              </span>

              <h2 className="text-2xl font-black mb-1 leading-tight" style={{ color: C.text }}>
                {session!.primaryLift} DAY
              </h2>

              {session!.coachNote && (
                <p
                  className="text-sm italic mb-4"
                  style={{
                    color: C.muted,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                  }}
                >
                  &ldquo;{session!.coachNote}&rdquo;
                </p>
              )}

              {/* Stats */}
              <div className="flex gap-4 mb-4 py-3 rounded-2xl px-4" style={{ backgroundColor: C.dim }}>
                {[
                  { label: 'Sets',      value: String(totalSets)    },
                  { label: 'Exercises', value: String(exercises.length) },
                  { label: 'Min est.',  value: String(estDuration)  },
                ].map((stat, i, arr) => (
                  <div key={stat.label} className="flex-1 flex items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-xl font-bold" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                        {stat.value}
                      </p>
                      <p className="text-xs" style={{ color: C.muted }}>{stat.label}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-px h-8 self-center" style={{ backgroundColor: C.border }} />
                    )}
                  </div>
                ))}
              </div>

              {session!.aiModifications && !isCompleted && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs font-semibold"
                  style={{ backgroundColor: `${C.gold}15`, color: C.gold }}
                >
                  ⚡ Session adjusted for today's readiness
                </div>
              )}

              {isCompleted ? (
                <div
                  className="w-full py-3 rounded-2xl text-base font-bold text-center"
                  style={{ backgroundColor: `${C.green}20`, color: C.green }}
                >
                  ✓ Session Complete — great work!
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push(`/session/${session!.id}`)}
                  className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98]"
                  style={{ backgroundColor: C.accent, color: '#fff' }}
                >
                  Start Session →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 4. MEET COUNTDOWN ─────────────────────────────────────────── */}
        {upcomingMeet && (
          <button
            type="button"
            onClick={() => router.push('/meet')}
            className="w-full rounded-3xl p-4 mb-4 flex items-center gap-4 transition-all active:scale-[0.99]"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, textAlign: 'left' }}
          >
            <div
              className="flex-shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center"
              style={{ backgroundColor: `${C.accent}20` }}
            >
              <span
                className="text-xl font-black leading-none"
                style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}
              >
                {daysUntil(upcomingMeet.date)}
              </span>
              <span className="text-xs" style={{ color: C.muted }}>days</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>
                Upcoming Meet
              </p>
              <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                {upcomingMeet.name}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>
                {upcomingMeet.weightClass} kg · {upcomingMeet.federation} · View Meet Prep →
              </p>
            </div>
            <ChevronRight size={18} color={C.muted} />
          </button>
        )}

        {/* ── 5. RECENT TRAINING ─────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
              Recent Training
            </p>
            <div className="overflow-x-auto pb-1 -mx-4 px-4">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {recentSessions.map(({ session: s, volume, avgRpe }) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => router.push(`/session/${s.id}`)}
                    className="flex-shrink-0 w-36 rounded-2xl p-3 flex flex-col gap-1 transition-all active:scale-95"
                    style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, textAlign: 'left' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: C.muted }}>
                        {new Date(s.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </span>
                      <span style={{ color: s.status === 'COMPLETED' ? C.green : C.muted, fontSize: 12 }}>
                        {s.status === 'COMPLETED' ? '✓' : '—'}
                      </span>
                    </div>
                    <p className="text-sm font-bold" style={{ color: C.text }}>{s.primaryLift}</p>
                    {volume > 0 && (
                      <p className="text-xs" style={{ color: C.muted }}>
                        {Math.round(volume).toLocaleString()} kg
                      </p>
                    )}
                    {avgRpe !== undefined && (
                      <p className="text-xs" style={{ color: C.muted }}>
                        RPE {avgRpe.toFixed(1)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
