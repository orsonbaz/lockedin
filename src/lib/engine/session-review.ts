/**
 * session-review.ts — Post-generation sanity review.
 *
 * The deterministic rules here catch the common ways the generator can
 * produce a session that doesn't match the athlete's goals or training
 * history: bench droughts, empty sessions, missing face pulls, primary
 * lift that doesn't match the athlete's chosen discipline, risky
 * spinal-load stacking, and so on.
 *
 * Every issue has `severity`:
 *   - 'BLOCK'  : the review auto-fixes the session (swap primary lift,
 *                append the missing accessory, etc.). UI shows an info chip.
 *   - 'WARN'   : surfaced to the UI as a banner; no auto-fix.
 *   - 'NOTE'   : low-priority note; displayed only in coach prompt.
 *
 * Keep every rule cheap + deterministic. LLM-based review is a separate
 * optional pass (see `aiReviewSession`).
 */

import { loadRecentLiftExposures } from './lift-exposures';
import { db } from '@/lib/db/database';
import type { AthleteProfile, Lift, TrainingBlock } from '@/lib/db/types';
import type { GeneratedSession, GeneratedExercise, LiftExposure } from './session';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewSeverity = 'BLOCK' | 'WARN' | 'NOTE';

export interface ReviewIssue {
  code:
    | 'BENCH_DROUGHT'
    | 'SQUAT_DROUGHT'
    | 'DEADLIFT_DROUGHT'
    | 'EMPTY_SESSION'
    | 'NO_FACE_PULLS'
    | 'DISCIPLINE_MISMATCH'
    | 'SPINAL_STACKING'
    | 'BENCH_UNDER_TARGET'
    | 'NO_COMP_LIFT';
  severity: ReviewSeverity;
  summary: string;
  fix?: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  /** Session rewritten to address BLOCK-severity issues. Same object if no fixes. */
  session: GeneratedSession;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasExerciseNamed(session: GeneratedSession, ...names: string[]): boolean {
  return session.exercises.some((e) => names.includes(e.name));
}

function exposureFor(exposures: LiftExposure[], lift: Lift): LiftExposure | undefined {
  return exposures.find((e) => e.lift === lift);
}

const WEEKLY_TARGET: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
  SQUAT:    2.5,
  BENCH:    3.5,
  DEADLIFT: 2.5,
};

// ── Core rule engine ─────────────────────────────────────────────────────────

/**
 * Runs the deterministic review and optionally patches the session in place.
 * Pure with respect to DB state — callers must pass exposures + block so this
 * function stays testable.
 *
 * `skipDroughtCheck` — set on the second review pass after the caller has
 * already re-generated the session with `forcePrimary`. Without this we'd
 * re-detect the OTHER lifts as drought-due (they all read Infinity-days on
 * a fresh athlete) and try to swap again.
 */
export function reviewSessionPure(input: {
  session: GeneratedSession;
  profile: AthleteProfile;
  block: TrainingBlock;
  exposures: LiftExposure[];
  weekDayOfWeek: number;
  skipDroughtCheck?: boolean;
}): ReviewResult {
  const { session, profile, exposures, block, skipDroughtCheck } = input;
  const issues: ReviewIssue[] = [];
  let patched: GeneratedSession = session;

  // ── 1. Empty session ────────────────────────────────────────────────────
  if (session.exercises.length === 0) {
    issues.push({
      code: 'EMPTY_SESSION',
      severity: 'WARN',
      summary: 'Session has no exercises. Regenerate from Home.',
    });
    return { issues, session };
  }

  // ── 2. Bench / Squat / DL drought ───────────────────────────────────────
  // BLOCK severity. Caller is expected to detect a *_DROUGHT issue,
  // re-run generateSession with forcePrimary, then call this function
  // again with skipDroughtCheck=true.
  //
  // Crucial guards:
  //   - Drought only fires when daysSince is FINITE — a brand-new athlete
  //     with no completed sessions has Infinity days for everything; we
  //     can't say bench is overdue if there's no training history yet.
  //   - We fire AT MOST ONE drought issue per review (the highest-priority).
  //     Otherwise on fresh data all three would fire.
  //   - Skipped entirely on the second pass via skipDroughtCheck.
  const benchExp = exposureFor(exposures, 'BENCH');
  const squatExp = exposureFor(exposures, 'SQUAT');
  const dlExp    = exposureFor(exposures, 'DEADLIFT');

  const daysSinceBench = benchExp?.daysSince ?? Infinity;
  const daysSinceSquat = squatExp?.daysSince ?? Infinity;
  const daysSinceDL    = dlExp?.daysSince    ?? Infinity;

  // Only rewrite primary for ACCUMULATION / INTENSIFICATION / PIVOT / MAINTENANCE.
  const canRewrite = block.blockType === 'ACCUMULATION'
                  || block.blockType === 'INTENSIFICATION'
                  || block.blockType === 'PIVOT'
                  || block.blockType === 'MAINTENANCE';

  function isFiniteFinite(n: number): boolean {
    return Number.isFinite(n);
  }

  if (!skipDroughtCheck && canRewrite) {
    // Priority order: bench (highest weekly target) > squat > deadlift.
    // Only one drought fires per pass.
    if (
      isFiniteFinite(daysSinceBench) && daysSinceBench >= 5
      && session.primaryLift !== 'BENCH'
    ) {
      issues.push({
        code: 'BENCH_DROUGHT',
        severity: 'BLOCK',
        summary: `No bench in ${Math.round(daysSinceBench)} days — rewriting today to a bench session.`,
        fix: 'Primary lift swapped to BENCH.',
      });
    } else if (
      isFiniteFinite(daysSinceSquat) && daysSinceSquat >= 7
      && session.primaryLift !== 'SQUAT'
    ) {
      issues.push({
        code: 'SQUAT_DROUGHT',
        severity: 'BLOCK',
        summary: `No squat in ${Math.round(daysSinceSquat)} days — rewriting today to a squat session.`,
        fix: 'Primary lift swapped to SQUAT.',
      });
    } else if (
      isFiniteFinite(daysSinceDL) && daysSinceDL >= 7
      && session.primaryLift !== 'DEADLIFT'
    ) {
      issues.push({
        code: 'DEADLIFT_DROUGHT',
        severity: 'BLOCK',
        summary: `No deadlift in ${Math.round(daysSinceDL)} days — rewriting today to a deadlift session.`,
        fix: 'Primary lift swapped to DEADLIFT.',
      });
    }
  }

  // ── 3. Weekly bench target check ────────────────────────────────────────
  // Only fires when the athlete has completed at least one session this
  // week — otherwise on a fresh-week Monday it would always WARN.
  const isLateWeek = input.weekDayOfWeek >= 4; // Thu, Fri, Sat
  const benchThisWeek = benchExp?.weekCount ?? 0;
  const squatThisWeek = squatExp?.weekCount ?? 0;
  const dlThisWeek    = dlExp?.weekCount    ?? 0;
  const completedThisWeek = benchThisWeek + squatThisWeek + dlThisWeek;
  if (
    completedThisWeek > 0
    && isLateWeek && benchThisWeek < 2
    && patched.primaryLift !== 'BENCH'
    && canRewrite
  ) {
    issues.push({
      code: 'BENCH_UNDER_TARGET',
      severity: 'WARN',
      summary: `Only ${benchThisWeek} bench session${benchThisWeek === 1 ? '' : 's'} this week — target is 3-4. Consider stacking bench today.`,
    });
  }

  // ── 4. Face pulls on bench day ──────────────────────────────────────────
  if (patched.primaryLift === 'BENCH' && !hasExerciseNamed(patched, 'Face Pull')) {
    issues.push({
      code: 'NO_FACE_PULLS',
      severity: 'BLOCK',
      summary: 'Bench day without face pulls — adding them (shoulder health non-negotiable).',
    });
    patched = appendExercise(patched, {
      name:              'Face Pull',
      exerciseType:      'ACCESSORY',
      setStructure:      'STRAIGHT',
      sets:              3,
      reps:              15,
      rpeTarget:         7,
      estimatedLoadKg:   Math.max(10, Math.round((profile.maxBench ?? 80) * 0.12 / 2.5) * 2.5),
      order:             patched.exercises.length + 1,
      notes:             'Rear-delt + external rotation. Every bench day.',
      libraryExerciseId: 'face_pull',
    });
  }

  // ── 5. Discipline mismatch ──────────────────────────────────────────────
  const primaryDisc = profile.primaryDiscipline ?? profile.disciplines?.[0];
  if (primaryDisc === 'STREET_LIFT') {
    const hasWeightedPull = hasExerciseNamed(patched, 'Weighted Pull-Up');
    const hasWeightedDip  = hasExerciseNamed(patched, 'Weighted Dip');
    if (!hasWeightedPull && !hasWeightedDip) {
      issues.push({
        code: 'DISCIPLINE_MISMATCH',
        severity: 'WARN',
        summary: 'Primary discipline is street-lift but today has no weighted pull-up or dip. Swap an accessory?',
      });
    }
  }

  // ── 6. Spinal-erector stacking ──────────────────────────────────────────
  const hasHeavySquat = patched.exercises.some(
    (e) => e.exerciseType === 'COMPETITION' && e.name.includes('Squat') && e.rpeTarget >= 8,
  );
  const hasHeavyDL = patched.exercises.some(
    (e) => e.exerciseType === 'COMPETITION' && (e.name.includes('Deadlift') || e.name.includes('Pull')) && e.rpeTarget >= 8,
  );
  if (hasHeavySquat && hasHeavyDL && block.blockType !== 'REALIZATION') {
    issues.push({
      code: 'SPINAL_STACKING',
      severity: 'WARN',
      summary: 'Heavy squat + heavy deadlift stacked today. Spinal erector fatigue will hurt the next 48h.',
    });
  }

  // ── 7. At least one comp lift ───────────────────────────────────────────
  const hasAnyComp = patched.exercises.some((e) => e.exerciseType === 'COMPETITION');
  if (!hasAnyComp) {
    issues.push({
      code: 'NO_COMP_LIFT',
      severity: 'WARN',
      summary: 'No competition-lift work scheduled. Consider regenerating from Home.',
    });
  }

  return { issues, session: patched };
}

// ── Session mutation helpers ─────────────────────────────────────────────────

function appendExercise(session: GeneratedSession, ex: GeneratedExercise): GeneratedSession {
  return {
    ...session,
    exercises: [...session.exercises, ex],
    modifications: [...session.modifications, `Review added ${ex.name}.`],
  };
}

// ── DB-backed entry point ────────────────────────────────────────────────────

/**
 * Loads exposures from Dexie and runs the review. Returns `issues` the UI
 * can render; actual primary-lift swaps should be done by re-running
 * `generateSession` with a pinned `forcePrimary` — see ensure-session-fresh.
 */
export async function reviewSession(input: {
  session: GeneratedSession;
  profile: AthleteProfile;
  block: TrainingBlock;
  dateStr: string;
  weekDayOfWeek: number;
}): Promise<ReviewResult> {
  const exposures = await loadRecentLiftExposures(input.dateStr).catch(() => []);
  return reviewSessionPure({ ...input, exposures });
}

/**
 * Persist the review issues on the session row so the UI can render them.
 * Uses `aiModifications` (already a JSON blob on TrainingSession) — we stash
 * issues alongside any engine modifications so the UI reads one field.
 */
export function packReviewIssues(issues: ReviewIssue[]): string {
  return JSON.stringify(issues);
}

export function unpackReviewIssues(raw: string | undefined): ReviewIssue[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'object' && x && 'code' in x && 'severity' in x)) {
      return parsed as ReviewIssue[];
    }
    return [];
  } catch {
    return [];
  }
}

// ── Persisted-issue field name (non-indexed, additive on TrainingSession) ────
// Stored in TrainingSession.reviewIssues as a JSON string.
// See TrainingSession in db/types.ts for the added field.
export const REVIEW_ISSUES_FIELD = 'reviewIssues' as const;

// Convenience: enrich a DB-read TrainingSession with parsed review issues.
export async function loadSessionReviewIssues(sessionId: string): Promise<ReviewIssue[]> {
  const row = await db.sessions.get(sessionId);
  const raw = (row as unknown as { reviewIssues?: string } | undefined)?.reviewIssues;
  return unpackReviewIssues(raw);
}
