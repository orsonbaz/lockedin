'use client';

/**
 * /health/strength — side-by-side strength dashboard.
 *
 * v8 framing: barbell SBD and weighted calisthenics are co-equal expressions
 * of strength. This page shows both tracks at the same level of hierarchy.
 * The "1RM" label gets replaced with "CHS" (Comfortable Heavy Single — RPE 8,
 * full ROM, no grinder) per the longevity-first redesign.
 *
 * The deep charts (volume / 1RM trend / RPE accuracy) still live on
 * /progress for now; phase 10 will fold them in here.
 */

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Activity, TrendingUp, ArrowRight } from 'lucide-react';
import { db } from '@/lib/db/database';
import { C } from '@/lib/theme';
import type { AthleteProfile } from '@/lib/db/types';

interface TrackCard {
  label: string;
  lifts: Array<{ name: string; valueKg: number | undefined; subscript: string }>;
}

export default function StrengthDashboardPage() {
  const router = useRouter();

  const profile = useLiveQuery(() => db.profile.get('me'), []);

  const sessionsLast30 = useLiveQuery(async () => {
    const cutoff = isoDaysAgo(30);
    const rows = await db.sessions
      .filter((s) => s.status === 'COMPLETED' && s.scheduledDate >= cutoff)
      .toArray();
    return rows;
  }, []);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  const sessions30 = sessionsLast30 ?? [];
  const sessions7 = sessions30.filter((s) => s.scheduledDate >= isoDaysAgo(7));

  const barbell: TrackCard = {
    label: 'Barbell',
    lifts: [
      { name: 'Squat', valueKg: profile.maxSquat, subscript: 'CHS' },
      { name: 'Bench', valueKg: profile.maxBench, subscript: 'CHS' },
      { name: 'Deadlift', valueKg: profile.maxDeadlift, subscript: 'CHS' },
    ],
  };

  const calisthenics: TrackCard = {
    label: 'Weighted Calisthenics',
    lifts: [
      { name: 'Weighted chin-up', valueKg: profile.maxWeightedPullUp, subscript: '+added load' },
      { name: 'Weighted dip', valueKg: profile.maxWeightedDip, subscript: '+added load' },
      { name: 'Muscle-up', valueKg: profile.maxWeightedMuscleUp, subscript: '+added load' },
    ],
  };

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: C.bg, color: C.text }}>
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
        <h1 className="flex-1 text-base font-semibold">Strength</h1>
        <button
          type="button"
          onClick={() => router.push('/progress')}
          className="text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
          style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
        >
          <TrendingUp size={14} /> Trends
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        <p className="text-xs px-1 leading-relaxed" style={{ color: C.muted }}>
          Both tracks count. <strong style={{ color: C.text }}>CHS</strong> = Comfortable
          Heavy Single (RPE 8, full ROM, no grinder) — the v8 default for tracking strength
          sustainably.
        </p>

        <TrackPanel track={barbell} onEdit={() => router.push('/settings')} />
        <TrackPanel track={calisthenics} onEdit={() => router.push('/settings')} />

        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
            Volume snapshot
          </p>
          <div
            className="rounded-2xl p-4 grid grid-cols-2 gap-3"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <Stat label="Sessions · 7d" value={sessions7.length} hint="target 3" />
            <Stat label="Sessions · 30d" value={sessions30.length} hint="target 12-15" />
          </div>
        </section>

        <button
          type="button"
          onClick={() => router.push('/progress')}
          className="w-full text-left rounded-2xl p-4 inline-flex items-center gap-3"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${C.blue}1A`, color: C.blue }}
          >
            <Activity size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: C.text }}>
              Volume / 1RM trend / RPE accuracy
            </p>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Detailed charts on /progress — kept intact pending the phase-10 merge.
            </p>
          </div>
          <ArrowRight size={14} style={{ color: C.muted }} />
        </button>
      </div>
    </div>
  );
}

function TrackPanel({ track, onEdit }: { track: TrackCard; onEdit: () => void }) {
  return (
    <section>
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
          {track.label}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] font-medium"
          style={{ color: C.muted }}
        >
          Edit in Settings
        </button>
      </div>
      <div
        className="rounded-2xl overflow-hidden divide-y"
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          borderColor: C.border,
        }}
      >
        {track.lifts.map((lift) => (
          <div key={lift.name} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium" style={{ color: C.text }}>{lift.name}</p>
              <p className="text-[10px]" style={{ color: C.muted }}>{lift.subscript}</p>
            </div>
            <p className="text-lg font-black tabular-nums" style={{ color: lift.valueKg ? C.text : C.muted }}>
              {lift.valueKg ? `${lift.valueKg}` : '—'}
              <span className="text-[11px] font-normal ml-0.5" style={{ color: C.muted }}>kg</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="text-2xl font-black tabular-nums" style={{ color: C.text }}>
        {value}
      </p>
      <p className="text-[10px]" style={{ color: C.muted }}>{hint}</p>
    </div>
  );
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
