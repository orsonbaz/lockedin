'use client';

/**
 * Settings → Arcs — /settings/arcs
 *
 * Lists every training arc (active, planned, paused, completed). Tap a row
 * to edit / activate. Plus button → /settings/arcs/new.
 */

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Circle, CircleCheck } from 'lucide-react';
import { db, today } from '@/lib/db/database';
import {
  arcDayCount,
  ARC_STATUS_LABELS,
  ARC_PRIORITY_LABELS,
} from '@/lib/arcs';
import { C } from '@/lib/theme';
import type { TrainingArc, ArcStatus } from '@/lib/db/types';

const STATUS_ORDER: ArcStatus[] = ['ACTIVE', 'PAUSED', 'PLANNED', 'COMPLETED', 'ABANDONED'];

export default function ArcsListPage() {
  const router = useRouter();

  const arcs = useLiveQuery(async () => {
    const rows = await db.trainingArcs.toArray();
    rows.sort((a, b) => {
      // ACTIVE first, then by createdAt desc within each group.
      const sa = STATUS_ORDER.indexOf(a.status);
      const sb = STATUS_ORDER.indexOf(b.status);
      if (sa !== sb) return sa - sb;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, []);

  const grouped = (arcs ?? []).reduce<Record<ArcStatus, TrainingArc[]>>(
    (acc, arc) => {
      (acc[arc.status] ??= []).push(arc);
      return acc;
    },
    { ACTIVE: [], PAUSED: [], PLANNED: [], COMPLETED: [], ABANDONED: [] },
  );

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
        <h1 className="flex-1 text-base font-semibold" style={{ color: C.text }}>
          Training Arcs
        </h1>
        <button
          type="button"
          onClick={() => router.push('/settings/arcs/new')}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: C.accent, color: '#1a1000' }}
        >
          <Plus size={16} />
          New
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <p className="text-xs leading-relaxed mb-5" style={{ color: C.muted }}>
          An arc is the season of training you&apos;re in right now. The coach reads the
          active arc on every turn and frames its guidance inside it.
        </p>

        {arcs === undefined ? (
          <LoadingCard />
        ) : arcs.length === 0 ? (
          <EmptyState onCreate={() => router.push('/settings/arcs/new')} />
        ) : (
          STATUS_ORDER.map((status) => {
            const list = grouped[status];
            if (!list || list.length === 0) return null;
            return (
              <section key={status} className="mb-6">
                <p
                  className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
                  style={{ color: C.muted }}
                >
                  {ARC_STATUS_LABELS[status]}
                </p>
                <div
                  className="rounded-2xl overflow-hidden divide-y"
                  style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
                >
                  {list.map((arc) => (
                    <ArcRow
                      key={arc.id}
                      arc={arc}
                      onClick={() => router.push(`/settings/arcs/${arc.id}`)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function ArcRow({ arc, onClick }: { arc: TrainingArc; onClick: () => void }) {
  const day = arcDayCount(arc, today());
  const isActive = arc.status === 'ACTIVE';
  const Icon = isActive ? CircleCheck : Circle;
  const topPriorities = arc.priorities
    .slice(0, 2)
    .map((p) => ARC_PRIORITY_LABELS[p])
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors active:opacity-70"
      style={{ borderColor: C.border }}
    >
      <Icon
        size={18}
        color={isActive ? C.accent : C.muted}
        style={{
          flexShrink: 0,
          marginTop: 2,
          filter: isActive ? `drop-shadow(0 0 4px ${C.accent}80)` : 'none',
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
            {arc.name}
          </p>
          {isActive && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: C.accent, backgroundColor: `${C.accent}1A` }}
            >
              Day {day}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>
          {topPriorities || 'No priorities set'}
        </p>
        {arc.intent && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: C.muted }}>
            {arc.intent}
          </p>
        )}
      </div>
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <p className="text-sm font-medium mb-1" style={{ color: C.text }}>
        No arcs yet
      </p>
      <p className="text-xs mb-4 leading-relaxed" style={{ color: C.muted }}>
        Define what season of training you&apos;re in so the coach can frame every
        suggestion around your real-world context.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
        style={{ backgroundColor: C.accent, color: '#1a1000' }}
      >
        <Plus size={16} />
        Start your first arc
      </button>
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="rounded-2xl p-6 text-center text-xs"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
    >
      Loading arcs…
    </div>
  );
}
