'use client';

/**
 * /health/cardio — zone 2 + steps + manual log.
 *
 * Reads zone 2 minutes and step counts from wearableMetrics for the last 7d
 * and 30d, shows progress against weekly target (default 150 min), and
 * provides a quick manual-log card for athletes without wearables.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Heart, Footprints } from 'lucide-react';
import { db, newId, today } from '@/lib/db/database';
import { C } from '@/lib/theme';
import type { WearableMetric } from '@/lib/db/types';

const WEEKLY_ZONE2_TARGET_MIN = 150;
const DAILY_STEP_TARGET = 8000;

export default function CardioPage() {
  const router = useRouter();

  // Last 30 days of relevant metrics.
  const zone2Recent = useLiveQuery(async () => {
    const cutoff = isoDaysAgo(30);
    const rows = await db.wearableMetrics
      .where('[date+metricKind]')
      .between([cutoff, 'ZONE_2_MINUTES'], [today(), 'ZONE_2_MINUTES￿'])
      .toArray();
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const stepsRecent = useLiveQuery(async () => {
    const cutoff = isoDaysAgo(30);
    const rows = await db.wearableMetrics
      .where('[date+metricKind]')
      .between([cutoff, 'STEPS'], [today(), 'STEPS￿'])
      .toArray();
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const zone2_7d = useMemo(() => sumLast(zone2Recent ?? [], 7), [zone2Recent]);
  const zone2_30d = useMemo(() => sumLast(zone2Recent ?? [], 30), [zone2Recent]);
  const steps_avg_7d = useMemo(() => avgLast(stepsRecent ?? [], 7), [stepsRecent]);
  const steps_avg_30d = useMemo(() => avgLast(stepsRecent ?? [], 30), [stepsRecent]);

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: C.bg, color: C.text }}>
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
        <h1 className="flex-1 text-base font-semibold">Cardio</h1>
        <button
          type="button"
          onClick={() => router.push('/settings/wearables')}
          className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
        >
          Import
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Zone 2 weekly tracker */}
        <Card>
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${C.red}1A`, color: C.red }}
            >
              <Heart size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
                Zone 2 this week
              </p>
              <p className="text-3xl font-black tabular-nums" style={{ color: C.text }}>
                {zone2_7d}
                <span className="text-base font-normal" style={{ color: C.muted }}> / {WEEKLY_ZONE2_TARGET_MIN} min</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                30d total: {zone2_30d} min
              </p>
            </div>
          </div>
          <ProgressBar value={zone2_7d} max={WEEKLY_ZONE2_TARGET_MIN} color={C.red} />
        </Card>

        {/* Steps daily avg */}
        <Card>
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${C.blue}1A`, color: C.blue }}
            >
              <Footprints size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
                Steps · daily avg
              </p>
              <p className="text-3xl font-black tabular-nums" style={{ color: C.text }}>
                {steps_avg_7d.toLocaleString()}
                <span className="text-base font-normal" style={{ color: C.muted }}> 7d</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                30d avg: {steps_avg_30d.toLocaleString()}
              </p>
            </div>
          </div>
          <ProgressBar value={steps_avg_7d} max={DAILY_STEP_TARGET} color={C.blue} />
        </Card>

        {/* Manual log */}
        <ManualLogCard />

        {/* Last 30d list */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-2" style={{ color: C.muted }}>
            Last 30 days
          </p>
          {(zone2Recent && zone2Recent.length > 0) || (stepsRecent && stepsRecent.length > 0) ? (
            <div
              className="rounded-2xl overflow-hidden divide-y"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
            >
              {mergeMetrics(zone2Recent ?? [], stepsRecent ?? []).slice(0, 14).map((row) => (
                <div key={row.date} className="px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: C.text }}>{row.date}</p>
                  <div className="flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                    {row.zone2 !== undefined && <span><Heart size={11} className="inline mr-1" />{row.zone2} min</span>}
                    {row.steps !== undefined && <span><Footprints size={11} className="inline mr-1" />{row.steps.toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 text-xs"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
            >
              No cardio data yet. Import a wearable export or log manually below.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.dim }}>
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ManualLogCard() {
  const [date, setDate] = useState(today());
  const [zone2Min, setZone2Min] = useState('');
  const [steps, setSteps] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const z = parseInt(zone2Min, 10);
    const s = parseInt(steps, 10);
    const rows: WearableMetric[] = [];
    const nowIso = new Date().toISOString();
    if (Number.isFinite(z) && z > 0) {
      rows.push({
        id: newId(),
        date,
        metricKind: 'ZONE_2_MINUTES',
        value: z,
        unit: 'min',
        source: 'MANUAL_CSV',
        importId: 'manual',
      });
    }
    if (Number.isFinite(s) && s > 0) {
      rows.push({
        id: newId(),
        date,
        metricKind: 'STEPS',
        value: s,
        unit: 'steps',
        source: 'MANUAL_CSV',
        importId: 'manual',
      });
    }
    if (rows.length === 0) {
      toast.error('Enter zone 2 minutes or steps');
      return;
    }
    setSaving(true);
    try {
      await db.transaction('rw', db.wearableMetrics, db.wearableImports, async () => {
        const existingImport = await db.wearableImports.get('manual');
        if (!existingImport) {
          await db.wearableImports.add({
            id: 'manual',
            source: 'MANUAL_CSV',
            importedAt: nowIso,
            rangeStart: date,
            rangeEnd: date,
            recordCount: 0,
            fileHash: 'manual',
            label: 'Manual entries',
          });
        }
        // Upsert by (date+metricKind+source)
        for (const row of rows) {
          const existing = await db.wearableMetrics
            .where('[date+metricKind]')
            .equals([row.date, row.metricKind])
            .first();
          if (existing) {
            await db.wearableMetrics.update(existing.id, { value: row.value });
          } else {
            await db.wearableMetrics.add(row);
          }
        }
      });
      toast.success('Logged');
      setZone2Min('');
      setSteps('');
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
        Manual log
      </p>
      <div className="space-y-3">
        <Row label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </Row>
        <Row label="Zone 2 minutes">
          <input
            type="number"
            value={zone2Min}
            onChange={(e) => setZone2Min(e.target.value)}
            placeholder="e.g. 45"
            min={0}
            step={5}
            className="w-24 rounded-xl border px-3 py-2 text-sm text-right outline-none tabular-nums"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </Row>
        <Row label="Steps">
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="e.g. 9500"
            min={0}
            step={500}
            className="w-28 rounded-xl border px-3 py-2 text-sm text-right outline-none tabular-nums"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </Row>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 mt-1"
          style={{ backgroundColor: C.accent, color: '#1a1000' }}
        >
          <Plus size={14} /> {saving ? 'Saving…' : 'Log day'}
        </button>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs flex-1" style={{ color: C.muted }}>{label}</span>
      {children}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sumLast(rows: WearableMetric[], days: number): number {
  const cutoff = isoDaysAgo(days);
  return rows.filter((r) => r.date > cutoff).reduce((s, r) => s + r.value, 0);
}

function avgLast(rows: WearableMetric[], days: number): number {
  const cutoff = isoDaysAgo(days);
  const recent = rows.filter((r) => r.date > cutoff);
  if (recent.length === 0) return 0;
  return Math.round(recent.reduce((s, r) => s + r.value, 0) / recent.length);
}

function mergeMetrics(
  z2: WearableMetric[],
  steps: WearableMetric[],
): { date: string; zone2?: number; steps?: number }[] {
  const map = new Map<string, { date: string; zone2?: number; steps?: number }>();
  for (const m of z2) {
    const row = map.get(m.date) ?? { date: m.date };
    row.zone2 = (row.zone2 ?? 0) + m.value;
    map.set(m.date, row);
  }
  for (const m of steps) {
    const row = map.get(m.date) ?? { date: m.date };
    row.steps = (row.steps ?? 0) + m.value;
    map.set(m.date, row);
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
