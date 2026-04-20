/**
 * schedule.ts — Resolve the athlete's effective plan for a given week.
 *
 * Inputs:
 *   - `AthleteProfile.weeklyScheduleTemplate` (default day-of-week availability)
 *   - `scheduleOverrides` rows (per-date constraints: unavailable, time box,
 *     equipment-limited, location)
 *   - Scheduled training sessions (so we know what exists to abbreviate/move)
 *
 * Output: `EffectiveWeekPlan` — a simple, UI-friendly summary of which days
 * are trainable, how many minutes are available each day, and what (if any)
 * constraints apply. The session generator and the hybrid scheduler both
 * consume this; the `/schedule` page and home banner render it.
 *
 * Pure-ish: the functions that *compute* a plan are pure; CRUD helpers wrap
 * Dexie writes.
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  AthleteProfile,
  ScheduleOverride,
  ScheduleOverrideKind,
  TrainingSession,
} from '@/lib/db/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DayBudget {
  date: string;              // YYYY-MM-DD
  dayOfWeek: number;         // 0 = Sun … 6 = Sat
  /** null means unavailable; undefined/number = minutes (undefined = no cap). */
  minutes: number | null | undefined;
  allowedEquipment?: string[];
  location?: string;
  note?: string;
  /** Session scheduled for this date, if any. */
  session?: TrainingSession;
  /** Schedule overrides applied to this date. */
  overrides: ScheduleOverride[];
}

export interface EffectiveWeekPlan {
  weekStart: string;           // YYYY-MM-DD of Monday anchor
  days: DayBudget[];           // length 7, Mon→Sun
  trainableDays: number;       // days where minutes !== null
  totalMinutes: number;        // sum of minutes (undefined counted as 90)
  hasAnyOverride: boolean;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns Monday of the week containing `date` (local time). */
export function mondayOf(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Calendar day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD string. */
function dayOfWeek(date: string): number {
  return new Date(date + 'T12:00:00').getDay();
}

// ── Resolver (pure) ──────────────────────────────────────────────────────────

/**
 * Merge overrides into the template to get a single budget per day.
 * UNAVAILABLE wins over everything else. Later overrides win within a day.
 */
function resolveDayBudget(
  date: string,
  template: AthleteProfile['weeklyScheduleTemplate'],
  overrides: ScheduleOverride[],
  session?: TrainingSession,
): DayBudget {
  const dow = dayOfWeek(date);
  const dayOverrides = overrides
    .filter((o) => o.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Start from the template (undefined ⇒ no cap; 0 ⇒ unavailable by convention)
  const templateMinutes = template?.[dow];
  let minutes: number | null | undefined =
    templateMinutes === 0 ? null : templateMinutes;

  let allowedEquipment: string[] | undefined;
  let location: string | undefined;
  const notes: string[] = [];

  for (const o of dayOverrides) {
    if (o.note) notes.push(o.note);
    switch (o.kind) {
      case 'UNAVAILABLE':
        minutes = null;
        break;
      case 'TIME_BOX':
        if (minutes !== null && o.minutesAvailable !== undefined) {
          minutes = o.minutesAvailable;
        }
        break;
      case 'EQUIPMENT_ONLY':
        if (o.allowedEquipment?.length) allowedEquipment = o.allowedEquipment;
        break;
      case 'LOCATION':
        location = o.location ?? o.note;
        break;
    }
  }

  return {
    date,
    dayOfWeek: dow,
    minutes,
    allowedEquipment,
    location,
    note: notes.join(' · ') || undefined,
    session,
    overrides: dayOverrides,
  };
}

export interface WeekPlanInputs {
  profile: AthleteProfile | null | undefined;
  overrides: ScheduleOverride[];
  sessions: TrainingSession[];
  weekStart: string;
}

/** Deterministic: given the inputs, produces the same plan every time. */
export function computeWeekPlan(inputs: WeekPlanInputs): EffectiveWeekPlan {
  const days: DayBudget[] = [];
  let trainable = 0;
  let total = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(inputs.weekStart, i);
    const session = inputs.sessions.find((s) => s.scheduledDate === date);
    const budget = resolveDayBudget(
      date,
      inputs.profile?.weeklyScheduleTemplate,
      inputs.overrides,
      session,
    );
    days.push(budget);

    if (budget.minutes !== null) {
      trainable += 1;
      total += budget.minutes ?? 90;
    }
  }

  return {
    weekStart: inputs.weekStart,
    days,
    trainableDays: trainable,
    totalMinutes: total,
    hasAnyOverride: inputs.overrides.length > 0,
  };
}

// ── Async loaders (thin wrappers around the pure resolver) ───────────────────

export async function loadWeekPlan(weekStart = mondayOf(today())): Promise<EffectiveWeekPlan> {
  const weekEnd = addDays(weekStart, 6);

  const [profile, overrides, sessions] = await Promise.all([
    db.profile.get('me'),
    db.scheduleOverrides
      .where('date').between(weekStart, weekEnd, true, true)
      .toArray(),
    db.sessions
      .where('scheduledDate').between(weekStart, weekEnd, true, true)
      .toArray(),
  ]);

  return computeWeekPlan({ profile, overrides, sessions, weekStart });
}

/** Read the schedule override(s) that apply to a specific date. */
export async function loadOverridesFor(date: string): Promise<ScheduleOverride[]> {
  return db.scheduleOverrides.where('date').equals(date).toArray();
}

// ── Override CRUD ────────────────────────────────────────────────────────────

export interface CreateOverrideInput {
  date: string;
  kind: ScheduleOverrideKind;
  minutesAvailable?: number;
  allowedEquipment?: string[];
  location?: string;
  note?: string;
}

export async function addOverride(input: CreateOverrideInput): Promise<ScheduleOverride> {
  const override: ScheduleOverride = {
    id: newId(),
    date: input.date,
    kind: input.kind,
    minutesAvailable: input.minutesAvailable,
    allowedEquipment: input.allowedEquipment,
    location: input.location,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  await db.scheduleOverrides.add(override);
  return override;
}

export async function removeOverride(id: string): Promise<boolean> {
  const existing = await db.scheduleOverrides.get(id);
  if (!existing) return false;
  await db.scheduleOverrides.delete(id);
  return true;
}

/**
 * Convenience: mark an entire week as time-boxed to `minutes`/day.
 * Replaces any prior TIME_BOX overrides in that week. Leaves UNAVAILABLE days
 * untouched.
 */
export async function applyWeekTimeBox(
  weekStart: string,
  minutes: number,
  note?: string,
): Promise<ScheduleOverride[]> {
  const weekEnd = addDays(weekStart, 6);
  const existing = await db.scheduleOverrides
    .where('date').between(weekStart, weekEnd, true, true)
    .toArray();

  // Delete existing TIME_BOX overrides in this range (we're replacing them).
  const toDelete = existing.filter((o) => o.kind === 'TIME_BOX').map((o) => o.id);
  if (toDelete.length > 0) await db.scheduleOverrides.bulkDelete(toDelete);

  const created: ScheduleOverride[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    // Skip days already marked UNAVAILABLE — the user's intent is that those
    // days are off, not that they have N minutes.
    if (existing.some((o) => o.date === date && o.kind === 'UNAVAILABLE')) continue;
    created.push(await addOverride({ date, kind: 'TIME_BOX', minutesAvailable: minutes, note }));
  }
  return created;
}

// ── Display helpers ──────────────────────────────────────────────────────────

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeDay(day: DayBudget): string {
  if (day.minutes === null) return 'Unavailable';
  if (day.minutes === undefined) return 'Full training day';
  return `${day.minutes} min available`;
}

/** Today's budget, if any. Exposed for the home page banner. */
export async function loadTodayBudget(): Promise<DayBudget | undefined> {
  const plan = await loadWeekPlan(mondayOf(today()));
  return plan.days.find((d) => d.date === today());
}
