/**
 * goal-progress.ts — Best-effort parser + progress calculator for the
 * athlete's free-text training goal.
 *
 * Recognised patterns:
 *   "200 kg squat"        → STRENGTH lift=SQUAT targetKg=200
 *   "440 lb bench"        → STRENGTH lift=BENCH targetKg≈200
 *   "500 kg total"        → STRENGTH lift=TOTAL targetKg=500
 *   "82.5 kg class"       → BODYWEIGHT targetKg=82.5
 *   "back to 82.5 class"  → BODYWEIGHT targetKg=82.5
 *   "strict muscle-up"    → SKILL skillKey=muscle_up
 *   "front lever"         → SKILL skillKey=front_lever
 *
 * When the text doesn't match anything, we still return a NARRATIVE entry so
 * the UI can render the deadline countdown and the raw goal text. Pure
 * logic — no DB calls.
 */

import type { AthleteProfile, BodyweightEntry } from '@/lib/db/types';
import { daysUntil } from '@/lib/date-utils';

// ── Public types ─────────────────────────────────────────────────────────────

export type GoalKind =
  | 'STRENGTH'    // a kg target on a specific lift or total
  | 'BODYWEIGHT'  // a target weight class / scale number
  | 'SKILL'       // a calisthenics skill from the curated list
  | 'NARRATIVE';  // unparseable — show text + deadline only

export type StrengthLift = 'SQUAT' | 'BENCH' | 'DEADLIFT' | 'TOTAL';

interface ParsedStrength {
  kind: 'STRENGTH';
  lift: StrengthLift;
  targetKg: number;
}
interface ParsedBodyweight {
  kind: 'BODYWEIGHT';
  targetKg: number;
}
interface ParsedSkill {
  kind: 'SKILL';
  skillKey: string;     // matches AthleteProfile.calisthenicsGoals entries
  skillLabel: string;
}
interface ParsedNarrative {
  kind: 'NARRATIVE';
}
export type ParsedGoal = ParsedStrength | ParsedBodyweight | ParsedSkill | ParsedNarrative;

export interface GoalProgress {
  /** Raw text from profile, trimmed. */
  rawText: string;
  /** ISO date or undefined. */
  deadline?: string;
  /** Days until deadline (≥ 0) or null when no deadline / past due. */
  daysLeft: number | null;
  /** True when daysLeft is null *because* the deadline already passed. */
  overdue: boolean;
  /** Parsed shape — always present (NARRATIVE fallback). */
  parsed: ParsedGoal;
  /** Current value on the parsed metric (kg for STRENGTH/BODYWEIGHT). */
  currentValue: number | null;
  /** Target value (kg for STRENGTH/BODYWEIGHT). */
  targetValue: number | null;
  /** 0-1 fraction of target reached. Null when not computable. */
  fraction: number | null;
  /** Plain-language one-liner the UI can render under the bar. */
  caption: string;
  /** If true, currentValue ≥ targetValue. */
  achieved: boolean;
}

// ── Parser ───────────────────────────────────────────────────────────────────

const SKILLS: { key: string; label: string; tokens: string[] }[] = [
  { key: 'muscle_up',        label: 'Strict muscle-up',  tokens: ['muscle up', 'muscle-up', 'muscleup'] },
  { key: 'front_lever',      label: 'Front lever',       tokens: ['front lever'] },
  { key: 'planche',          label: 'Planche',           tokens: ['planche'] },
  { key: 'pistol_squat',     label: 'Pistol squat',      tokens: ['pistol'] },
  { key: 'one_arm_pullup',   label: 'One-arm pull-up',   tokens: ['one arm pull', 'one-arm pull', 'oapu'] },
  { key: 'handstand_pushup', label: 'Handstand push-up', tokens: ['handstand push', 'hspu'] },
];

const LB_TO_KG = 0.45359237;

export function parseGoalText(input: string): ParsedGoal {
  const text = input.trim().toLowerCase();
  if (!text) return { kind: 'NARRATIVE' };

  // STRENGTH: "{N}{unit} {lift|total}"
  const liftMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(kg|kilo|kgs|lb|lbs|pound|pounds)?\s*(squat|bench|deadlift|total)/,
  );
  if (liftMatch) {
    const n = parseFloat(liftMatch[1]);
    const unit = liftMatch[2] ?? 'kg';
    const lift = liftMatch[3] as 'squat' | 'bench' | 'deadlift' | 'total';
    const kg = isLb(unit) ? n * LB_TO_KG : n;
    return {
      kind: 'STRENGTH',
      lift: lift.toUpperCase() as StrengthLift,
      targetKg: round1(kg),
    };
  }

  // BODYWEIGHT: "{N}{unit} class" or "back to {N} class"
  const classMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|lb|lbs)?\s*class/);
  if (classMatch) {
    const n = parseFloat(classMatch[1]);
    const unit = classMatch[2] ?? 'kg';
    const kg = isLb(unit) ? n * LB_TO_KG : n;
    return { kind: 'BODYWEIGHT', targetKg: round1(kg) };
  }

  // SKILL: literal token match
  for (const skill of SKILLS) {
    if (skill.tokens.some((t) => text.includes(t))) {
      return { kind: 'SKILL', skillKey: skill.key, skillLabel: skill.label };
    }
  }

  return { kind: 'NARRATIVE' };
}

function isLb(unit: string): boolean {
  return /lb|pound/.test(unit);
}

// ── Progress calculator ──────────────────────────────────────────────────────

interface BuildArgs {
  profile: AthleteProfile;
  /** Most recent BodyweightEntry, if any. */
  latestBodyweight?: BodyweightEntry | null;
  /** Today's ISO date — injected for testability. */
  todayIso?: string;
}

export function buildGoalProgress(args: BuildArgs): GoalProgress | null {
  const { profile, latestBodyweight } = args;
  const rawText = (profile.trainingGoalTarget ?? '').trim();
  const deadline = profile.trainingGoalDeadline;

  // Nothing at all — no card to render.
  if (!rawText && !deadline) return null;

  const parsed = parseGoalText(rawText);
  const { daysLeft, overdue } = computeDeadline(deadline, args.todayIso);

  let currentValue: number | null = null;
  let targetValue: number | null = null;

  if (parsed.kind === 'STRENGTH') {
    targetValue = parsed.targetKg;
    currentValue = currentStrength(profile, parsed.lift);
  } else if (parsed.kind === 'BODYWEIGHT') {
    targetValue = parsed.targetKg;
    currentValue = latestBodyweight?.weightKg ?? profile.weightKg;
  }

  const fraction = computeFraction(parsed, currentValue, targetValue);
  const achieved = fraction !== null && fraction >= 1;

  return {
    rawText,
    deadline,
    daysLeft,
    overdue,
    parsed,
    currentValue,
    targetValue,
    fraction,
    caption: buildCaption(parsed, currentValue, targetValue, achieved),
    achieved,
  };
}

function currentStrength(profile: AthleteProfile, lift: StrengthLift): number {
  switch (lift) {
    case 'SQUAT':    return profile.maxSquat;
    case 'BENCH':    return profile.maxBench;
    case 'DEADLIFT': return profile.maxDeadlift;
    case 'TOTAL':    return profile.maxSquat + profile.maxBench + profile.maxDeadlift;
  }
}

function computeFraction(
  parsed: ParsedGoal,
  current: number | null,
  target: number | null,
): number | null {
  if (current === null || target === null || target <= 0) return null;

  if (parsed.kind === 'STRENGTH') {
    // Bigger is better — clamp to [0, 1.5] so a 50% overshoot is visible.
    return clamp(current / target, 0, 1.5);
  }

  if (parsed.kind === 'BODYWEIGHT') {
    // Distance-based: 1.0 means we're at target. We treat each kg of distance
    // as ~1% off (rough heuristic — meet weight class moves are small).
    const distKg = Math.abs(current - target);
    return clamp(1 - distKg / 10, 0, 1);
  }

  return null;
}

function buildCaption(
  parsed: ParsedGoal,
  current: number | null,
  target: number | null,
  achieved: boolean,
): string {
  if (parsed.kind === 'STRENGTH' && current !== null && target !== null) {
    if (achieved) return `Hit it — ${current}kg ≥ ${target}kg target.`;
    const remaining = round1(target - current);
    return `${current}kg now · ${remaining}kg to go`;
  }
  if (parsed.kind === 'BODYWEIGHT' && current !== null && target !== null) {
    const diff = round1(current - target);
    if (Math.abs(diff) < 0.5) return `On weight at ${current}kg.`;
    return diff > 0
      ? `${current}kg now · ${diff}kg to drop`
      : `${current}kg now · ${Math.abs(diff)}kg to gain`;
  }
  if (parsed.kind === 'SKILL') {
    return `Goal: ${parsed.skillLabel}`;
  }
  return '';
}

function computeDeadline(
  deadline: string | undefined,
  todayIsoOverride: string | undefined,
): { daysLeft: number | null; overdue: boolean } {
  if (!deadline) return { daysLeft: null, overdue: false };
  const left = todayIsoOverride
    ? Math.max(0, Math.ceil(
        (new Date(deadline).getTime() - new Date(todayIsoOverride).getTime()) / 86_400_000,
      ))
    : daysUntil(deadline);
  // daysUntil clamps to 0; detect overdue by comparing the raw delta.
  const ms = new Date(deadline).getTime() - (todayIsoOverride
    ? new Date(todayIsoOverride).getTime()
    : Date.now());
  const overdue = ms < 0;
  return { daysLeft: overdue ? null : left, overdue };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
