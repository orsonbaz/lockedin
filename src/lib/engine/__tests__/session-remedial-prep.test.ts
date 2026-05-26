import { describe, it, expect } from 'vitest';
import { generateSession } from '../session';
import type { AthleteProfile, TrainingBlock, Injury } from '@/lib/db/types';

const iso = '2026-01-01T00:00:00.000Z';

const profile: AthleteProfile = {
  id: 'me',
  name: 'Test',
  weightKg: 82,
  targetWeightClass: 83,
  sex: 'MALE',
  federation: 'IPF',
  equipment: 'RAW',
  weighIn: 'TWO_HOUR',
  trainingAgeMonths: 36,
  maxSquat: 180,
  maxBench: 120,
  maxDeadlift: 210,
  bottleneck: 'BALANCED',
  rewardSystem: 'CONSISTENCY',
  responder: 'STANDARD',
  overshooter: false,
  timeToPeakWeeks: 3,
  weeklyFrequency: 4,
  peakDayOfWeek: 6,
  unitSystem: 'KG',
  onboardingComplete: true,
  createdAt: iso,
  updatedAt: iso,
  trainingGoal: 'LONGEVITY',
};

const block: TrainingBlock = {
  id: 'b1',
  cycleId: 'c1',
  blockType: 'ACCUMULATION',
  weekStart: 1,
  weekEnd: 4,
  volumeTarget: 1.1,
  intensityTarget: 0.73,
};

function makeInjury(overrides: Partial<Injury>): Injury {
  return {
    id: 'inj1',
    label: 'Test',
    regions: ['LEFT_SHOULDER'],
    status: 'MANAGING',
    severity: 3,
    onsetDate: '2026-01-01',
    contraindicatedPatterns: [],
    contraindicatedSwapGroups: [],
    preferredPatterns: [],
    constraints: [],
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
}

const baseInput = {
  profile,
  block,
  weekDayOfWeek: 3,
  readinessScore: 75,
  sessionNumber: 1,
};

// Remedial prep rows always carry "Rehab prep" or "Rehab + loading" in their
// notes (see buildRemedialPrep). Counting these directly is more robust than
// diffing exercise count, because the arc-aware length cap can trim
// accessories when prep is added.
function countRehabPrep(exercises: { notes?: string }[]): number {
  return exercises.filter((e) => /^rehab/i.test(e.notes ?? '')).length;
}

describe('generateSession — remedial prep injection (v8)', () => {
  it('no injuries → no remedial prep, exercises identical to baseline', () => {
    const baseline = generateSession(baseInput);
    const withEmpty = generateSession({ ...baseInput, activeInjuries: [] });
    expect(withEmpty.exercises.map((e) => e.name))
      .toEqual(baseline.exercises.map((e) => e.name));
  });

  it('shoulder injury prepends shoulder-region prep at order 1', () => {
    const injury = makeInjury({ regions: ['LEFT_SHOULDER'] });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    expect(session.exercises[0].order).toBe(1);
    // Notes should flag it as rehab prep so the UI can style accordingly.
    expect(session.exercises[0].notes ?? '').toMatch(/rehab/i);
  });

  it('caps prep at 5 movements even with many injuries / complaints', () => {
    const injuries = [
      makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'], severity: 4 }),
      makeInjury({ id: 'b', regions: ['LEFT_KNEE'],     severity: 3 }),
      makeInjury({ id: 'c', regions: ['L_SPINE'],       severity: 2 }),
      makeInjury({ id: 'd', regions: ['LEFT_HIP'],      severity: 2 }),
      makeInjury({ id: 'e', regions: ['LEFT_ANKLE'],    severity: 1 }),
    ];
    const session = generateSession({ ...baseInput, activeInjuries: injuries });
    const prepCount = countRehabPrep(session.exercises);
    expect(prepCount).toBeLessThanOrEqual(5);
    expect(prepCount).toBeGreaterThan(0);
  });

  it('every active injury gets at least one remedy — even low-severity', () => {
    // The "physio that wants you strong af" invariant: a sev-2 niggle isn't
    // ignored when a sev-4 problem is also active.
    const big = makeInjury({ id: 'a', regions: ['LEFT_KNEE'], severity: 4, label: 'Bad knee' });
    const small = makeInjury({ id: 'b', regions: ['LEFT_SHOULDER'], severity: 2, label: 'Cranky shoulder' });
    const session = generateSession({ ...baseInput, activeInjuries: [big, small] });
    const note = session.modifications.join(' ');
    // The modifications line names both injuries.
    expect(note).toContain('Bad knee');
    expect(note).toContain('Cranky shoulder');
  });

  it('a solo low-severity injury still gets a couple of remedies', () => {
    const injury = makeInjury({ regions: ['LEFT_SHOULDER'], severity: 2 });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    // Solo injury + severity 2 → base want 1 + solo bonus 1 = 2 remedies.
    expect(countRehabPrep(session.exercises)).toBeGreaterThanOrEqual(2);
  });

  it('a solo high-severity injury gets more remedies (severity ≥ 3 + solo bonus)', () => {
    const injury = makeInjury({ regions: ['L_SPINE'], severity: 4 });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    // Sev ≥ 3 base want 2 + solo bonus 1 = 3 remedies.
    expect(countRehabPrep(session.exercises)).toBeGreaterThanOrEqual(3);
  });

  it('rehab prep comes before competition exercises', () => {
    const injury = makeInjury({ regions: ['LEFT_SHOULDER'] });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const firstCompIdx = session.exercises.findIndex((e) => e.exerciseType === 'COMPETITION');
    const firstRehabIdx = session.exercises.findIndex((e) => (e.notes ?? '').toLowerCase().includes('rehab'));
    expect(firstRehabIdx).toBeGreaterThanOrEqual(0);
    if (firstCompIdx >= 0) {
      expect(firstRehabIdx).toBeLessThan(firstCompIdx);
    }
  });

  it('rehab exercises carry mechanism-appropriate RPE — loading mechanisms hit RPE 6.5-7', () => {
    const injury = makeInjury({ regions: ['LEFT_KNEE'], severity: 4 });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const rehab = session.exercises.filter((e) => (e.notes ?? '').toLowerCase().includes('rehab'));
    expect(rehab.length).toBeGreaterThan(0);
    for (const ex of rehab) {
      // No grinders — never above RPE 7 for prep.
      expect(ex.rpeTarget).toBeLessThanOrEqual(7);
      // Load stays at 0 — athlete picks the load to hit the prescribed RPE.
      expect(ex.estimatedLoadKg).toBe(0);
    }
    // Knee remedies include HSR leg extension etc. — at least one should be a
    // proper loading mechanism (RPE ≥ 6.5, tagged as VARIATION).
    const loaded = rehab.find((e) => e.rpeTarget >= 6.5);
    expect(loaded).toBeDefined();
    expect(loaded!.exerciseType).toBe('VARIATION');
  });

  it('progression criteria appear in the rehab exercise notes', () => {
    const injury = makeInjury({ regions: ['LEFT_KNEE'], severity: 4 });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const rehab = session.exercises.filter((e) => (e.notes ?? '').toLowerCase().includes('rehab'));
    const withProgress = rehab.find((e) => (e.notes ?? '').toLowerCase().includes('progress'));
    expect(withProgress).toBeDefined();
  });

  it('higher-severity injuries are prepped first', () => {
    // Both shoulder and knee injuries; severity-4 knee should drive the
    // FIRST prep exercise (knee remedies appear before shoulder remedies).
    const injuries = [
      makeInjury({ id: 'shoulder', regions: ['LEFT_SHOULDER'], severity: 2 }),
      makeInjury({ id: 'knee',     regions: ['LEFT_KNEE'],     severity: 4 }),
    ];
    const session = generateSession({ ...baseInput, activeInjuries: injuries });
    const firstRehab = session.exercises.find((e) => (e.notes ?? '').toLowerCase().includes('rehab'));
    expect(firstRehab).toBeDefined();
    // The top knee remedy in the library (Spanish squat / Eccentric leg
    // extension etc.) should win the first slot — heuristic check that the
    // top pick isn't a clearly shoulder-only exercise.
    const name = firstRehab!.name.toLowerCase();
    expect(name).not.toMatch(/band pull-apart|external rotation|cuban/);
  });

  it('skips RESOLVED injuries — no prep when only resolved entries exist', () => {
    const resolved = makeInjury({ status: 'RESOLVED' });
    const baseline = generateSession(baseInput);
    const session = generateSession({ ...baseInput, activeInjuries: [resolved] });
    expect(session.exercises.length).toBe(baseline.exercises.length);
  });

  it('adds a modification note explaining the prep', () => {
    const injury = makeInjury({ label: 'Left rotator cuff tendinopathy', regions: ['LEFT_SHOULDER'] });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const note = session.modifications.join(' ');
    expect(note.toLowerCase()).toMatch(/rehab|prep/);
    expect(note).toContain('Left rotator cuff tendinopathy');
  });

  it('re-indexes order so rehab and main work form a continuous sequence', () => {
    const injury = makeInjury({ regions: ['LEFT_SHOULDER'] });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const orders = session.exercises.map((e) => e.order);
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
  });
});

describe('generateSession — power preservation warm-up (Phase C)', () => {
  it('no arc priorities → no power prep (back-compat: existing tests still pass)', () => {
    const session = generateSession(baseInput);
    const hasPowerPrep = session.exercises.some(
      (e) => e.name === 'Power Warm-Up',
    );
    expect(hasPowerPrep).toBe(false);
  });

  it('strength-priority arc → adds power warm-up at order 1', () => {
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['STRENGTH_BARBELL', 'STRENGTH_CALISTHENICS'],
    });
    expect(session.exercises[0].name).toBe('Power Warm-Up');
    expect(session.exercises[0].sets).toBe(5);
    expect(session.exercises[0].reps).toBe(3);
    // Modifications surface the addition so the athlete sees what changed.
    expect(session.modifications.join(' ').toLowerCase()).toMatch(/power preservation/);
  });

  it('INJURY_HEALING priority → skips power prep (rehab focus)', () => {
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['INJURY_HEALING', 'MOBILITY'],
    });
    const hasPowerPrep = session.exercises.some(
      (e) => e.name === 'Power Warm-Up',
    );
    expect(hasPowerPrep).toBe(false);
  });

  it('STRESS_REDUCTION priority → skips power prep (sleep-deprived dad season)', () => {
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['STRESS_REDUCTION', 'TIME_EFFICIENT'],
    });
    expect(session.exercises.every((e) => e.name !== 'Power Warm-Up')).toBe(true);
  });

  it('acute lower-body injury → skips power prep even with strength priority', () => {
    const injury = makeInjury({
      regions: ['LEFT_KNEE'],
      status: 'ACUTE',
      severity: 4,
    });
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['STRENGTH_BARBELL'],
      activeInjuries: [injury],
    });
    expect(session.exercises.every((e) => e.name !== 'Power Warm-Up')).toBe(true);
  });

  it('upper-body-only injury still allows power prep', () => {
    const injury = makeInjury({
      regions: ['LEFT_SHOULDER'],
      status: 'MANAGING',
      severity: 2,
    });
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['STRENGTH_BARBELL'],
      activeInjuries: [injury],
    });
    expect(session.exercises[0].name).toBe('Power Warm-Up');
  });

  it('power prep sits BEFORE remedial prep so explosive work goes in fresh', () => {
    const injury = makeInjury({ regions: ['LEFT_SHOULDER'] });
    const session = generateSession({
      ...baseInput,
      arcPriorities: ['STRENGTH_BARBELL'],
      activeInjuries: [injury],
    });
    const powerIdx = session.exercises.findIndex((e) => e.name === 'Power Warm-Up');
    const firstRehabIdx = session.exercises.findIndex(
      (e) => (e.notes ?? '').toLowerCase().includes('rehab'),
    );
    expect(powerIdx).toBe(0);
    if (firstRehabIdx >= 0) expect(powerIdx).toBeLessThan(firstRehabIdx);
  });
});
