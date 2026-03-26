'use client';

/**
 * Onboarding — single-page setup form.
 *
 * The DB seed already created a default AthleteProfile.
 * This form lets the user personalise it, then sets
 * localStorage 'lockedin_onboarding_complete' = '1' and
 * redirects to /home.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db }        from '@/lib/db/database';
import { C }         from '@/lib/theme';
import type { Sex, Federation, WeighIn, Equipment, Bottleneck, Responder } from '@/lib/db/types';
import { generateSession } from '@/lib/engine/session';
import { newId } from '@/lib/db/database';

// ── Option sets ───────────────────────────────────────────────────────────────
const FEDERATIONS: Federation[]  = ['IPF', 'USAPL', 'USPA', 'RPS', 'CPU', 'OTHER'];
const WEIGHT_CLASSES_M           = [59, 66, 74, 83, 93, 105, 120, 120.1];
const WEIGHT_CLASSES_F           = [47, 52, 57, 63, 69, 76, 84, 84.1];
const WEIGHT_CLASS_LABELS: Record<number, string> = { 120.1: '120+', 84.1: '84+' };

// ── Small helpers ─────────────────────────────────────────────────────────────
function SectionTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-4 mb-4">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ backgroundColor: C.accent, color: '#fff' }}
      >
        {n}
      </div>
      <div>
        <p className="text-base font-bold leading-tight" style={{ color: C.text }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</p>
      </div>
    </div>
  );
}

function FieldLabel({ label, hint, htmlFor }: { label: string; hint?: string; htmlFor?: string }) {
  return (
    <div className="mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        {label}
      </label>
      {hint && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{hint}</p>}
    </div>
  );
}

function TextInput({
  id, value, onChange, placeholder, type = 'text',
}: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border px-4 py-3 text-base outline-none"
      style={{ backgroundColor: C.dim, borderColor: C.border, color: C.text }}
    />
  );
}

function NumberInput({
  id, value, onChange, min = 0, step = 1, suffix,
}: {
  id?: string; value: string; onChange: (v: string) => void; min?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border px-4 py-3 text-base font-bold outline-none text-right"
        style={{
          backgroundColor: C.dim,
          borderColor: C.border,
          color: C.text,
          fontVariantNumeric: 'tabular-nums',
          paddingRight: suffix ? '3rem' : undefined,
        }}
      />
      {suffix && (
        <span
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
          style={{ color: C.muted }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options, value, onChange, labelFn,
}: {
  options: T[]; value: T; onChange: (v: T) => void; labelFn?: (v: T) => string;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all min-w-[80px]"
          style={{
            backgroundColor: value === opt ? C.accent : C.dim,
            borderColor:     value === opt ? C.accent : C.border,
            color:           value === opt ? '#fff'   : C.muted,
          }}
        >
          {labelFn ? labelFn(opt) : opt}
        </button>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OnboardingStep1() {
  const router = useRouter();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name,         setName]         = useState('');
  const [sex,          setSex]          = useState<Sex>('MALE');
  const [weightKg,     setWeightKg]     = useState('83');
  const [weightClass,  setWeightClass]  = useState(83);
  const [maxSquat,     setMaxSquat]     = useState('');
  const [maxBench,     setMaxBench]     = useState('');
  const [maxDeadlift,  setMaxDeadlift]  = useState('');
  const [federation,   setFederation]   = useState<Federation>('IPF');
  const [equipment,    setEquipment]    = useState<Equipment>('RAW');
  const [weighIn,      setWeighIn]      = useState<WeighIn>('TWO_HOUR');
  const [frequency,    setFrequency]    = useState('4');

  const [bottleneck,    setBottleneck]    = useState<Bottleneck>('BALANCED');
  const [responder,     setResponder]     = useState<Responder>('STANDARD');
  const [overshooter,   setOvershooter]   = useState(false);
  const [trainingYears, setTrainingYears] = useState('1');

  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');

  const weightClasses = sex === 'FEMALE' ? WEIGHT_CLASSES_F : WEIGHT_CLASSES_M;

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    // Validate required fields
    const squat    = parseFloat(maxSquat);
    const bench    = parseFloat(maxBench);
    const deadlift = parseFloat(maxDeadlift);
    const weight   = parseFloat(weightKg);
    const freq     = parseInt(frequency);

    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (isNaN(squat)    || squat    <= 0) { setError('Enter your competition squat max.'); return; }
    if (isNaN(bench)    || bench    <= 0) { setError('Enter your competition bench max.'); return; }
    if (isNaN(deadlift) || deadlift <= 0) { setError('Enter your competition deadlift max.'); return; }
    if (isNaN(weight)   || weight   <= 0) { setError('Enter your body weight.'); return; }

    const trainingAgeMonths = Math.round(parseFloat(trainingYears || '1') * 12);

    setError('');
    setSaving(true);

    try {
      const now = new Date().toISOString();

      // Update (or create) the profile
      const existing = await db.profile.get('me');
      const base = existing ?? {
        id:                'me',
        bottleneck:        'BALANCED'  as const,
        rewardSystem:      'CONSISTENCY' as const,
        responder:         'STANDARD'  as const,
        overshooter:       false,
        timeToPeakWeeks:   3,
        peakDayOfWeek:     6,
        unitSystem:        'KG'        as const,
        trainingAgeMonths: 12,
        heightCm:          175,
        gymSquat:          squat,
        gymBench:          bench,
        gymDeadlift:       deadlift,
        createdAt:         now,
      };

      await db.profile.put({
        ...base,
        name:               name.trim(),
        sex,
        weightKg:           weight,
        targetWeightClass:  weightClass,
        maxSquat:           squat,
        maxBench:           bench,
        maxDeadlift:        deadlift,
        gymSquat:           squat,
        gymBench:           bench,
        gymDeadlift:        deadlift,
        federation,
        equipment,
        weighIn,
        weeklyFrequency:    isNaN(freq) ? 4 : Math.max(2, Math.min(6, freq)),
        bottleneck,
        rewardSystem:       'CONSISTENCY' as const,
        responder,
        overshooter,
        trainingAgeMonths,
        onboardingComplete: true,
        updatedAt:          now,
      });

      // Remove the seeded dummy meet so the user starts with a clean slate
      await db.meets
        .filter((m) => m.name === 'Sample Powerlifting Meet')
        .delete();
      // Detach cycle from sample meet (meet was deleted)
      await db.cycles
        .filter((c) => c.status === 'ACTIVE')
        .modify({ meetId: undefined });

      // Regenerate today's seeded session with actual user maxes
      const todayStr = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
      const todaySession = await db.sessions.where('scheduledDate').equals(todayStr).first();
      if (todaySession) {
        const block = await db.blocks.get(todaySession.blockId);
        if (block) {
          const generated = generateSession({
            profile: {
              ...base,
              name: name.trim(), sex, weightKg: weight, targetWeightClass: weightClass,
              maxSquat: squat, maxBench: bench, maxDeadlift: deadlift,
              gymSquat: squat, gymBench: bench, gymDeadlift: deadlift,
              federation, equipment, weighIn,
              weeklyFrequency: isNaN(freq) ? 4 : Math.max(2, Math.min(6, freq)),
              bottleneck, responder, overshooter,
              trainingAgeMonths,
              onboardingComplete: true,
              updatedAt: now,
            },
            block,
            readinessScore: 75,  // neutral default — no check-in yet
            sessionNumber: 1,
            weekWithinBlock: 1,
            weekDayOfWeek: new Date().getDay(),
          });

          // Replace seeded exercises with generated ones
          await db.exercises.where('sessionId').equals(todaySession.id).delete();
          const freshExercises = generated.exercises.map((ex) => ({
            id: newId(),
            sessionId: todaySession.id,
            name: ex.name,
            exerciseType: ex.exerciseType,
            setStructure: ex.setStructure,
            sets: ex.sets,
            reps: ex.reps,
            rpeTarget: ex.rpeTarget,
            estimatedLoadKg: ex.estimatedLoadKg,
            order: ex.order,
            notes: ex.notes,
            ...(ex.libraryExerciseId ? { libraryExerciseId: ex.libraryExerciseId } : {}),
          }));
          await db.exercises.bulkAdd(freshExercises);

          // Update session with generated coaching note
          await db.sessions.update(todaySession.id, {
            coachNote: generated.coachNote,
            aiModifications: generated.modifications.length > 0
              ? JSON.stringify(generated.modifications)
              : undefined,
          });
        }
      }

      // Mark onboarding done
      localStorage.setItem('lockedin_onboarding_complete', '1');
      router.replace('/home');
    } catch (err) {
      console.error(err);
      setError('Something went wrong saving your profile. Please try again.');
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-5">

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <div className="pt-12 pb-8 text-center">
          <h1
            className="text-5xl font-black tracking-widest mb-2"
            style={{ color: C.accent, textShadow: `0 0 40px ${C.accent}50` }}
          >
            LOCKEDIN
          </h1>
          <p className="text-base" style={{ color: C.muted }}>
            Let's set up your coaching profile. Takes 60 seconds.
          </p>
        </div>

        {/* ── SECTION 1: WHO ARE YOU ───────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 mb-4"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <SectionTitle n={1} title="About you" sub="Used to personalise your coaching and DOTS score" />

          <div className="flex flex-col gap-4">
            {/* Name */}
            <div>
              <FieldLabel label="Your name" htmlFor="ob-name" />
              <TextInput
                id="ob-name"
                value={name}
                onChange={setName}
                placeholder="e.g. Alex"
              />
            </div>

            {/* Sex */}
            <div>
              <FieldLabel label="Sex" hint="Used for DOTS score calculation" />
              <SegmentedControl<Sex>
                options={['MALE', 'FEMALE', 'OTHER']}
                value={sex}
                onChange={(v) => {
                  setSex(v);
                  // Reset weight class to first option for new sex
                  const classes = v === 'FEMALE' ? WEIGHT_CLASSES_F : WEIGHT_CLASSES_M;
                  setWeightClass(classes[0]);
                }}
                labelFn={(v) => v === 'MALE' ? 'Male' : v === 'FEMALE' ? 'Female' : 'Other'}
              />
            </div>

            {/* Body weight */}
            <div>
              <FieldLabel label="Current body weight" hint="Your weight right now, not at weigh-in" htmlFor="ob-weight" />
              <NumberInput id="ob-weight" value={weightKg} onChange={setWeightKg} min={30} step={0.1} suffix="kg" />
            </div>

            {/* Weight class */}
            <div>
              <FieldLabel label="Target weight class" />
              <div className="flex gap-2 flex-wrap">
                {weightClasses.map((wc) => (
                  <button
                    key={wc}
                    type="button"
                    onClick={() => setWeightClass(wc)}
                    className="px-3 py-2 rounded-xl text-sm font-semibold border transition-all"
                    style={{
                      backgroundColor: weightClass === wc ? C.accent : C.dim,
                      borderColor:     weightClass === wc ? C.accent : C.border,
                      color:           weightClass === wc ? '#fff'   : C.muted,
                    }}
                  >
                    {WEIGHT_CLASS_LABELS[wc] ?? `${wc} kg`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: YOUR LIFTS ────────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 mb-4"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <SectionTitle
            n={2}
            title="Your current maxes"
            sub="Enter your best competition lifts, or recent training maxes if you haven't competed"
          />

          <div className="flex flex-col gap-4">
            {[
              { label: 'Squat',     value: maxSquat,    set: setMaxSquat,    id: 'ob-squat'    },
              { label: 'Bench',     value: maxBench,    set: setMaxBench,    id: 'ob-bench'    },
              { label: 'Deadlift',  value: maxDeadlift, set: setMaxDeadlift, id: 'ob-deadlift' },
            ].map(({ label, value, set, id }) => (
              <div key={label}>
                <FieldLabel label={label} htmlFor={id} />
                <NumberInput
                  id={id}
                  value={value}
                  onChange={set}
                  min={20}
                  step={0.5}
                  suffix="kg"
                />
              </div>
            ))}

            {/* Total preview */}
            {maxSquat && maxBench && maxDeadlift && (
              <div
                className="rounded-2xl p-3 flex items-center justify-between"
                style={{ backgroundColor: C.dim }}
              >
                <span className="text-sm" style={{ color: C.muted }}>Projected total</span>
                <span className="text-lg font-black" style={{ color: C.gold, fontVariantNumeric: 'tabular-nums' }}>
                  {(parseFloat(maxSquat || '0') + parseFloat(maxBench || '0') + parseFloat(maxDeadlift || '0')).toFixed(1)} kg
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 3: COMPETITION SETUP ─────────────────────────────── */}
        <div
          className="rounded-3xl p-5 mb-4"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <SectionTitle n={3} title="Competition setup" sub="Affects programming rules and attempt selection" />

          <div className="flex flex-col gap-4">
            {/* Federation */}
            <div>
              <FieldLabel label="Federation" />
              <div className="flex gap-2 flex-wrap">
                {FEDERATIONS.map((fed) => (
                  <button
                    key={fed}
                    type="button"
                    onClick={() => setFederation(fed)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                    style={{
                      backgroundColor: federation === fed ? C.accent : C.dim,
                      borderColor:     federation === fed ? C.accent : C.border,
                      color:           federation === fed ? '#fff'   : C.muted,
                    }}
                  >
                    {fed}
                  </button>
                ))}
              </div>
            </div>

            {/* Equipment */}
            <div>
              <FieldLabel label="Equipment" />
              <SegmentedControl<Equipment>
                options={['RAW', 'SINGLE_PLY', 'MULTI_PLY']}
                value={equipment}
                onChange={setEquipment}
                labelFn={(v) =>
                  v === 'RAW' ? 'Raw' : v === 'SINGLE_PLY' ? 'Single-ply' : 'Multi-ply'
                }
              />
            </div>

            {/* Weigh-in */}
            <div>
              <FieldLabel label="Weigh-in format" hint="Changes your water cut protocol" />
              <SegmentedControl<WeighIn>
                options={['TWO_HOUR', 'TWENTY_FOUR_HOUR']}
                value={weighIn}
                onChange={setWeighIn}
                labelFn={(v) => v === 'TWO_HOUR' ? '2-hour' : '24-hour'}
              />
            </div>

            {/* Weekly frequency */}
            <div>
              <FieldLabel label="Sessions per week" />
              <div className="flex gap-2">
                {['2', '3', '4', '5', '6'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFrequency(n)}
                    className="flex-1 py-3 rounded-2xl text-base font-bold border transition-all"
                    style={{
                      backgroundColor: frequency === n ? C.accent : C.dim,
                      borderColor:     frequency === n ? C.accent : C.border,
                      color:           frequency === n ? '#fff'   : C.muted,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: TRAINING PROFILE ──────────────────────────────── */}
        <div
          className="rounded-3xl p-5 mb-4"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <SectionTitle n={4} title="Your Training Profile" sub="Helps us personalise your programming" />

          <div className="flex flex-col gap-4">
            {/* Training age */}
            <div>
              <FieldLabel
                label="Years powerlifting"
                hint="Counts from your first competition or dedicated powerlifting training"
                htmlFor="ob-training-years"
              />
              <NumberInput
                id="ob-training-years"
                value={trainingYears}
                onChange={setTrainingYears}
                min={0}
                step={0.5}
                suffix="yrs"
              />
            </div>

            {/* Responder type */}
            <div>
              <FieldLabel
                label="How do you respond to training volume?"
                hint={
                  responder === 'HIGH'
                    ? '(I grow fast and handle lots of volume)'
                    : responder === 'LOW'
                    ? '(I need extra recovery, accumulate fatigue fast)'
                    : '(Steady progress, need normal rest)'
                }
              />
              <SegmentedControl<Responder>
                options={['HIGH', 'STANDARD', 'LOW']}
                value={responder}
                onChange={setResponder}
                labelFn={(v) =>
                  v === 'HIGH' ? 'Fast responder' : v === 'STANDARD' ? 'Average' : 'Slow to recover'
                }
              />
            </div>

            {/* Bottleneck */}
            <div>
              <FieldLabel
                label="What limits your total most?"
                hint="Affects rep ranges — size = higher reps, neural = lower reps"
              />
              <SegmentedControl<Bottleneck>
                options={['HYPERTROPHY', 'NEURAL', 'BALANCED']}
                value={bottleneck}
                onChange={setBottleneck}
                labelFn={(v) =>
                  v === 'HYPERTROPHY' ? 'Need more size' : v === 'NEURAL' ? 'Need more skill/efficiency' : 'Both equally'
                }
              />
            </div>

            {/* Overshooter */}
            <div>
              <FieldLabel
                label="How do you handle prescribed RPE?"
                hint="If you tend to overshoot RPE, we'll dial back targets slightly"
              />
              <SegmentedControl<string>
                options={['false', 'true']}
                value={String(overshooter)}
                onChange={(v) => setOvershooter(v === 'true')}
                labelFn={(v) => v === 'false' ? 'I stick close to it' : 'I often go harder than prescribed'}
              />
            </div>
          </div>
        </div>

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {error && (
          <div
            className="rounded-2xl px-4 py-3 mb-4 text-sm font-semibold"
            style={{ backgroundColor: `${C.accent}20`, color: C.accent, border: `1px solid ${C.accent}40` }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ── SUBMIT ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="w-full py-5 rounded-3xl text-lg font-black transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            backgroundColor: C.accent,
            color:           '#fff',
            textShadow:      `0 0 20px ${C.accent}80`,
            boxShadow:       `0 8px 32px ${C.accent}40`,
          }}
        >
          {saving ? 'Setting up your profile…' : "Let's Go →"}
        </button>

        <p className="text-center text-xs mt-4" style={{ color: C.muted }}>
          Everything is saved locally on your device. No account needed.
        </p>

      </div>
    </div>
  );
}
