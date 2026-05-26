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
import { prescribeLoad, roundLoad, quantizeRpe } from '@/lib/engine/calc';
import { EXERCISE_BY_ID, EXERCISE_LIBRARY } from '@/lib/exercises/index';
import type {
  SessionExercise,
  AthleteProfile,
  ArcPriority,
  ArcConstraint,
  TrainingGoal,
  BodyRegion,
  InjuryStatus,
  InjurySeverity,
  InjuryConstraint,
  InjuryMovementPattern,
  PainScale,
  StiffnessScale,
  IrritabilityLevel,
} from '@/lib/db/types';
import { addMemory, removeMemory, isValidMemoryKind, parseExpiry, describeExpiry } from './memory';
import { getMaxForLift, liftAnchorForExercise } from './lift-anchor';
import { abbreviateSession, estimateSessionMinutes, type GeneratedExercise } from '@/lib/engine/session';
import { applyWeekTimeBox, mondayOf, addOverride } from '@/lib/engine/schedule';
import { recordRefeed, saveTodayTarget } from '@/lib/engine/nutrition-db';
import type { NutritionMealType, NutritionLog, NutritionProfile } from '@/lib/db/types';
import {
  getActiveArc,
  createArc,
  updateArc,
  endArc,
  pauseArc,
  resumeArc,
  activateArc,
  ARC_PRIORITY_LABELS,
  ARC_CONSTRAINT_LABELS,
} from '@/lib/arcs';
import { regenerateCycleFromArc } from '@/lib/arcs/cycle-sync';
import {
  createInjury,
  updateInjuryStatus,
  logSymptom,
  BODY_REGION_LABELS,
  INJURY_CONSTRAINT_LABELS,
  INJURY_MOVEMENT_PATTERN_LABELS,
  INJURY_STATUS_LABELS,
} from '@/lib/injuries';
import {
  generateRoutine,
  type MobilityFocus,
} from '@/lib/mobility/routine-generator';
import { listActiveInjuries } from '@/lib/injuries';
import { weakRegions } from '@/lib/mobility/rom-assessment';
import { MOBILITY_BY_ID } from '@/lib/mobility';

// ── Action Types ──────────────────────────────────────────────────────────────

export type CoachActionType =
  | 'UPDATE_MAX'
  | 'SWAP_EXERCISE'
  | 'MODIFY_SESSION'
  | 'ADJUST_SET_LOAD'
  | 'SKIP_SESSION'
  | 'ADD_EXERCISE'
  | 'REMOVE_EXERCISE'
  | 'REORDER_EXERCISES'
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
  | 'REGENERATE_SESSION'
  | 'RESET_TODAY'
  // v8: training arc lifecycle
  | 'START_ARC'
  | 'END_ARC'
  | 'PAUSE_ARC'
  | 'RESUME_ARC'
  | 'UPDATE_ARC'
  // v8: injuries
  | 'ADD_INJURY'
  | 'UPDATE_INJURY_STATUS'
  | 'LOG_SYMPTOM'
  // v8: mobility
  | 'GENERATE_MOBILITY_FLOW'
  | 'START_MOBILITY_FLOW'
  | 'LOG_ROM';

export interface CoachAction {
  type: CoachActionType;
  params: Record<string, string>;
  displayText: string;       // Human-readable description
  confirmText: string;       // Button label
  /**
   * ID of the chat message this action was parsed from. Stamped by
   * `parseActions` when supplied. Currently used by REMEMBER so the resulting
   * memory links back to its originating turn (the settings page renders a
   * "from chat" badge that deep-links into /coach).
   */
  sourceMessageId?: string;
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
export function parseActions(text: string, sourceMessageId?: string): {
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
    if (action) {
      if (sourceMessageId) action.sourceMessageId = sourceMessageId;
      actions.push(action);
    }
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

    case 'REORDER_EXERCISES': {
      const order = params.order;
      if (!order) return null;
      const names = order.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length === 0) return null;
      return {
        type,
        params,
        displayText: `Reorder session: ${names.join(' → ')}`,
        confirmText: 'Reorder',
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
      const expiresAt = parseExpiry(params.expires);
      return {
        type,
        params: { ...params, kind },
        displayText: `Remember (${kind.toLowerCase()}): ${content}  ·  ${describeExpiry(expiresAt)}`,
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

    case 'RESET_TODAY': {
      const reason = params.reason || 'Wipe today and let the athlete redo check-in';
      return {
        type,
        params,
        displayText: `Reset today's session — ${reason}`,
        confirmText: 'Reset today',
      };
    }

    // ── v8: training arc lifecycle ───────────────────────────────────────────

    case 'START_ARC': {
      const name = params.name?.trim();
      const intent = params.intent?.trim();
      const priorities = parseArcPriorities(params.priorities);
      if (!name || !intent || priorities.length === 0) return null;
      const goal = (params.primary_goal || '').toUpperCase();
      const primaryGoal: TrainingGoal = isValidTrainingGoal(goal) ? goal : 'LONGEVITY';
      const summary = priorities
        .slice(0, 2)
        .map((p) => ARC_PRIORITY_LABELS[p] ?? p)
        .join(' · ');
      return {
        type,
        params,
        displayText: `Start "${name}" arc — ${summary}`,
        confirmText: `Start "${name}"`,
      };
    }

    case 'END_ARC': {
      const reason = params.reason?.trim();
      return {
        type,
        params,
        displayText: reason
          ? `End the current arc — ${reason}`
          : 'End the current arc',
        confirmText: 'End arc',
      };
    }

    case 'PAUSE_ARC': {
      const reason = params.reason?.trim();
      return {
        type,
        params,
        displayText: reason ? `Pause the current arc — ${reason}` : 'Pause the current arc',
        confirmText: 'Pause arc',
      };
    }

    case 'RESUME_ARC': {
      const id = params.id?.trim();
      if (!id) return null;
      return {
        type,
        params,
        displayText: `Resume arc ${id.slice(0, 8)}…`,
        confirmText: 'Resume arc',
      };
    }

    case 'UPDATE_ARC': {
      const changes = describeArcPatch(params);
      if (changes.length === 0) return null;
      return {
        type,
        params,
        displayText: `Update active arc: ${changes.join(' · ')}`,
        confirmText: 'Update arc',
      };
    }

    // ── v8: injuries ────────────────────────────────────────────────────────

    case 'ADD_INJURY': {
      const label = params.label?.trim();
      const regions = parseRegions(params.regions);
      if (!label || regions.length === 0) return null;
      const statusRaw = (params.status || 'MANAGING').toUpperCase();
      const status: InjuryStatus = isValidInjuryStatus(statusRaw) ? statusRaw : 'MANAGING';
      const severity = clampSeverity(parseInt(params.severity || '3', 10));
      const constraints = parseInjuryConstraints(params.constraints);
      const contraindicatedPatterns = parseInjuryPatterns(params.contraindicated_patterns);
      const regionLabels = regions.slice(0, 2).map((r) => BODY_REGION_LABELS[r]).join(', ');
      return {
        type,
        params,
        displayText: `Log injury "${label}" — ${regionLabels}${constraints.length > 0 ? ` (${constraints.length} constraint${constraints.length === 1 ? '' : 's'})` : ''} · severity ${severity}, ${INJURY_STATUS_LABELS[status].toLowerCase()}`,
        confirmText: 'Log injury',
        // Pass-through to executor — store cleaned values so the executor
        // doesn't re-parse.
        // We piggyback on `params` since CoachAction.params is the contract.
        // The executor reparses defensively.
        // (No-op: avoid future temptation.)
        ...(contraindicatedPatterns.length > 0 ? {} : {}),
      };
    }

    case 'UPDATE_INJURY_STATUS': {
      const id = params.id?.trim();
      const statusRaw = (params.status || '').toUpperCase();
      if (!id || !isValidInjuryStatus(statusRaw)) return null;
      return {
        type,
        params,
        displayText: `Update injury → ${INJURY_STATUS_LABELS[statusRaw as InjuryStatus]}`,
        confirmText: 'Update status',
      };
    }

    case 'LOG_SYMPTOM': {
      const id = params.injury_id?.trim();
      const painAtRest = parseInt(params.pain_at_rest || '', 10);
      const painUnderLoad = parseInt(params.pain_under_load || '', 10);
      if (!id || !isPainScale(painAtRest) || !isPainScale(painUnderLoad)) return null;
      const stiff = parseInt(params.stiffness || '0', 10);
      const irrRaw = (params.irritability || 'MED').toUpperCase();
      const irr: IrritabilityLevel = irrRaw === 'LOW' || irrRaw === 'HIGH' ? irrRaw : 'MED';
      return {
        type,
        params,
        displayText: `Log symptom: rest ${painAtRest}/10, load ${painUnderLoad}/10, stiff ${stiff}/5, ${irr.toLowerCase()}`,
        confirmText: 'Log symptom',
      };
    }

    // ── v8: mobility ────────────────────────────────────────────────────────

    case 'GENERATE_MOBILITY_FLOW': {
      const focusRaw = (params.focus || 'CUSTOM').toUpperCase();
      const focus: MobilityFocus = isValidMobilityFocus(focusRaw) ? focusRaw : 'CUSTOM';
      const minutes = clampMinutes(parseInt(params.minutes || '10', 10));
      return {
        type,
        params: { ...params, focus, minutes: String(minutes) },
        displayText: `Generate a ${minutes}-min ${focusToLabel(focus)} flow`,
        confirmText: 'Generate flow',
      };
    }

    case 'START_MOBILITY_FLOW': {
      const id = params.routine_id?.trim();
      if (!id) return null;
      return {
        type,
        params,
        displayText: `Start the "${id}" flow`,
        confirmText: 'Start flow',
      };
    }

    case 'LOG_ROM': {
      const movementId = params.movement_id?.trim();
      const rating = parseInt(params.rating || '', 10);
      if (!movementId || isNaN(rating) || rating < 0 || rating > 100) return null;
      const m = MOBILITY_BY_ID.get(movementId);
      return {
        type,
        params,
        displayText: `Log ROM for ${m?.name ?? movementId}: ${rating}/100`,
        confirmText: 'Log ROM',
      };
    }

    default:
      return null;
  }
}

// ── Arc parser helpers ───────────────────────────────────────────────────────

const VALID_PRIORITIES: ReadonlySet<ArcPriority> = new Set(
  Object.keys(ARC_PRIORITY_LABELS) as ArcPriority[],
);
const VALID_CONSTRAINTS: ReadonlySet<ArcConstraint> = new Set(
  Object.keys(ARC_CONSTRAINT_LABELS) as ArcConstraint[],
);
const VALID_TRAINING_GOALS: ReadonlySet<string> = new Set<TrainingGoal>([
  'LONGEVITY',
  'MOBILITY_REBUILD',
  'INJURY_REHAB',
  'COMPETITION_PREP',
  'STRENGTH_PROGRESSION',
  'SKILL_PROGRESSION',
  'WEIGHT_LOSS',
  'WEIGHT_GAIN',
  'GENERAL_FITNESS',
  'MAINTENANCE',
]);

function isValidTrainingGoal(g: string): g is TrainingGoal {
  return VALID_TRAINING_GOALS.has(g);
}

function parseArcPriorities(raw: string | undefined): ArcPriority[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ArcPriority => VALID_PRIORITIES.has(s as ArcPriority));
}

function parseArcConstraints(raw: string | undefined): ArcConstraint[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ArcConstraint => VALID_CONSTRAINTS.has(s as ArcConstraint));
}

// ── Injury / mobility parser helpers ─────────────────────────────────────────

const VALID_REGIONS: ReadonlySet<BodyRegion> = new Set(
  Object.keys(BODY_REGION_LABELS) as BodyRegion[],
);
const VALID_INJURY_CONSTRAINTS: ReadonlySet<InjuryConstraint> = new Set(
  Object.keys(INJURY_CONSTRAINT_LABELS) as InjuryConstraint[],
);
const VALID_INJURY_PATTERNS: ReadonlySet<InjuryMovementPattern> = new Set(
  Object.keys(INJURY_MOVEMENT_PATTERN_LABELS) as InjuryMovementPattern[],
);
const VALID_INJURY_STATUSES = new Set<InjuryStatus>([
  'ACUTE', 'SUBACUTE', 'CHRONIC', 'MANAGING', 'REHAB', 'RESOLVED',
]);

function isValidInjuryStatus(s: string): s is InjuryStatus {
  return VALID_INJURY_STATUSES.has(s as InjuryStatus);
}

function clampSeverity(n: number): InjurySeverity {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 5) return 5;
  return Math.round(n) as InjurySeverity;
}

function parseRegions(raw: string | undefined): BodyRegion[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is BodyRegion => VALID_REGIONS.has(s as BodyRegion));
}

function parseInjuryConstraints(raw: string | undefined): InjuryConstraint[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is InjuryConstraint => VALID_INJURY_CONSTRAINTS.has(s as InjuryConstraint));
}

function parseInjuryPatterns(raw: string | undefined): InjuryMovementPattern[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is InjuryMovementPattern => VALID_INJURY_PATTERNS.has(s as InjuryMovementPattern));
}

function isPainScale(n: number): n is PainScale {
  return Number.isInteger(n) && n >= 0 && n <= 10;
}

const VALID_MOBILITY_FOCUSES = new Set<MobilityFocus>([
  'AM_RESET', 'PM_DECOMPRESS', 'PRE_SQUAT', 'PRE_PRESS', 'PRE_DEADLIFT',
  'DESK_RESET', 'POST_SESSION', 'CUSTOM',
]);

function isValidMobilityFocus(s: string): s is MobilityFocus {
  return VALID_MOBILITY_FOCUSES.has(s as MobilityFocus);
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n) || n < 3) return 5;
  if (n > 60) return 60;
  return Math.round(n);
}

function focusToLabel(f: MobilityFocus): string {
  return f.toLowerCase().replace(/_/g, ' ');
}

/** Human-readable summary of which fields an UPDATE_ARC tag will change. */
function describeArcPatch(params: Record<string, string>): string[] {
  const parts: string[] = [];
  if (params.priorities !== undefined) {
    const list = parseArcPriorities(params.priorities);
    parts.push(list.length > 0 ? `priorities → ${list.join(', ')}` : 'priorities cleared');
  }
  if (params.deprioritized !== undefined) {
    const list = parseArcPriorities(params.deprioritized);
    parts.push(list.length > 0 ? `deprioritized → ${list.join(', ')}` : 'deprioritized cleared');
  }
  if (params.constraints !== undefined) {
    const list = parseArcConstraints(params.constraints);
    parts.push(list.length > 0 ? `constraints → ${list.join(', ')}` : 'constraints cleared');
  }
  if (params.directive !== undefined) parts.push('coach directive');
  if (params.intent !== undefined) parts.push('intent');
  if (params.weekly_time_min !== undefined) parts.push(`time budget → ${params.weekly_time_min}m/wk`);
  if (params.primary_goal !== undefined) parts.push(`goal → ${params.primary_goal}`);
  if (params.name !== undefined) parts.push(`name → "${params.name}"`);
  return parts;
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
      case 'REORDER_EXERCISES':
        return await executeReorderExercises(action.params);
      case 'UPDATE_REPS':
        return await executeUpdateReps(action.params);
      case 'SET_RPE_TARGET':
        return await executeSetRpeTarget(action.params);
      case 'REMEMBER':
        return await executeRemember(action.params, action.sourceMessageId);
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
      case 'RESET_TODAY':
        return await executeResetToday(action.params);
      case 'START_ARC':
        return await executeStartArc(action.params);
      case 'END_ARC':
        return await executeEndArc(action.params);
      case 'PAUSE_ARC':
        return await executePauseArc(action.params);
      case 'RESUME_ARC':
        return await executeResumeArc(action.params);
      case 'UPDATE_ARC':
        return await executeUpdateArc(action.params);
      case 'ADD_INJURY':
        return await executeAddInjury(action.params);
      case 'UPDATE_INJURY_STATUS':
        return await executeUpdateInjuryStatus(action.params);
      case 'LOG_SYMPTOM':
        return await executeLogSymptom(action.params);
      case 'GENERATE_MOBILITY_FLOW':
        return await executeGenerateMobilityFlow(action.params);
      case 'START_MOBILITY_FLOW':
        return await executeStartMobilityFlow(action.params);
      case 'LOG_ROM':
        return await executeLogRom(action.params);
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

  // v9: maxes are part of the cached stable core — invalidate so the next
  // coach turn sees the new value.
  const { invalidateCache } = await import('./coach-cache');
  await invalidateCache();

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
    // Try to estimate a reasonable load for the new exercise. Anchor to the
    // NEW exercise's primary-lift target (e.g. swapping squat→bench should
    // use bench max), not the session's primary lift.
    const liftMax = fromEx.exerciseType === 'COMPETITION'
      ? getMaxForLift(profile, liftAnchorForExercise(toLib, session.primaryLift))
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
      updates.rpeTarget = quantizeRpe(ex.rpeTarget + rpeOffset);
    }

    if (volumeMult !== 1 && volumeMult > 0) {
      updates.sets = Math.max(1, Math.round(ex.sets * volumeMult));
    }

    if (Object.keys(updates).length > 0) {
      // Recalculate load if RPE changed
      if (updates.rpeTarget) {
        const profile = await db.profile.get('me');
        if (profile) {
          const max = getMaxForLift(profile, liftAnchorForExercise(ex, session.primaryLift));
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

  // Estimate load. Anchor to the new exercise's own primary-lift target so
  // an upper-body accessory on a squat day uses bench max, not squat max.
  const profile = await db.profile.get('me');
  let load = 0;
  if (profile) {
    const anchor = libEx
      ? liftAnchorForExercise(libEx, session.primaryLift)
      : session.primaryLift;
    const max = getMaxForLift(profile, anchor);
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

/**
 * Reorder today's session by exercise name. Accepts a comma-separated list
 * matching the desired order; names are matched case-insensitively as
 * substrings of the exercise's full name (same matching policy as SWAP /
 * REMOVE / UPDATE_REPS so the coach can be loose).
 *
 * Any exercise the list doesn't mention keeps its relative ordering and is
 * appended after the explicitly-ordered ones — so the coach can reorder
 * just a slice ("warm-up rotator cuff before the bench") without having to
 * re-list every accessory.
 */
async function executeReorderExercises(params: Record<string, string>): Promise<ActionResult> {
  const session = await db.sessions
    .where('scheduledDate').equals(today())
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
    .first();
  if (!session) {
    return { success: false, message: 'No active session today.' };
  }

  const order = params.order;
  if (!order) return { success: false, message: 'No order specified.' };
  const wanted = order.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) {
    return { success: false, message: 'Empty reorder list.' };
  }

  const exercises = await db.exercises
    .where('sessionId').equals(session.id)
    .sortBy('order');
  if (exercises.length === 0) {
    return { success: false, message: 'No exercises to reorder.' };
  }

  // Greedy match: each wanted name claims the first un-claimed exercise
  // whose name contains the substring. This handles repeated patterns like
  // "tempo bench" / "competition bench" without collapsing them.
  const claimed = new Set<string>();
  const reordered: typeof exercises = [];
  const unmatched: string[] = [];
  for (const want of wanted) {
    const match = exercises.find(
      (e) => !claimed.has(e.id) && e.name.toLowerCase().includes(want),
    );
    if (match) {
      claimed.add(match.id);
      reordered.push(match);
    } else {
      unmatched.push(want);
    }
  }

  if (reordered.length === 0) {
    return {
      success: false,
      message: `Could not find any of: ${unmatched.join(', ')}.`,
    };
  }

  // Append unclaimed exercises in their original order so the coach can
  // reorder a slice without listing the whole session.
  for (const ex of exercises) {
    if (!claimed.has(ex.id)) reordered.push(ex);
  }

  await db.transaction('rw', db.exercises, db.sessions, async () => {
    for (let i = 0; i < reordered.length; i++) {
      await db.exercises.update(reordered[i].id, { order: i + 1 });
    }
    await db.sessions.update(session.id, { status: 'MODIFIED' });
  });

  const unmatchedTail = unmatched.length > 0
    ? ` (couldn't match: ${unmatched.join(', ')})`
    : '';
  return {
    success: true,
    message: `Reordered ${reordered.length} exercise${reordered.length === 1 ? '' : 's'}${unmatchedTail}.`,
  };
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
      const max = getMaxForLift(profile, liftAnchorForExercise(target, session.primaryLift));
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

  // Recalculate load for new RPE — snap to half-step grid before write.
  const quantizedRpe = quantizeRpe(rpe);
  const updates: Partial<SessionExercise> = { rpeTarget: quantizedRpe };
  const profile = await db.profile.get('me');
  if (profile && target.exerciseType === 'COMPETITION') {
    const max = getMaxForLift(profile, liftAnchorForExercise(target, session.primaryLift));
    updates.estimatedLoadKg = roundLoad(prescribeLoad(max, quantizedRpe, target.reps));
  }

  await db.exercises.update(target.id, updates);
  await db.sessions.update(session.id, { status: 'MODIFIED' });

  return { success: true, message: `Set RPE target for ${target.name} to ${quantizedRpe}.` };
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

async function executeRemember(
  params: Record<string, string>,
  sourceMessageId?: string,
): Promise<ActionResult> {
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
  const expiresAt = parseExpiry(params.expires);

  const memory = await addMemory({ kind, content, tags, importance, expiresAt, sourceMessageId });
  return { success: true, message: `Saved memory: ${memory.content} (${describeExpiry(memory.expiresAt)})` };
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

  const [profile, block] = await Promise.all([
    db.profile.get('me'),
    db.blocks.get(session.blockId),
  ]);
  if (!profile || !block) {
    return { success: false, message: 'Could not regenerate — profile or training block missing.' };
  }

  const readinessRow = await db.readiness.where('date').equals(today()).first();
  const readinessScore = readinessRow?.readinessScore ?? session.readinessScore ?? 70;

  // Deterministic rebuild from the rule engine — arc-aware (primary lift,
  // UPPER/LOWER rotation, length cap), injury-aware (dosed remedial prep,
  // contraindicated movement filter), readiness-aware (volume + intensity
  // modulation). No LLM author in the loop; the coach should make targeted
  // changes via SWAP/ADD/REMOVE/UPDATE_REPS tags rather than re-running
  // this whole-session regenerator.
  const { generateSession } = await import('@/lib/engine/session');
  const { loadRecentLiftExposures } = await import('@/lib/engine/lift-exposures');
  const { getActiveArc } = await import('@/lib/arcs');
  const { newId } = await import('@/lib/db/database');

  const recentLiftExposures = await loadRecentLiftExposures(today()).catch(() => []);
  const ws = mondayOf(today());
  const weekSessions = await db.sessions
    .where('cycleId').equals(session.cycleId)
    .filter((s) => s.scheduledDate >= ws && s.scheduledDate <= today())
    .sortBy('scheduledDate');
  const sessionIdx = weekSessions.findIndex((s) => s.id === session.id);
  const sessionNumber = sessionIdx >= 0 ? sessionIdx + 1 : 1;
  const cycle = await db.cycles.get(session.cycleId);
  const cycleWeek = cycle?.currentWeek ?? 1;
  const weekWithinBlock = Math.max(1, cycleWeek - block.weekStart + 1);

  const [activeInjuries, activeArc] = await Promise.all([
    listActiveInjuries(),
    getActiveArc().catch(() => null),
  ]);

  const finalSession = generateSession({
    profile, block,
    weekDayOfWeek: new Date(`${today()}T12:00:00`).getDay(),
    readinessScore, sessionNumber, weekWithinBlock,
    recentLiftExposures,
    activeInjuries,
    arcPriorities: activeArc?.priorities,
  });

  await db.transaction('rw', db.sessions, db.exercises, async () => {
    await db.sessions.update(session.id, {
      readinessScore,
      primaryLift:     finalSession.primaryLift,
      secondaryLifts:  finalSession.secondaryLifts ?? [],
      sessionType:     finalSession.sessionType,
      coachNote:       finalSession.coachNote,
      aiModifications: JSON.stringify(finalSession.modifications),
      status:          'SCHEDULED',
    });
    await db.exercises.where('sessionId').equals(session.id).delete();
    await db.exercises.bulkAdd(finalSession.exercises.map((ex) => ({
      id:              newId(),
      sessionId:       session.id,
      name:            ex.name,
      exerciseType:    ex.exerciseType,
      setStructure:    ex.setStructure,
      sets:            ex.sets,
      reps:            ex.reps,
      rpeTarget:       ex.rpeTarget,
      estimatedLoadKg: ex.estimatedLoadKg,
      order:           ex.order,
      notes:           ex.notes,
      ...(ex.tempo ? { tempo: ex.tempo } : {}),
    })));
  });

  const reason = params.reason ? ` (${params.reason})` : '';
  return {
    success: true,
    message: `Session rebuilt from rule engine${reason} — ${finalSession.exercises.length} exercises.`,
  };
}

async function executeResetToday(params: Record<string, string>): Promise<ActionResult> {
  const { resetTodaySession } = await import('@/lib/engine/reset-session');
  const result = await resetTodaySession(today());

  if (result.status === 'no-session') {
    return { success: false, message: 'No session found for today.' };
  }
  if (result.status === 'session-completed') {
    return {
      success: false,
      message: 'Today\'s session is already completed — reset declined to protect your training log.',
    };
  }

  const c = result.cleared!;
  const bits: string[] = [];
  if (c.exercises) bits.push(`${c.exercises} exercise${c.exercises === 1 ? '' : 's'}`);
  if (c.sets)      bits.push(`${c.sets} logged set${c.sets === 1 ? '' : 's'}`);
  if (c.readiness) bits.push('readiness');
  if (c.bodyweight)bits.push('bodyweight');
  const reason = params.reason ? ` (${params.reason})` : '';
  const cleared = bits.length > 0 ? bits.join(', ') : 'nothing already';
  return {
    success: true,
    message: `Today reset${reason} — wiped ${cleared}. Heading to check-in.`,
    navigateTo: '/checkin',
  };
}

// ── Training Arc executors (v8) ─────────────────────────────────────────────

async function executeStartArc(params: Record<string, string>): Promise<ActionResult> {
  const name = params.name?.trim();
  const intent = params.intent?.trim();
  const priorities = parseArcPriorities(params.priorities);
  if (!name || !intent || priorities.length === 0) {
    return { success: false, message: 'Arc needs a name, intent, and at least one priority.' };
  }
  const goalRaw = (params.primary_goal || '').toUpperCase();
  const primaryGoal: TrainingGoal = isValidTrainingGoal(goalRaw) ? goalRaw : 'LONGEVITY';
  const budget = parseInt(params.weekly_time_min || '0', 10);
  const arc = await createArc({
    name,
    intent,
    primaryGoal,
    priorities,
    deprioritized: parseArcPriorities(params.deprioritized),
    constraints: parseArcConstraints(params.constraints),
    weeklyTimeBudgetMin: Number.isFinite(budget) && budget > 0 ? budget : undefined,
    coachDirective: params.directive?.trim() || '',
    activate: true,
    transitionReason: params.reason?.trim() || 'Started from chat',
  });

  // Regenerate the macrocycle from the new arc's priorities so the next
  // session draws from the right phasing model (competition → linear,
  // longevity → sustainable rhythm). Best-effort: if the profile isn't
  // ready yet, the seeded cycle stays in place.
  const synced = await regenerateCycleFromArc(arc).catch(() => null);
  const cycleHint = synced
    ? ` New ${synced.blockCount}-block cycle aligned to your priorities.`
    : '';
  return {
    success: true,
    message: `"${arc.name}" is now your active training arc.${cycleHint}`,
    navigateTo: `/settings/arcs/${arc.id}`,
  };
}

async function executeEndArc(params: Record<string, string>): Promise<ActionResult> {
  const arc = await getActiveArc();
  if (!arc) return { success: false, message: 'No active arc to end.' };
  await endArc(arc.id, params.reason?.trim());
  return { success: true, message: `Ended "${arc.name}". It stays in your arc history.` };
}

async function executePauseArc(params: Record<string, string>): Promise<ActionResult> {
  const arc = await getActiveArc();
  if (!arc) return { success: false, message: 'No active arc to pause.' };
  await pauseArc(arc.id);
  const reason = params.reason?.trim();
  return {
    success: true,
    message: reason ? `Paused "${arc.name}" — ${reason}.` : `Paused "${arc.name}".`,
  };
}

async function executeResumeArc(params: Record<string, string>): Promise<ActionResult> {
  const id = params.id?.trim();
  if (!id) return { success: false, message: 'Resume needs an arc id.' };
  const target = await db.trainingArcs.get(id);
  if (!target) return { success: false, message: 'Arc not found.' };
  await resumeArc(id);

  // Read back the just-activated arc (resumeArc may have rewritten startDate /
  // status), then realign the macrocycle to its priorities.
  const refreshed = await db.trainingArcs.get(id);
  const synced = refreshed
    ? await regenerateCycleFromArc(refreshed).catch(() => null)
    : null;
  const cycleHint = synced
    ? ` Cycle rebuilt around this arc's priorities.`
    : '';
  return {
    success: true,
    message: `Resumed "${target.name}".${cycleHint}`,
    navigateTo: `/settings/arcs/${id}`,
  };
}

async function executeUpdateArc(params: Record<string, string>): Promise<ActionResult> {
  const arc = await getActiveArc();
  if (!arc) return { success: false, message: 'No active arc to update.' };

  const patch: Parameters<typeof updateArc>[1] = {};
  if (params.priorities !== undefined) patch.priorities = parseArcPriorities(params.priorities);
  if (params.deprioritized !== undefined) patch.deprioritized = parseArcPriorities(params.deprioritized);
  if (params.constraints !== undefined) patch.constraints = parseArcConstraints(params.constraints);
  if (params.directive !== undefined) patch.coachDirective = params.directive.trim();
  if (params.intent !== undefined) patch.intent = params.intent.trim();
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.weekly_time_min !== undefined) {
    const n = parseInt(params.weekly_time_min, 10);
    patch.weeklyTimeBudgetMin = Number.isFinite(n) && n > 0 ? n : undefined;
  }
  if (params.primary_goal !== undefined) {
    const g = params.primary_goal.toUpperCase();
    if (isValidTrainingGoal(g)) patch.primaryGoal = g;
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, message: 'No valid fields to update.' };
  }

  await updateArc(arc.id, patch);
  return { success: true, message: `Updated "${arc.name}".` };
}

// `activateArc` is imported for the executor but referenced via the existing
// arcs helpers below — surfaced here so future ACTIVATE_ARC-style actions can
// reuse the import without re-adding it.
void activateArc;

// ── Injury executors (v8) ────────────────────────────────────────────────────

async function executeAddInjury(params: Record<string, string>): Promise<ActionResult> {
  const label = params.label?.trim();
  const regions = parseRegions(params.regions);
  if (!label || regions.length === 0) {
    return { success: false, message: 'Injury needs a label and at least one region.' };
  }
  const statusRaw = (params.status || 'MANAGING').toUpperCase();
  const status: InjuryStatus = isValidInjuryStatus(statusRaw) ? statusRaw : 'MANAGING';
  const severity = clampSeverity(parseInt(params.severity || '3', 10));
  const constraints = parseInjuryConstraints(params.constraints);
  const contraindicatedPatterns = parseInjuryPatterns(params.contraindicated_patterns);
  const preferredPatterns = parseInjuryPatterns(params.preferred_patterns);
  const injury = await createInjury({
    label,
    regions,
    status,
    severity,
    constraints,
    contraindicatedPatterns,
    preferredPatterns,
    notes: params.notes?.trim() || undefined,
  });
  return {
    success: true,
    message: `Logged "${injury.label}". The swap engine will route around it now.`,
    navigateTo: `/health/injuries/${injury.id}`,
  };
}

async function executeUpdateInjuryStatus(params: Record<string, string>): Promise<ActionResult> {
  const id = params.id?.trim();
  const statusRaw = (params.status || '').toUpperCase();
  if (!id || !isValidInjuryStatus(statusRaw)) {
    return { success: false, message: 'Need an injury id and a valid status.' };
  }
  const injury = await db.injuries.get(id);
  if (!injury) return { success: false, message: 'Injury not found.' };
  await updateInjuryStatus(id, statusRaw as InjuryStatus);
  return {
    success: true,
    message: `"${injury.label}" → ${INJURY_STATUS_LABELS[statusRaw as InjuryStatus]}.`,
  };
}

async function executeLogSymptom(params: Record<string, string>): Promise<ActionResult> {
  const injuryId = params.injury_id?.trim();
  const painAtRest = parseInt(params.pain_at_rest || '', 10);
  const painUnderLoad = parseInt(params.pain_under_load || '', 10);
  if (!injuryId || !isPainScale(painAtRest) || !isPainScale(painUnderLoad)) {
    return { success: false, message: 'Need injury_id and valid pain_at_rest / pain_under_load.' };
  }
  const injury = await db.injuries.get(injuryId);
  if (!injury) return { success: false, message: 'Injury not found.' };
  const stiffRaw = parseInt(params.stiffness || '0', 10);
  const stiffness: StiffnessScale = (Math.max(0, Math.min(5, isNaN(stiffRaw) ? 0 : stiffRaw))) as StiffnessScale;
  const irrRaw = (params.irritability || 'MED').toUpperCase();
  const irritability: IrritabilityLevel = irrRaw === 'LOW' || irrRaw === 'HIGH' ? irrRaw : 'MED';
  await logSymptom({
    injuryId,
    painAtRest,
    painUnderLoad,
    stiffness,
    irritability,
    note: params.note?.trim() || undefined,
  });
  return { success: true, message: `Logged symptom for "${injury.label}".` };
}

// ── Mobility executors (v8) ──────────────────────────────────────────────────

async function executeGenerateMobilityFlow(params: Record<string, string>): Promise<ActionResult> {
  const focusRaw = (params.focus || 'CUSTOM').toUpperCase();
  const focus: MobilityFocus = isValidMobilityFocus(focusRaw) ? focusRaw : 'CUSTOM';
  const minutes = clampMinutes(parseInt(params.minutes || '10', 10));
  const [injuries, weak] = await Promise.all([
    listActiveInjuries(),
    weakRegions(),
  ]);
  const routine = generateRoutine({
    focus,
    minutes,
    injuries,
    weakRegions: weak,
  });
  // Persist as a CUSTOM routine so the runner can step through it the same
  // way as the templates.
  const id = newId();
  await db.mobilityRoutines.add({
    id,
    name: `Coach: ${focusToLabel(focus)}`,
    ownerId: 'me',
    durationMin: routine.estimatedMinutes,
    movementIds: routine.movementIds,
    source: 'LLM',
    tags: ['coach_generated'],
    createdAt: new Date().toISOString(),
  });
  return {
    success: true,
    message: `Generated a ${routine.estimatedMinutes}-min flow with ${routine.movementIds.length} movements. Opening the runner…`,
    navigateTo: `/mobility/${id}/run`,
  };
}

async function executeStartMobilityFlow(params: Record<string, string>): Promise<ActionResult> {
  const id = params.routine_id?.trim();
  if (!id) return { success: false, message: 'Need a routine_id.' };
  return {
    success: true,
    message: 'Opening the flow…',
    navigateTo: `/mobility/${id}/run`,
  };
}

async function executeLogRom(params: Record<string, string>): Promise<ActionResult> {
  const movementId = params.movement_id?.trim();
  const rating = parseInt(params.rating || '', 10);
  if (!movementId || isNaN(rating) || rating < 0 || rating > 100) {
    return { success: false, message: 'Need movement_id and rating 0-100.' };
  }
  const movement = MOBILITY_BY_ID.get(movementId);
  if (!movement) return { success: false, message: 'Movement not found in library.' };
  const region = movement.regions[0];
  const { logSelfRating } = await import('@/lib/mobility/rom-assessment');
  await logSelfRating({ movementId, region, selfRating: rating });
  return { success: true, message: `Logged ROM ${rating}/100 for ${movement.name}.` };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// `getMaxForLift` and `liftAnchorForExercise` live in ./lift-anchor so the
// session advisor can reuse the same anchoring logic when it recomputes
// loads from advisor-issued RPE/reps adjustments.
