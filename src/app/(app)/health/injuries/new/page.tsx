'use client';

/**
 * /health/injuries/new — log a new injury.
 *
 * Minimum: label + at least one region. Everything else is chip-pickable.
 * The pattern / swap-group contraindications live on the detail page so
 * this form stays approachable for the "I just tweaked something" moment.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';
import {
  createInjury,
  BODY_REGION_LABELS,
  INJURY_CONSTRAINT_LABELS,
  INJURY_STATUS_LABELS,
} from '@/lib/injuries';
import { C } from '@/lib/theme';
import type {
  BodyRegion,
  InjuryConstraint,
  InjuryStatus,
  InjurySeverity,
} from '@/lib/db/types';

const ALL_REGIONS: BodyRegion[] = Object.keys(BODY_REGION_LABELS) as BodyRegion[];
const ALL_CONSTRAINTS: InjuryConstraint[] = Object.keys(INJURY_CONSTRAINT_LABELS) as InjuryConstraint[];
const STATUS_OPTIONS: InjuryStatus[] = ['ACUTE', 'SUBACUTE', 'CHRONIC', 'MANAGING', 'REHAB'];

export default function NewInjuryPage() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [regions, setRegions] = useState<BodyRegion[]>([]);
  const [status, setStatus] = useState<InjuryStatus>('MANAGING');
  const [severity, setSeverity] = useState<InjurySeverity>(3);
  const [constraints, setConstraints] = useState<InjuryConstraint[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error('Give it a short label');
      return;
    }
    if (regions.length === 0) {
      toast.error('Pick at least one region');
      return;
    }
    setSaving(true);
    try {
      const injury = await createInjury({
        label,
        regions,
        status,
        severity,
        constraints,
        notes: notes.trim() || undefined,
      });
      toast.success(`${injury.label} logged`);
      router.push(`/health/injuries/${injury.id}`);
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

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
        <h1 className="flex-1 text-base font-semibold">Log injury</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        <FormField label="Label" sub="Plain English. The coach reads this verbatim.">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Left rotator cuff tendinopathy"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        <FormField label="Affected regions">
          <ChipGrid
            values={ALL_REGIONS}
            labels={BODY_REGION_LABELS}
            selected={regions}
            onToggle={(r) => setRegions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])}
            color={C.accent}
          />
        </FormField>

        <FormField label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                style={{
                  backgroundColor: status === s ? `${C.accent}22` : C.surface,
                  border: `1px solid ${status === s ? C.accent : C.border}`,
                  color: status === s ? C.accent : C.text,
                }}
              >
                {INJURY_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Severity" sub="1 = barely notice it. 5 = stops you training.">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeverity(n as InjurySeverity)}
                className="w-12 h-12 rounded-xl text-base font-bold tabular-nums transition-all active:scale-95"
                style={{
                  backgroundColor: severity === n ? `${C.accent}22` : C.surface,
                  border: `1px solid ${severity === n ? C.accent : C.border}`,
                  color: severity === n ? C.accent : C.text,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Constraints" sub="The swap engine reads these to filter / penalise candidates.">
          <ChipGrid
            values={ALL_CONSTRAINTS}
            labels={INJURY_CONSTRAINT_LABELS}
            selected={constraints}
            onToggle={(c) => setConstraints((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])}
            color={C.gold}
          />
        </FormField>

        <FormField label="Notes" sub="Optional. Anything the coach should know.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Started after a heavy bench session 6 weeks ago…"
            rows={4}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-y"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t"
        style={{
          backgroundColor: C.bg,
          borderColor: C.border,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px + 72px)',
        }}
      >
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ backgroundColor: C.accent, color: '#1a1000' }}
          >
            <Check size={15} />
            {saving ? 'Saving…' : 'Save injury'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
        {label}
      </label>
      {sub && <p className="text-[11px] mb-2 px-1 leading-snug" style={{ color: C.muted }}>{sub}</p>}
      {children}
    </div>
  );
}

function ChipGrid<T extends string>({
  values,
  labels,
  selected,
  onToggle,
  color,
}: {
  values: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (v: T) => void;
  color: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const isSelected = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              backgroundColor: isSelected ? `${color}22` : C.surface,
              border: `1px solid ${isSelected ? color : C.border}`,
              color: isSelected ? color : C.text,
            }}
          >
            {labels[v]}
          </button>
        );
      })}
    </div>
  );
}
