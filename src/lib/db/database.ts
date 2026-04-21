import Dexie, { type Table } from 'dexie';
import type {
  AthleteProfile,
  BlockType,
  TrainingCycle,
  TrainingBlock,
  TrainingSession,
  SessionExercise,
  SetLog,
  ReadinessRecord,
  Meet,
  MeetAttempt,
  BodyweightEntry,
  ChatMessage,
  AthleteMemory,
  ConversationSummary,
  ScheduleOverride,
  NutritionProfile,
  NutritionLog,
  NutritionTarget,
  FormCheck,
  FormCheckKeyframe,
  WearableImport,
  WearableMetric,
} from './types';
import type { UserEquipmentProfile, CustomExercise } from '@/lib/exercises/types';

export class LockedinDB extends Dexie {
  profile!: Table<AthleteProfile>;
  cycles!: Table<TrainingCycle>;
  blocks!: Table<TrainingBlock>;
  sessions!: Table<TrainingSession>;
  exercises!: Table<SessionExercise>;
  sets!: Table<SetLog>;
  readiness!: Table<ReadinessRecord>;
  meets!: Table<Meet>;
  attempts!: Table<MeetAttempt>;
  bodyweight!: Table<BodyweightEntry>;
  chat!: Table<ChatMessage>;
  equipmentProfile!: Table<UserEquipmentProfile>;
  customExercises!: Table<CustomExercise>;
  athleteMemory!: Table<AthleteMemory>;
  conversationSummaries!: Table<ConversationSummary>;
  scheduleOverrides!: Table<ScheduleOverride>;
  nutritionProfile!: Table<NutritionProfile>;
  nutritionLogs!: Table<NutritionLog>;
  nutritionTargets!: Table<NutritionTarget>;
  formChecks!: Table<FormCheck>;
  formCheckKeyframes!: Table<FormCheckKeyframe>;
  wearableImports!: Table<WearableImport>;
  wearableMetrics!: Table<WearableMetric>;

  constructor() {
    super('LockedinDB');

    // v1: original schema
    this.version(1).stores({
      profile:   'id',
      cycles:    'id, status',
      blocks:    'id, cycleId',
      sessions:  'id, blockId, cycleId, scheduledDate, status',
      exercises: 'id, sessionId',
      sets:      'id, exerciseId, sessionId',
      readiness: 'id, date',
      meets:     'id, cycleId, status',
      attempts:  'id, meetId',
      chat:      'id, createdAt',
    });

    // v2: add bodyweight table
    this.version(2).stores({
      bodyweight: 'id, date',
    });

    // v3: add equipment profile + custom exercise tables
    this.version(3).stores({
      // Singleton record (id = 'me') for the athlete's gym gear
      equipmentProfile: 'id',
      // User-authored exercises; multi-valued index on swapGroups for efficient lookup
      customExercises:  'id, movementPattern, *swapGroups',
    });

    // v4: long-term coach memory + schedule overrides
    this.version(4).stores({
      // Structured athlete facts surfaced into the AI prompt. *tags is a multi-valued
      // index so we can filter memories by tag efficiently during retrieval.
      athleteMemory:         'id, kind, createdAt, importance, *tags',
      // Rolling conversation summaries — replaces the hard "last 10 messages" window.
      conversationSummaries: 'id, periodEnd, createdAt',
      // Per-date schedule constraints (unavailable days, time boxes, equipment limits).
      scheduleOverrides:     'id, date, [date+kind]',
    });

    // v5: nutrition — singleton profile + daily logs + resolved targets.
    this.version(5).stores({
      nutritionProfile: 'id',
      nutritionLogs:    'id, date, mealType',
      nutritionTargets: 'id, date',
    });

    // v6: form checks — Groq vision output + keyframe thumbnails.
    this.version(6).stores({
      formChecks:         'id, date, sessionId, exerciseId, lift',
      formCheckKeyframes: 'id, formCheckId, [formCheckId+index]',
    });

    // v7: wearable imports — per-day metrics normalized across providers.
    this.version(7).stores({
      wearableImports: 'id, source, importedAt, fileHash',
      wearableMetrics: 'id, date, metricKind, importId, [date+metricKind]',
    });
  }
}

export const db = new LockedinDB();

/** Returns today's date as YYYY-MM-DD in local time. */
export const today = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Generates a cryptographically random UUID v4 (collision-proof). */
export const newId = (): string => crypto.randomUUID();

// ── Cycle Week Advancement ──────────────────────────────────────────────────

export interface AdvanceCycleResult {
  advanced: boolean;
  newWeek: number;
  completed: boolean;
  newBlockType?: BlockType;
}

/**
 * Advance the cycle's `currentWeek` when we've passed the calendar boundary
 * for the current week. Called after completing a session.
 *
 * Logic:
 * 1. If `currentWeek >= totalWeeks`, mark cycle COMPLETED.
 * 2. Determine week boundary: `startDate + (currentWeek) * 7 days`.
 *    If today is on or past that boundary, bump `currentWeek`.
 * 3. After bumping, check if the new week falls in a different block.
 *    Return the block type for a UI toast if it changed.
 */
export async function advanceCycleWeek(
  cycleId: string,
): Promise<AdvanceCycleResult> {
  const cycle = await db.cycles.get(cycleId);
  if (!cycle || cycle.status !== 'ACTIVE') {
    return { advanced: false, newWeek: cycle?.currentWeek ?? 0, completed: false };
  }

  // Already at or past total weeks → mark completed
  if (cycle.currentWeek >= cycle.totalWeeks) {
    await db.cycles.update(cycleId, { status: 'COMPLETED' });
    return { advanced: false, newWeek: cycle.currentWeek, completed: true };
  }

  // Determine when the NEXT week starts
  const startMs = new Date(cycle.startDate).getTime();
  const nextWeekBoundary = startMs + cycle.currentWeek * 7 * 24 * 60 * 60 * 1000;
  const todayMs = new Date(today()).getTime();

  if (todayMs < nextWeekBoundary) {
    // Still within the current week
    return { advanced: false, newWeek: cycle.currentWeek, completed: false };
  }

  const newWeek = cycle.currentWeek + 1;

  // If the new week exceeds total, mark completed
  if (newWeek > cycle.totalWeeks) {
    await db.cycles.update(cycleId, { status: 'COMPLETED', currentWeek: newWeek });
    return { advanced: true, newWeek, completed: true };
  }

  await db.cycles.update(cycleId, { currentWeek: newWeek });

  // Check for block transition
  const blocks = await db.blocks
    .where('cycleId')
    .equals(cycleId)
    .toArray();

  // Find the block containing the old week and the new week
  const oldBlock = blocks.find(
    (b) => cycle.currentWeek >= b.weekStart && cycle.currentWeek <= b.weekEnd,
  );
  const newBlock = blocks.find(
    (b) => newWeek >= b.weekStart && newWeek <= b.weekEnd,
  );

  const newBlockType =
    newBlock && (!oldBlock || oldBlock.id !== newBlock.id)
      ? newBlock.blockType
      : undefined;

  return { advanced: true, newWeek, completed: false, newBlockType };
}

// ── Export / Import helpers ──────────────────────────────────────────────────

const TABLE_NAMES = [
  'profile', 'cycles', 'blocks', 'sessions', 'exercises',
  'sets', 'readiness', 'meets', 'attempts', 'bodyweight', 'chat',
  'equipmentProfile', 'customExercises',
  'athleteMemory', 'conversationSummaries', 'scheduleOverrides',
  'nutritionProfile', 'nutritionLogs', 'nutritionTargets',
  'formChecks', 'formCheckKeyframes',
  'wearableImports', 'wearableMetrics',
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface BackupPayload {
  /** v1 = original; v2 = equipmentProfile + customExercises; v3 = memory + schedule; v4 = nutrition; v5 = form checks; v6 = wearables */
  version: 1 | 2 | 3 | 4 | 5 | 6;
  exportedAt: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

/** Serialises every Dexie table into a single JSON-safe object. */
export async function exportAll(): Promise<BackupPayload> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const name of TABLE_NAMES) {
    tables[name] = await (db[name] as Table<unknown>).toArray();
  }
  return { version: 6, exportedAt: new Date().toISOString(), tables };
}

/**
 * Imports a previously exported backup, **replacing** all current data.
 * Wraps the write in a single transaction so it's all-or-nothing.
 * Gracefully skips tables that don't exist in older backup versions.
 * Returns the record counts per table.
 */
export async function importAll(
  payload: BackupPayload,
): Promise<Record<string, number>> {
  if (payload.version < 1 || payload.version > 6) {
    throw new Error(`Unsupported backup version: ${payload.version}`);
  }

  const counts: Record<string, number> = {};

  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db[n] as Table<unknown>),
    async () => {
      for (const name of TABLE_NAMES) {
        const table = db[name] as Table<unknown>;
        await table.clear();
        // Gracefully handle v1 backups that lack newer tables.
        const rows = (payload.tables as Record<string, unknown[]>)[name] ?? [];
        if (rows.length > 0) await table.bulkPut(rows);
        counts[name] = rows.length;
      }
    },
  );

  return counts;
}
