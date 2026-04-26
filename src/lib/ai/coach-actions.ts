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
import type { SessionExercise, AthleteProfile } from '@/lib/db/types';
import { addMemory, removeMemory, isValidMemoryKind } from './memory';
import { abbreviateSession, estimateSessionMinutes, type GeneratedExercise } from '@/lib/engine/session';
import { applyWeekTimeBox, mondayOf, addOverride } from '@/lib/engine/schedule';
import { recordRefeed, saveTodayTarget } from '@/lib/engine/nutrition-db';
import type { NutritionMealType, NutritionLog, NutritionProfile } from '@/lib/db/types';

// ── Action Types ──────────────────────────────────────────────────────────────

export type CoachActionType =
  | 'UPDATE_MAX'
  | 'SWAP_EXERCISE'
  | 'MODIFY_SESSION'
  | 'ADJUST_SET_LOAD'
  | 'SKIP_SESSION'
  | 'ADD_EXERCISE'
  | 'REMOVE_EXERCISE'
  | 'UPDATE_REPS'
  | 'SET_RPE_TARGET'
  | 'REMEMBER'
  | 'FORGET'
  | 'ABBREVIATE_TODAY'
  | 'SET_WEEK_AVAILABILITY'
  | 'LOG_NUTRITION'
  | 'SET_NUTRITION_TARGETS'
  | 'SCHEDULE_REFEED'
  | 'REQUEST_FORM_CHECK'
  | 'IMPORT_WEARABLE'
  | 'REGENERATE_SESSION';

export interface CoachAction {
  type: CoachActionType;
  params: Record<string, string>;
  displayText: string;       // Human-readable description
  confirmText: string;       // Button label
}

export interface ActionResult {
  success: boolean;
  message: string;
  /** Optional path the UI should navigate to after executing. */
  navigateTo?: string;
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

    case 'ADJUST_SET_LOAD': {
      const exercise = params.exercise;
      const load     = params.load;
      if (!exercise || !load) return null;
      return {
        type,
        params,
        displayText: `Adjust ${exercise} → ${load} kg for remaining sets`,
        confirmText: 'Update load',
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

    case 'REMEMBER': {
      const kind = (params.kind || '').toUpperCase();
      const content = params.content;
      if (!isValidMemoryKind(kind) || !content) return null;
      return {
        type,
        params: { ...params, kind },
        displayText: `Remember (${kind.toLowerCase()}): ${content}`,
        confirmText: 'Save memory',
      };
    }

    case 'FORGET': {
      const id = params.id;
      if (!id) return null;
      return {
        type,
        params,
        displayText: `Forget memory ${id.slice(0, 8)}…`,
        confirmText: 'Forget',
      };
    }

    case 'ABBREVIATE_TODAY': {
      const minutes = parseInt(params.minutes || '0', 10);
      if (!minutes || minutes < 10 || minutes > 240) return null;
      return {
        type,
        params,
        displayText: `Abbreviate today's session to ${minutes} min`,
        confirmText: 'Abbreviate',
      };
    }

    case 'SET_WEEK_AVAILABILITY': {
      const minutes = parseInt(params.minutes || '0', 10);
      const weekStart = params.week_start || '';
      if (!minutes || minutes < 10 || minutes > 240) return null;
      return {
        type,
        params,
        displayText: `Cap this week to ${minutes} min/day${params.note ? ` · ${params.note}` : ''}`,
        confirmText: 'Apply to week',
      };
    }

    case 'LOG_NUTRITION': {
      const meal = (params.meal || 'SNACK').toUpperCase();
      const kcal = parseInt(params.kcal || '0', 10);
      const protein = parseInt(params.protein || '0', 10);
      if (!kcal && !protein) return null;
      const macros = [
        kcal ? `${kcal} kcal` : '',
        protein ? `${protein}g P` : '',
        params.carbs ? `${params.carbs}g C` : '',
        params.fat ? `${params.fat}g F` : '',
      ].filter(Boolean).join(' · ');
      return {
        type,
        params: { ...params, meal },
        displayText: `Log ${meal.toLowerCase()}: ${macros}`,
        confirmText: 'Log meal',
      };
    }

    case 'SET_NUTRITION_TARGETS': {
      const training = parseInt(params.training_kcal || '0', 10);
      const rest = parseInt(params.rest_kcal || '0', 10);
      if (!training || !rest) return null;
      return {
        type,
        params,
        displayText: `Targets: ${training} kcal training / ${rest} kcal rest`,
        confirmText: 'Update targets',
      };
    }

    case 'SCHEDULE_REFEED': {
      const date = params.date || '';
      if (!date) return null;
      return {
        type,
        params,
        displayText: `Log refeed day: ${date}`,
        confirmText: 'Mark refeed',
      };
    }

    case 'REQUEST_FORM_CHECK': {
      const lift = (params.lift || '').toUpperCase();
      if (!['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'LOWER', 'FULL'].includes(lift)) return null;
      return {
        type,
        params: { ...params, lift },
        displayText: `Record a ${lift.toLowerCase()} set for form check`,
        confirmText: 'Open camera',
      };
    }

    case 'IMPORT_WEARABLE':
      return {
        type,
        params,
        displayText: 'Import wearable data (Apple Health, Oura, Whoop, or CSV)',
        confirmText: 'Open importer',
      };

    case 'REGENERATE_SESSION': {
      const reason = params.reason || 'Rebuild session from current data';
      return {
        type,
        params,
        displayText: `Regenerate today's session — ${reason}`,
        confirmText: 'Regenerate session',
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
      case 'ADJUST_SET_LOAD':
        return await executeAdjustSetLoad(action.params);
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
      case 'REMEMBER':
        return await executeRemember(action.params);
      case 'FORGET':
        return await executeForget(action.params);
      case 'ABBREVIATE_TODAY':
        return await executeAbbreviateToday(action.params);
      case 'SET_WEEK_AVAILABILITY':
        return await executeSetWeekAvailability(action.params);
      case 'LOG_NUTRITION':
        return await executeLogNutrition(action.params);
      case 'SET_NUTRITION_TARGETS':
        return await executeSetNutritionTargets(action.params);
      case 'SCHEDULE_REFEED':
        return await executeScheduleRefeed(action.params);
      case 'REQUEST_FORM_CHECK':
        return executeRequestFormCheck(action.params);
      case 'IMPORT_WEARABLE':
        return {
          success: true,
          message: 'Opening wearable importer…',
          navigateTo: '/settings/wearables',
        };
      case 'REGENERATE_SESSION':
        return await executeRegenerateSession(action.params);
      default:
        return { success: false, message: 'Unknown action type.' };
    }
  } catch (err) {
    console.error('[coach-actions] execute failed:', err);
    return { success: false, message: 'Action failed. Please try again.' };
  }
}

async function executeLogNutrition(params: Record<string, string>): Promise<ActionResult> {
  const mealType = (params.meal || 'SNACK').toUpperCase() as NutritionMealType;
  const log: NutritionLog = {
    id: newId(),
    date: today(),
    mealType,
    description: params.description,
    kcal: params.kcal ? parseInt(params.kcal, 10) : undefined,
    proteinG: params.protein ? parseInt(params.protein, 10) : undefined,
    carbG: params.carbs ? parseInt(params.carbs, 10) : undefined,
    fatG: params.fat ? parseInt(params.fat, 10) : undefined,
    loggedAt: new Date().toISOString(),
  };
  await db.nutritionLogs.add(log);
  return { success: true, message: `Logged ${mealType.toLowerCase()}.` };
}

async function executeSetNutritionTargets(params: Record<string, string>): Promise<ActionResult> {
  const existing = await db.nutritionProfile.get('me');
  const training = parseInt(params.training_kcal || '0', 10);
  const rest = parseInt(params.rest_kcal || '0', 10);
  const refeed = parseInt(params.refeed_kcal || '0', 10);
  if (!training || !rest) {
    return { success: false, message: 'training_kcal and rest_kcal are required.' };
  }
  const next: NutritionProfile = {
    id: 'me',
    dietPhase: (params.phase as NutritionProfile['dietPhase']) ?? existing?.dietPhase ?? 'MAINTAIN',
    bmrFormula: existing?.bmrFormula ?? 'MIFFLIN_ST_JEOR',
    activityFactor: existing?.activityFactor ?? 1.55,
    bodyFatPercent: existing?.bodyFatPercent,
    trainingDayKcal: training,
    restDayKcal: rest,
    refeedDayKcal: refeed || existing?.refeedDayKcal || training + 600,
    proteinGPerKg: existing?.proteinGPerKg ?? 2.0,
    fatGPerKg: existing?.fatGPerKg ?? 0.9,
    carbGPerKg: existing?.carbGPerKg ?? 4.0,
    refeedFrequencyDays: existing?.refeedFrequencyDays ?? 10,
    lastRefeedDate: existing?.lastRefeedDate,
    updatedAt: new Date().toISOString(),
  };
  await db.nutritionProfile.put(next);
  await saveTodayTarget();
  return { success: true, message: 'Nutrition targets updated.' };
}

async function executeScheduleRefeed(params: Record<string, string>): Promise<ActionResult> {
  const date = params.date || today();
  const updated = await recordRefeed(date);
  if (!updated) {
    return { success: false, message: 'Set up nutrition targets first.' };
  }
  await saveTodayTarget();
  return { success: true, message: `Refeed recorded for ${date}.` };
}

function executeRequestFormCheck(params: Record<string, string>): ActionResult {
  const lift = (params.lift || '').toLowerCase();
  const sessionId = params.session_id;
  const exerciseId = params.exercise_id;
  const qs = new URLSearchParams({ lift });
  if (sessionId) qs.set('session_id', sessionId);
  if (exerciseId) qs.set('exercise_id', exerciseId);
  return {
    success: true,
    message: `Opening camera for ${lift} form check…`,
    navigateTo: `/form-check?${qs.toString()}`,
  };
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
  const gymKey = `gym${lift!.charAt(0) + lift!.slice(1).toLowerCase()}` as 'gymSquat' | 'gymBench' | 'gymDeadlift';
  const rounded = roundLoad(value);

  await db.profile.update('me', {
    [key]: rounded,
    [gymKey]: rounded,
    updatedAt: new Date().toISOString(),
  } as Partial<AthleteProfile>);

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

/**
 * Adjusts the prescribed load on a specific exercise in the current session.
 * Used mid-session when the athlete's actual RPE diverges from the target —
 * the coach emits this after computing the corrected load via intra-session.ts.
 * Only updates estimatedLoadKg; sets/reps/RPE stay unchanged so the progression
 * logic for future sessions is unaffected.
 */
async function executeAdjustSetLoad(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const name  = params.exercise?.toLowerCase();
  const load  = parseFloat(params.load ?? '');
  if (!name || isNaN(load) || load <= 0) {
    return { success: false, message: 'Invalid exercise name or load value.' };
  }

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  const target    = exercises.find((e) => e.name.toLowerCase().includes(name));
  if (!target) {
    return { success: false, message: `Could not find "${params.exercise}" in today's session.` };
  }

  const note = params.note ? ` (${params.note})` : '';
  await db.exercises.update(target.id, { estimatedLoadKg: load });
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return {
    success: true,
    message: `Load for ${target.name} updated to ${load} kg for remaining sets${note}.`,
  };
}

async function executeRemember(params: Record<string, string>): Promise<ActionResult> {
  const kind = (params.kind || '').toUpperCase();
  const content = params.content?.trim();
  if (!isValidMemoryKind(kind) || !content) {
    return { success: false, message: 'Invalid memory kind or content.' };
  }
  const tags = (params.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const importance = parseInt(params.importance || '3', 10);

  const memory = await addMemory({ kind, content, tags, importance });
  return { success: true, message: `Saved memory: ${memory.content}` };
}

async function executeForget(params: Record<string, string>): Promise<ActionResult> {
  const id = params.id?.trim();
  if (!id) return { success: false, message: 'Missing memory id.' };
  const removed = await removeMemory(id);
  return removed
    ? { success: true, message: 'Memory removed.' }
    : { success: false, message: 'Memory not found.' };
}

async function executeAbbreviateToday(params: Record<string, string>): Promise<ActionResult> {
  const minutes = parseInt(params.minutes || '0', 10);
  if (!minutes || minutes < 10 || minutes > 240) {
    return { success: false, message: 'Provide a minute budget between 10 and 240.' };
  }

  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) return { success: false, message: 'No active session today.' };

  const exercises = await db.exercises.where('sessionId').equals(session.id).toArray();
  exercises.sort((a, b) => a.order - b.order);

  // Shape DB exercises into the GeneratedSession form abbreviateSession expects.
  const generatedExercises: GeneratedExercise[] = exercises.map((e) => ({
    name: e.name,
    exerciseType: e.exerciseType,
    setStructure: e.setStructure,
    sets: e.sets,
    reps: e.reps,
    rpeTarget: e.rpeTarget,
    estimatedLoadKg: e.estimatedLoadKg,
    order: e.order,
    notes: e.notes,
    libraryExerciseId: e.libraryExerciseId,
  }));

  const before = estimateSessionMinutes(generatedExercises);

  const abbreviated = abbreviateSession(
    {
      sessionType: session.sessionType,
      primaryLift: session.primaryLift,
      exercises: generatedExercises,
      modifications: [],
      coachNote: '',
    },
    { maxMinutes: minutes },
  );

  const after = estimateSessionMinutes(abbreviated.exercises);
  const keptLibIds = new Set(abbreviated.exercises.map((e) => e.libraryExerciseId));
  const keptNames = new Set(abbreviated.exercises.map((e) => e.name));

  // Delete exercises that were cut; update sets on the survivors.
  for (const ex of exercises) {
    const stillIn = ex.libraryExerciseId
      ? keptLibIds.has(ex.libraryExerciseId)
      : keptNames.has(ex.name);
    if (!stillIn) {
      await db.exercises.delete(ex.id);
      continue;
    }
    const match = abbreviated.exercises.find((a) =>
      a.libraryExerciseId === ex.libraryExerciseId && a.name === ex.name,
    );
    if (match && match.sets !== ex.sets) {
      await db.exercises.update(ex.id, { sets: match.sets });
    }
  }

  await db.sessions.update(session.id, {
    status: 'MODIFIED',
    modality: 'ABBREVIATED',
    estimatedMinutes: Math.round(after),
    aiModifications: JSON.stringify(abbreviated.modifications),
  });

  return {
    success: true,
    message: `Abbreviated: ~${Math.round(before)} min → ~${Math.round(after)} min.`,
  };
}

async function executeSetWeekAvailability(params: Record<string, string>): Promise<ActionResult> {
  const minutes = parseInt(params.minutes || '0', 10);
  if (!minutes || minutes < 10 || minutes > 240) {
    return { success: false, message: 'Provide a minute budget between 10 and 240.' };
  }
  const weekStart = params.week_start?.trim() || mondayOf(today());
  const note = params.note?.trim() || undefined;

  // Per-day unavailable list (comma-separated YYYY-MM-DD).
  const offDays = (params.off_days || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  for (const date of offDays) {
    await addOverride({ date, kind: 'UNAVAILABLE', note });
  }

  const created = await applyWeekTimeBox(weekStart, minutes, note);
  return {
    success: true,
    message: `Week of ${weekStart} capped at ${minutes} min/day (${created.length} days).`,
  };
}

async function executeRegenerateSession(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) return { success: false, message: 'No session found for today.' };

  // Reset to SCHEDULED and clear readinessScore so ensureSessionFresh runs
  // fresh, bypassing both the MODIFIED guard and the readiness-in-sync guard.
  await db.sessions.update(session.id, {
    status: 'SCHEDULED',
    readinessScore: undefined as unknown as number,
  });

  const { ensureSessionFresh } = await import('@/lib/engine/ensure-session-fresh');
  const result = await ensureSessionFresh(today());

  if (result.status === 'regenerated') {
    const reason = params.reason ? ` (${params.reason})` : '';
    return {
      success: true,
      message: `Session rebuilt${reason} — ${result.exerciseCount} exercises generated.`,
    };
  }
  return { success: false, message: `Could not regenerate: ${result.reason ?? 'unknown error'}.` };
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
