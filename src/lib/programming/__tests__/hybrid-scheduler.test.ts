import { describe, it, expect } from 'vitest';
import { scheduleWeek, describeHybridPlan } from '../hybrid-scheduler';
import type { EffectiveWeekPlan, DayBudget } from '@/lib/engine/schedule';
import type { AthleteProfile } from '@/lib/db/types';

// ── Fixture builders ─────────────────────────────────────────────────────────

function day(date: string, dayOfWeek: number, minutes: number | null | undefined): DayBudget {
  return { date, dayOfWeek, minutes, overrides: [] };
}

function weekPlan(days: DayBudget[]): EffectiveWeekPlan {
  return {
    weekStart: days[0]?.date ?? '2026-04-20',
    days,
    trainableDays: days.filter((d) => d.minutes !== null).length,
    totalMinutes: days.reduce((a, d) => a + (d.minutes === null ? 0 : d.minutes ?? 90), 0),
    hasAnyOverride: false,
  };
}

function fullWeek(minutes: number | null | undefined = undefined): EffectiveWeekPlan {
  return weekPlan([
    day('2026-04-20', 1, minutes), // Mon
    day('2026-04-21', 2, minutes), // Tue
    day('2026-04-22', 3, minutes), // Wed
    day('2026-04-23', 4, minutes), // Thu
    day('2026-04-24', 5, minutes), // Fri
    day('2026-04-25', 6, minutes), // Sat
    day('2026-04-26', 0, minutes), // Sun
  ]);
}

function profile(
  overrides: Partial<Pick<AthleteProfile, 'weeklyFrequency' | 'disciplines' | 'primaryDiscipline'>> = {},
) {
  return {
    weeklyFrequency: 4,
    disciplines: ['POWERLIFTING' as const],
    primaryDiscipline: 'POWERLIFTING' as const,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('scheduleWeek — powerlifting only', () => {
  it('places the expected number of PL sessions for a 4-day athlete', () => {
    const plan = scheduleWeek({ weekPlan: fullWeek(), profile: profile() });
    expect(plan.plSessions).toBe(4);
    expect(plan.streetLiftSessions).toBe(0);
    expect(plan.calisthenicsSessions).toBe(0);
  });

  it('rotates S / B / DL / B across 4 days', () => {
    const plan = scheduleWeek({ weekPlan: fullWeek(), profile: profile() });
    const lifts = plan.assignments
      .filter((a) => a.kind === 'POWERLIFTING')
      .map((a) => a.primaryLift);
    expect(lifts).toEqual(['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH']);
  });

  it('marks unavailable days as REST', () => {
    const wp = weekPlan([
      day('2026-04-20', 1, null),
      day('2026-04-21', 2, 60),
      day('2026-04-22', 3, null),
      day('2026-04-23', 4, 60),
      day('2026-04-24', 5, null),
      day('2026-04-25', 6, 60),
      day('2026-04-26', 0, null),
    ]);
    const plan = scheduleWeek({ weekPlan: wp, profile: profile({ weeklyFrequency: 3 }) });
    expect(plan.plSessions).toBe(3);
    expect(plan.restDays).toBe(4);
    expect(plan.assignments[0].kind).toBe('REST');
    expect(plan.assignments[0].reason).toContain('Unavailable');
  });
});

describe('scheduleWeek — hybrid (PL + street-lift)', () => {
  it('adds at least one street-lift session when discipline is selected', () => {
    const plan = scheduleWeek({
      weekPlan: fullWeek(),
      profile: profile({
        disciplines: ['POWERLIFTING', 'STREET_LIFT'],
        primaryDiscipline: 'POWERLIFTING',
      }),
    });
    expect(plan.streetLiftSessions).toBeGreaterThan(0);
  });

  it('never stacks a street-lift pull on the same day as a deadlift session', () => {
    const plan = scheduleWeek({
      weekPlan: fullWeek(),
      profile: profile({
        disciplines: ['POWERLIFTING', 'STREET_LIFT'],
        primaryDiscipline: 'POWERLIFTING',
      }),
    });
    for (const a of plan.assignments) {
      if (a.kind === 'STREET_LIFT_PULL' || a.kind === 'STREET_LIFT_DIP') {
        // Deadlift same day would mean the slot kind was overwritten; check
        // the slot isn't also a DL assignment.
        expect(a.primaryLift).not.toBe('DEADLIFT');
      }
    }
    // Also check that no PL DL day got silently overwritten by a street-lift.
    const plDays = plan.assignments.filter((a) => a.kind === 'POWERLIFTING');
    expect(plDays.length).toBe(4);
  });
});

describe('scheduleWeek — calisthenics skill placement', () => {
  it('uses a short day for the skill block when available', () => {
    const wp = weekPlan([
      day('2026-04-20', 1, 60),
      day('2026-04-21', 2, 60),
      day('2026-04-22', 3, 20),   // short day
      day('2026-04-23', 4, 60),
      day('2026-04-24', 5, 60),
      day('2026-04-25', 6, null),
      day('2026-04-26', 0, null),
    ]);
    const plan = scheduleWeek({
      weekPlan: wp,
      profile: profile({
        weeklyFrequency: 4,
        disciplines: ['POWERLIFTING', 'CALISTHENICS'],
        primaryDiscipline: 'POWERLIFTING',
      }),
    });
    const skillDay = plan.assignments.find((a) => a.kind === 'CALISTHENICS_SKILL');
    expect(skillDay).toBeDefined();
    expect(skillDay!.date).toBe('2026-04-22');
  });

  it('pairs the skill block with a bench day if no open slot remains', () => {
    // 4 trainable days, weeklyFrequency 4 → PL fills all 4; cali must pair.
    const wp = weekPlan([
      day('2026-04-20', 1, 60),
      day('2026-04-21', 2, null),
      day('2026-04-22', 3, 60),
      day('2026-04-23', 4, null),
      day('2026-04-24', 5, 60),
      day('2026-04-25', 6, null),
      day('2026-04-26', 0, 60),
    ]);
    const plan = scheduleWeek({
      weekPlan: wp,
      profile: profile({
        weeklyFrequency: 4,
        disciplines: ['POWERLIFTING', 'CALISTHENICS'],
        primaryDiscipline: 'POWERLIFTING',
      }),
    });
    const pairedBench = plan.assignments.find(
      (a) =>
        a.kind === 'POWERLIFTING' &&
        a.primaryLift === 'BENCH' &&
        (a.theme ?? '').includes('skill'),
    );
    expect(pairedBench).toBeDefined();
  });
});

describe('describeHybridPlan', () => {
  it('summarizes non-zero counts', () => {
    const plan = scheduleWeek({
      weekPlan: fullWeek(),
      profile: profile({
        weeklyFrequency: 4,
        disciplines: ['POWERLIFTING', 'STREET_LIFT', 'CALISTHENICS'],
        primaryDiscipline: 'POWERLIFTING',
      }),
    });
    const summary = describeHybridPlan(plan);
    expect(summary).toContain('PL');
    // Rest days may or may not appear depending on allocation; PL is always
    // present when primaryDiscipline is POWERLIFTING.
  });
});
