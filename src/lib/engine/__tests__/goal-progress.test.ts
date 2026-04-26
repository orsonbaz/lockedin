import { describe, it, expect } from 'vitest';
import { parseGoalText, buildGoalProgress } from '../goal-progress';
import type { AthleteProfile } from '@/lib/db/types';

const baseProfile: AthleteProfile = {
  id: 'me',
  name: 'Test',
  weightKg: 84,
  targetWeightClass: 83,
  sex: 'MALE',
  federation: 'IPF',
  equipment: 'RAW',
  weighIn: 'TWO_HOUR',
  trainingAgeMonths: 24,
  maxSquat: 180,
  maxBench: 120,
  maxDeadlift: 220,
  bottleneck: 'BALANCED',
  rewardSystem: 'CONSISTENCY',
  responder: 'STANDARD',
  overshooter: false,
  timeToPeakWeeks: 3,
  weeklyFrequency: 4,
  peakDayOfWeek: 6,
  unitSystem: 'KG',
  onboardingComplete: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('parseGoalText', () => {
  it.each([
    ['200 kg squat',     { kind: 'STRENGTH', lift: 'SQUAT',    targetKg: 200 }],
    ['200kg squat',      { kind: 'STRENGTH', lift: 'SQUAT',    targetKg: 200 }],
    ['440 lb bench',     { kind: 'STRENGTH', lift: 'BENCH',    targetKg: 199.6 }],
    ['250 deadlift',     { kind: 'STRENGTH', lift: 'DEADLIFT', targetKg: 250 }],
    ['600 kg total',     { kind: 'STRENGTH', lift: 'TOTAL',    targetKg: 600 }],
  ])('parses strength target "%s"', (input, expected) => {
    expect(parseGoalText(input)).toMatchObject(expected);
  });

  it.each([
    ['82.5 kg class',         82.5],
    ['back to 82.5 class',    82.5],
    ['198 lb class',          89.8],
  ])('parses bodyweight target "%s" → %fkg', (input, kg) => {
    const out = parseGoalText(input);
    expect(out.kind).toBe('BODYWEIGHT');
    if (out.kind !== 'BODYWEIGHT') return;
    expect(out.targetKg).toBeCloseTo(kg, 1);
  });

  it.each([
    ['strict muscle-up',  'muscle_up'],
    ['front lever',       'front_lever'],
    ['planche',           'planche'],
    ['pistol squat',      'pistol_squat'],
  ])('parses skill "%s"', (input, key) => {
    const out = parseGoalText(input);
    expect(out.kind).toBe('SKILL');
    if (out.kind !== 'SKILL') return;
    expect(out.skillKey).toBe(key);
  });

  it('falls back to NARRATIVE for unparseable text', () => {
    expect(parseGoalText('be strong like dad').kind).toBe('NARRATIVE');
    expect(parseGoalText('').kind).toBe('NARRATIVE');
  });
});

describe('buildGoalProgress', () => {
  it('returns null when neither target nor deadline is set', () => {
    expect(buildGoalProgress({ profile: baseProfile })).toBeNull();
  });

  it('computes a strength progress fraction from current max', () => {
    const out = buildGoalProgress({
      profile: { ...baseProfile, trainingGoalTarget: '200 kg squat', maxSquat: 180 },
    });
    expect(out).not.toBeNull();
    expect(out!.parsed.kind).toBe('STRENGTH');
    expect(out!.currentValue).toBe(180);
    expect(out!.targetValue).toBe(200);
    expect(out!.fraction).toBeCloseTo(0.9, 2);
    expect(out!.achieved).toBe(false);
    expect(out!.caption).toContain('20');
    expect(out!.caption).toContain('kg to go');
  });

  it('flags achieved when currentMax ≥ target', () => {
    const out = buildGoalProgress({
      profile: { ...baseProfile, trainingGoalTarget: '180 kg squat', maxSquat: 185 },
    });
    expect(out!.achieved).toBe(true);
    expect(out!.fraction).toBeGreaterThanOrEqual(1);
  });

  it('uses the sum for TOTAL', () => {
    const out = buildGoalProgress({
      profile: {
        ...baseProfile,
        trainingGoalTarget: '600 kg total',
        maxSquat: 200, maxBench: 140, maxDeadlift: 240, // = 580
      },
    });
    expect(out!.currentValue).toBe(580);
    expect(out!.targetValue).toBe(600);
  });

  it('computes bodyweight progress from latestBodyweight, falling back to profile', () => {
    const out = buildGoalProgress({
      profile: { ...baseProfile, trainingGoalTarget: '82.5 kg class', weightKg: 84 },
      latestBodyweight: { id: 'bw1', date: '2024-04-01', weightKg: 83.2, createdAt: '2024-04-01' },
    });
    expect(out!.parsed.kind).toBe('BODYWEIGHT');
    expect(out!.currentValue).toBeCloseTo(83.2, 1);
    expect(out!.caption).toContain('drop');
  });

  it('reports daysLeft from a future deadline', () => {
    const future = '2030-01-01';
    const out = buildGoalProgress({
      profile: { ...baseProfile, trainingGoalTarget: '200 kg squat', trainingGoalDeadline: future },
      todayIso: '2029-12-22',
    });
    expect(out!.daysLeft).toBe(10);
    expect(out!.overdue).toBe(false);
  });

  it('flags overdue when the deadline has passed', () => {
    const out = buildGoalProgress({
      profile: { ...baseProfile, trainingGoalTarget: '200 kg squat', trainingGoalDeadline: '2024-01-01' },
      todayIso: '2024-06-01',
    });
    expect(out!.overdue).toBe(true);
    expect(out!.daysLeft).toBeNull();
  });

  it('NARRATIVE falls through with text-only — no fraction', () => {
    const out = buildGoalProgress({
      profile: {
        ...baseProfile,
        trainingGoalTarget: 'be strong like dad',
        trainingGoalDeadline: '2030-01-01',
      },
      todayIso: '2029-12-22',
    });
    expect(out!.parsed.kind).toBe('NARRATIVE');
    expect(out!.fraction).toBeNull();
    expect(out!.daysLeft).toBe(10);
  });
});
