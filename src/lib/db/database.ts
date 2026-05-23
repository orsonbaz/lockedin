import Dexie, { type Table, type Transaction } from 'dexie';
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
  TrainingArc,
  ArcTransition,
  ArcConstraint,
  ArcPriority,
  Injury,
  InjurySeverity,
  SymptomLog,
  RehabProtocol,
  MobilityMovement,
  MobilityRoutine,
  MobilitySession,
  MobilityRomEntry,
  LongevitySnapshot,
  BodyRegion,
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
  // v8: longevity-first redesign
  trainingArcs!: Table<TrainingArc>;
  arcTransitions!: Table<ArcTransition>;
  injuries!: Table<Injury>;
  symptomLogs!: Table<SymptomLog>;
  rehabProtocols!: Table<RehabProtocol>;
  mobilityMovements!: Table<MobilityMovement>;
  mobilityRoutines!: Table<MobilityRoutine>;
  mobilitySessions!: Table<MobilitySession>;
  mobilityRomEntries!: Table<MobilityRomEntry>;
  longevitySnapshots!: Table<LongevitySnapshot>;

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

    // v8: longevity-first redesign — Training Arcs, Injuries, Mobility,
    // Longevity score. The upgrade callback backfills an initial "Get Healthy"
    // arc and migrates legacy INJURY-kind AthleteMemory rows into Injury
    // records so the gating logic in swap.ts can read structured data.
    this.version(8).stores({
      // Active arc lookup is the hot path — indexed on status. startDate lets us
      // sort arc history chronologically without a full scan.
      trainingArcs:       'id, status, startDate, createdAt',
      arcTransitions:     'id, fromArcId, toArcId, createdAt',
      // *regions lets us answer "any open injury affecting LEFT_KNEE?" cheaply.
      // *contraindicatedSwapGroups powers the swap-engine hard filter.
      injuries:           'id, status, *regions, *contraindicatedSwapGroups, updatedAt',
      symptomLogs:        'id, injuryId, date, [injuryId+date]',
      rehabProtocols:     'id, injuryId',
      // Mobility movements are mostly read from a static library, but custom
      // user-authored ones get persisted here.
      mobilityMovements:  'id, category, *regions, isCustom',
      mobilityRoutines:   'id, source, archivedAt, createdAt',
      mobilitySessions:   'id, routineId, date, [date+routineId]',
      mobilityRomEntries: 'id, date, movementId, region, [movementId+date]',
      longevitySnapshots: 'id, date',
    }).upgrade(async (tx) => {
      await upgradeToV8(tx);
    });
  }
}

/**
 * v8 upgrade — runs once per database when stepping from v7 → v8.
 *
 * Backfill behavior:
 * 1. Default `AthleteProfile.trainingGoal` to 'LONGEVITY' when unset.
 * 2. Migrate `AthleteMemory` rows of kind 'INJURY' into stub `Injury` records
 *    so the swap engine can read structured data going forward. The memory
 *    rows are kept (no data loss); they just stop being the source of truth
 *    for gating decisions.
 * 3. Auto-create the initial 'Get Healthy' `TrainingArc` so the rest of the
 *    app can assume an active arc always exists.
 */
async function upgradeToV8(tx: Transaction): Promise<void> {
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);

  const profileTable = tx.table<AthleteProfile>('profile');
  const memoryTable = tx.table<AthleteMemory>('athleteMemory');
  const injuryTable = tx.table<Injury>('injuries');
  const arcTable = tx.table<TrainingArc>('trainingArcs');

  // 1. Default trainingGoal → LONGEVITY for any profile that doesn't have one.
  const profiles = await profileTable.toArray();
  for (const profile of profiles) {
    if (!profile.trainingGoal) {
      await profileTable.update(profile.id, { trainingGoal: 'LONGEVITY' });
    }
  }

  // 2. Backfill Injury rows from legacy memory.
  const injuryMemories = await memoryTable.where('kind').equals('INJURY').toArray();
  for (const memory of injuryMemories) {
    const id = (globalThis.crypto?.randomUUID?.() ?? `inj_${memory.id}`);
    const regions = guessRegionsFromText(memory.content);
    await injuryTable.add({
      id,
      label: memory.content.slice(0, 120),
      regions,
      status: 'MANAGING',
      severity: Math.min(Math.max(memory.importance, 1), 5) as InjurySeverity,
      onsetDate: memory.createdAt.slice(0, 10),
      contraindicatedPatterns: [],
      contraindicatedSwapGroups: [],
      preferredPatterns: [],
      constraints: [],
      notes: `Migrated from athleteMemory ${memory.id}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  // 3. Auto-create the initial 'Get Healthy' arc if none exists yet.
  const existingArcs = await arcTable.count();
  if (existingArcs === 0) {
    const hasOpenInjuries = (await injuryTable.count()) > 0;
    const priorities: ArcPriority[] = [
      'INJURY_HEALING',
      'MOBILITY',
      'STRENGTH_CALISTHENICS',
      'STRENGTH_BARBELL',
    ];
    const constraints: ArcConstraint[] = hasOpenInjuries ? ['POST_INJURY'] : [];
    await arcTable.add({
      id: globalThis.crypto?.randomUUID?.() ?? `arc_${Date.now()}`,
      name: 'Get Healthy',
      intent:
        'Rebuild durable joint health and mobility while keeping baseline strength. ' +
        'Lean on weighted calisthenics and joint-friendly variations; avoid max-effort barbell work.',
      status: 'ACTIVE',
      startDate: todayStr,
      primaryGoal: 'LONGEVITY',
      priorities,
      deprioritized: ['COMPETITION'],
      constraints,
      coachDirective:
        'Prioritize my long-term joint health over peak performance. ' +
        'Treat barbell and weighted-calisthenics strength as co-equal expressions. ' +
        'When in doubt, choose the joint-friendly variation.',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
}

/**
 * Cheap heuristic — scan an injury-memory body for region keywords. We bias
 * toward over-tagging (better to flag too many regions than to miss the
 * affected joint and let the swap engine prescribe something risky).
 *
 * Exported for testability; not part of the public DB API.
 */
export function guessRegionsFromText(text: string): BodyRegion[] {
  const lower = text.toLowerCase();
  const regions: BodyRegion[] = [];
  const probes: Array<[RegExp, BodyRegion]> = [
    [/\b(neck|cervical)\b/, 'CERVICAL_SPINE'],
    [/\b(t[- ]?spine|thoracic|mid[- ]?back|upper back)\b/, 'T_SPINE'],
    [/\b(l[- ]?spine|lumbar|low back|lower back)\b/, 'L_SPINE'],
    [/\b(si joint|sacroiliac)\b/, 'SI_JOINT'],
    [/\b(left shoulder|l shoulder)\b/, 'LEFT_SHOULDER'],
    [/\b(right shoulder|r shoulder)\b/, 'RIGHT_SHOULDER'],
    [/\bshoulder\b/, 'LEFT_SHOULDER'],
    [/\b(left elbow)\b/, 'LEFT_ELBOW'],
    [/\b(right elbow)\b/, 'RIGHT_ELBOW'],
    [/\belbow\b/, 'LEFT_ELBOW'],
    [/\b(left wrist)\b/, 'LEFT_WRIST'],
    [/\b(right wrist)\b/, 'RIGHT_WRIST'],
    [/\bwrist\b/, 'LEFT_WRIST'],
    [/\b(left hip)\b/, 'LEFT_HIP'],
    [/\b(right hip)\b/, 'RIGHT_HIP'],
    [/\bhip\b/, 'LEFT_HIP'],
    [/\b(left knee)\b/, 'LEFT_KNEE'],
    [/\b(right knee)\b/, 'RIGHT_KNEE'],
    [/\bknee\b/, 'LEFT_KNEE'],
    [/\b(left ankle)\b/, 'LEFT_ANKLE'],
    [/\b(right ankle)\b/, 'RIGHT_ANKLE'],
    [/\bankle\b/, 'LEFT_ANKLE'],
    [/\b(core|abs|abdominal)\b/, 'CORE'],
    [/\b(pelvic floor)\b/, 'PELVIC_FLOOR'],
  ];
  for (const [pattern, region] of probes) {
    if (pattern.test(lower) && !regions.includes(region)) regions.push(region);
  }
  return regions.length > 0 ? regions : ['OTHER'];
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
  // v8 (backup v7): longevity-first redesign
  'trainingArcs', 'arcTransitions',
  'injuries', 'symptomLogs', 'rehabProtocols',
  'mobilityMovements', 'mobilityRoutines', 'mobilitySessions', 'mobilityRomEntries',
  'longevitySnapshots',
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface BackupPayload {
  /**
   * Backup format version. Bumped each time we add tables to the export
   * surface. Note: this is the backup format version, not the Dexie schema
   * version (which is one ahead — Dexie v2 added bodyweight without a
   * corresponding backup-format bump).
   *
   * v1 = original;
   * v2 = equipmentProfile + customExercises;
   * v3 = memory + schedule;
   * v4 = nutrition;
   * v5 = form checks;
   * v6 = wearables;
   * v7 = training arcs + injuries + mobility + longevity (Dexie v8).
   */
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  exportedAt: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

/** Serialises every Dexie table into a single JSON-safe object. */
export async function exportAll(): Promise<BackupPayload> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const name of TABLE_NAMES) {
    tables[name] = await (db[name] as Table<unknown>).toArray();
  }
  return { version: 7, exportedAt: new Date().toISOString(), tables };
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
  if (payload.version < 1 || payload.version > 7) {
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
