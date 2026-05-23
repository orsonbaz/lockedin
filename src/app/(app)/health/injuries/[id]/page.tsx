'use client';

/**
 * /health/injuries/[id] — injury detail.
 *
 * Edit all fields including contraindicated patterns / swap groups (these
 * directly drive the swap engine filter). Symptom log timeline at the
 * bottom with a quick-log card.
 */

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Trash2, Plus, CheckCircle2,
} from 'lucide-react';
import { db } from '@/lib/db/database';
import {
  updateInjury,
  updateInjuryStatus,
  deleteInjury,
  logSymptom,
  BODY_REGION_LABELS,
  INJURY_CONSTRAINT_LABELS,
  INJURY_STATUS_LABELS,
  INJURY_MOVEMENT_PATTERN_LABELS,
} from '@/lib/injuries';
import { C } from '@/lib/theme';
import type {
  Injury,
  InjuryStatus,
  InjurySeverity,
  InjuryConstraint,
  InjuryMovementPattern,
  BodyRegion,
  SymptomLog,
  PainScale,
  StiffnessScale,
  IrritabilityLevel,
} from '@/lib/db/types';

const ALL_REGIONS: BodyRegion[] = Object.keys(BODY_REGION_LABELS) as BodyRegion[];
const ALL_CONSTRAINTS: InjuryConstraint[] = Object.keys(INJURY_CONSTRAINT_LABELS) as InjuryConstraint[];
const ALL_PATTERNS: InjuryMovementPattern[] = Object.keys(INJURY_MOVEMENT_PATTERN_LABELS) as InjuryMovementPattern[];
const STATUS_OPTIONS: InjuryStatus[] = ['ACUTE', 'SUBACUTE', 'CHRONIC', 'MANAGING', 'REHAB', 'RESOLVED'];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InjuryDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const injury = useLiveQuery(() => db.injuries.get(id), [id]);
  const symptoms = useLiveQuery(
    async () => {
      const rows = await db.symptomLogs.where('injuryId').equals(id).toArray();
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    },
    [id],
  );

  // Local editable state
  const [label, setLabel] = useState('');
  const [regions, setRegions] = useState<BodyRegion[]>([]);
  const [status, setStatus] = useState<InjuryStatus>('MANAGING');
  const [severity, setSeverity] = useState<InjurySeverity>(3);
  const [constraints, setConstraints] = useState<InjuryConstraint[]>([]);
  const [contraindicatedPatterns, setContraPatterns] = useState<InjuryMovementPattern[]>([]);
  const [preferredPatterns, setPreferredPatterns] = useState<InjuryMovementPattern[]>([]);
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!injury) return;
    setLabel(injury.label);
    setRegions(injury.regions);
    setStatus(injury.status);
    setSeverity(injury.severity);
    setConstraints(injury.constraints);
    setContraPatterns(injury.contraindicatedPatterns);
    setPreferredPatterns(injury.preferredPatterns);
    setNotes(injury.notes ?? '');
    setDirty(false);
  }, [injury]);

  if (injury === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  if (injury === null) {
    return (
      <div className="min-h-screen p-6 text-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        <p>Injury not found.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateInjury(injury.id, {
        label,
        regions,
        status,
        severity,
        constraints,
        contraindicatedPatterns,
        preferredPatterns,
        notes: notes.trim() || undefined,
      });
      toast.success('Saved');
      setDirty(false);
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!confirm('Mark as resolved? It stays in your history.')) return;
    await updateInjuryStatus(injury.id, 'RESOLVED');
    toast.success(`${injury.label} resolved`);
    router.push('/health/injuries');
  };

  const handleDelete = async () => {
    if (!confirm('Delete permanently? This wipes the symptom history too.')) return;
    await deleteInjury(injury.id);
    toast.success('Deleted');
    router.push('/health/injuries');
  };

  const togglePattern = (
    p: InjuryMovementPattern,
    setter: React.Dispatch<React.SetStateAction<InjuryMovementPattern[]>>,
    otherSetter?: React.Dispatch<React.SetStateAction<InjuryMovementPattern[]>>,
  ) => {
    setter((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    if (otherSetter) otherSetter((prev) => prev.filter((x) => x !== p));
    setDirty(true);
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
        <h1 className="flex-1 text-base font-semibold truncate">{injury.label}</h1>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
          style={{
            color: injury.severity >= 4 ? C.red : injury.severity >= 3 ? C.gold : C.muted,
            backgroundColor: `${injury.severity >= 4 ? C.red : injury.severity >= 3 ? C.gold : C.muted}1A`,
          }}
        >
          S{injury.severity} · {INJURY_STATUS_LABELS[injury.status]}
        </span>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        <FormField label="Label">
          <input
            type="text"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        <FormField label="Regions">
          <ChipGrid
            values={ALL_REGIONS}
            labels={BODY_REGION_LABELS}
            selected={regions}
            onToggle={(r) => {
              setRegions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
              setDirty(true);
            }}
            color={C.accent}
          />
        </FormField>

        <FormField label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStatus(s); setDirty(true); }}
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

        <FormField label="Severity">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { setSeverity(n as InjurySeverity); setDirty(true); }}
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

        <FormField label="Constraints" sub="Soft scoring rules in the swap engine.">
          <ChipGrid
            values={ALL_CONSTRAINTS}
            labels={INJURY_CONSTRAINT_LABELS}
            selected={constraints}
            onToggle={(c) => {
              setConstraints((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
              setDirty(true);
            }}
            color={C.gold}
          />
        </FormField>

        <FormField
          label="Contraindicated patterns"
          sub="Hard-block movements with these patterns from session generation."
        >
          <ChipGrid
            values={ALL_PATTERNS}
            labels={INJURY_MOVEMENT_PATTERN_LABELS}
            selected={contraindicatedPatterns}
            onToggle={(p) => togglePattern(p, setContraPatterns, setPreferredPatterns)}
            color={C.red}
          />
        </FormField>

        <FormField
          label="Preferred patterns"
          sub="Boost candidates with these patterns when the engine has a choice."
        >
          <ChipGrid
            values={ALL_PATTERNS}
            labels={INJURY_MOVEMENT_PATTERN_LABELS}
            selected={preferredPatterns}
            onToggle={(p) => togglePattern(p, setPreferredPatterns, setContraPatterns)}
            color={C.green}
          />
        </FormField>

        <FormField label="Notes">
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            rows={4}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-y"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        {/* Symptom log */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
            Symptom log
          </p>
          <SymptomQuickLog
            injuryId={injury.id}
            onLogged={() => toast.success('Symptom logged')}
          />
          {symptoms && symptoms.length > 0 && (
            <div
              className="mt-3 rounded-2xl overflow-hidden divide-y"
              style={{
                backgroundColor: C.surface,
                border: `1px solid ${C.border}`,
                borderColor: C.border,
              }}
            >
              {symptoms.slice(0, 10).map((s) => (
                <SymptomRow key={s.id} symptom={s} />
              ))}
            </div>
          )}
        </section>

        {/* Manage */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
            Manage
          </p>
          <div
            className="rounded-2xl overflow-hidden divide-y"
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderColor: C.border,
            }}
          >
            {injury.status !== 'RESOLVED' && (
              <ActionRow
                icon={<CheckCircle2 size={16} />}
                label="Mark as resolved"
                sub="Stays in history; stops affecting the swap engine."
                onClick={handleResolve}
              />
            )}
            <ActionRow
              icon={<Trash2 size={16} />}
              label="Delete permanently"
              sub="Removes the injury and all logged symptoms."
              onClick={handleDelete}
              destructive
            />
          </div>
        </section>
      </div>

      {dirty && (
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
              <Save size={15} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SymptomQuickLog({
  injuryId,
  onLogged,
}: {
  injuryId: string;
  onLogged: () => void;
}) {
  const [painAtRest, setRest] = useState<PainScale>(2);
  const [painUnderLoad, setLoad] = useState<PainScale>(4);
  const [stiffness, setStiffness] = useState<StiffnessScale>(2);
  const [irritability, setIrritability] = useState<IrritabilityLevel>('MED');
  const [saving, setSaving] = useState(false);

  const handleLog = async () => {
    setSaving(true);
    try {
      await logSymptom({ injuryId, painAtRest, painUnderLoad, stiffness, irritability });
      onLogged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <NumericRow label="Pain at rest" value={painAtRest} max={10} onChange={(v) => setRest(v as PainScale)} />
      <NumericRow label="Pain under load" value={painUnderLoad} max={10} onChange={(v) => setLoad(v as PainScale)} />
      <NumericRow label="Stiffness" value={stiffness} max={5} onChange={(v) => setStiffness(v as StiffnessScale)} />
      <div className="flex items-center gap-2">
        <span className="text-xs flex-1" style={{ color: C.muted }}>Irritability</span>
        <div className="flex gap-1">
          {(['LOW', 'MED', 'HIGH'] as IrritabilityLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setIrritability(l)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              style={{
                backgroundColor: irritability === l ? `${C.accent}22` : C.dim,
                border: `1px solid ${irritability === l ? C.accent : C.border}`,
                color: irritability === l ? C.accent : C.text,
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleLog()}
        disabled={saving}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
        style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
      >
        <Plus size={14} /> Log today
      </button>
    </div>
  );
}

function NumericRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs flex-1" style={{ color: C.muted }}>{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-[2]"
      />
      <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: C.text }}>
        {value}<span className="text-[10px] font-normal" style={{ color: C.muted }}>/{max}</span>
      </span>
    </div>
  );
}

function SymptomRow({ symptom }: { symptom: SymptomLog }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: C.text }}>{symptom.date}</p>
        <p className="text-[11px]" style={{ color: C.muted }}>
          {symptom.irritability.toLowerCase()} irritability
        </p>
      </div>
      <p className="text-xs mt-0.5" style={{ color: C.muted }}>
        Rest {symptom.painAtRest}/10 · Load {symptom.painUnderLoad}/10 · Stiffness {symptom.stiffness}/5
      </p>
      {symptom.note && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>"{symptom.note}"</p>
      )}
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

function ActionRow({
  icon,
  label,
  sub,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? C.red : C.text;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
    >
      <span style={{ color }} aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</p>
      </div>
    </button>
  );
}
