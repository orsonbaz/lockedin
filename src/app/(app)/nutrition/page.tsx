'use client';

/**
 * Nutrition — /nutrition
 *
 * Daily target ring, quick-add meal log, phase/cadence controls.
 * Reads from nutritionProfile + nutritionLogs; writes via nutrition-db.ts
 * helpers so the coach prompt and UI stay in sync.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Flame, Utensils, Trash2, Plus } from 'lucide-react';
import { db, newId, today } from '@/lib/db/database';
import { C } from '@/lib/theme';
import { RingProgress } from '@/components/lockedin/RingProgress';
import {
  resolveTodayTarget,
  saveTodayTarget,
  macroTotalsFor,
  recordRefeed,
} from '@/lib/engine/nutrition-db';
import { defaultNutritionProfile } from '@/lib/engine/nutrition';
import type {
  NutritionProfile,
  NutritionLog,
  NutritionMealType,
  DietPhase,
  AthleteProfile,
} from '@/lib/db/types';
import type { DailyTarget } from '@/lib/engine/nutrition';

const PHASES: DietPhase[] = ['CUT', 'RECOMP', 'MAINTAIN', 'BULK'];
const MEAL_TYPES: NutritionMealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const MEAL_ICONS: Record<NutritionMealType, string> = {
  BREAKFAST: '🌅',
  LUNCH: '🥗',
  DINNER: '🍽️',
  SNACK: '🍎',
};

type Totals = Awaited<ReturnType<typeof macroTotalsFor>>;

// ── Small primitives (match settings style) ─────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest px-1 mb-2 mt-6 first:mt-0"
      style={{ color: C.muted }}
    >
      {title}
    </p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden divide-y"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: C.border }}>
      {children}
    </div>
  );
}

// ── Macro bar ──────────────────────────────────────────────────────────────
function MacroBar({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>
          {label}
        </span>
        <span className="text-xs font-semibold" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(current)}<span style={{ color: C.muted }}> / {target}g</span>
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.dim }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function NutritionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [nutrition, setNutrition] = useState<NutritionProfile | null>(null);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [totals, setTotals] = useState<Totals>({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0, count: 0 });
  const [logs, setLogs] = useState<NutritionLog[]>([]);

  // Quick-add form
  const [mealType, setMealType] = useState<NutritionMealType>('SNACK');
  const [quickKcal, setQuickKcal] = useState('');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickCarb, setQuickCarb] = useState('');
  const [quickFat, setQuickFat] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const todayStr = today();
    const [p, n, t, tot, ls] = await Promise.all([
      db.profile.get('me'),
      db.nutritionProfile.get('me'),
      resolveTodayTarget(todayStr),
      macroTotalsFor(todayStr),
      db.nutritionLogs.where('date').equals(todayStr).toArray(),
    ]);
    setProfile(p ?? null);
    setNutrition(n ?? null);
    setTarget(t);
    setTotals(tot);
    setLogs(ls.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)));
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // ── Create default profile ─────────────────────────────────────────────
  const createDefaultProfile = useCallback(async () => {
    if (!profile) {
      toast.error('Complete onboarding first.');
      return;
    }
    const defaults = defaultNutritionProfile({ weightKg: profile.weightKg });
    const row: NutritionProfile = { ...defaults, updatedAt: new Date().toISOString() };
    await db.nutritionProfile.put(row);
    await saveTodayTarget();
    toast.success('Nutrition targets created');
    await refresh();
  }, [profile, refresh]);

  // ── Patch profile ──────────────────────────────────────────────────────
  const patchProfile = useCallback(async (patch: Partial<NutritionProfile>) => {
    if (!nutrition) return;
    const updated = { ...nutrition, ...patch, updatedAt: new Date().toISOString() };
    await db.nutritionProfile.put(updated);
    await saveTodayTarget();
    await refresh();
  }, [nutrition, refresh]);

  // ── Log meal ───────────────────────────────────────────────────────────
  const handleLog = useCallback(async () => {
    const kcalN = parseFloat(quickKcal);
    if (!Number.isFinite(kcalN) && !quickDesc.trim()) {
      toast.error('Add kcal or a description.');
      return;
    }
    setSaving(true);
    try {
      const row: NutritionLog = {
        id: newId(),
        date: today(),
        mealType,
        description: quickDesc.trim() || undefined,
        kcal:     Number.isFinite(kcalN) ? Math.round(kcalN) : undefined,
        proteinG: Number.isFinite(parseFloat(quickProtein)) ? Math.round(parseFloat(quickProtein)) : undefined,
        carbG:    Number.isFinite(parseFloat(quickCarb))    ? Math.round(parseFloat(quickCarb))    : undefined,
        fatG:     Number.isFinite(parseFloat(quickFat))     ? Math.round(parseFloat(quickFat))     : undefined,
        loggedAt: new Date().toISOString(),
      };
      await db.nutritionLogs.put(row);
      setQuickKcal(''); setQuickProtein(''); setQuickCarb(''); setQuickFat(''); setQuickDesc('');
      toast.success('Meal logged');
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [mealType, quickKcal, quickProtein, quickCarb, quickFat, quickDesc, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await db.nutritionLogs.delete(id);
    toast('Entry removed', { duration: 1500 });
    await refresh();
  }, [refresh]);

  const handleRefeed = useCallback(async () => {
    await recordRefeed();
    toast.success('Refeed logged for today');
    await refresh();
  }, [refresh]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!nutrition) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text }}>
        <div className="max-w-lg mx-auto px-4">
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
            <h1 className="text-xl font-bold">Nutrition</h1>
          </div>
          <div
            className="rounded-3xl p-6 mt-6 text-center"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: `${C.accent}20` }}
            >
              <Flame size={26} color={C.accent} />
            </div>
            <h2 className="text-lg font-bold mb-1">Set up nutrition</h2>
            <p className="text-sm mb-5" style={{ color: C.muted }}>
              Get training-day, rest-day, and refeed targets based on your weight.
              {profile ? ` We'll start at ~${Math.round(profile.weightKg * 33)} kcal on training days.` : ''}
            </p>
            <button
              type="button"
              onClick={() => void createDefaultProfile()}
              className="w-full py-3 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all"
              style={{ backgroundColor: C.accent, color: '#fff' }}
            >
              Create defaults
            </button>
          </div>
        </div>
      </div>
    );
  }

  const kcalPct = target && target.kcal > 0
    ? Math.min(100, Math.round((totals.kcal / target.kcal) * 100))
    : 0;
  const ringColor = target?.isRefeed ? C.gold : target?.isTrainingDay ? C.accent : C.blue;
  const ringLabel = target?.isRefeed ? 'Refeed' : target?.isTrainingDay ? 'Training' : 'Rest';

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
          <h1 className="text-xl font-bold">Nutrition</h1>
          <span
            className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${ringColor}20`, color: ringColor }}
          >
            {ringLabel}
          </span>
        </div>

        {/* Target ring */}
        {target && (
          <div
            className="rounded-3xl p-5 mt-4 flex items-center gap-5"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <RingProgress
              score={kcalPct}
              color={ringColor}
              label={`${Math.round(totals.kcal)} / ${target.kcal} kcal`}
              animate
            />
            <div className="flex-1 flex flex-col gap-3">
              <MacroBar label="Protein" current={totals.proteinG} target={target.proteinG} color={C.accent} />
              <MacroBar label="Carbs"   current={totals.carbG}   target={target.carbG}    color={C.gold} />
              <MacroBar label="Fat"     current={totals.fatG}    target={target.fatG}     color={C.blue} />
            </div>
          </div>
        )}

        {/* Quick add */}
        <SectionHeader title="Log a meal" />
        <Card>
          <div className="px-4 py-3.5">
            <div className="flex gap-1.5 mb-3">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMealType(m)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                  style={{
                    backgroundColor: mealType === m ? C.accent : C.dim,
                    color: mealType === m ? '#fff' : C.muted,
                    border: `1px solid ${mealType === m ? C.accent : C.border}`,
                  }}
                >
                  <span className="mr-1">{MEAL_ICONS[m]}</span>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="What did you eat? (optional)"
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none mb-2"
              style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
            />
            <div className="grid grid-cols-4 gap-2">
              {([
                ['kcal', quickKcal, setQuickKcal],
                ['P',    quickProtein, setQuickProtein],
                ['C',    quickCarb, setQuickCarb],
                ['F',    quickFat, setQuickFat],
              ] as const).map(([label, value, setter]) => (
                <div key={label} className="relative">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={label}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="w-full rounded-xl border px-2 py-2.5 text-sm font-semibold outline-none text-center"
                    style={{
                      backgroundColor: C.bg,
                      borderColor: C.border,
                      color: C.text,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleLog()}
              disabled={saving}
              className="w-full mt-3 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: C.accent, color: '#fff' }}
            >
              <Plus size={16} />
              {saving ? 'Saving…' : 'Log meal'}
            </button>
          </div>
        </Card>

        {/* Today's entries */}
        {logs.length > 0 && (
          <>
            <SectionHeader title={`Today · ${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`} />
            <Card>
              {logs.map((l) => (
                <Row key={l.id}>
                  <span className="text-lg">{MEAL_ICONS[l.mealType]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
                      {l.description || l.mealType.charAt(0) + l.mealType.slice(1).toLowerCase()}
                    </p>
                    <p className="text-xs" style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {l.kcal ? `${l.kcal} kcal` : '—'}
                      {l.proteinG !== undefined && ` · P${l.proteinG}`}
                      {l.carbG    !== undefined && ` · C${l.carbG}`}
                      {l.fatG     !== undefined && ` · F${l.fatG}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(l.id)}
                    className="p-2 rounded-lg active:scale-95 transition-all"
                    style={{ color: C.muted }}
                    aria-label="Delete entry"
                  >
                    <Trash2 size={15} />
                  </button>
                </Row>
              ))}
            </Card>
          </>
        )}

        {/* Settings */}
        <SectionHeader title="Diet phase" />
        <Card>
          <div className="px-4 py-3.5">
            <div className="grid grid-cols-4 gap-1.5">
              {PHASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void patchProfile({ dietPhase: p })}
                  className="py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{
                    backgroundColor: nutrition.dietPhase === p ? C.accent : C.dim,
                    color: nutrition.dietPhase === p ? '#fff' : C.muted,
                    border: `1px solid ${nutrition.dietPhase === p ? C.accent : C.border}`,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: C.muted }}>
              Multiplier applied to the day&apos;s kcal: CUT 0.80 · RECOMP 0.95 · MAINTAIN 1.00 · BULK 1.10
            </p>
          </div>
        </Card>

        <SectionHeader title="Targets (kcal)" />
        <Card>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Training day</p>
              <p className="text-xs" style={{ color: C.muted }}>Baseline on lifting days</p>
            </div>
            <KcalInput
              value={nutrition.trainingDayKcal}
              onSave={(n) => void patchProfile({ trainingDayKcal: n })}
            />
          </Row>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Rest day</p>
              <p className="text-xs" style={{ color: C.muted }}>Lower carbs, same protein</p>
            </div>
            <KcalInput
              value={nutrition.restDayKcal}
              onSave={(n) => void patchProfile({ restDayKcal: n })}
            />
          </Row>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Refeed day</p>
              <p className="text-xs" style={{ color: C.muted }}>Carb bump on long accumulation</p>
            </div>
            <KcalInput
              value={nutrition.refeedDayKcal}
              onSave={(n) => void patchProfile({ refeedDayKcal: n })}
            />
          </Row>
        </Card>

        <SectionHeader title="Refeed cadence" />
        <Card>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Frequency</p>
              <p className="text-xs" style={{ color: C.muted }}>Days between refeeds (0 = disabled)</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={30}
                value={nutrition.refeedFrequencyDays}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 0) void patchProfile({ refeedFrequencyDays: n });
                }}
                className="w-16 rounded-xl border px-3 py-2 text-right text-sm font-bold outline-none"
                style={{
                  backgroundColor: C.bg,
                  borderColor: C.border,
                  color: C.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span className="text-xs" style={{ color: C.muted }}>days</span>
            </div>
          </Row>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Last refeed</p>
              <p className="text-xs" style={{ color: C.muted }}>
                {nutrition.lastRefeedDate ?? 'Never — tap to log today as a refeed'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefeed()}
              className="text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1.5"
              style={{ backgroundColor: `${C.gold}20`, color: C.gold, border: `1px solid ${C.gold}40` }}
            >
              <Utensils size={13} />
              Log today
            </button>
          </Row>
        </Card>

        <SectionHeader title="Macros per kg body weight" />
        <Card>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Protein</p>
            </div>
            <MacroGkgInput
              value={nutrition.proteinGPerKg}
              onSave={(n) => void patchProfile({ proteinGPerKg: n })}
            />
          </Row>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Fat</p>
            </div>
            <MacroGkgInput
              value={nutrition.fatGPerKg}
              onSave={(n) => void patchProfile({ fatGPerKg: n })}
            />
          </Row>
          <Row>
            <div className="flex-1">
              <p className="text-sm font-medium">Carbs</p>
              <p className="text-xs" style={{ color: C.muted }}>Carbs fill the kcal remainder</p>
            </div>
            <span className="text-sm" style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {target?.carbG ?? '—'}g today
            </span>
          </Row>
        </Card>
      </div>
    </div>
  );
}

// ── Reusable tiny inputs ───────────────────────────────────────────────────
function KcalInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={50}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={(e) => {
          const n = parseInt(e.target.value);
          if (!isNaN(n) && n > 0) onSave(n);
        }}
        className="w-20 rounded-xl border px-3 py-2 text-right text-sm font-bold outline-none"
        style={{
          backgroundColor: C.bg,
          borderColor: C.border,
          color: C.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      <span className="text-xs" style={{ color: C.muted }}>kcal</span>
    </div>
  );
}

function MacroGkgInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={0.1}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n) && n >= 0) onSave(n);
        }}
        className="w-16 rounded-xl border px-3 py-2 text-right text-sm font-bold outline-none"
        style={{
          backgroundColor: C.bg,
          borderColor: C.border,
          color: C.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      <span className="text-xs" style={{ color: C.muted }}>g/kg</span>
    </div>
  );
}
