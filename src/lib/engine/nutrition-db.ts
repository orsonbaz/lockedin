/**
 * nutrition-db.ts — Dexie read/write helpers on top of nutrition.ts.
 *
 * Keeps the pure engine free of I/O. These thin wrappers read the profile
 * + today's context, resolve a target, and optionally persist it so the
 * UI and prompt builder share one source of truth.
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  NutritionProfile,
  NutritionTarget,
  NutritionLog,
  TrainingBlock,
  TrainingCycle,
} from '@/lib/db/types';
import { resolveDailyTarget, type DailyTarget } from './nutrition';

function ageFromProfile(trainingAgeMonths: number): number {
  // Rough fallback when profile lacks DOB: assume the athlete is 25+lifting age.
  return 25 + Math.floor(trainingAgeMonths / 12);
}

async function activeBlockType(cycle: TrainingCycle | undefined): Promise<TrainingBlock['blockType'] | undefined> {
  if (!cycle) return undefined;
  const block = await db.blocks
    .where('cycleId')
    .equals(cycle.id)
    .filter((b) => b.weekStart <= cycle.currentWeek && b.weekEnd >= cycle.currentWeek)
    .first();
  return block?.blockType;
}

/** Resolve today's target without persisting it. Returns null if no profile. */
export async function resolveTodayTarget(date = today()): Promise<DailyTarget | null> {
  const [profile, nutrition] = await Promise.all([
    db.profile.get('me'),
    db.nutritionProfile.get('me'),
  ]);
  if (!profile || !nutrition) return null;

  const [session, cycle] = await Promise.all([
    db.sessions.where('scheduledDate').equals(date).first(),
    db.cycles.filter((c) => c.status === 'ACTIVE').first(),
  ]);
  const isTrainingDay = !!session && session.status !== 'SKIPPED';
  const blockType = await activeBlockType(cycle);

  return resolveDailyTarget({
    date,
    profile: {
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      sex: profile.sex,
      trainingAgeMonths: profile.trainingAgeMonths,
      age: ageFromProfile(profile.trainingAgeMonths),
    },
    nutrition,
    isTrainingDay,
    blockType,
  });
}

/** Resolve + persist. Creates or updates the nutritionTargets row for `date`. */
export async function saveTodayTarget(date = today()): Promise<DailyTarget | null> {
  const target = await resolveTodayTarget(date);
  if (!target) return null;
  const existing = await db.nutritionTargets.where('date').equals(date).first();
  const row: NutritionTarget = {
    id: existing?.id ?? newId(),
    date,
    kcal: target.kcal,
    proteinG: target.proteinG,
    carbG: target.carbG,
    fatG: target.fatG,
    isTrainingDay: target.isTrainingDay,
    isRefeed: target.isRefeed,
    note: target.note,
    resolvedAt: new Date().toISOString(),
  };
  await db.nutritionTargets.put(row);
  return target;
}

/** Sum of kcal/protein/carb/fat logged for a date (ignoring rows with no macros). */
export async function macroTotalsFor(date: string): Promise<{
  kcal: number; proteinG: number; carbG: number; fatG: number; count: number;
}> {
  const logs: NutritionLog[] = await db.nutritionLogs.where('date').equals(date).toArray();
  return logs.reduce(
    (acc, l) => ({
      kcal:     acc.kcal     + (l.kcal ?? 0),
      proteinG: acc.proteinG + (l.proteinG ?? 0),
      carbG:    acc.carbG    + (l.carbG ?? 0),
      fatG:     acc.fatG     + (l.fatG ?? 0),
      count:    acc.count    + 1,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, count: 0 },
  );
}

/** Mark `date` as the most recent refeed. */
export async function recordRefeed(date = today()): Promise<NutritionProfile | null> {
  const existing = await db.nutritionProfile.get('me');
  if (!existing) return null;
  const updated: NutritionProfile = {
    ...existing,
    lastRefeedDate: date,
    updatedAt: new Date().toISOString(),
  };
  await db.nutritionProfile.put(updated);
  return updated;
}

/** Pre-formatted compact string for the coach prompt. Empty when no profile. */
export async function buildNutritionSection(maxChars = 400): Promise<string> {
  const target = await resolveTodayTarget();
  if (!target) return '';
  const parts = [
    `${target.kcal} kcal · P${target.proteinG} / C${target.carbG} / F${target.fatG} g`,
    target.isRefeed ? 'Refeed today (carbs up)' : target.isTrainingDay ? 'Training day' : 'Rest day',
  ];
  const line = parts.join(' · ');
  return line.length <= maxChars ? line : line.slice(0, maxChars - 1) + '…';
}
