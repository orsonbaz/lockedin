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

export type Discipline = 'POWERLIFTING' | 'STREET_LIFT' | 'CALISTHENICS' | 'HYBRID';

/** How today's session will actually be run — governs the abbreviation logic. */
export type SessionModality =
  | 'FULL'             // standard generated session, full budget
  | 'ABBREVIATED'      // trimmed to fit a minute budget
  | 'BODYWEIGHT_ONLY'  // no barbell available (travel, home)
  | 'TRAVEL';          // abbreviated + bodyweight hints

export type MemoryKind =
  | 'INJURY'
  | 'PREFERENCE'
  | 'LIFE_EVENT'
  | 'PAST_ADVICE'
  | 'GOAL'
  | 'CONSTRAINT';

export type ScheduleOverrideKind =
  | 'UNAVAILABLE'
  | 'TIME_BOX'
  | 'EQUIPMENT_ONLY'
  | 'LOCATION';

export type DietPhase = 'CUT' | 'MAINTAIN' | 'BULK' | 'RECOMP';

export type BmrFormula = 'MIFFLIN_ST_JEOR' | 'KATCH_MCARDLE';

export type NutritionMealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

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
  // Multi-discipline (v4+): what the athlete actually trains
  disciplines?: Discipline[];    // defaults to ['POWERLIFTING'] on read
  primaryDiscipline?: Discipline;
  /** Default day-of-week availability (0=Sun…6=Sat → minutes). Undefined ⇒ unlimited. */
  weeklyScheduleTemplate?: Record<number, number | undefined>;
  calisthenicsGoals?: string[];  // free-text: 'muscle_up', 'front_lever', etc.
}

// ── Long-term coach memory (v4) ──────────────────────────────────────────────

export interface AthleteMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];               // multi-valued index; lowercase
  importance: number;           // 1-5
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;           // ISO date; null/undefined = permanent
  sourceMessageId?: string;     // chat message that produced this memory
}

export interface ConversationSummary {
  id: string;
  periodStart: string;          // ISO date of earliest message summarized
  periodEnd: string;            // ISO date of latest message summarized
  messageCount: number;         // how many messages rolled into this summary
  summary: string;
  topics: string[];
  createdAt: string;
}

export interface ScheduleOverride {
  id: string;
  date: string;                 // YYYY-MM-DD
  kind: ScheduleOverrideKind;
  minutesAvailable?: number;    // for TIME_BOX
  allowedEquipment?: string[];  // for EQUIPMENT_ONLY (e.g. ['BODYWEIGHT','BANDS'])
  location?: string;            // for LOCATION (free-text)
  note?: string;
  createdAt: string;
}

// ── Nutrition (v5) ───────────────────────────────────────────────────────────

export interface NutritionProfile {
  id: 'me';                     // singleton
  dietPhase: DietPhase;
  bmrFormula: BmrFormula;
  activityFactor: number;       // 1.2–1.9 (sedentary → very active)
  bodyFatPercent?: number;      // needed for KATCH_MCARDLE
  trainingDayKcal: number;
  restDayKcal: number;
  refeedDayKcal: number;
  proteinGPerKg: number;
  fatGPerKg: number;
  carbGPerKg: number;
  refeedFrequencyDays: number;  // 0 disables refeeds
  lastRefeedDate?: string;      // YYYY-MM-DD
  updatedAt: string;
}

export interface NutritionLog {
  id: string;
  date: string;                 // YYYY-MM-DD
  mealType: NutritionMealType;
  description?: string;
  kcal?: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  loggedAt: string;
}

export interface NutritionTarget {
  id: string;                   // one per date
  date: string;                 // YYYY-MM-DD
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  isTrainingDay: boolean;
  isRefeed: boolean;
  note?: string;
  resolvedAt: string;
}

// ── Video form check (v6) ────────────────────────────────────────────────────

/** High-level verdict from a vision model's analysis of lift keyframes. */
export type FormVerdict = 'GOOD' | 'MINOR_FIXES' | 'MAJOR_FIXES' | 'UNSAFE' | 'UNCLEAR';

export interface FormCheck {
  id: string;
  /** Date of capture, YYYY-MM-DD. */
  date: string;
  /** Session + exercise are optional — users can form-check outside a session. */
  sessionId?: string;
  exerciseId?: string;
  /** Lift label used to prompt the vision model. */
  lift: Lift;
  /** Athlete-supplied context, e.g. "final set, 180kg, felt grindy". */
  note?: string;
  verdict: FormVerdict;
  /** Short coaching bullets from the model. */
  cues: string[];
  /** Red flags surfaced by the safety prompt. */
  safetyFlags: string[];
  /** Raw model score 0–100 for quick sorting of history. */
  score?: number;
  /** Which model produced the analysis. */
  model: string;
  /** ISO 8601 timestamp. */
  analyzedAt: string;
}

export interface FormCheckKeyframe {
  id: string;
  formCheckId: string;
  /** 0-based index within the keyframe sequence. */
  index: number;
  /** Relative position in the clip (0–1) — used to order and caption frames. */
  timestamp: number;
  /** data: URI for the jpeg. Small (~40KB) so storing inline keeps things simple. */
  dataUri: string;
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
  // Phase 2 (optional, additive — no index change)
  discipline?: Discipline;
  estimatedMinutes?: number;     // budgeted time for the session
  modality?: SessionModality;    // how the athlete will actually run it
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
  // Exercise library integration (optional for backward compat)
  /** Stable library exercise id, e.g. 'competition_squat'. */
  libraryExerciseId?: string;
  /** For weighted calisthenics: kg added on top of bodyweight. estimatedLoadKg stores this value. */
  addedLoadKg?: number;
  /** Whether the athlete is wearing a belt for this exercise. */
  usingBelt?: boolean;
  /** Whether the athlete is wearing knee sleeves for this exercise. */
  usingKneeSleeves?: boolean;
  /** Whether the athlete is wearing wrist wraps for this exercise. */
  usingWristWraps?: boolean;
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

export interface BodyweightEntry {
  id: string;
  date: string;             // YYYY-MM-DD
  weightKg: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}
