'use client';

/**
 * /settings/arcs/new — guided arc creation.
 *
 * Two steps in one screen:
 *   1. Pick a preset (or "blank") — pre-fills name, intent, priorities,
 *      constraints, and a starter coachDirective.
 *   2. Edit the form. Athlete is encouraged to personalize the directive
 *      in their own words before saving.
 *
 * Saving with "Start now" ends the current ACTIVE arc and writes an
 * ArcTransition snapshot; the new arc becomes ACTIVE immediately.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';
import {
  ARC_PRESETS,
  ARC_PRIORITY_LABELS,
  ARC_CONSTRAINT_LABELS,
  createArc,
  type ArcPreset,
} from '@/lib/arcs';
import { C } from '@/lib/theme';
import type { ArcPriority, ArcConstraint, TrainingGoal } from '@/lib/db/types';

const ALL_PRIORITIES: ArcPriority[] = Object.keys(ARC_PRIORITY_LABELS) as ArcPriority[];
const ALL_CONSTRAINTS: ArcConstraint[] = Object.keys(ARC_CONSTRAINT_LABELS) as ArcConstraint[];

const GOAL_LABELS: Record<TrainingGoal, string> = {
  LONGEVITY:            'Longevity',
  MOBILITY_REBUILD:     'Mobility rebuild',
  INJURY_REHAB:         'Injury rehab',
  COMPETITION_PREP:     'Competition prep',
  STRENGTH_PROGRESSION: 'Strength progression',
  SKILL_PROGRESSION:    'Skill progression',
  WEIGHT_LOSS:          'Weight loss',
  WEIGHT_GAIN:          'Weight gain',
  GENERAL_FITNESS:      'General fitness',
  MAINTENANCE:          'Maintenance',
};

export default function NewArcPage() {
  const router = useRouter();
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const preset = useMemo<ArcPreset | undefined>(
    () => ARC_PRESETS.find((p) => p.key === presetKey),
    [presetKey],
  );

  // Form state — seeded from preset, then editable.
  const [name, setName] = useState('');
  const [intent, setIntent] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<TrainingGoal>('LONGEVITY');
  const [priorities, setPriorities] = useState<ArcPriority[]>([]);
  const [deprioritized, setDeprioritized] = useState<ArcPriority[]>([]);
  const [constraints, setConstraints] = useState<ArcConstraint[]>([]);
  const [coachDirective, setCoachDirective] = useState('');
  const [weeklyTimeBudgetMin, setWeeklyTimeBudgetMin] = useState<string>('');

  const [saving, setSaving] = useState(false);

  const applyPreset = (p: ArcPreset) => {
    setPresetKey(p.key);
    setName(p.name);
    setIntent(p.intent);
    setPrimaryGoal(p.primaryGoal);
    setPriorities(p.priorities);
    setDeprioritized(p.deprioritized);
    setConstraints(p.constraints);
    setCoachDirective(p.coachDirective);
    setWeeklyTimeBudgetMin(p.weeklyTimeBudgetMin?.toString() ?? '');
  };

  const togglePriority = (p: ArcPriority) => {
    setPriorities((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    setDeprioritized((prev) => prev.filter((x) => x !== p));
  };

  const toggleDeprioritized = (p: ArcPriority) => {
    setDeprioritized((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    setPriorities((prev) => prev.filter((x) => x !== p));
  };

  const toggleConstraint = (c: ArcConstraint) => {
    setConstraints((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  const handleSave = async (activate: boolean) => {
    if (!name.trim()) {
      toast.error('Give your arc a name first');
      return;
    }
    if (!intent.trim()) {
      toast.error('Add an intent — one line on what this arc is for');
      return;
    }
    if (priorities.length === 0) {
      toast.error('Pick at least one priority');
      return;
    }

    setSaving(true);
    try {
      const budget = parseInt(weeklyTimeBudgetMin, 10);
      const arc = await createArc({
        name,
        intent,
        primaryGoal,
        priorities,
        deprioritized,
        constraints,
        weeklyTimeBudgetMin: Number.isFinite(budget) && budget > 0 ? budget : undefined,
        coachDirective,
        activate,
        transitionReason: activate ? 'New arc started' : undefined,
      });
      toast.success(activate ? `${arc.name} is now active` : `${arc.name} saved as planned`);
      router.push(`/settings/arcs/${arc.id}`);
    } catch (err) {
      console.error(err);
      toast.error('Could not save arc');
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
        <h1 className="flex-1 text-base font-semibold">New arc</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        {/* Preset picker */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-2" style={{ color: C.muted }}>
            Start from a template
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ARC_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                className="text-left rounded-2xl p-3 transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: presetKey === p.key ? `${C.accent}14` : C.surface,
                  border: `1px solid ${presetKey === p.key ? C.accent : C.border}`,
                }}
              >
                <p className="text-sm font-semibold" style={{ color: C.text }}>{p.name}</p>
                <p className="text-[11px] mt-1 leading-snug line-clamp-3" style={{ color: C.muted }}>
                  {p.intent}
                </p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPresetKey('blank');
                setName('');
                setIntent('');
                setPriorities([]);
                setDeprioritized([]);
                setConstraints([]);
                setCoachDirective('');
                setWeeklyTimeBudgetMin('');
                setPrimaryGoal('LONGEVITY');
              }}
              className="text-left rounded-2xl p-3"
              style={{
                backgroundColor: presetKey === 'blank' ? `${C.accent}14` : C.surface,
                border: `1px dashed ${presetKey === 'blank' ? C.accent : C.border}`,
              }}
            >
              <p className="text-sm font-semibold" style={{ color: C.text }}>Blank</p>
              <p className="text-[11px] mt-1 leading-snug" style={{ color: C.muted }}>
                Start from scratch — write everything yourself.
              </p>
            </button>
          </div>
        </section>

        {/* Form — only show after a preset (or blank) is chosen */}
        {(presetKey || name) && (
          <>
            <FormField label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Get Healthy"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              />
            </FormField>

            <FormField label="Intent" sub="One or two sentences. What does this arc exist for?">
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Rebuild durable shoulder & hip health while keeping baseline strength."
                rows={2}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-y"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              />
            </FormField>

            <FormField label="Primary goal">
              <select
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value as TrainingGoal)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none appearance-none"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              >
                {(Object.keys(GOAL_LABELS) as TrainingGoal[]).map((g) => (
                  <option key={g} value={g}>{GOAL_LABELS[g]}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Priorities" sub="Ordered — top of the list is dominant.">
              <ChipGrid
                values={ALL_PRIORITIES}
                labels={ARC_PRIORITY_LABELS}
                selected={priorities}
                onToggle={togglePriority}
                color={C.accent}
              />
            </FormField>

            <FormField label="Deprioritized" sub="Explicit 'not focused on this right now'.">
              <ChipGrid
                values={ALL_PRIORITIES.filter((p) => !priorities.includes(p))}
                labels={ARC_PRIORITY_LABELS}
                selected={deprioritized}
                onToggle={toggleDeprioritized}
                color={C.muted}
              />
            </FormField>

            <FormField label="Constraints">
              <ChipGrid
                values={ALL_CONSTRAINTS}
                labels={ARC_CONSTRAINT_LABELS}
                selected={constraints}
                onToggle={toggleConstraint}
                color={C.gold}
              />
            </FormField>

            <FormField label="Weekly time budget" sub="Total minutes per week. Leave blank for no cap.">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={weeklyTimeBudgetMin}
                  onChange={(e) => setWeeklyTimeBudgetMin(e.target.value)}
                  placeholder="e.g. 180"
                  min={0}
                  step={15}
                  className="w-28 rounded-xl border px-3 py-2.5 text-sm text-right outline-none"
                  style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
                />
                <span className="text-xs" style={{ color: C.muted }}>min / week</span>
              </div>
            </FormField>

            <FormField
              label="Coach directive"
              sub="Write this in your own words. The coach reads it on every turn."
            >
              <textarea
                value={coachDirective}
                onChange={(e) => setCoachDirective(e.target.value)}
                placeholder="Prioritize my long-term joint health…"
                rows={5}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none leading-relaxed resize-y"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              />
            </FormField>
          </>
        )}
      </div>

      {/* Bottom action bar */}
      {(presetKey || name) && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t flex gap-2"
          style={{
            backgroundColor: C.bg,
            borderColor: C.border,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px + 72px)',
          }}
        >
          <div className="max-w-lg mx-auto w-full flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.text }}
            >
              Save as planned
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: C.accent, color: '#1a1000' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Check size={15} />
                Start now
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

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
  if (values.length === 0) {
    return <p className="text-xs px-1" style={{ color: C.muted }}>—</p>;
  }
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
