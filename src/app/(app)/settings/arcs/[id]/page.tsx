'use client';

/**
 * /settings/arcs/[id] — arc detail.
 *
 * View / edit a single arc. Activate / pause / resume / end actions in the
 * footer. The `coachDirective` is the most-edited field — it's the athlete's
 * own words handed straight to the coach on every turn.
 */

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Play,
  Pause,
  StopCircle,
  Save,
  Trash2,
  CircleCheck,
  Circle,
} from 'lucide-react';
import { db, today } from '@/lib/db/database';
import {
  arcDayCount,
  ARC_PRIORITY_LABELS,
  ARC_CONSTRAINT_LABELS,
  ARC_STATUS_LABELS,
  activateArc,
  endArc,
  pauseArc,
  resumeArc,
  updateArc,
  findOrphanedMeetsForArc,
  archiveMeet,
} from '@/lib/arcs';
import { C } from '@/lib/theme';
import type {
  TrainingArc,
  ArcPriority,
  ArcConstraint,
  TrainingGoal,
  ArcTransition,
  Meet,
} from '@/lib/db/types';

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

interface ArcDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ArcDetailPage({ params }: ArcDetailPageProps) {
  // Next 16: params is a Promise — unwrap with React.use().
  const { id } = use(params);
  const router = useRouter();

  const arc = useLiveQuery(() => db.trainingArcs.get(id), [id]);
  const transitions = useLiveQuery(async () => {
    const rows = await db.arcTransitions.toArray();
    return rows
      .filter((t) => t.fromArcId === id || t.toArcId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [id]);

  // Local editable copies; seeded from arc once loaded.
  const [name, setName] = useState('');
  const [intent, setIntent] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<TrainingGoal>('LONGEVITY');
  const [priorities, setPriorities] = useState<ArcPriority[]>([]);
  const [deprioritized, setDeprioritized] = useState<ArcPriority[]>([]);
  const [constraints, setConstraints] = useState<ArcConstraint[]>([]);
  const [coachDirective, setCoachDirective] = useState('');
  const [weeklyTimeBudgetMin, setWeeklyTimeBudgetMin] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  // Phase D follow-up — meet-reconciliation prompt. When activating a non-
  // competition arc with upcoming meets on the calendar, we offer to archive
  // them so the cycle macrocycle stops pinning the athlete to peak prep.
  const [pendingActivation, setPendingActivation] = useState<{
    arcId: string;
    orphanedMeets: Meet[];
  } | null>(null);

  useEffect(() => {
    if (!arc) return;
    setName(arc.name);
    setIntent(arc.intent);
    setPrimaryGoal(arc.primaryGoal);
    setPriorities(arc.priorities);
    setDeprioritized(arc.deprioritized);
    setConstraints(arc.constraints);
    setCoachDirective(arc.coachDirective);
    setWeeklyTimeBudgetMin(arc.weeklyTimeBudgetMin?.toString() ?? '');
    setDirty(false);
  }, [arc]);

  if (arc === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  if (arc === null) {
    return (
      <div className="min-h-screen p-6 text-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        <p>Arc not found.</p>
        <button
          type="button"
          onClick={() => router.push('/settings/arcs')}
          className="mt-4 text-sm font-semibold"
          style={{ color: C.accent }}
        >
          Back to arcs
        </button>
      </div>
    );
  }

  const day = arcDayCount(arc, today());
  const isActive = arc.status === 'ACTIVE';
  const isPaused = arc.status === 'PAUSED';

  const togglePriority = (p: ArcPriority) => {
    setPriorities((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    setDeprioritized((prev) => prev.filter((x) => x !== p));
    setDirty(true);
  };

  const toggleDeprioritized = (p: ArcPriority) => {
    setDeprioritized((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    setPriorities((prev) => prev.filter((x) => x !== p));
    setDirty(true);
  };

  const toggleConstraint = (c: ArcConstraint) => {
    setConstraints((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !intent.trim()) {
      toast.error('Name and intent are required');
      return;
    }
    setSaving(true);
    try {
      const budget = parseInt(weeklyTimeBudgetMin, 10);
      await updateArc(arc.id, {
        name,
        intent,
        primaryGoal,
        priorities,
        deprioritized,
        constraints,
        weeklyTimeBudgetMin: Number.isFinite(budget) && budget > 0 ? budget : undefined,
        coachDirective,
      });
      toast.success('Saved');
      setDirty(false);
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!arc) return;
    // Phase D follow-up — detect orphaned meets BEFORE activation. If the
    // target arc isn't competition-flavored AND meets are still upcoming,
    // open a confirm dialog so the athlete chooses what happens to the meet.
    setTransitioning(true);
    try {
      const orphaned = await findOrphanedMeetsForArc({ priorities });
      if (orphaned.length > 0) {
        setPendingActivation({ arcId: arc.id, orphanedMeets: orphaned });
        setTransitioning(false);
        return;
      }
      await activateArc(arc.id, 'Activated from arc detail');
      toast.success(`${arc.name} is now active`);
    } catch {
      toast.error('Could not activate');
    } finally {
      setTransitioning(false);
    }
  };

  /**
   * Confirm the pending activation. If `archive` is true, archive every
   * orphaned meet first; either way, then activate the arc. Closes the dialog.
   */
  const confirmActivation = async (archive: boolean) => {
    if (!pendingActivation || !arc) return;
    setTransitioning(true);
    try {
      if (archive) {
        await Promise.all(pendingActivation.orphanedMeets.map((m) => archiveMeet(m.id)));
      }
      await activateArc(pendingActivation.arcId, 'Activated from arc detail');
      toast.success(
        archive
          ? `${arc.name} is now active. ${pendingActivation.orphanedMeets.length} meet${pendingActivation.orphanedMeets.length === 1 ? '' : 's'} archived.`
          : `${arc.name} is now active. Meet kept on the calendar.`,
      );
    } catch {
      toast.error('Could not activate');
    } finally {
      setTransitioning(false);
      setPendingActivation(null);
    }
  };

  const handlePause = async () => {
    setTransitioning(true);
    try {
      await pauseArc(arc.id);
      toast.success('Paused');
    } catch {
      toast.error('Could not pause');
    } finally {
      setTransitioning(false);
    }
  };

  const handleResume = async () => {
    setTransitioning(true);
    try {
      await resumeArc(arc.id);
      toast.success('Resumed');
    } catch {
      toast.error('Could not resume');
    } finally {
      setTransitioning(false);
    }
  };

  const handleEnd = async () => {
    if (!confirm(`End the "${arc.name}" arc? This cannot be undone, but the arc stays in your history.`)) return;
    setTransitioning(true);
    try {
      await endArc(arc.id, 'Ended from arc detail');
      toast.success(`${arc.name} ended`);
      router.push('/settings/arcs');
    } catch {
      toast.error('Could not end');
    } finally {
      setTransitioning(false);
    }
  };

  const handleDelete = async () => {
    if (arc.status === 'ACTIVE') {
      toast.error('End the arc before deleting it');
      return;
    }
    if (!confirm('Delete this arc permanently? This cannot be undone.')) return;
    try {
      await db.trainingArcs.delete(arc.id);
      toast.success('Arc deleted');
      router.push('/settings/arcs');
    } catch {
      toast.error('Could not delete');
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
        <h1 className="flex-1 text-base font-semibold truncate">{arc.name}</h1>
        <StatusBadge arc={arc} day={day} />
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        <FormField label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        <FormField label="Intent" sub="One or two sentences. What does this arc exist for?">
          <textarea
            value={intent}
            onChange={(e) => { setIntent(e.target.value); setDirty(true); }}
            rows={2}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-y"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        <FormField label="Primary goal">
          <select
            value={primaryGoal}
            onChange={(e) => { setPrimaryGoal(e.target.value as TrainingGoal); setDirty(true); }}
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

        <FormField label="Deprioritized">
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
              onChange={(e) => { setWeeklyTimeBudgetMin(e.target.value); setDirty(true); }}
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
          sub="Your words to the coach. Read on every turn."
        >
          <textarea
            value={coachDirective}
            onChange={(e) => { setCoachDirective(e.target.value); setDirty(true); }}
            rows={6}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none leading-relaxed resize-y"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        </FormField>

        {/* History */}
        {transitions && transitions.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
              Transitions
            </p>
            <div
              className="rounded-2xl overflow-hidden divide-y"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
            >
              {transitions.map((t) => (
                <TransitionRow key={t.id} transition={t} arcId={id} />
              ))}
            </div>
          </section>
        )}

        {/* Danger zone */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: C.muted }}>
            Manage
          </p>
          <div
            className="rounded-2xl overflow-hidden divide-y"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
          >
            {!isActive && arc.status !== 'COMPLETED' && (
              <ActionRow
                icon={<Play size={16} />}
                label="Activate"
                sub="Make this the active arc. Ends the currently-active one if any."
                onClick={handleActivate}
                disabled={transitioning}
              />
            )}
            {isActive && (
              <ActionRow
                icon={<Pause size={16} />}
                label="Pause"
                sub="Keep the arc but stop using it as the active context."
                onClick={handlePause}
                disabled={transitioning}
              />
            )}
            {isPaused && (
              <ActionRow
                icon={<Play size={16} />}
                label="Resume"
                sub="Continue using this arc as the active context."
                onClick={handleResume}
                disabled={transitioning}
              />
            )}
            {arc.status !== 'COMPLETED' && (
              <ActionRow
                icon={<StopCircle size={16} />}
                label="End arc"
                sub="Mark as completed. Stays in history."
                onClick={handleEnd}
                disabled={transitioning}
              />
            )}
            <ActionRow
              icon={<Trash2 size={16} />}
              label="Delete permanently"
              sub="Removes from history. Cannot be undone."
              onClick={handleDelete}
              destructive
              disabled={arc.status === 'ACTIVE'}
            />
          </div>
        </section>
      </div>

      {/* Save bar */}
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
              className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              style={{ backgroundColor: C.accent, color: '#1a1000' }}
            >
              <Save size={15} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Phase D follow-up — orphan-meet reconciliation dialog. Appears when
          activating a non-competition arc with upcoming meets on the calendar.
          Lets the athlete either archive the meets (cycle regenerates as a
          HEALTH_BASE rhythm) or keep them and accept the cycle stays in
          peak-prep mode. */}
      {pendingActivation && arc && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="meet-archive-title"
        >
          <div
            className="w-full max-w-md rounded-3xl p-5"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <h2 id="meet-archive-title" className="text-lg font-bold mb-1" style={{ color: C.text }}>
              You have an upcoming meet
            </h2>
            <p className="text-sm mb-3" style={{ color: C.muted }}>
              Activating <span style={{ color: C.text, fontWeight: 600 }}>{arc.name}</span> moves
              you away from peak prep, but a meet is still on the calendar — the cycle will keep
              pinning you to a realization block unless the meet is archived.
            </p>
            <ul className="mb-4 space-y-1.5">
              {pendingActivation.orphanedMeets.map((m) => (
                <li
                  key={m.id}
                  className="text-xs rounded-xl px-3 py-2"
                  style={{ backgroundColor: C.bg, color: C.text, border: `1px solid ${C.border}` }}
                >
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ color: C.muted }}> · {m.date} · {m.federation}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void confirmActivation(true)}
                disabled={transitioning}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80"
                style={{ backgroundColor: C.accent, color: '#0a0a0a' }}
              >
                {transitioning ? 'Working…' : 'Archive meet and activate'}
              </button>
              <button
                type="button"
                onClick={() => void confirmActivation(false)}
                disabled={transitioning}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'transparent', color: C.text, border: `1px solid ${C.border}` }}
              >
                Keep meet, activate anyway
              </button>
              <button
                type="button"
                onClick={() => setPendingActivation(null)}
                disabled={transitioning}
                className="w-full px-4 py-2 text-xs"
                style={{ color: C.muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StatusBadge({ arc, day }: { arc: TrainingArc; day: number }) {
  const isActive = arc.status === 'ACTIVE';
  const color = isActive ? C.accent : C.muted;
  const Icon = isActive ? CircleCheck : Circle;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      <Icon size={12} />
      {ARC_STATUS_LABELS[arc.status]}
      {isActive && ` · D${day}`}
    </span>
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

function ActionRow({
  icon,
  label,
  sub,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const color = destructive ? C.red : C.text;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40 transition-opacity active:opacity-70"
    >
      <span style={{ color }} aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</p>
      </div>
    </button>
  );
}

function TransitionRow({ transition, arcId }: { transition: ArcTransition; arcId: string }) {
  const direction =
    transition.toArcId === arcId
      ? (transition.fromArcId ? 'Switched into this arc' : 'Started this arc')
      : 'Switched out to a new arc';
  return (
    <div className="px-4 py-3">
      <p className="text-sm" style={{ color: C.text }}>{direction}</p>
      <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
        {new Date(transition.createdAt).toLocaleDateString()}{transition.reason ? ` · ${transition.reason}` : ''}
      </p>
      {transition.summary && (
        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: C.muted }}>{transition.summary}</p>
      )}
    </div>
  );
}
