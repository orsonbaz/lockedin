'use client';

/**
 * /health/injuries — list view.
 *
 * Grouped by status (hot stuff first). Tap row → detail. New button → /new.
 * Until /health is built (phase 7) this is reachable from /settings.
 */

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Activity, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db/database';
import {
  INJURY_STATUS_LABELS,
  INJURY_STATUS_ORDER,
  BODY_REGION_LABELS,
} from '@/lib/injuries';
import { C } from '@/lib/theme';
import type { Injury, InjuryStatus } from '@/lib/db/types';

export default function InjuriesListPage() {
  const router = useRouter();

  const injuries = useLiveQuery(async () => {
    const rows = await db.injuries.toArray();
    rows.sort((a, b) => {
      const sa = INJURY_STATUS_ORDER.indexOf(a.status);
      const sb = INJURY_STATUS_ORDER.indexOf(b.status);
      if (sa !== sb) return sa - sb;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return rows;
  }, []);

  const grouped = (injuries ?? []).reduce<Record<InjuryStatus, Injury[]>>(
    (acc, inj) => {
      (acc[inj.status] ??= []).push(inj);
      return acc;
    },
    { ACUTE: [], SUBACUTE: [], REHAB: [], MANAGING: [], CHRONIC: [], RESOLVED: [] },
  );

  // One-shot migration banner: any injuries with the "Migrated from
  // athleteMemory" note hint were created by the v8 upgrade. Surface a
  // banner so the athlete can review + tighten the regions / constraints.
  const migrated = (injuries ?? []).filter((i) =>
    i.notes?.startsWith('Migrated from athleteMemory') && i.status !== 'RESOLVED',
  );

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
        <h1 className="flex-1 text-base font-semibold">Injuries</h1>
        <button
          type="button"
          onClick={() => router.push('/health/injuries/new')}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: C.accent, color: '#1a1000' }}
        >
          <Plus size={16} />
          Log
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {migrated.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: `${C.gold}10`, border: `1px solid ${C.gold}40` }}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} style={{ color: C.gold, flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: C.text }}>
                  {migrated.length} injur{migrated.length === 1 ? 'y' : 'ies'} carried over from coach memory
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: C.muted }}>
                  Quick check: open each to confirm the regions and add any patterns
                  to contraindicate. The swap engine reads these now.
                </p>
              </div>
            </div>
          </div>
        )}

        {injuries === undefined ? (
          <LoadingCard />
        ) : injuries.length === 0 ? (
          <EmptyState onCreate={() => router.push('/health/injuries/new')} />
        ) : (
          INJURY_STATUS_ORDER.map((status) => {
            const list = grouped[status];
            if (!list || list.length === 0) return null;
            return (
              <section key={status}>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2 px-1"
                  style={{ color: C.muted }}
                >
                  {INJURY_STATUS_LABELS[status]} ({list.length})
                </p>
                <div
                  className="rounded-2xl overflow-hidden divide-y"
                  style={{
                    backgroundColor: C.surface,
                    border: `1px solid ${C.border}`,
                    borderColor: C.border,
                  }}
                >
                  {list.map((inj) => (
                    <InjuryRow
                      key={inj.id}
                      injury={inj}
                      onClick={() => router.push(`/health/injuries/${inj.id}`)}
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

function InjuryRow({ injury, onClick }: { injury: Injury; onClick: () => void }) {
  const regions = injury.regions.slice(0, 3).map((r) => BODY_REGION_LABELS[r]).join(' · ');
  const severityColor = injury.severity >= 4 ? C.red : injury.severity >= 3 ? C.gold : C.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-4 py-3.5 active:opacity-70 transition-opacity"
    >
      <Activity size={16} style={{ color: severityColor, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
            {injury.label}
          </p>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: severityColor, backgroundColor: `${severityColor}1A` }}
          >
            S{injury.severity}
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>
          {regions || 'No regions'}{injury.regions.length > 3 ? ` (+${injury.regions.length - 3})` : ''}
        </p>
        {injury.contraindicatedPatterns.length > 0 && (
          <p className="text-[11px] mt-1" style={{ color: C.muted }}>
            Avoiding: {injury.contraindicatedPatterns.slice(0, 3).join(', ').toLowerCase().replace(/_/g, ' ')}
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
        No injuries logged
      </p>
      <p className="text-xs mb-4 leading-relaxed" style={{ color: C.muted }}>
        Logging a structured injury lets the swap engine route around contraindicated movements
        — way more reliable than relying on the coach to remember in chat.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
        style={{ backgroundColor: C.accent, color: '#1a1000' }}
      >
        <Plus size={16} />
        Log an injury
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
      Loading…
    </div>
  );
}
