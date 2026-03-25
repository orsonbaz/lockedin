'use client';

/**
 * Meet Detail — /app/meet/[id]
 *
 * Three tabs:
 *   1. Warm-up Planner  — auto-generated warm-up ladders for each lift + copy
 *   2. Weigh-in Protocol — water-cut guide keyed to cut size and weigh-in format
 *   3. Meet Results      — planned vs actual, GOOD/NO LIFT/BOMB toggles, DOTS
 */

import React, { use, useState, useEffect, useCallback } from 'react';
import { useRouter }                                    from 'next/navigation';
import { toast }                                        from 'sonner';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import { db }                                          from '@/lib/db/database';
import { calcDots, suggestAttempts }                   from '@/lib/engine/calc';
import { C }                                           from '@/lib/theme';
import type {
  Meet, MeetAttempt, AthleteProfile, AttemptResult,
} from '@/lib/db/types';

// ── Lift ordering ─────────────────────────────────────────────────────────────
const LIFT_ORDER = ['SQUAT', 'BENCH', 'DEADLIFT'] as const;
type CompLift = 'SQUAT' | 'BENCH' | 'DEADLIFT';

const LIFT_LABELS: Record<CompLift, string> = {
  SQUAT:    'Squat',
  BENCH:    'Bench Press',
  DEADLIFT: 'Deadlift',
};

// ── Warm-up helpers ───────────────────────────────────────────────────────────
interface WarmupSet {
  label:  string;
  loadKg: number;
  reps:   number;
  sets:   number;
}

const WARMUP_STEPS: Array<{ pct: number; reps: number; sets: number }> = [
  { pct: 0,    reps: 5, sets: 2 },  // empty bar
  { pct: 0.40, reps: 5, sets: 1 },
  { pct: 0.55, reps: 4, sets: 1 },
  { pct: 0.70, reps: 3, sets: 1 },
  { pct: 0.82, reps: 2, sets: 1 },
  { pct: 0.90, reps: 1, sets: 1 },
];

function buildWarmup(openerKg: number): WarmupSet[] {
  return WARMUP_STEPS.map(({ pct, reps, sets }, i) => {
    const raw  = i === 0 ? 20 : openerKg * pct;
    const load = Math.round(raw / 2.5) * 2.5;
    const label = i === 0
      ? 'Empty bar'
      : `${Math.round(pct * 100)}% of opener`;
    return { label, loadKg: load, reps, sets };
  });
}

function warmupToText(liftLabel: string, warmup: WarmupSet[], opener: number): string {
  const lines = [
    `── ${liftLabel.toUpperCase()} WARM-UP ──`,
    ...warmup.map(
      (s) => `${s.sets}×${s.reps} @ ${s.loadKg} kg   (${s.label})`,
    ),
    `OPENER: ${opener} kg`,
    '',
  ];
  return lines.join('\n');
}

// ── Weigh-in helpers ──────────────────────────────────────────────────────────
interface CutProtocol {
  severity:    'none' | 'light' | 'moderate' | 'heavy' | 'warning';
  cutKg:       number;
  steps:       string[];
  rehydration: string[];
}

function buildCutProtocol(
  currentKg: number,
  targetKg:  number,
  weighIn:   'TWO_HOUR' | 'TWENTY_FOUR_HOUR',
): CutProtocol {
  const cutKg = +(currentKg - targetKg).toFixed(1);

  if (cutKg <= 0) {
    return {
      severity:    'none',
      cutKg,
      steps:       [
        'You are at or under your weight class — no cut required.',
        'Focus on carbohydrate loading and staying hydrated in the days before.',
        'Eat a solid meal the night before. Sleep 8+ hours.',
        'Eat breakfast 2–3 hours before your first lift.',
      ],
      rehydration: [],
    };
  }

  if (cutKg <= 2) {
    const steps =
      weighIn === 'TWENTY_FOUR_HOUR'
        ? [
            `Cut target: ${cutKg} kg — manageable with water manipulation.`,
            '48h out: Reduce dietary fibre and bloat-heavy foods.',
            '24h out: Limit fluid intake to ~500 ml/day. Light sweat suit walk.',
            'Weigh-in morning: Sip water only if needed for meds.',
          ]
        : [
            `Cut target: ${cutKg} kg — tight 2-hour window. Keep it simple.`,
            '48h out: Reduce carbs slightly; avoid high-sodium foods.',
            'Morning of: Fast from midnight. Sip minimal water.',
            '90 min out: 20-min sweat suit walk or sauna if 0.5–1 kg still to drop.',
          ];

    return {
      severity: 'light',
      cutKg,
      steps,
      rehydration:
        weighIn === 'TWENTY_FOUR_HOUR'
          ? [
              'First 30 min: 500 ml water + electrolyte tab.',
              '30–60 min: 500 ml water + carb drink (60 g carbs).',
              '1–2 h: Light meal — rice, white bread, banana.',
              '2–6 h: Continue drinking to comfort. Full carb meal.',
              'Evening before bed: Normal dinner + 1 L water.',
            ]
          : [
              'Immediately: 300 ml water + electrolytes. Sip steadily.',
              '30 min out: Banana + rice cake + 300 ml sports drink.',
              'First lift warm-up: Normal — carbs are kicking in.',
              'Between flights: Keep sipping; avoid over-loading the gut.',
            ],
    };
  }

  if (cutKg <= 4) {
    const steps =
      weighIn === 'TWENTY_FOUR_HOUR'
        ? [
            `Cut target: ${cutKg} kg — requires deliberate water manipulation.`,
            '72h out: Switch to low-residue diet (white rice, lean protein, no fibre).',
            '48h out: Reduce fluid intake to ~1 L/day.',
            '24h out: 30–45 min sauna or sweat suit session. Track weight hourly.',
            'Weigh-in: Minimal fluid. Rinse mouth only.',
          ]
        : [
            `Cut target: ${cutKg} kg — aggressive for a 2-hour window. Plan carefully.`,
            '72h out: Low-residue diet. Eliminate alcohol completely.',
            '36h out: Reduce fluid to ~750 ml/day.',
            'Night before: 45–60 min sweat suit session.',
            'Morning of: No food. Minimal water (sips only).',
            '⚠️ Consider moving up a weight class if strength-to-weight ratio allows.',
          ];

    return {
      severity: 'moderate',
      cutKg,
      steps,
      rehydration:
        weighIn === 'TWENTY_FOUR_HOUR'
          ? [
              'Immediately post weigh-in: 500 ml water + 2 electrolyte tabs.',
              '0–1 h: 750 ml sports drink (carbs + sodium).',
              '1–3 h: Solid meal — rice, chicken, fruit. Keep drinking.',
              '3–6 h: 2nd meal. Target 3–4 g carbs/kg bodyweight total.',
              'Evening: Normal dinner. 1–1.5 L water before bed.',
            ]
          : [
              'Immediately: 300 ml water + electrolytes. Do NOT gulp.',
              '20 min: Banana + sports gel + 200 ml drink.',
              '40 min: Rice cake + peanut butter. Continue sipping.',
              '60 min (1st lift): Primed. Stick to liquid carbs between attempts.',
            ],
    };
  }

  // Heavy / warning
  return {
    severity: 'warning',
    cutKg,
    steps: [
      `⚠️ Cut target: ${cutKg} kg — this is a HIGH-RISK cut.`,
      `A ${cutKg} kg water cut ${weighIn === 'TWO_HOUR' ? 'in 2 hours' : 'in 24 hours'} significantly impairs performance.`,
      'Strongly consider competing at a higher weight class.',
      'If proceeding: consult a sports dietitian. The steps below are absolute minimums.',
      '72h out: Nothing but water + white rice + lean protein. Zero fibre.',
      '48h out: Fluid to 500 ml/day. Monitor: dizziness = stop immediately.',
      '24h out: Sauna 2× 20-min sessions with 10-min breaks. Weight check every 30 min.',
      'If you cannot make weight safely, scratch the meet — health first.',
    ],
    rehydration:
      weighIn === 'TWENTY_FOUR_HOUR'
        ? [
            'Immediately: 500 ml ORS (oral rehydration solution).',
            '0–2 h: Alternate 300 ml water / 300 ml sports drink every 20 min.',
            '2–4 h: Solid meal — easily digestible carbs + sodium-rich food.',
            '4–6 h: Larger meal. Target rehydration of 150% of fluid lost.',
            'Night before lifts: Sleep is the best recovery tool.',
          ]
        : [
            'This cut is extremely difficult to recover from in 2 hours.',
            'Drink steadily — 50–100 ml every 5 minutes. No gulping.',
            'Fast-acting carbs only: gels, banana, sports drink.',
            'Expect reduced performance. Adjust openers DOWN 3–5%.',
          ],
  };
}

// ── AttemptResult button ──────────────────────────────────────────────────────
function ResultToggle({
  value,
  current,
  onSelect,
}: {
  value:    AttemptResult;
  current?: AttemptResult;
  onSelect: (r: AttemptResult) => void;
}) {
  const isActive = current === value;
  const config = {
    GOOD:    { label: '✓ Good',     bg: C.greenDim,   activeBg: '#166534', border: C.green,   color: C.green  },
    NO_LIFT: { label: '✗ No Lift',  bg: C.yellowDim,  activeBg: '#713F12', border: C.gold,    color: C.gold   },
    BOMBED:  { label: '💥 Bomb',    bg: C.redDim,     activeBg: '#7F1D1D', border: C.accent,  color: C.accent },
  }[value];

  return (
    <button
      type="button"
      onClick={() => onSelect(isActive ? ('PENDING' as AttemptResult) : value)}
      className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
      style={{
        backgroundColor: isActive ? config.activeBg : config.bg,
        borderColor:     isActive ? config.border   : C.border,
        color:           isActive ? config.color     : C.muted,
      }}
    >
      {config.label}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MeetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }   = use(params);
  const router   = useRouter();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(true);
  const [meet,     setMeet]     = useState<Meet | null>(null);
  const [attempts, setAttempts] = useState<MeetAttempt[]>([]);
  const [profile,  setProfile]  = useState<AthleteProfile | null>(null);

  // ── Results state ─────────────────────────────────────────────────────────
  const [actualKgs,  setActualKgs]  = useState<Record<string, string>>({});
  const [results,    setResults]    = useState<Record<string, AttemptResult>>({});
  const [notes,      setNotes]      = useState('');
  const [completing, setCompleting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [m, prof] = await Promise.all([
        db.meets.get(id),
        db.profile.get('me'),
      ]);
      if (!m) { router.back(); return; }
      const atts = await db.attempts.where('meetId').equals(id).toArray();

      setMeet(m);
      setProfile(prof ?? null);
      setAttempts(atts);

      // Pre-fill existing results
      const kgs:  Record<string, string>       = {};
      const res:  Record<string, AttemptResult> = {};
      for (const a of atts) {
        kgs[a.id] = String(a.actualKg ?? a.plannedKg);
        if (a.result) res[a.id] = a.result;
      }
      setActualKgs(kgs);
      setResults(res);
      setLoading(false);
    }
    void load();
  }, [id, router]);

  // ── Derived ───────────────────────────────────────────────────────────────
  function getOpener(lift: CompLift): number {
    const att = attempts.find((a) => a.lift === lift && a.attemptNumber === 1);
    if (att) return att.plannedKg;
    // No attempts stored — derive opener from training max in profile
    const maxField: Record<CompLift, keyof AthleteProfile> = {
      SQUAT:    'maxSquat',
      BENCH:    'maxBench',
      DEADLIFT: 'maxDeadlift',
    };
    const trainingMax = (profile?.[maxField[lift]] as number | undefined) ?? 0;
    return trainingMax > 0 ? suggestAttempts(trainingMax)[0] : 60;
  }

  function bestGoodLift(lift: CompLift): number {
    const goods = attempts
      .filter((a) => a.lift === lift && results[a.id] === 'GOOD')
      .map((a) => parseFloat(actualKgs[a.id] ?? '0') || 0);
    return goods.length > 0 ? Math.max(...goods) : 0;
  }

  const totalKg = (['SQUAT', 'BENCH', 'DEADLIFT'] as CompLift[]).reduce(
    (sum, l) => sum + bestGoodLift(l),
    0,
  );

  const dotsScore =
    totalKg > 0 && profile
      ? calcDots(totalKg, profile.weightKg, profile.sex)
      : null;

  // ── Save results ──────────────────────────────────────────────────────────
  const handleComplete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      // Update each attempt
      await Promise.all(
        attempts.map((a) => {
          const actualKg = parseFloat(actualKgs[a.id] ?? '') || undefined;
          const result   = results[a.id];
          return db.attempts.update(a.id, {
            ...(actualKg !== undefined ? { actualKg } : {}),
            ...(result    !== undefined ? { result }   : {}),
          });
        }),
      );

      await db.meets.update(id, { status: 'COMPLETED' });
      toast('Meet saved! Great lifting. 🏆', { duration: 4000 });
      router.back();
    } finally {
      setCompleting(false);
    }
  }, [attempts, actualKgs, results, completing, id, router]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading || !meet) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: C.bg }}
      >
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }}
        />
      </div>
    );
  }

  // ── Weigh-in data ─────────────────────────────────────────────────────────
  const cutProtocol = buildCutProtocol(
    profile?.weightKg     ?? meet.weightClass,
    meet.weightClass,
    meet.weighIn,
  );

  const severityColor = {
    none:     C.green,
    light:    C.green,
    moderate: C.gold,
    heavy:    C.accent,
    warning:  C.accent,
  }[cutProtocol.severity];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="pt-6 pb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm px-3 py-1.5 rounded-xl border transition-all active:scale-95"
            style={{ borderColor: C.border, color: C.muted, backgroundColor: C.surface }}
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-lg font-bold leading-tight truncate"
              style={{ color: C.text }}
            >
              {meet.name}
            </h1>
            <p className="text-xs" style={{ color: C.muted }}>
              {new Date(meet.date).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </p>
          </div>
          {meet.status === 'COMPLETED' && (
            <span
              className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${C.green}20`, color: C.green }}
            >
              Completed
            </span>
          )}
        </div>

        {/* ── TABS ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="warmup" className="w-full">
          <TabsList
            className="w-full mb-5"
            style={{ backgroundColor: C.surface }}
          >
            <TabsTrigger value="warmup"  className="flex-1" style={{ color: C.muted }}>Warm-up</TabsTrigger>
            <TabsTrigger value="weighin" className="flex-1" style={{ color: C.muted }}>Weigh-in</TabsTrigger>
            <TabsTrigger value="results" className="flex-1" style={{ color: C.muted }}>Results</TabsTrigger>
          </TabsList>

          {/* ══ TAB 1: WARM-UP PLANNER ══════════════════════════════════════ */}
          <TabsContent value="warmup">
            <p
              className="text-xs mb-5 leading-relaxed"
              style={{ color: C.muted }}
            >
              Warm-up ladders auto-generated from your openers. Adjust on-the-fly.
              Copy all lifts to paste into your notes.
            </p>

            <div className="flex flex-col gap-5">
              {LIFT_ORDER.map((lift) => {
                const opener  = getOpener(lift);
                const warmup  = buildWarmup(opener);
                const copyStr = warmupToText(LIFT_LABELS[lift], warmup, opener);

                return (
                  <div
                    key={lift}
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                  >
                    {/* Lift header */}
                    <div
                      className="px-4 py-3 flex items-center justify-between"
                      style={{ backgroundColor: C.dim, borderBottom: `1px solid ${C.border}` }}
                    >
                      <div>
                        <span
                          className="text-sm font-bold uppercase tracking-widest"
                          style={{ color: C.text }}
                        >
                          {LIFT_LABELS[lift]}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: C.muted }}>
                          Opener: {opener} kg
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(copyStr);
                          toast(`${LIFT_LABELS[lift]} warm-up copied!`, { duration: 2000 });
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-all active:scale-95"
                        style={{ borderColor: C.border, color: C.muted, backgroundColor: C.surface }}
                      >
                        Copy
                      </button>
                    </div>

                    {/* Warm-up table */}
                    <div className="divide-y" style={{ borderColor: C.border }}>
                      {warmup.map((set, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <div
                            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              backgroundColor: i === 0 ? `${C.muted}20` : `${C.accent}15`,
                              color:           i === 0 ? C.muted          : C.accent,
                            }}
                          >
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm" style={{ color: C.text }}>
                              <span className="font-bold">{set.loadKg} kg</span>
                              {' '}
                              <span className="text-xs" style={{ color: C.muted }}>
                                {set.sets}×{set.reps}
                              </span>
                            </p>
                            <p className="text-xs" style={{ color: C.muted }}>{set.label}</p>
                          </div>
                          {/* Visual bar */}
                          <div
                            className="flex-shrink-0 h-1.5 rounded-full"
                            style={{
                              width:           `${Math.max(10, Math.round((set.loadKg / opener) * 64))}px`,
                              backgroundColor: i === 0 ? C.muted : C.accent,
                              opacity:         0.5 + (i / warmup.length) * 0.5,
                            }}
                          />
                        </div>
                      ))}

                      {/* Opener row */}
                      <div
                        className="flex items-center gap-3 px-4 py-3"
                        style={{ backgroundColor: `${C.accent}10` }}
                      >
                        <div
                          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: C.accent, color: '#fff' }}
                        >
                          ⚡
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: C.accent }}>
                            {opener} kg
                          </p>
                          <p className="text-xs" style={{ color: C.muted }}>Opener — 1st attempt</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Copy all button */}
              <button
                type="button"
                onClick={async () => {
                  const all = LIFT_ORDER.map((lift) =>
                    warmupToText(LIFT_LABELS[lift], buildWarmup(getOpener(lift)), getOpener(lift)),
                  ).join('\n');
                  await navigator.clipboard.writeText(all);
                  toast('All warm-ups copied!', { duration: 2000 });
                }}
                className="w-full py-3 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98]"
                style={{ borderColor: C.border, color: C.muted, backgroundColor: C.surface }}
              >
                Copy All Warm-ups
              </button>
            </div>
          </TabsContent>

          {/* ══ TAB 2: WEIGH-IN PROTOCOL ════════════════════════════════════ */}
          <TabsContent value="weighin">
            {/* Summary card */}
            <div
              className="rounded-2xl p-4 mb-5"
              style={{
                backgroundColor: C.surface,
                border:          `1px solid ${severityColor}40`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                    Weight Cut
                  </p>
                  <p
                    className="text-4xl font-black"
                    style={{
                      color:      severityColor,
                      textShadow: cutProtocol.severity === 'none' ? 'none' : `0 0 20px ${severityColor}60`,
                    }}
                  >
                    {cutProtocol.cutKg <= 0
                      ? '0 kg'
                      : `${cutProtocol.cutKg} kg`}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                    {profile?.weightKg ?? meet.weightClass} kg → {meet.weightClass} kg class
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className="text-xs font-semibold px-3 py-1 rounded-full"
                    style={{
                      backgroundColor: `${severityColor}20`,
                      color:            severityColor,
                    }}
                  >
                    {cutProtocol.severity === 'none'     ? 'No cut needed'  :
                     cutProtocol.severity === 'light'    ? 'Light cut'      :
                     cutProtocol.severity === 'moderate' ? 'Moderate cut'   :
                                                          '⚠️ High risk'}
                  </span>
                  <p className="text-xs mt-2" style={{ color: C.muted }}>
                    {meet.weighIn === 'TWO_HOUR' ? '2-hour weigh-in' : '24-hour weigh-in'}
                  </p>
                </div>
              </div>
            </div>

            {/* Protocol steps */}
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: C.muted }}
            >
              Cut Protocol
            </p>
            <div
              className="rounded-2xl overflow-hidden mb-5"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
            >
              {cutProtocol.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-3 px-4 py-3 border-b last:border-b-0"
                  style={{ borderColor: C.border }}
                >
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{
                      backgroundColor: step.startsWith('⚠')
                        ? `${C.accent}20`
                        : `${C.accent}10`,
                      color: step.startsWith('⚠') ? C.accent : C.muted,
                    }}
                  >
                    {step.startsWith('⚠') ? '!' : i + 1}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                    {step}
                  </p>
                </div>
              ))}
            </div>

            {/* Rehydration */}
            {cutProtocol.rehydration.length > 0 && (
              <>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: C.muted }}
                >
                  Rehydration & Recovery (post weigh-in)
                </p>
                <div
                  className="rounded-2xl overflow-hidden mb-5"
                  style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                >
                  {cutProtocol.rehydration.map((step, i) => (
                    <div
                      key={i}
                      className="flex gap-3 px-4 py-3 border-b last:border-b-0"
                      style={{ borderColor: C.border }}
                    >
                      <div
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                        style={{ backgroundColor: `${C.green}20`, color: C.green }}
                      >
                        {i + 1}
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Universal tips */}
            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: C.dim, border: `1px solid ${C.border}` }}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: C.gold }}>
                Meet Day Nutrition Tips
              </p>
              {[
                'Familiar foods only — no new foods on meet day.',
                'Pack your own food: rice, white bread, bananas, gels, sports drinks.',
                'Set alarms for eating between flights — it is easy to forget.',
                'Caffeine 60 min before your 1st lift (usual dose only).',
                'Bring extra food — meets run long.',
              ].map((tip, i) => (
                <p key={i} className="text-xs mb-1 last:mb-0" style={{ color: C.muted }}>
                  • {tip}
                </p>
              ))}
            </div>
          </TabsContent>

          {/* ══ TAB 3: MEET RESULTS ══════════════════════════════════════════ */}
          <TabsContent value="results">
            <p
              className="text-xs mb-5 leading-relaxed"
              style={{ color: C.muted }}
            >
              Log your attempts as they happen. Tap a result after each lift.
            </p>

            {/* Attempt entry — per lift */}
            <div className="flex flex-col gap-5 mb-6">
              {LIFT_ORDER.map((lift) => {
                const liftAttempts = attempts
                  .filter((a) => a.lift === lift)
                  .sort((a, b) => a.attemptNumber - b.attemptNumber);

                return (
                  <div
                    key={lift}
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                  >
                    {/* Lift header */}
                    <div
                      className="px-4 py-3 flex items-center justify-between"
                      style={{ backgroundColor: C.dim, borderBottom: `1px solid ${C.border}` }}
                    >
                      <span
                        className="text-sm font-bold uppercase tracking-widest"
                        style={{ color: C.text }}
                      >
                        {LIFT_LABELS[lift]}
                      </span>
                      {bestGoodLift(lift) > 0 && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${C.green}20`, color: C.green }}
                        >
                          Best: {bestGoodLift(lift)} kg
                        </span>
                      )}
                    </div>

                    {/* Attempts */}
                    <div className="divide-y" style={{ borderColor: C.border }}>
                      {liftAttempts.map((attempt) => {
                        const numLabel = ['', 'Opener', '2nd', '3rd'][attempt.attemptNumber];
                        return (
                          <div key={attempt.id} className="px-4 py-3 flex flex-col gap-2">
                            {/* Attempt label + planned */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold" style={{ color: C.muted }}>
                                {numLabel}
                              </span>
                              <span className="text-xs" style={{ color: C.muted }}>
                                Planned: {attempt.plannedKg} kg
                              </span>
                            </div>

                            {/* Actual weight input */}
                            <div className="relative">
                              <input
                                type="number"
                                step={0.5}
                                min={0}
                                aria-label={`${numLabel} actual weight in kilograms`}
                                value={actualKgs[attempt.id] ?? ''}
                                onChange={(e) =>
                                  setActualKgs((prev) => ({
                                    ...prev,
                                    [attempt.id]: e.target.value,
                                  }))
                                }
                                placeholder={String(attempt.plannedKg)}
                                className="w-full rounded-xl border px-4 py-2.5 text-right text-lg font-bold outline-none"
                                style={{
                                  backgroundColor:    C.bg,
                                  borderColor:        C.border,
                                  color:              C.text,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              />
                              <span
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                style={{ color: C.muted }}
                              >
                                Actual (kg)
                              </span>
                            </div>

                            {/* Result toggles */}
                            <div className="flex gap-1.5">
                              {(['GOOD', 'NO_LIFT', 'BOMBED'] as AttemptResult[]).map((r) => (
                                <ResultToggle
                                  key={r}
                                  value={r}
                                  current={results[attempt.id]}
                                  onSelect={(selected) =>
                                    setResults((prev) => ({
                                      ...prev,
                                      [attempt.id]: selected,
                                    }))
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Total + DOTS ──────────────────────────────────────────────── */}
            {totalKg > 0 && (
              <div
                className="rounded-2xl p-4 mb-5 relative overflow-hidden"
                style={{ backgroundColor: C.surface, border: `1px solid ${C.gold}40` }}
              >
                {/* Gold glow */}
                <div
                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 pointer-events-none"
                  style={{ backgroundColor: C.gold, filter: 'blur(30px)' }}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>
                      Total
                    </p>
                    <p
                      className="text-5xl font-black"
                      style={{
                        color:      C.gold,
                        textShadow: `0 0 30px ${C.gold}50`,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {totalKg}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: C.muted }}>kg total</p>
                  </div>

                  {dotsScore !== null && (
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>
                        DOTS
                      </p>
                      <p
                        className="text-5xl font-black"
                        style={{
                          color:      C.accent,
                          textShadow: `0 0 30px ${C.accent}50`,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {dotsScore.toFixed(1)}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: C.muted }}>points</p>
                    </div>
                  )}
                </div>

                {/* Individual bests */}
                <div className="mt-4 flex gap-3">
                  {LIFT_ORDER.map((lift) => {
                    const best = bestGoodLift(lift);
                    return (
                      <div key={lift} className="flex-1 text-center">
                        <p className="text-xs" style={{ color: C.muted }}>{LIFT_LABELS[lift].split(' ')[0]}</p>
                        <p
                          className="text-base font-bold"
                          style={{
                            color: best > 0 ? C.text : C.muted,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {best > 0 ? `${best} kg` : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Post-meet notes ───────────────────────────────────────────── */}
            <div className="mb-5">
              <label
                htmlFor="post-meet-notes"
                className="text-xs font-semibold uppercase tracking-widest block mb-2"
                style={{ color: C.muted }}
              >
                Post-Meet Notes
              </label>
              <textarea
                id="post-meet-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it go? What would you change? Any PRs?"
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none resize-none"
                style={{
                  backgroundColor: C.surface,
                  borderColor:     C.border,
                  color:           C.text,
                }}
              />
            </div>

            {/* ── Complete button ───────────────────────────────────────────── */}
            {meet.status !== 'COMPLETED' ? (
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={completing}
                className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ backgroundColor: C.accent, color: '#fff' }}
              >
                {completing ? 'Saving…' : '🏆 Mark Meet Complete'}
              </button>
            ) : (
              <div
                className="w-full py-4 rounded-2xl text-base font-bold text-center"
                style={{ backgroundColor: `${C.green}20`, color: C.green }}
              >
                ✓ Meet Completed
              </div>
            )}
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
