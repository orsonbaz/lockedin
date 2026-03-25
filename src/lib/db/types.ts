// ── Enums (union literals — no runtime overhead) ──────────────────────────────

export type Sex = 'MALE' | 'FEMALE' | 'OTHER';

export type Bottleneck = 'HYPERTROPHY' | 'NEURAL' | 'BALANCED';

export type RewardSystem = 'HIGH_VOLUME' | 'HEAVY_SINGLES' | 'VARIETY' | 'CONSISTENCY';

export type Responder = 'HIGH' | 'LOW' | 'STANDARD';

export type Federation = 'IPF' | 'USAPL' | 'USPA' | 'RPS' | 'CPU' | 'OTHER';

export type WeighIn = 'TWO_HOUR' | 'TWENTY_FOUR_HOUR';

export type Equipment = 'RAW' | 'SINGLE_PLY' | 'MULTI_PLY';

export type BlockType =
  | 'ACCUMULATION'
  | 'INTENSIFICATION'
  | 'REALIZATION'
  | 'DELOAD'
  | 'PIVOT'
  | 'MAINTENANCE';

export type SessionType =
  | 'ACCUMULATION'
  | 'TECHNICAL'
  | 'BRIDGE'
  | 'PEAK'
  | 'RECOVERY';

export type Lift = 'SQUAT' | 'BENCH' | 'DEADLIFT' | 'UPPER' | 'LOWER' | 'FULL';

export type ExerciseType = 'COMPETITION' | 'VARIATION' | 'ACCESSORY';

export type SetStructure = 'STRAIGHT' | 'ASCENDING' | 'DESCENDING';

export type SessionStatus = 'SCHEDULED' | 'MODIFIED' | 'COMPLETED' | 'SKIPPED';

export type AttemptResult = 'GOOD' | 'NO_LIFT' | 'BOMBED';

export type ChatRole = 'user' | 'assistant' | 'system';

export type HRVSource = 'MANUAL' | 'APPLE_HEALTH' | 'OURA' | 'WHOOP' | 'POLAR';

// ── Core entities ─────────────────────────────────────────────────────────────

export interface AthleteProfile {
  id: string;                    // always 'me' — single-user app
  name: string;
  weightKg: number;
  targetWeightClass: number;
  heightCm?: number;
  sex: Sex;
  federation: Federation;
  equipment: Equipment;
  weighIn: WeighIn;
  trainingAgeMonths: number;
  // Current maxes (kg)
  maxSquat: number;
  maxBench: number;
  maxDeadlift: number;
  // Gym PRs (may differ from meet maxes — used to detect neural gap)
  gymSquat?: number;
  gymBench?: number;
  gymDeadlift?: number;
  // AI diagnostics
  bottleneck: Bottleneck;
  rewardSystem: RewardSystem;
  responder: Responder;
  overshooter: boolean;
  timeToPeakWeeks: number;
  // Preferences
  weeklyFrequency: number;       // sessions per week
  peakDayOfWeek: number;         // 0=Sun … 6=Sat
  unitSystem: 'KG' | 'LBS';
  // Settings
  groqApiKey?: string;           // optional Groq key for online AI
  onboardingComplete: boolean;
  createdAt: string;             // ISO date string
  updatedAt: string;
}

export interface TrainingCycle {
  id: string;
  name: string;
  startDate: string;
  meetId?: string;
  totalWeeks: number;
  currentWeek: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
}

export interface TrainingBlock {
  id: string;
  cycleId: string;
  blockType: BlockType;
  weekStart: number;
  weekEnd: number;
  volumeTarget: number;          // multiplier: 0.6–1.2
  intensityTarget: number;       // target %1RM e.g. 0.78
}

export interface TrainingSession {
  id: string;
  blockId: string;
  cycleId: string;
  scheduledDate: string;         // YYYY-MM-DD
  sessionType: SessionType;
  primaryLift: Lift;
  status: SessionStatus;
  readinessScore?: number;       // 0-100 at time of session
  aiModifications?: string;      // JSON string of changes made
  coachNote?: string;            // shown to athlete
  completedAt?: string;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  name: string;
  exerciseType: ExerciseType;
  setStructure: SetStructure;
  sets: number;
  reps: number;
  rpeTarget: number;
  estimatedLoadKg: number;
  order: number;
  notes?: string;
}

export interface SetLog {
  id: string;
  exerciseId: string;
  sessionId: string;
  setNumber: number;
  reps: number;
  loadKg: number;
  rpeLogged?: number;
  velocityMs?: number;
  loggedAt: string;
}

export interface ReadinessRecord {
  id: string;
  date: string;                  // YYYY-MM-DD
  hrv?: number;                  // RMSSD in ms
  hrvBaseline7d?: number;
  hrvDeviation?: number;         // % from baseline
  hrvSource?: HRVSource;
  sleepHours?: number;
  sleepQuality?: number;         // 1-5
  energy?: number;               // 1-5
  motivation?: number;           // 1-5
  soreness?: number;             // 1-5
  stress?: number;               // 1-5
  note?: string;
  readinessScore: number;        // 0-100 composite
  createdAt: string;
}

export interface Meet {
  id: string;
  cycleId?: string;
  name: string;
  date: string;
  location?: string;
  federation: Federation;
  weightClass: number;
  weighIn: WeighIn;
  status: 'UPCOMING' | 'COMPLETED';
}

export interface MeetAttempt {
  id: string;
  meetId: string;
  lift: Lift;
  attemptNumber: 1 | 2 | 3;
  plannedKg: number;
  actualKg?: number;
  result?: AttemptResult;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}
