import { db, newId, today } from './database';
import type { AthleteProfile } from './types';

/**
 * Inserts a default AthleteProfile when the DB is empty.
 * Safe to call on every app load — exits immediately if data already exists.
 */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.profile.count();
  if (count > 0) return;

  const now = new Date().toISOString();

  const profile: AthleteProfile = {
    id: 'me',
    name: 'Athlete',
    weightKg: 82,
    targetWeightClass: 83,
    heightCm: 175,
    sex: 'MALE',
    federation: 'IPF',
    equipment: 'RAW',
    weighIn: 'TWO_HOUR',
    trainingAgeMonths: 24,

    // Intermediate competition maxes (kg)
    maxSquat: 180,
    maxBench: 120,
    maxDeadlift: 210,

    // Gym PRs — slightly higher to reflect neural gap
    gymSquat: 185,
    gymBench: 122.5,
    gymDeadlift: 215,

    // AI diagnostics
    bottleneck: 'BALANCED',
    rewardSystem: 'CONSISTENCY',
    responder: 'STANDARD',
    overshooter: false,
    timeToPeakWeeks: 3,

    // Preferences
    weeklyFrequency: 4,
    peakDayOfWeek: 6,  // Saturday
    unitSystem: 'KG',

    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.profile.put(profile);

  // Seed an active training cycle (no meet attached — user adds their own)
  const cycleId = newId();
  await db.cycles.put({
    id: cycleId,
    name: '12-Week Meet Prep',
    startDate: today(),
    totalWeeks: 12,
    currentWeek: 1,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  });

  // Seed three blocks: Accumulation → Intensification → Realization
  const blockIds = [newId(), newId(), newId()];
  await db.blocks.bulkPut([
    {
      id: blockIds[0],
      cycleId,
      blockType: 'ACCUMULATION',
      weekStart: 1,
      weekEnd: 4,
      volumeTarget: 1.1,
      intensityTarget: 0.72,
    },
    {
      id: blockIds[1],
      cycleId,
      blockType: 'INTENSIFICATION',
      weekStart: 5,
      weekEnd: 9,
      volumeTarget: 0.9,
      intensityTarget: 0.82,
    },
    {
      id: blockIds[2],
      cycleId,
      blockType: 'REALIZATION',
      weekStart: 10,
      weekEnd: 12,
      volumeTarget: 0.65,
      intensityTarget: 0.92,
    },
  ]);

  // Seed today's session so the athlete can hit "Start Session" immediately
  const sessionId = newId();
  await db.sessions.put({
    id: sessionId,
    blockId: blockIds[0],
    cycleId,
    scheduledDate: today(),
    sessionType: 'ACCUMULATION',
    primaryLift: 'SQUAT',
    status: 'SCHEDULED',
    coachNote: 'Week 1 — focus on bar path and bracing. Keep RPE honest.',
  });

  // Exercises will be generated from the user's actual maxes after onboarding completes
  // via the generateSession() call in the onboarding submit handler.

  // Seed a readiness record for today
  await db.readiness.put({
    id: newId(),
    date: today(),
    sleepHours: 7.5,
    sleepQuality: 4,
    energy: 4,
    motivation: 4,
    soreness: 2,
    stress: 2,
    readinessScore: 78,
    createdAt: new Date().toISOString(),
  });
}
