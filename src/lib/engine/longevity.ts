/**
 * Longevity score — composite of seven daily pillars.
 *
 *   longevityScore =
 *     0.20 * sleepScore       7d avg hours ≥ 7 AND quality
 *     0.15 * cardioScore      weekly zone 2 vs target (default 150 min)
 *     0.15 * strengthScore    sessions/wk vs target + full-ROM streak
 *     0.15 * mobilityScore    routines done/wk + assigned-rehab adherence
 *     0.10 * recoveryScore    HRV vs 28d baseline + subjective stress
 *     0.10 * nutritionScore   protein + kcal band adherence
 *     0.15 * injuryRiskScore  100 − Σ(active injury severity × 8)
 *
 * Pure functions where possible; the orchestrator (`computeAndPersistSnapshot`)
 * reads from Dexie. All pillar scores are 0-100. The composite is rounded to
 * an integer.
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  LongevitySnapshot,
  WearableMetric,
  ReadinessRecord,
  Injury,
  TrainingSession,
  NutritionLog,
  NutritionTarget,
  MobilitySession,
} from '@/lib/db/types';
import { listActiveInjuries } from '@/lib/injuries';

// ── Pillar weights (must sum to 1.0) ─────────────────────────────────────────

export const PILLAR_WEIGHTS = {
  sleep:      0.20,
  cardio:     0.15,
  strength:   0.15,
  mobility:   0.15,
  recovery:   0.10,
  nutrition:  0.10,
  injuryRisk: 0.15,
} as const;

export type PillarKey = keyof typeof PILLAR_WEIGHTS;

export interface PillarBreakdown {
  sleep: number;
  cardio: number;
  strength: number;
  mobility: number;
  recovery: number;
  nutrition: number;
  injuryRisk: number;
}

// ── Pure pillar scorers ──────────────────────────────────────────────────────

/**
 * Sleep — 7-day average hours, weighted by quality if present.
 * Targets: 7h is "minimum acceptable" (60 pts), 8h is "ideal" (100 pts).
 * Below 6 = 0; above 9 = capped at 100 (no bonus for oversleeping).
 */
export function scoreSleep(input: {
  hoursLast7d: number[];
  qualitiesLast7d?: number[];   // optional 0-100 quality scores
}): number {
  const hours = input.hoursLast7d.filter((h) => h > 0);
  if (hours.length === 0) return 0;
  const avg = hours.reduce((a, b) => a + b, 0) / hours.length;

  let hoursScore: number;
  if (avg < 6) hoursScore = 0;
  else if (avg < 7) hoursScore = ((avg - 6) / 1) * 60;
  else if (avg < 8) hoursScore = 60 + ((avg - 7) / 1) * 40;
  else hoursScore = 100;

  const qualities = input.qualitiesLast7d?.filter((q) => q > 0) ?? [];
  if (qualities.length === 0) return Math.round(hoursScore);

  const qAvg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
  // Average the two so a great score with mediocre quality doesn't max out.
  return Math.round((hoursScore + qAvg) / 2);
}

/**
 * Cardio — weekly zone 2 minutes vs target. Linear up to target, half-credit
 * beyond (a little extra is fine but excessive is fatigue).
 */
export function scoreCardio(input: {
  zone2MinutesLast7d: number;
  weeklyTargetMin?: number;
}): number {
  const target = input.weeklyTargetMin ?? 150;
  if (input.zone2MinutesLast7d <= 0) return 0;
  if (input.zone2MinutesLast7d <= target) {
    return Math.round((input.zone2MinutesLast7d / target) * 100);
  }
  // Past target: each minute is half-credit, capped at 100.
  const extra = input.zone2MinutesLast7d - target;
  return Math.min(100, Math.round(100 + (extra / target) * 50));
}

/**
 * Strength — sessions completed in the last 7 days vs target. Default 3/wk.
 * Bonus when a "full ROM streak" (sessions tagged with FULL_ROM completion)
 * exists; not implemented in v8 — placeholder.
 */
export function scoreStrength(input: {
  sessionsLast7d: number;
  weeklyTarget?: number;
}): number {
  const target = input.weeklyTarget ?? 3;
  if (input.sessionsLast7d <= 0) return 0;
  return Math.min(100, Math.round((input.sessionsLast7d / target) * 100));
}

/**
 * Mobility — completed routines / week. Target 5 (daily-ish). Zero floor.
 */
export function scoreMobility(input: {
  routinesLast7d: number;
  weeklyTarget?: number;
}): number {
  const target = input.weeklyTarget ?? 5;
  if (input.routinesLast7d <= 0) return 0;
  return Math.min(100, Math.round((input.routinesLast7d / target) * 100));
}

/**
 * Recovery — HRV vs 28d baseline plus subjective stress check.
 * HRV deviation (today minus 28d avg, as a fraction of avg):
 *   +10 % or better  → 100
 *   0 to +10 %      → 80-100
 *   -10 % to 0      → 50-80
 *   -20 % to -10 %  → 25-50
 *   below -20 %     → 0-25
 * If stress is logged (1-5, higher = worse) we subtract 0/8/16/24/32 pts.
 */
export function scoreRecovery(input: {
  hrvToday?: number;
  hrvBaseline28d?: number;
  stress?: number; // 1-5
}): number {
  if (!input.hrvToday || !input.hrvBaseline28d || input.hrvBaseline28d <= 0) {
    return 50; // neutral when we lack data
  }
  const delta = (input.hrvToday - input.hrvBaseline28d) / input.hrvBaseline28d;
  let base: number;
  if (delta >= 0.10) base = 100;
  else if (delta >= 0)    base = 80 + delta * 200; // 0 → 80, +0.10 → 100
  else if (delta >= -0.10) base = 50 + (delta + 0.10) * 300; // -0.10 → 50, 0 → 80
  else if (delta >= -0.20) base = 25 + (delta + 0.20) * 250; // -0.20 → 25, -0.10 → 50
  else base = Math.max(0, 25 + (delta + 0.20) * 125);

  if (input.stress && input.stress >= 1 && input.stress <= 5) {
    base -= (input.stress - 1) * 8;
  }
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Nutrition — average protein-target adherence + kcal-band adherence over
 * the last 7 days. Both are 0-100; we average them.
 */
export function scoreNutrition(input: {
  proteinAdherence7d?: number; // 0-100 (% of days hit protein target)
  kcalBandAdherence7d?: number; // 0-100 (% of days within ±15% of target)
}): number {
  const parts: number[] = [];
  if (input.proteinAdherence7d !== undefined) parts.push(input.proteinAdherence7d);
  if (input.kcalBandAdherence7d !== undefined) parts.push(input.kcalBandAdherence7d);
  if (parts.length === 0) return 50;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/**
 * Injury risk — start at 100, subtract 8 per severity point across active
 * (non-resolved) injuries. Floor at 0.
 */
export function scoreInjuryRisk(injuries: readonly Injury[]): number {
  const active = injuries.filter((i) => i.status !== 'RESOLVED');
  const total = active.reduce((sum, i) => sum + i.severity * 8, 0);
  return Math.max(0, 100 - total);
}

// ── Composer ─────────────────────────────────────────────────────────────────

export function composeLongevityScore(pillars: PillarBreakdown): number {
  const total =
    pillars.sleep      * PILLAR_WEIGHTS.sleep +
    pillars.cardio     * PILLAR_WEIGHTS.cardio +
    pillars.strength   * PILLAR_WEIGHTS.strength +
    pillars.mobility   * PILLAR_WEIGHTS.mobility +
    pillars.recovery   * PILLAR_WEIGHTS.recovery +
    pillars.nutrition  * PILLAR_WEIGHTS.nutrition +
    pillars.injuryRisk * PILLAR_WEIGHTS.injuryRisk;
  return Math.round(total);
}

// ── Orchestrator (Dexie-backed) ──────────────────────────────────────────────

export interface ComputeOptions {
  /** Date to compute for; defaults to today. */
  date?: string;
  /** Persist a snapshot row. Defaults to true. */
  persist?: boolean;
}

export interface ComputedSnapshot {
  date: string;
  score: number;
  pillars: PillarBreakdown;
}

/**
 * Read athlete data from Dexie, compute the seven pillar scores, and either
 * just return the snapshot or persist it for trending.
 *
 * Designed to be cheap to call — e.g. once when the home page renders. Each
 * pillar reads at most one indexed range.
 */
export async function computeSnapshot(opts: ComputeOptions = {}): Promise<ComputedSnapshot> {
  const date = opts.date ?? today();
  const persist = opts.persist ?? true;

  const sevenDaysAgo = isoDaysAgo(7, date);
  const twentyEightDaysAgo = isoDaysAgo(28, date);

  const [
    sleepHoursMetrics,
    sleepQualityMetrics,
    zone2Metrics,
    sessions7d,
    mobility7d,
    todayHrv,
    hrv28d,
    todayReadiness,
    nutritionTargets7d,
    nutritionLogs7d,
    injuries,
  ] = await Promise.all([
    db.wearableMetrics
      .where('[date+metricKind]')
      .between([sevenDaysAgo, 'SLEEP_HOURS'], [date, 'SLEEP_HOURS￿'])
      .toArray(),
    db.wearableMetrics
      .where('[date+metricKind]')
      .between([sevenDaysAgo, 'SLEEP_QUALITY'], [date, 'SLEEP_QUALITY￿'])
      .toArray(),
    db.wearableMetrics
      .where('[date+metricKind]')
      .between([sevenDaysAgo, 'ZONE_2_MINUTES'], [date, 'ZONE_2_MINUTES￿'])
      .toArray(),
    db.sessions
      .filter((s) => s.status === 'COMPLETED' && s.scheduledDate >= sevenDaysAgo && s.scheduledDate <= date)
      .toArray(),
    db.mobilitySessions
      .filter((s) => Boolean(s.completedAt) && s.date >= sevenDaysAgo && s.date <= date)
      .toArray(),
    db.wearableMetrics
      .where('[date+metricKind]')
      .between([date, 'HRV'], [date, 'HRV￿'])
      .first(),
    db.wearableMetrics
      .where('[date+metricKind]')
      .between([twentyEightDaysAgo, 'HRV'], [date, 'HRV￿'])
      .toArray(),
    db.readiness.where('date').equals(date).first(),
    db.nutritionTargets
      .filter((t) => t.date >= sevenDaysAgo && t.date <= date)
      .toArray(),
    db.nutritionLogs
      .filter((l) => l.date >= sevenDaysAgo && l.date <= date)
      .toArray(),
    listActiveInjuries(),
  ]);

  const pillars: PillarBreakdown = {
    sleep: scoreSleep({
      hoursLast7d: sleepHoursMetrics.map((m) => m.value),
      qualitiesLast7d: sleepQualityMetrics.map((m) => m.value),
    }),
    cardio: scoreCardio({
      zone2MinutesLast7d: zone2Metrics.reduce((s, m) => s + m.value, 0),
    }),
    strength: scoreStrength({
      sessionsLast7d: sessions7d.length,
    }),
    mobility: scoreMobility({
      routinesLast7d: mobility7d.length,
    }),
    recovery: scoreRecovery({
      hrvToday: todayHrv?.value,
      hrvBaseline28d: hrv28d.length > 0
        ? hrv28d.reduce((s, m) => s + m.value, 0) / hrv28d.length
        : undefined,
      stress: todayReadiness?.stress,
    }),
    nutrition: composeNutritionAdherence(nutritionTargets7d, nutritionLogs7d),
    injuryRisk: scoreInjuryRisk(injuries),
  };

  const score = composeLongevityScore(pillars);
  const snapshot: ComputedSnapshot = { date, score, pillars };

  if (persist) await persistSnapshot(snapshot);
  return snapshot;
}

/**
 * Persist (or overwrite) the snapshot row for `date`. Idempotent.
 */
export async function persistSnapshot(snapshot: ComputedSnapshot): Promise<void> {
  const existing = await db.longevitySnapshots.where('date').equals(snapshot.date).first();
  const row: LongevitySnapshot = {
    id: existing?.id ?? newId(),
    date: snapshot.date,
    score: snapshot.score,
    pillars: snapshot.pillars,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await db.longevitySnapshots.put(row);
}

/** Recent snapshots (newest first) for trend display. */
export async function recentSnapshots(days = 14): Promise<LongevitySnapshot[]> {
  const cutoff = isoDaysAgo(days);
  const rows = await db.longevitySnapshots.where('date').above(cutoff).toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function composeNutritionAdherence(
  targets: NutritionTarget[],
  logs: NutritionLog[],
): number {
  if (targets.length === 0) return 50;

  const byDate = new Map<string, { target: NutritionTarget; logs: NutritionLog[] }>();
  for (const t of targets) byDate.set(t.date, { target: t, logs: [] });
  for (const l of logs) {
    const slot = byDate.get(l.date);
    if (slot) slot.logs.push(l);
  }

  let proteinHits = 0;
  let kcalHits = 0;
  let counted = 0;
  for (const { target, logs: dayLogs } of byDate.values()) {
    if (dayLogs.length === 0) continue;
    counted++;
    const totalProtein = dayLogs.reduce((s, l) => s + (l.proteinG ?? 0), 0);
    const totalKcal = dayLogs.reduce((s, l) => s + (l.kcal ?? 0), 0);
    if (totalProtein >= target.proteinG * 0.9) proteinHits++;
    if (Math.abs(totalKcal - target.kcal) <= target.kcal * 0.15) kcalHits++;
  }
  if (counted === 0) return 50;
  const proteinPct = (proteinHits / counted) * 100;
  const kcalPct = (kcalHits / counted) * 100;
  return scoreNutrition({
    proteinAdherence7d: proteinPct,
    kcalBandAdherence7d: kcalPct,
  });
}

function isoDaysAgo(n: number, base?: string): string {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Suppress unused-import warnings — re-exported for the engine entrypoint.
export type { ReadinessRecord, TrainingSession, MobilitySession, WearableMetric };
