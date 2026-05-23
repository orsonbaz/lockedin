import { db, newId, today } from './database';
import type { AthleteProfile, TrainingArc } from './types';

/**
 * Inserts a default AthleteProfile + initial "Get Healthy" arc + a
 * HEALTH_BASE → ACCUMULATION starter cycle when the DB is empty.
 *
 * v8 defaults: trainingGoal is LONGEVITY (was COMPETITION_PREP in v7),
 * the seed cycle leads with HEALTH_BASE blocks, and the active arc is
 * "Get Healthy" with INJURY_HEALING + MOBILITY priorities. Athletes
 * who want a competition focus start a new arc from /settings/arcs/new
 * — see the COMPETITION-priority gate in /meet/layout.tsx.
 *
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

    // v8: default goal is longevity. Athletes who want a comp peak
    // start a "Back to Powerlifting" arc which flips this implicitly.
    trainingGoal: 'LONGEVITY',

    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.profile.put(profile);

  // v8: seed the initial training arc. The v8 upgrade callback handles
  // this for users migrating from v7; the seed path covers fresh installs.
  const arc: TrainingArc = {
    id: newId(),
    name: 'Get Healthy',
    intent:
      'Rebuild durable joint health and mobility while keeping baseline strength. ' +
      'Lean on weighted calisthenics and joint-friendly variations.',
    status: 'ACTIVE',
    startDate: today(),
    primaryGoal: 'LONGEVITY',
    priorities: ['INJURY_HEALING', 'MOBILITY', 'STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL'],
    deprioritized: ['COMPETITION'],
    constraints: [],
    coachDirective:
      'Prioritize my long-term joint health over peak performance. ' +
      'Treat barbell and weighted-calisthenics strength as co-equal expressions. ' +
      'When in doubt, choose the joint-friendly variation.',
    createdAt: now,
    updatedAt: now,
  };
  await db.trainingArcs.put(arc);

  // Seed an active training cycle. v8 default leads with HEALTH_BASE
  // (full ROM + tempo) before accumulation — sustainable strength foundation.
  const cycleId = newId();
  await db.cycles.put({
    id: cycleId,
    name: '12-Week Foundation',
    startDate: today(),
    totalWeeks: 12,
    currentWeek: 1,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  });

  const blockIds = [newId(), newId(), newId()];
  await db.blocks.bulkPut([
    {
      id: blockIds[0],
      cycleId,
      blockType: 'HEALTH_BASE',
      weekStart: 1,
      weekEnd: 4,
      volumeTarget: 0.85,
      intensityTarget: 0.70,
    },
    {
      id: blockIds[1],
      cycleId,
      blockType: 'ACCUMULATION',
      weekStart: 5,
      weekEnd: 9,
      volumeTarget: 1.1,
      intensityTarget: 0.75,
    },
    {
      id: blockIds[2],
      cycleId,
      blockType: 'HEALTH_BASE',
      weekStart: 10,
      weekEnd: 12,
      volumeTarget: 0.85,
      intensityTarget: 0.70,
    },
  ]);

  // Seed today's session so the athlete can hit "Start Session" immediately
  const sessionId = newId();
  await db.sessions.put({
    id: sessionId,
    blockId: blockIds[0],
    cycleId,
    scheduledDate: today(),
    sessionType: 'TECHNICAL',
    primaryLift: 'SQUAT',
    status: 'SCHEDULED',
    coachNote: 'Week 1, Health Base — full ROM, tempo, RPE 7. No grinders.',
  });

  // Exercises will be generated from the user's actual maxes after onboarding completes
  // via the generateSession() call in the onboarding submit handler.
  // No readiness record is seeded — the user should complete their first check-in
  // via the /checkin page, which gates access to /home.
}
