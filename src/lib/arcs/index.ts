/**
 * Training Arc helpers — single source of truth for arc reads + writes.
 *
 * An arc is the athlete-authored, persistent training context that wraps
 * goals, priorities, constraints, and coach guidance. One arc is ACTIVE at
 * a time; switching arcs writes an ArcTransition snapshot so prior-arc
 * context survives in long-term coach memory.
 *
 * Engine + coach call these helpers; pages mutate via the higher-level
 * action wrappers (createArc / activateArc / endArc / updateArc).
 */

import { db, today, newId } from '@/lib/db/database';
import { invalidateCache } from '@/lib/ai/coach-cache';
import type {
  TrainingArc,
  ArcTransition,
  ArcPriority,
  ArcConstraint,
  ArcStatus,
  TrainingGoal,
} from '@/lib/db/types';

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Returns the currently-active arc, or null if none. There should be at most
 * one ACTIVE arc at a time; if multiple are accidentally active we return the
 * most recently created so the UI degrades gracefully.
 */
export async function getActiveArc(): Promise<TrainingArc | null> {
  const active = await db.trainingArcs.where('status').equals('ACTIVE').toArray();
  if (active.length === 0) return null;
  active.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return active[0];
}

/** All arcs, newest first. Used by the arc list page. */
export async function listArcs(): Promise<TrainingArc[]> {
  const rows = await db.trainingArcs.toArray();
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

export async function getArc(id: string): Promise<TrainingArc | undefined> {
  return db.trainingArcs.get(id);
}

export async function listTransitions(): Promise<ArcTransition[]> {
  const rows = await db.arcTransitions.toArray();
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

/** How many days the athlete has been in this arc (inclusive of today). */
export function arcDayCount(arc: TrainingArc, todayStr: string = today()): number {
  const start = Date.parse(arc.startDate);
  const end = Date.parse(arc.endDate ?? todayStr);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateArcInput {
  name: string;
  intent: string;
  primaryGoal: TrainingGoal;
  priorities: ArcPriority[];
  deprioritized?: ArcPriority[];
  constraints?: ArcConstraint[];
  weeklyTimeBudgetMin?: number;
  coachDirective: string;
  successMarkers?: string[];
  /** If true, end the current ACTIVE arc and start this one immediately. */
  activate?: boolean;
  /** Optional reason for the transition (only used when `activate=true`). */
  transitionReason?: string;
}

/**
 * Create a new arc. When `activate=true`, ends the currently-active arc and
 * writes an ArcTransition so the coach can reference it as prior context.
 */
export async function createArc(input: CreateArcInput): Promise<TrainingArc> {
  const nowIso = new Date().toISOString();
  const todayStr = today();
  const arc: TrainingArc = {
    id: newId(),
    name: input.name.trim(),
    intent: input.intent.trim(),
    status: input.activate ? 'ACTIVE' : 'PLANNED',
    startDate: todayStr,
    primaryGoal: input.primaryGoal,
    priorities: input.priorities,
    deprioritized: input.deprioritized ?? [],
    constraints: input.constraints ?? [],
    weeklyTimeBudgetMin: input.weeklyTimeBudgetMin,
    coachDirective: input.coachDirective.trim(),
    successMarkers: input.successMarkers,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (input.activate) {
    const previous = await getActiveArc();
    if (previous) {
      await endArcInternal(previous.id, input.transitionReason);
      await writeTransition(previous.id, arc.id, input.transitionReason);
    } else {
      // First-ever arc — still record the transition for symmetry.
      await writeTransition(undefined, arc.id, input.transitionReason ?? 'First arc');
    }
  }

  await db.trainingArcs.add(arc);
  if (arc.status === 'ACTIVE') await invalidateCache();
  return arc;
}

/** Partial update. Bumps `updatedAt`. Status changes go through dedicated helpers. */
export async function updateArc(
  id: string,
  patch: Partial<Omit<TrainingArc, 'id' | 'createdAt' | 'updatedAt' | 'status'>>,
): Promise<void> {
  await db.trainingArcs.update(id, { ...patch, updatedAt: new Date().toISOString() });
  const arc = await db.trainingArcs.get(id);
  if (arc?.status === 'ACTIVE') await invalidateCache();
}

/**
 * Switch the active arc. Ends the current one (status=COMPLETED unless caller
 * specifies otherwise), then activates the target arc and writes a transition.
 */
export async function activateArc(id: string, reason?: string): Promise<void> {
  const target = await db.trainingArcs.get(id);
  if (!target) throw new Error(`Arc ${id} not found`);
  if (target.status === 'ACTIVE') return; // no-op

  const previous = await getActiveArc();
  if (previous && previous.id !== id) {
    await endArcInternal(previous.id, reason);
    await writeTransition(previous.id, id, reason);
  } else if (!previous) {
    await writeTransition(undefined, id, reason ?? 'Activated');
  }

  await db.trainingArcs.update(id, {
    status: 'ACTIVE',
    startDate: today(),  // reset start when (re)activating so day-count is meaningful
    endDate: undefined,
    updatedAt: new Date().toISOString(),
  });
  await invalidateCache();
}

export async function endArc(id: string, reason?: string): Promise<void> {
  await endArcInternal(id, reason);
}

export async function pauseArc(id: string): Promise<void> {
  await setArcStatus(id, 'PAUSED');
}

export async function resumeArc(id: string): Promise<void> {
  // Resuming a paused arc puts it back to ACTIVE — but only if no other arc
  // is currently active. Otherwise the caller should `activateArc(id)` which
  // handles the transition.
  const other = await getActiveArc();
  if (other && other.id !== id) {
    await activateArc(id, 'Resumed');
    return;
  }
  await setArcStatus(id, 'ACTIVE');
}

export async function reorderPriorities(id: string, priorities: ArcPriority[]): Promise<void> {
  await updateArc(id, { priorities });
}

// ── Internals ────────────────────────────────────────────────────────────────

async function endArcInternal(id: string, _reason?: string): Promise<void> {
  await db.trainingArcs.update(id, {
    status: 'COMPLETED',
    endDate: today(),
    updatedAt: new Date().toISOString(),
  });
  await invalidateCache();
}

async function setArcStatus(id: string, status: ArcStatus): Promise<void> {
  await db.trainingArcs.update(id, {
    status,
    updatedAt: new Date().toISOString(),
  });
  await invalidateCache();
}

async function writeTransition(
  fromArcId: string | undefined,
  toArcId: string,
  reason: string | undefined,
): Promise<void> {
  const transition: ArcTransition = {
    id: newId(),
    fromArcId,
    toArcId,
    reason: reason?.trim() || undefined,
    // summary is filled in later by the coach action; on raw arc switches via
    // the UI it stays undefined until the next coach turn rolls it up.
    summary: undefined,
    createdAt: new Date().toISOString(),
  };
  await db.arcTransitions.add(transition);
}

// ── Presets ──────────────────────────────────────────────────────────────────

/**
 * The unifying training philosophy. Prepended to every arc directive by
 * `buildArcSection()` so the coach always operates from the same thesis,
 * weighted differently per arc rather than re-stated each time.
 *
 * Strong + Big come from heavy compounds (RPE 7–9) and modern hypertrophy
 * (SFR, lengthened-bias, proximity-to-failure, MEV→MRV). Mobile comes from
 * FRC (daily CARs, PAILs/RAILs for the active-ROM gap) plus Knees-Over-Toes
 * end-range loading. Durable comes from polarized cardio (zone 2 + 1× VO2max),
 * tendon isometrics, and power preservation. The four legs reinforce; they
 * never compete.
 */
export const TRAINING_PHILOSOPHY = `
TRAINING PHILOSOPHY: Get strong and big while being as mobile and durable as possible — on focused sessions, for decades.
- Strong + Big come from heavy compounds and modern hypertrophy (SFR exercise pick, lengthened-bias, proximity-to-failure 0–3 RIR, MEV→MRV volume landmarks, cluster sets for time-efficient strength).
- Mobile comes from FRC: daily CARs as a floor, PAILs/RAILs for any joint with an active/passive ROM gap, plus Knees-Over-Toes loaded end-range work.
- Durable comes from polarized cardio (zone 2 + 1× VO2max session), heavy tendon isometrics, and power preservation (jumps/throws past age 30).
- Stimulus per minute > stimulus per session. No long workouts as a side-effect.
- FRC does NOT prescribe hypertrophy rep schemes or 1RM programming; modern hypertrophy methods do NOT replace heavy strength work. Use the right tool per leg.
`.trim();

export interface ArcPreset {
  key: string;
  name: string;
  intent: string;
  primaryGoal: TrainingGoal;
  priorities: ArcPriority[];
  deprioritized: ArcPriority[];
  constraints: ArcConstraint[];
  weeklyTimeBudgetMin?: number;
  coachDirective: string;
}

/**
 * Curated starting points for the most common training seasons. The new-arc
 * page seeds these into the form; athletes are expected to edit before saving.
 *
 * Each `coachDirective` weights the unifying TRAINING_PHILOSOPHY for that
 * season — it does NOT restate the philosophy. The coach prepends the philosophy
 * once per turn via `buildArcSection()`.
 */
export const ARC_PRESETS: ArcPreset[] = [
  {
    key: 'get_healthy',
    name: 'Get Healthy',
    intent: 'Rebuild durable joint health and mobility on a strong, mobile chassis — without losing size.',
    primaryGoal: 'LONGEVITY',
    priorities: ['INJURY_HEALING', 'MOBILITY', 'STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL'],
    deprioritized: ['COMPETITION'],
    constraints: ['POST_INJURY'],
    coachDirective:
      'Build sustainable strength and size on a mobile chassis. Daily CARs are the floor. ' +
      'PAILs/RAILs for any joint with a >15° active/passive gap. ATG split squat + Nordics ' +
      'build durable knees. Lengthened-bias accessories (DB RDL, deep ROM lunges) over ' +
      'standard variants. Hypertrophy work in the 8–15 rep range. Polarized cardio: zone 2 ' +
      'most of the week, one VO2max session.',
  },
  {
    key: 'get_strong',
    name: 'Get Strong Again',
    intent: 'Rebuild a sustainable strength base — strong, big, and mobile in parallel.',
    primaryGoal: 'STRENGTH_PROGRESSION',
    priorities: ['STRENGTH_BARBELL', 'STRENGTH_CALISTHENICS', 'MOBILITY'],
    deprioritized: ['COMPETITION'],
    constraints: [],
    coachDirective:
      'Hypertrophy is co-equal with top-set strength. Lengthened-bias accessories, 1–3 hard sets ' +
      'close to failure (0–3 RIR). Cluster sets and rest-pause for heavy work so sessions stay ' +
      'under an hour. Track Comfortable Heavy Singles, not true 1RMs. Daily CARs on training-day ' +
      'joints. One VO2max session per week through the build.',
  },
  {
    key: 'back_to_powerlifting',
    name: 'Back to Powerlifting',
    intent: 'Peak for a powerlifting or street-lift meet without losing mobility or durability.',
    primaryGoal: 'COMPETITION_PREP',
    priorities: ['COMPETITION', 'STRENGTH_BARBELL', 'MOBILITY'],
    deprioritized: ['CONDITIONING', 'BODY_COMP'],
    constraints: [],
    coachDirective:
      'Specificity wins — bias SBD comp lifts. Linear macrocycle (accumulation → intensification ' +
      '→ realization). Use intelligent attempt selection. Pre-load CARs for the day\'s primary ' +
      'joint stay in even during peak — they\'re a readiness check, not a workout. One VO2max ' +
      'session per week through accumulation; drop it during peak. Pull back at the first sign ' +
      'of a flare-up.',
  },
  {
    key: 'new_dad',
    name: 'New Dad / No Time',
    intent: 'Hold the line on strength, size, and movement with whatever minutes are available.',
    primaryGoal: 'MAINTENANCE',
    priorities: ['TIME_EFFICIENT', 'STRENGTH_CALISTHENICS', 'MOBILITY', 'STRESS_REDUCTION'],
    deprioritized: ['COMPETITION', 'BODY_COMP'],
    constraints: ['LIMITED_TIME', 'HIGH_LIFE_STRESS', 'SLEEP_DEPRIVED'],
    weeklyTimeBudgetMin: 120,
    coachDirective:
      'Morning CARs (5 min) are the non-negotiable, even when training doesn\'t happen. Sessions ' +
      'cap at 30 minutes — cluster sets and rest-pause for strength density, 1–2 hard sets ' +
      'close to failure for hypertrophy. Compound lifts only, full-body splits. Cardio counts as ' +
      'steps and play with the kid — formal zone 2 is a nice-to-have, not a must.',
  },
  {
    key: 'travel_heavy',
    name: 'Traveling Heavy',
    intent: 'Stay strong, big, and mobile from hotel gyms and bodyweight.',
    primaryGoal: 'GENERAL_FITNESS',
    priorities: ['STRENGTH_CALISTHENICS', 'CONDITIONING', 'MOBILITY'],
    deprioritized: ['STRENGTH_BARBELL', 'COMPETITION'],
    constraints: ['TRAVELING_FREQUENTLY', 'EQUIPMENT_LIMITED'],
    weeklyTimeBudgetMin: 180,
    coachDirective:
      'CARs travel for free — daily floor regardless of training. Default to bodyweight + ' +
      'dumbbell circuits with lengthened-bias picks (DB RDL, deficit pushup, deep-ROM lunges). ' +
      'Norwegian 4×4 on a hotel treadmill counts as a full session. If a barbell is available, ' +
      'one heavy day per trip is enough — quality over quantity.',
  },
  {
    key: 'mobility_rebuild',
    name: 'Mobility Rebuild',
    intent: 'Restore range of motion after a sedentary period or post-injury — close the active-ROM gap.',
    primaryGoal: 'MOBILITY_REBUILD',
    priorities: ['MOBILITY', 'INJURY_HEALING', 'STRENGTH_CALISTHENICS'],
    deprioritized: ['COMPETITION', 'STRENGTH_BARBELL'],
    constraints: ['POST_INJURY'],
    coachDirective:
      'Close the active-ROM gap — that\'s the metric. Daily CARs are non-negotiable. PAILs/RAILs ' +
      'on any joint with a >15° passive-vs-active gap. Knees-Over-Toes progressions (ATG split ' +
      'squat, backwards sled, tibialis raises, Nordics) where appropriate. Strength work is tempo ' +
      'loaded full-ROM patterning, not a 1RM rebuild. ROM markers tracked weekly.',
  },
];

// ── Label helpers (UI) ───────────────────────────────────────────────────────

export const ARC_PRIORITY_LABELS: Record<ArcPriority, string> = {
  INJURY_HEALING:        'Injury healing',
  MOBILITY:              'Mobility',
  STRENGTH_BARBELL:      'Barbell strength',
  STRENGTH_CALISTHENICS: 'Calisthenics strength',
  CONDITIONING:          'Conditioning',
  BODY_COMP:             'Body composition',
  SKILL:                 'Skill (muscle-up, etc.)',
  COMPETITION:           'Competition / meet prep',
  MAINTENANCE:           'Maintenance',
  TIME_EFFICIENT:        'Time efficiency',
  STRESS_REDUCTION:      'Stress reduction',
};

export const ARC_CONSTRAINT_LABELS: Record<ArcConstraint, string> = {
  LIMITED_TIME:         'Limited time',
  TRAVELING_FREQUENTLY: 'Traveling frequently',
  NO_GYM:               'No gym access',
  HOME_ONLY:            'Home gym only',
  POST_INJURY:          'Post-injury',
  HIGH_LIFE_STRESS:     'High life stress',
  SLEEP_DEPRIVED:       'Sleep deprived',
  EQUIPMENT_LIMITED:    'Equipment limited',
};

export const ARC_STATUS_LABELS: Record<ArcStatus, string> = {
  PLANNED:   'Planned',
  ACTIVE:    'Active',
  PAUSED:    'Paused',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
};
