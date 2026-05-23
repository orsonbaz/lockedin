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
 */
export const ARC_PRESETS: ArcPreset[] = [
  {
    key: 'get_healthy',
    name: 'Get Healthy',
    intent: 'Rebuild durable joint health and mobility while keeping baseline strength.',
    primaryGoal: 'LONGEVITY',
    priorities: ['INJURY_HEALING', 'MOBILITY', 'STRENGTH_CALISTHENICS', 'STRENGTH_BARBELL'],
    deprioritized: ['COMPETITION'],
    constraints: ['POST_INJURY'],
    coachDirective:
      'Prioritize joint health over peak performance. ' +
      'Treat barbell and weighted-calisthenics strength as co-equal expressions. ' +
      'When in doubt, choose the joint-friendly variation.',
  },
  {
    key: 'get_strong',
    name: 'Get Strong Again',
    intent: 'Rebuild a sustainable strength base across both barbell and weighted-calisthenics tracks.',
    primaryGoal: 'STRENGTH_PROGRESSION',
    priorities: ['STRENGTH_BARBELL', 'STRENGTH_CALISTHENICS', 'MOBILITY'],
    deprioritized: ['COMPETITION'],
    constraints: [],
    coachDirective:
      'Push intensity but stay clear of grinders. Track Comfortable Heavy Singles, not true 1RMs. ' +
      'Run 2-3 strength sessions per week with one full-ROM accessory day.',
  },
  {
    key: 'back_to_powerlifting',
    name: 'Back to Powerlifting',
    intent: 'Peak for a powerlifting or street-lift meet.',
    primaryGoal: 'COMPETITION_PREP',
    priorities: ['COMPETITION', 'STRENGTH_BARBELL', 'MOBILITY'],
    deprioritized: ['CONDITIONING', 'BODY_COMP'],
    constraints: [],
    coachDirective:
      'Specificity wins — bias SBD comp lifts. Use intelligent attempt selection. ' +
      'Stay healthy through the peak; pull back at the first sign of a flare-up.',
  },
  {
    key: 'new_dad',
    name: 'New Dad / No Time',
    intent: 'Hold the line on strength and movement with whatever minutes are available.',
    primaryGoal: 'MAINTENANCE',
    priorities: ['TIME_EFFICIENT', 'STRENGTH_CALISTHENICS', 'MOBILITY', 'STRESS_REDUCTION'],
    deprioritized: ['COMPETITION', 'BODY_COMP'],
    constraints: ['LIMITED_TIME', 'HIGH_LIFE_STRESS', 'SLEEP_DEPRIVED'],
    weeklyTimeBudgetMin: 120,
    coachDirective:
      'Sessions cap at 30 minutes. Compound lifts only, full-body splits. ' +
      'Cardio counts as steps and play with the kid — not formal zone 2.',
  },
  {
    key: 'travel_heavy',
    name: 'Traveling Heavy',
    intent: 'Stay in shape with hotel gyms and bodyweight.',
    primaryGoal: 'GENERAL_FITNESS',
    priorities: ['STRENGTH_CALISTHENICS', 'CONDITIONING', 'MOBILITY'],
    deprioritized: ['STRENGTH_BARBELL', 'COMPETITION'],
    constraints: ['TRAVELING_FREQUENTLY', 'EQUIPMENT_LIMITED'],
    weeklyTimeBudgetMin: 180,
    coachDirective:
      'Default to bodyweight + dumbbell circuits. If a barbell is available, ' +
      'one heavy day per trip is enough — quality over quantity.',
  },
  {
    key: 'mobility_rebuild',
    name: 'Mobility Rebuild',
    intent: 'Restore range of motion after a sedentary period or post-injury.',
    primaryGoal: 'MOBILITY_REBUILD',
    priorities: ['MOBILITY', 'INJURY_HEALING', 'STRENGTH_CALISTHENICS'],
    deprioritized: ['COMPETITION', 'STRENGTH_BARBELL'],
    constraints: ['POST_INJURY'],
    coachDirective:
      'Daily mobility flow is non-negotiable. Strength work is light, full-ROM, tempo-biased. ' +
      'No max effort. ROM markers tracked weekly.',
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
