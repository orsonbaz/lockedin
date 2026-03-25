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
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface BackupPayload {
  version: 1;
  exportedAt: string;
  tables: Record<TableName, unknown[]>;
}

/** Serialises every Dexie table into a single JSON-safe object. */
export async function exportAll(): Promise<BackupPayload> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const name of TABLE_NAMES) {
    tables[name] = await (db[name] as Table<unknown>).toArray();
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

/**
 * Imports a previously exported backup, **replacing** all current data.
 * Wraps the write in a single transaction so it's all-or-nothing.
 * Returns the record counts per table.
 */
export async function importAll(
  payload: BackupPayload,
): Promise<Record<string, number>> {
  if (payload.version !== 1) {
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
        const rows = payload.tables[name] ?? [];
        if (rows.length > 0) await table.bulkPut(rows);
        counts[name] = rows.length;
      }
    },
  );

  return counts;
}
