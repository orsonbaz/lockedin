/**
 * coach-actions.ts — Executable actions the AI coach can trigger.
 *
 * The LLM outputs structured action tags in its response. The UI parses these
 * and presents confirmation cards to the user. On confirm, the action executes
 * against the database.
 *
 * Action format in LLM output:
 *   [ACTION:action_type|param1=value1|param2=value2]
 *
 * Supported actions:
 *   - UPDATE_MAX:       Update a competition max
 *   - SWAP_EXERCISE:    Replace an exercise in today's session
 *   - MODIFY_SESSION:   Adjust today's session (RPE, volume, skip exercises)
 *   - SKIP_SESSION:     Mark today's session as skipped (rest day)
 *   - ADD_EXERCISE:     Add an exercise to today's session
 *   - REMOVE_EXERCISE:  Remove an exercise from today's session
 *   - UPDATE_REPS:      Change rep scheme for an exercise in today's session
 *   - SET_RPE_TARGET:   Override RPE target for an exercise
 */

import { db, today, newId } from '@/lib/db/database';
import { prescribeLoad, roundLoad } from '@/lib/engine/calc';
import { EXERCISE_BY_ID, EXERCISE_LIBRARY } from '@/lib/exercises/index';
import type { SessionExercise } from '@/lib/db/types';

// ── Action Types ──────────────────────────────────────────────────────────────

export type CoachActionType =
  | 'UPDATE_MAX'
  | 'SWAP_EXERCISE'
  | 'MODIFY_SESSION'
  | 'SKIP_SESSION'
  | 'ADD_EXERCISE'
  | 'REMOVE_EXERCISE'
  | 'UPDATE_REPS'
  | 'SET_RPE_TARGET';

export interface CoachAction {
  type: CoachActionType;
  params: Record<string, string>;
  displayText: string;       // Human-readable description
  confirmText: string;       // Button label
}

export interface ActionResult {
  success: boolean;
  message: string;
}

// ── Action Parser ─────────────────────────────────────────────────────────────

const ACTION_REGEX = /\[ACTION:(\w+)(?:\|([^\]]+))?\]/g;

/**
 * Parse action tags from an LLM response string.
 * Returns the cleaned text (actions removed) and the parsed actions.
 */
export function parseActions(text: string): {
  cleanText: string;
  actions: CoachAction[];
} {
  const actions: CoachAction[] = [];
  const cleanText = text.replace(ACTION_REGEX, (match, type: string, paramStr?: string) => {
    const params: Record<string, string> = {};
    if (paramStr) {
      for (const pair of paramStr.split('|')) {
        const [key, ...valueParts] = pair.split('=');
        if (key) params[key.trim()] = valueParts.join('=').trim();
      }
    }

    const action = buildAction(type as CoachActionType, params);
    if (action) actions.push(action);
    return ''; // Remove action tag from display text
  });

  return { cleanText: cleanText.trim(), actions };
}

function buildAction(type: CoachActionType, params: Record<string, string>): CoachAction | null {
  switch (type) {
    case 'UPDATE_MAX': {
      const lift = params.lift?.toUpperCase();
      const value = params.value;
      if (!lift || !value) return null;
      const liftName = lift === 'SQUAT' ? 'squat' : lift === 'BENCH' ? 'bench' : 'deadlift';
      return {
        type,
        params,
        displayText: `Update ${liftName} max to ${value} kg`,
        confirmText: `Update ${liftName} max`,
      };
    }

    case 'SWAP_EXERCISE': {
      const from = params.from;
      const to = params.to;
      if (!from || !to) return null;
      return {
        type,
        params,
        displayText: `Swap "${from}" → "${to}"`,
        confirmText: 'Swap exercise',
      };
    }

    case 'MODIFY_SESSION': {
      const mod = params.modification || 'Adjust session';
      return {
        type,
        params,
        displayText: mod,
        confirmText: 'Apply changes',
      };
    }

    case 'SKIP_SESSION':
      return {
        type,
        params,
        displayText: 'Skip today\'s session (mark as rest day)',
        confirmText: 'Skip session',
      };

    case 'ADD_EXERCISE': {
      const name = params.name;
      const sets = params.sets || '3';
      const reps = params.reps || '8';
      if (!name) return null;
      return {
        type,
        params,
        displayText: `Add ${name} (${sets}×${reps})`,
        confirmText: 'Add exercise',
      };
    }

    case 'REMOVE_EXERCISE': {
      const name = params.name;
      if (!name) return null;
      return {
        type,
        params,
        displayText: `Remove "${name}" from session`,
        confirmText: 'Remove exercise',
      };
    }

    case 'UPDATE_REPS': {
      const name = params.name;
      const sets = params.sets;
      const reps = params.reps;
      if (!name) return null;
      return {
        type,
        params,
        displayText: `Change ${name} to ${sets || '?'}×${reps || '?'}`,
        confirmText: 'Update reps',
      };
    }

    case 'SET_RPE_TARGET': {
      const name = params.name;
      const rpe = params.rpe;
      if (!name || !rpe) return null;
      return {
        type,
        params,
        displayText: `Set RPE target for ${name} to ${rpe}`,
        confirmText: 'Update RPE',
      };
    }

    default:
      return null;
  }
}

// ── Action Executors ──────────────────────────────────────────────────────────

export async function executeAction(action: CoachAction): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'UPDATE_MAX':
        return await executeUpdateMax(action.params);
      case 'SWAP_EXERCISE':
        return await executeSwapExercise(action.params);
      case 'MODIFY_SESSION':
        return await executeModifySession(action.params);
      case 'SKIP_SESSION':
        return await executeSkipSession();
      case 'ADD_EXERCISE':
        return await executeAddExercise(action.params);
      case 'REMOVE_EXERCISE':
        return await executeRemoveExercise(action.params);
      case 'UPDATE_REPS':
        return await executeUpdateReps(action.params);
      case 'SET_RPE_TARGET':
        return await executeSetRpeTarget(action.params);
      default:
        return { success: false, message: 'Unknown action type.' };
    }
  } catch (err) {
    console.error('[coach-actions] execute failed:', err);
    return { success: false, message: 'Action failed. Please try again.' };
  }
}

// ── Individual Executors ──────────────────────────────────────────────────────

async function executeUpdateMax(params: Record<string, string>): Promise<ActionResult> {
  const lift = params.lift?.toUpperCase();
  const value = parseFloat(params.value || '0');

  if (!['SQUAT', 'BENCH', 'DEADLIFT'].includes(lift || '')) {
    return { success: false, message: 'Invalid lift. Must be squat, bench, or deadlift.' };
  }
  if (isNaN(value) || value <= 0 || value > 500) {
    return { success: false, message: 'Invalid max value.' };
  }

  const key = `max${lift!.charAt(0) + lift!.slice(1).toLowerCase()}` as 'maxSquat' | 'maxBench' | 'maxDeadlift';
  const rounded = roundLoad(value);

  await db.profile.update('me', {
    [key]: rounded,
    [`gym${lift!.charAt(0) + lift!.slice(1).toLowerCase()}`]: rounded,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, message: `${lift!.toLowerCase()} max updated to ${rounded} kg.` };
}

async function executeSwapExercise(params: Record<string, string>): Promise<ActionResult> {
  const fromName = params.from?.toLowerCase();
  const toName = params.to?.toLowerCase();
  if (!fromName || !toName) {
    return { success: false, message: 'Missing exercise names.' };
  }

  // Find today's session
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  // Find the exercise to swap
  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const fromEx = exercises.find((e) => e.name.toLowerCase().includes(fromName));
  if (!fromEx) {
    return { success: false, message: `Could not find "${params.from}" in today's session.` };
  }

  // Find the target exercise in library
  const toLib = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase().includes(toName));
  const newName = toLib?.name || params.to;
  const newLibId = toLib?.id;

  // Estimate load for new exercise
  const profile = await db.profile.get('me');
  let newLoad = fromEx.estimatedLoadKg;
  if (toLib && profile) {
    // Try to estimate a reasonable load for the new exercise
    const liftMax = fromEx.exerciseType === 'COMPETITION'
      ? getMaxForLift(profile, session.primaryLift)
      : fromEx.estimatedLoadKg;
    if (liftMax > 0) {
      newLoad = roundLoad(prescribeLoad(liftMax, fromEx.rpeTarget, fromEx.reps));
    }
  }

  await db.exercises.update(fromEx.id, {
    name: newName,
    libraryExerciseId: newLibId,
    estimatedLoadKg: newLoad,
  });

  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return { success: true, message: `Swapped "${fromEx.name}" → "${newName}".` };
}

async function executeModifySession(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const rpeOffset = parseFloat(params.rpe_offset || '0');
  const volumeMult = parseFloat(params.volume_mult || '1');

  for (const ex of exercises) {
    const updates: Partial<SessionExercise> = {};

    if (rpeOffset !== 0) {
      updates.rpeTarget = Math.max(5, Math.min(10, ex.rpeTarget + rpeOffset));
    }

    if (volumeMult !== 1 && volumeMult > 0) {
      updates.sets = Math.max(1, Math.round(ex.sets * volumeMult));
    }

    if (Object.keys(updates).length > 0) {
      // Recalculate load if RPE changed
      if (updates.rpeTarget) {
        const profile = await db.profile.get('me');
        if (profile) {
          const max = getMaxForLift(profile, session.primaryLift);
          if (max > 0 && ex.exerciseType === 'COMPETITION') {
            updates.estimatedLoadKg = roundLoad(
              prescribeLoad(max, updates.rpeTarget, updates.sets ? Math.round(ex.reps) : ex.reps),
            );
          }
        }
      }
      await db.exercises.update(ex.id, updates);
    }
  }

  await db.sessions.update(session.id, {
    status: 'MODIFIED',
    aiModifications: JSON.stringify([params.modification || 'Session modified by AI coach']),
  });

  return { success: true, message: 'Session modified.' };
}

async function executeSkipSession(): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  await db.sessions.update(session.id, { status: 'SKIPPED' });
  return { success: true, message: 'Session skipped. Rest up!' };
}

async function executeAddExercise(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const name = params.name;
  if (!name) return { success: false, message: 'No exercise name specified.' };

  const sets = parseInt(params.sets || '3');
  const reps = parseInt(params.reps || '8');
  const rpe = parseFloat(params.rpe || '7');
  const type = (params.type?.toUpperCase() || 'ACCESSORY') as 'COMPETITION' | 'VARIATION' | 'ACCESSORY';

  // Find in library
  const libEx = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase().includes(name.toLowerCase()));

  // Estimate load
  const profile = await db.profile.get('me');
  let load = 0;
  if (profile) {
    const max = getMaxForLift(profile, session.primaryLift);
    load = roundLoad(prescribeLoad(max * 0.6, rpe, reps)); // Conservative for accessories
  }
  if (params.load) load = roundLoad(parseFloat(params.load));

  const existing = await db.exercises.where('sessionId').equals(session.id).toArray();
  const maxOrder = existing.reduce((max, e) => Math.max(max, e.order), 0);

  const exercise: SessionExercise = {
    id: newId(),
    sessionId: session.id,
    name: libEx?.name || name,
    exerciseType: type,
    setStructure: 'STRAIGHT',
    sets,
    reps,
    rpeTarget: rpe,
    estimatedLoadKg: load,
    order: maxOrder + 1,
    ...(libEx ? { libraryExerciseId: libEx.id } : {}),
  };

  await db.exercises.add(exercise);
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return { success: true, message: `Added ${exercise.name} (${sets}×${reps} @ RPE ${rpe}).` };
}

async function executeRemoveExercise(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const name = params.name?.toLowerCase();
  if (!name) return { success: false, message: 'No exercise name specified.' };

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const target = exercises.find((e) => e.name.toLowerCase().includes(name));
  if (!target) {
    return { success: false, message: `Could not find "${params.name}" in today's session.` };
  }

  // Don't allow removing competition lifts
  if (target.exerciseType === 'COMPETITION') {
    return { success: false, message: 'Cannot remove competition lift from session.' };
  }

  await db.exercises.delete(target.id);
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return { success: true, message: `Removed ${target.name} from session.` };
}

async function executeUpdateReps(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const name = params.name?.toLowerCase();
  if (!name) return { success: false, message: 'No exercise name specified.' };

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const target = exercises.find((e) => e.name.toLowerCase().includes(name));
  if (!target) {
    return { success: false, message: `Could not find "${params.name}" in today's session.` };
  }

  const updates: Partial<SessionExercise> = {};
  if (params.sets) updates.sets = Math.max(1, Math.min(10, parseInt(params.sets)));
  if (params.reps) updates.reps = Math.max(1, Math.min(20, parseInt(params.reps)));

  // Recalculate load for new rep range
  if (updates.reps || updates.sets) {
    const profile = await db.profile.get('me');
    if (profile && target.exerciseType === 'COMPETITION') {
      const max = getMaxForLift(profile, session.primaryLift);
      updates.estimatedLoadKg = roundLoad(
        prescribeLoad(max, target.rpeTarget, updates.reps || target.reps),
      );
    }
  }

  await db.exercises.update(target.id, updates);
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return {
    success: true,
    message: `Updated ${target.name}: ${updates.sets || target.sets}×${updates.reps || target.reps}.`,
  };
}

async function executeSetRpeTarget(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const name = params.name?.toLowerCase();
  const rpe = parseFloat(params.rpe || '0');
  if (!name || rpe < 5 || rpe > 10) {
    return { success: false, message: 'Invalid exercise name or RPE value.' };
  }

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const target = exercises.find((e) => e.name.toLowerCase().includes(name));
  if (!target) {
    return { success: false, message: `Could not find "${params.name}" in today's session.` };
  }

  // Recalculate load for new RPE
  const updates: Partial<SessionExercise> = { rpeTarget: rpe };
  const profile = await db.profile.get('me');
  if (profile && target.exerciseType === 'COMPETITION') {
    const max = getMaxForLift(profile, session.primaryLift);
    updates.estimatedLoadKg = roundLoad(prescribeLoad(max, rpe, target.reps));
  }

  await db.exercises.update(target.id, updates);
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return { success: true, message: `Set RPE target for ${target.name} to ${rpe}.` };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMaxForLift(profile: { maxSquat?: number; maxBench?: number; maxDeadlift?: number }, lift: string): number {
  switch (lift) {
    case 'SQUAT': return profile.maxSquat ?? 0;
    case 'BENCH': return profile.maxBench ?? 0;
    case 'DEADLIFT': return profile.maxDeadlift ?? 0;
    default: return 0;
  }
}
