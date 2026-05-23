'use client';

/**
 * /health — the longevity-first dashboard.
 *
 * Layout:
 *   1. Big longevity ring + score (computed on each mount + persisted)
 *   2. Seven pillar cards in a grid — sleep, cardio, strength, mobility,
 *      recovery, nutrition, injury risk. Each links into the sub-page where
 *      the athlete can act on that pillar.
 *   3. Recent injuries banner (if any active).
 *   4. 14-day score sparkline.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Moon, Heart, Dumbbell, Activity, Battery, UtensilsCrossed, ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { db } from '@/lib/db/database';
import {
  computeSnapshot,
  recentSnapshots,
  PILLAR_WEIGHTS,
  type PillarKey,
  type ComputedSnapshot,
} from '@/lib/engine/longevity';
import { listActiveInjuries } from '@/lib/injuries';
import { C } from '@/lib/theme';
import type { LongevitySnapshot, Injury } from '@/lib/db/types';
import type { LucideIcon } from 'lucide-react';

interface PillarMeta {
  key: PillarKey;
  label: string;
  short: string;
  icon: LucideIcon;
  route?: string;
}

const PILLARS: PillarMeta[] = [
  { key: 'sleep',      label: 'Sleep',       short: '7d hours + quality',      icon: Moon,            route: '/settings/wearables' },
  { key: 'cardio',     label: 'Cardio',      short: 'Zone 2 / wk vs target',   icon: Heart,           route: '/health/cardio' },
  { key: 'strength',   label: 'Strength',    short: 'Sessions / wk',           icon: Dumbbell,        route: '/health/strength' },
  { key: 'mobility',   label: 'Mobility',    short: 'Routines / wk',           icon: Activity,        route: '/mobility' },
  { key: 'recovery',   label: 'Recovery',    short: 'HRV vs 28d baseline',     icon: Battery,         route: '/checkin' },
  { key: 'nutrition',  label: 'Nutrition',   short: 'Protein + kcal band',     icon: UtensilsCrossed, route: '/nutrition' },
  { key: 'injuryRisk', label: 'Injury risk', short: 'Active injuries',         icon: ShieldAlert,     route: '/health/injuries' },
];

export default function HealthDashboardPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ComputedSnapshot | null>(null);
  const [history, setHistory] = useState<LongevitySnapshot[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);

  // Recompute when the page mounts so the score reflects whatever the
  // athlete just did (logged a flow, completed a session, etc.).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [snap, hist, inj] = await Promise.all([
        computeSnapshot(),
        recentSnapshots(14),
        listActiveInjuries(),
      ]);
      if (!cancelled) {
        setSnapshot(snap);
        setHistory(hist);
        setInjuries(inj);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // React to underlying changes — when a snapshot is persisted, history
  // refreshes via the live query.
  const liveHistory = useLiveQuery(async () => {
    const rows = await db.longevitySnapshots.toArray();
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  }, []);
  useEffect(() => { if (liveHistory) setHistory(liveHistory); }, [liveHistory]);

  const trend = computeTrend(history);

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
        <h1 className="flex-1 text-base font-semibold">Health</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Big ring */}
        <RingCard snapshot={snapshot} trend={trend} />

        {/* Injury banner */}
        {injuries.length > 0 && (
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{
              backgroundColor: `${C.red}10`,
              border: `1px solid ${C.red}40`,
            }}
          >
            <ShieldAlert size={18} style={{ color: C.red, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: C.text }}>
                {injuries.length} active injur{injuries.length === 1 ? 'y' : 'ies'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                {injuries.slice(0, 2).map((i) => i.label).join(' · ')}{injuries.length > 2 ? ` (+${injuries.length - 2})` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/health/injuries')}
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: C.red }}
            >
              Manage
            </button>
          </div>
        )}

        {/* Pillars grid */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-2" style={{ color: C.muted }}>
            Pillars
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PILLARS.map((p) => (
              <PillarCard
                key={p.key}
                meta={p}
                value={snapshot?.pillars[p.key] ?? 0}
                onClick={() => p.route && router.push(p.route)}
              />
            ))}
          </div>
        </section>

        {/* 14-day sparkline */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-2" style={{ color: C.muted }}>
            14-day trend
          </p>
          <Sparkline history={history} />
        </section>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function RingCard({
  snapshot,
  trend,
}: {
  snapshot: ComputedSnapshot | null;
  trend: { dir: 'up' | 'down' | 'flat'; delta: number };
}) {
  const score = snapshot?.score ?? 0;
  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <RingProgress score={score} size={120} />
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
          Longevity score
        </p>
        <p className="text-3xl font-black tabular-nums" style={{ color: C.text }}>
          {snapshot ? score : '—'}
          <span className="text-base font-normal" style={{ color: C.muted }}> / 100</span>
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: trend.dir === 'up' ? C.green : trend.dir === 'down' ? C.red : C.muted }}
        >
          {trendArrow(trend.dir)} {trend.delta > 0 ? '+' : ''}{trend.delta} vs 7 days ago
        </p>
      </div>
    </div>
  );
}

function PillarCard({
  meta,
  value,
  onClick,
}: {
  meta: PillarMeta;
  value: number;
  onClick: () => void;
}) {
  const Icon = meta.icon;
  const color = value >= 70 ? C.green : value >= 40 ? C.gold : C.red;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-3 transition-all active:scale-[0.98]"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: C.text }}>{meta.label}</p>
          <p className="text-[10px]" style={{ color: C.muted }}>{meta.short}</p>
        </div>
        <ChevronRight size={12} style={{ color: C.muted }} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-black tabular-nums" style={{ color }}>{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: C.muted }}>
          / 100
        </p>
        <p className="text-[9px] ml-auto" style={{ color: C.muted }}>
          {Math.round(PILLAR_WEIGHTS[meta.key] * 100)}% wt
        </p>
      </div>
      <div className="h-1 mt-2 rounded-full overflow-hidden" style={{ backgroundColor: C.dim }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </button>
  );
}

function RingProgress({ score, size }: { score: number; size: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 70 ? C.green : score >= 40 ? C.gold : C.red;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={C.dim}
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          transition: 'stroke-dashoffset 0.6s ease-out',
          filter: `drop-shadow(0 0 8px ${color}80)`,
        }}
      />
    </svg>
  );
}

function Sparkline({ history }: { history: LongevitySnapshot[] }) {
  if (history.length < 2) {
    return (
      <div
        className="rounded-2xl p-6 text-center text-xs"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
      >
        Need at least 2 days of history.
      </div>
    );
  }
  // history is newest first; reverse for left-to-right time.
  const points = [...history].reverse();
  const width = 320;
  const height = 80;
  const pad = 6;
  const max = Math.max(...points.map((p) => p.score), 100);
  const min = Math.min(...points.map((p) => p.score), 0);
  const range = max - min || 1;

  const xStep = (width - pad * 2) / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => {
      const x = pad + i * xStep;
      const y = pad + (1 - (p.score - min) / range) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={path} fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between text-[10px] mt-1" style={{ color: C.muted }}>
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeTrend(history: LongevitySnapshot[]): { dir: 'up' | 'down' | 'flat'; delta: number } {
  if (history.length < 2) return { dir: 'flat', delta: 0 };
  // history is newest-first
  const today = history[0].score;
  const sevenAgo = history[Math.min(7, history.length - 1)].score;
  const delta = today - sevenAgo;
  return {
    dir: delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat',
    delta,
  };
}

function trendArrow(dir: 'up' | 'down' | 'flat'): string {
  return dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
}
