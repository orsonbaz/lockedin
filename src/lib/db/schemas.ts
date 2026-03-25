/**
 * Zod validation schemas for Dexie writes.
 *
 * These mirror the types in `types.ts` and gate NEW writes.
 * They do NOT retroactively validate existing data.
 */

import { z } from 'zod';

// ── Shared helpers ──────────────────────────────────────────────────────────

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateStr = z.string().regex(isoDateRegex, 'Expected YYYY-MM-DD');
const isoTimestamp = z.string().min(1);
const positiveKg = z.number().min(0).max(600);
const rpe = z.number().min(5).max(10).multipleOf(0.5);

// ── Enum schemas ────────────────────────────────────────────────────────────

export const SexSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const BottleneckSchema = z.enum(['HYPERTROPHY', 'NEURAL', 'BALANCED']);
export const RewardSystemSchema = z.enum(['HIGH_VOLUME', 'HEAVY_SINGLES', 'VARIETY', 'CONSISTENCY']);
export const ResponderSchema = z.enum(['HIGH', 'LOW', 'STANDARD']);
export const FederationSchema = z.enum(['IPF', 'USAPL', 'USPA', 'RPS', 'CPU', 'OTHER']);
export const WeighInSchema = z.enum(['TWO_HOUR', 'TWENTY_FOUR_HOUR']);
export const EquipmentSchema = z.enum(['RAW', 'SINGLE_PLY', 'MULTI_PLY']);
export const BlockTypeSchema = z.enum(['ACCUMULATION', 'INTENSIFICATION', 'REALIZATION', 'DELOAD', 'PIVOT', 'MAINTENANCE']);
export const SessionTypeSchema = z.enum(['ACCUMULATION', 'TECHNICAL', 'BRIDGE', 'PEAK', 'RECOVERY']);
export const LiftSchema = z.enum(['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'LOWER', 'FULL']);
export const ExerciseTypeSchema = z.enum(['COMPETITION', 'VARIATION', 'ACCESSORY']);
export const SetStructureSchema = z.enum(['STRAIGHT', 'ASCENDING', 'DESCENDING']);
export const SessionStatusSchema = z.enum(['SCHEDULED', 'MODIFIED', 'COMPLETED', 'SKIPPED']);
export const AttemptResultSchema = z.enum(['GOOD', 'NO_LIFT', 'BOMBED']);

// ── Entity schemas ──────────────────────────────────────────────────────────

export const AthleteProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  weightKg: z.number().min(30).max(250),
  targetWeightClass: z.number().min(30).max(250),
  heightCm: z.number().min(100).max(250).optional(),
  sex: SexSchema,
  federation: FederationSchema,
  equipment: EquipmentSchema,
  weighIn: WeighInSchema,
  trainingAgeMonths: z.number().int().min(0).max(600),
  maxSquat: positiveKg,
  maxBench: positiveKg,
  maxDeadlift: positiveKg,
  gymSquat: positiveKg.optional(),
  gymBench: positiveKg.optional(),
  gymDeadlift: positiveKg.optional(),
  bottleneck: BottleneckSchema,
  rewardSystem: RewardSystemSchema,
  responder: ResponderSchema,
  overshooter: z.boolean(),
  timeToPeakWeeks: z.number().int().min(1).max(12),
  weeklyFrequency: z.number().int().min(2).max(7),
  peakDayOfWeek: z.number().int().min(0).max(6),
  unitSystem: z.enum(['KG', 'LBS']),
  groqApiKey: z.string().optional(),
  onboardingComplete: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const SetLogSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  sessionId: z.string().min(1),
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).max(100),
  loadKg: z.number().min(0).max(600),
  rpeLogged: rpe.optional(),
  velocityMs: z.number().min(0).optional(),
  loggedAt: isoTimestamp,
});

export const ReadinessRecordSchema = z.object({
  id: z.string().min(1),
  date: dateStr,
  hrv: z.number().min(0).optional(),
  hrvBaseline7d: z.number().min(0).optional(),
  hrvDeviation: z.number().optional(),
  hrvSource: z.enum(['MANUAL', 'APPLE_HEALTH', 'OURA', 'WHOOP', 'POLAR']).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  sleepQuality: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  motivation: z.number().int().min(1).max(5).optional(),
  soreness: z.number().int().min(1).max(5).optional(),
  stress: z.number().int().min(1).max(5).optional(),
  note: z.string().optional(),
  readinessScore: z.number().min(0).max(100),
  createdAt: isoTimestamp,
});

export const MeetSchema = z.object({
  id: z.string().min(1),
  cycleId: z.string().optional(),
  name: z.string().min(1).max(200),
  date: dateStr,
  location: z.string().optional(),
  federation: FederationSchema,
  weightClass: z.number().min(30).max(250),
  weighIn: WeighInSchema,
  status: z.enum(['UPCOMING', 'COMPLETED']),
});

export const MeetAttemptSchema = z.object({
  id: z.string().min(1),
  meetId: z.string().min(1),
  lift: LiftSchema,
  attemptNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  plannedKg: positiveKg,
  actualKg: positiveKg.optional(),
  result: AttemptResultSchema.optional(),
});

// ── Partial schemas for update operations ───────────────────────────────────

/** For Settings page saves — only validate the fields being patched. */
export const ProfilePatchSchema = AthleteProfileSchema.partial().omit({ id: true });
