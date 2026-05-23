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

  it('caps prep at 3 movements even with many injuries / complaints', () => {
    const injuries = [
      makeInjury({ id: 'a', regions: ['LEFT_SHOULDER'] }),
      makeInjury({ id: 'b', regions: ['LEFT_KNEE'] }),
      makeInjury({ id: 'c', regions: ['L_SPINE'] }),
      makeInjury({ id: 'd', regions: ['LEFT_HIP'] }),
      makeInjury({ id: 'e', regions: ['LEFT_ANKLE'] }),
    ];
    const baseline = generateSession(baseInput);
    const session = generateSession({ ...baseInput, activeInjuries: injuries });
    const added = session.exercises.length - baseline.exercises.length;
    expect(added).toBeLessThanOrEqual(3);
    expect(added).toBeGreaterThan(0);
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

  it('rehab exercises carry RPE 5 and 0 estimated load (prep, not loading)', () => {
    const injury = makeInjury({ regions: ['LEFT_KNEE'], severity: 4 });
    const session = generateSession({ ...baseInput, activeInjuries: [injury] });
    const rehab = session.exercises.filter((e) => (e.notes ?? '').toLowerCase().includes('rehab'));
    expect(rehab.length).toBeGreaterThan(0);
    for (const ex of rehab) {
      expect(ex.rpeTarget).toBeLessThanOrEqual(5);
      expect(ex.estimatedLoadKg).toBe(0);
    }
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
