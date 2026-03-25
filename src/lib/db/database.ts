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
  chat!: Table<ChatMessage>;

  constructor() {
    super('LockedinDB');
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

/** Generates a collision-resistant client-side ID (no dependency needed). */
export const newId = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
