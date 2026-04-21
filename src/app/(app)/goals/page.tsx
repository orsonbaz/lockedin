'use client';

/**
 * Goals — /goals
 *
 * Single source of truth for the athlete's training direction:
 *   • Primary discipline (powerlifting / street-lift / calisthenics / hybrid)
 *   • Secondary disciplines (multi-select)
 *   • High-level training goal (comp prep, strength PR, skill progression, etc.)
 *   • Free-text target + deadline
 *   • Calisthenics skill goals (checkboxes) when calisthenics is in the mix
 *
 * All writes patch the `profile` row. The coach prompt in `coach.ts` reads
 * these fields so the answer tone + programming bias follow the athlete.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Target, Trophy, Dumbbell, Sparkles } from 'lucide-react';
import { db } from '@/lib/db/database';
import { C } from '@/lib/theme';
import type { AthleteProfile, Discipline, TrainingGoal } from '@/lib/db/types';

const DISCIPLINES: { key: Discipline; label: string; blurb: string }[] = [
  { key: 'POWERLIFTING',  label: 'Powerlifting', blurb: 'Squat · bench · deadlift. Barbell comp lifts first.' },
  { key: 'STREET_LIFT',   label: 'Street Lift',  blurb: 'Weighted pull-up + weighted dip. Calisthenics comp format.' },
  { key: 'CALISTHENICS',  label: 'Calisthenics', blurb: 'Skills first: muscle-up, front lever, planche, OAPU.' },
  { key: 'HYBRID',        label: 'Hybrid',       blurb: 'Mix the above. Coach balances exposures and fatigue.' },
];

const GOALS: { key: TrainingGoal; label: string; blurb: string }[] = [
  { key: 'COMPETITION_PREP',     label: 'Competition prep',     blurb: 'Peaking for a meet on a specific date.' },
  { key: 'STRENGTH_PROGRESSION', label: 'Strength PRs',         blurb: 'Push comp-lift maxes without a meet scheduled.' },
  { key: 'SKILL_PROGRESSION',    label: 'Skill progression',    blurb: 'Unlock a calisthenics skill (muscle-up, lever).' },
  { key: 'WEIGHT_LOSS',          label: 'Fat loss',             blurb: 'Cut while maintaining strength. Lower volume focus.' },
  { key: 'WEIGHT_GAIN',          label: 'Mass gain',            blurb: 'Lean bulk. Higher volume, trend up the scale.' },
  { key: 'GENERAL_FITNESS',      label: 'General fitness',      blurb: 'Train consistently without a single objective.' },
  { key: 'MAINTENANCE',          label: 'Maintenance',          blurb: 'Hold current state during busy/life phases.' },
];

const CALI_SKILLS: { key: string; label: string }[] = [
  { key: 'muscle_up',        label: 'Strict muscle-up' },
  { key: 'front_lever',      label: 'Front lever' },
  { key: 'planche',          label: 'Planche' },
  { key: 'pistol_squat',     label: 'Pistol squat' },
  { key: 'one_arm_pullup',   label: 'One-arm pull-up' },
  { key: 'handstand_pushup', label: 'Handstand push-up' },
];

// ── Small primitives ───────────────────────────────────────────────────────
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-1 mb-2 mt-6 first:mt-0">
      <p
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: C.muted }}
      >
        {title}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);

  // Local form state (applied on save / onChange for chip selections)
  const [primary,      setPrimary]      = useState<Discipline>('POWERLIFTING');
  const [secondary,    setSecondary]    = useState<Set<Discipline>>(new Set());
  const [goal,         setGoal]         = useState<TrainingGoal>('STRENGTH_PROGRESSION');
  const [target,       setTarget]       = useState('');
  const [deadline,     setDeadline]     = useState('');
  const [caliSkills,   setCaliSkills]   = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const p = await db.profile.get('me');
    if (!p) return;
    setProfile(p);
    setPrimary(p.primaryDiscipline ?? p.disciplines?.[0] ?? 'POWERLIFTING');
    setSecondary(new Set((p.disciplines ?? []).filter(
      (d) => d !== (p.primaryDiscipline ?? p.disciplines?.[0]),
    )));
    setGoal(p.trainingGoal ?? 'STRENGTH_PROGRESSION');
    setTarget(p.trainingGoalTarget ?? '');
    setDeadline(p.trainingGoalDeadline ?? '');
    setCaliSkills(new Set(p.calisthenicsGoals ?? []));
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const patch = useCallback(async (delta: Partial<AthleteProfile>) => {
    if (!profile) return;
    const updated: AthleteProfile = {
      ...profile,
      ...delta,
      updatedAt: new Date().toISOString(),
    };
    await db.profile.put(updated);
    setProfile(updated);
  }, [profile]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handlePrimary = useCallback(async (d: Discipline) => {
    setPrimary(d);
    const next = new Set(secondary);
    next.delete(d);
    setSecondary(next);
    const disciplines = [d, ...Array.from(next)];
    await patch({ primaryDiscipline: d, disciplines });
    toast.success(`Primary set to ${d.replace('_', ' ').toLowerCase()}`);
  }, [secondary, patch]);

  const handleSecondaryToggle = useCallback(async (d: Discipline) => {
    if (d === primary) return;
    const next = new Set(secondary);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setSecondary(next);
    const disciplines = [primary, ...Array.from(next)];
    await patch({ disciplines });
  }, [primary, secondary, patch]);

  const handleGoal = useCallback(async (g: TrainingGoal) => {
    setGoal(g);
    await patch({ trainingGoal: g });
  }, [patch]);

  const handleSaveTarget = useCallback(async () => {
    await patch({
      trainingGoalTarget: target.trim() || undefined,
      trainingGoalDeadline: deadline || undefined,
    });
    toast.success('Goal updated');
  }, [target, deadline, patch]);

  const handleSkillToggle = useCallback(async (key: string) => {
    const next = new Set(caliSkills);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCaliSkills(next);
    await patch({ calisthenicsGoals: Array.from(next) });
  }, [caliSkills, patch]);

  const showCaliSkills = primary === 'CALISTHENICS' || primary === 'HYBRID'
    || secondary.has('CALISTHENICS') || secondary.has('HYBRID');

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: C.bg, color: C.text }}>
        <div className="text-center">
          <p className="mb-3">Finish onboarding first to set goals.</p>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-fade-in" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4 pb-8">
        {/* Header */}
        <div className="pt-6 pb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl transition-all active:scale-95"
            style={{ color: C.muted, backgroundColor: C.surface }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Goals</h1>
        </div>

        {/* Intro */}
        <div
          className="rounded-3xl p-5 mt-4 flex items-start gap-4"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${C.accent}20` }}
          >
            <Target size={22} color={C.accent} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold mb-1">Direction matters more than detail.</h2>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
              Pick what you&apos;re training for. The coach uses this to bias exercise selection,
              rep ranges, refeed cadence, and which knowledge it pulls into every answer.
            </p>
          </div>
        </div>

        {/* Primary discipline */}
        <SectionHeader title="Primary discipline" sub="Drives the default session template." />
        <div className="grid gap-2">
          {DISCIPLINES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => void handlePrimary(d.key)}
              className="text-left rounded-2xl p-4 transition-all active:scale-[0.99]"
              style={{
                backgroundColor: primary === d.key ? `${C.accent}14` : C.surface,
                border: `1px solid ${primary === d.key ? C.accent : C.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell size={15} color={primary === d.key ? C.accent : C.muted} />
                <span
                  className="text-sm font-bold"
                  style={{ color: primary === d.key ? C.accent : C.text }}
                >
                  {d.label}
                </span>
                {primary === d.key && (
                  <span
                    className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{ backgroundColor: C.accent, color: '#fff' }}
                  >
                    Primary
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: C.muted }}>
                {d.blurb}
              </p>
            </button>
          ))}
        </div>

        {/* Secondary disciplines */}
        <SectionHeader
          title="Also train"
          sub="Extra disciplines the coach should factor in when planning the week."
        />
        <Card>
          <div className="flex flex-wrap gap-2 p-3">
            {DISCIPLINES
              .filter((d) => d.key !== primary)
              .map((d) => {
                const on = secondary.has(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => void handleSecondaryToggle(d.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                    style={{
                      backgroundColor: on ? `${C.accent}20` : C.dim,
                      color:           on ? C.accent : C.muted,
                      border:          `1px solid ${on ? C.accent : C.border}`,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
          </div>
        </Card>

        {/* Training goal */}
        <SectionHeader title="Current focus" sub="Reset this any time life changes." />
        <div className="grid gap-2">
          {GOALS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => void handleGoal(g.key)}
              className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.99]"
              style={{
                backgroundColor: goal === g.key ? `${C.accent}14` : C.surface,
                border: `1px solid ${goal === g.key ? C.accent : C.border}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} color={goal === g.key ? C.accent : C.muted} />
                <span
                  className="text-sm font-bold"
                  style={{ color: goal === g.key ? C.accent : C.text }}
                >
                  {g.label}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                {g.blurb}
              </p>
            </button>
          ))}
        </div>

        {/* Target + deadline */}
        <SectionHeader
          title="Target (optional)"
          sub="What does 'done' look like? Coach cites this in conversation."
        />
        <Card>
          <div className="p-4 space-y-3">
            <input
              type="text"
              placeholder="e.g. 200 kg squat · strict muscle-up · 82.5 kg class"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={() => void handleSaveTarget()}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
            />
            <div className="flex items-center gap-3">
              <label className="text-xs shrink-0" style={{ color: C.muted }}>
                By
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                onBlur={() => void handleSaveTarget()}
                className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              />
              {deadline && (
                <button
                  type="button"
                  onClick={() => { setDeadline(''); void patch({ trainingGoalDeadline: undefined }); }}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ color: C.muted }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Calisthenics skills */}
        {showCaliSkills && (
          <>
            <SectionHeader
              title="Calisthenics skills"
              sub="Which skills should the coach program progressions toward?"
            />
            <Card>
              <div className="flex flex-wrap gap-2 p-3">
                {CALI_SKILLS.map((s) => {
                  const on = caliSkills.has(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => void handleSkillToggle(s.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                      style={{
                        backgroundColor: on ? `${C.gold}20` : C.dim,
                        color:           on ? C.gold : C.muted,
                        border:          `1px solid ${on ? C.gold : C.border}`,
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* Competing link */}
        <SectionHeader title="Competing?" />
        <button
          type="button"
          onClick={() => router.push('/meet')}
          className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.99]"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${C.gold}20` }}
          >
            <Trophy size={18} color={C.gold} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-bold">Meet center</p>
            <p className="text-xs" style={{ color: C.muted }}>
              Add your meet date, attempts, and opener plan.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
