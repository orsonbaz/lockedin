import Dexie, { type Table } from 'dexie';
import type {
  AthleteProfile,
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

// ── Export / Import helpers ──────────────────────────────────────────────────

const TABLE_NAMES = [
  'profile', 'cycles', 'blocks', 'sessions', 'exercises',
  'sets', 'readiness', 'meets', 'attempts', 'bodyweight', 'chat',
  'equipmentProfile', 'customExercises',
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface BackupPayload {
  /** v1 = original schema; v2 = added equipmentProfile + customExercises */
  version: 1 | 2;
  exportedAt: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

/** Serialises every Dexie table into a single JSON-safe object. */
export async function exportAll(): Promise<BackupPayload> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const name of TABLE_NAMES) {
    tables[name] = await (db[name] as Table<unknown>).toArray();
  }
  return { version: 2, exportedAt: new Date().toISOString(), tables };
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
  if (payload.version !== 1 && payload.version !== 2) {
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
