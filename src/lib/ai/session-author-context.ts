/**
 * session-author-context.ts — Build the prompt context for `authorSessionFromCoach`.
 *
 * Mirrors the chat coach's context bundle: athlete snapshot, goals, active
 * disciplines, memories, readiness, recent training, current block + week,
 * and the full coaching knowledge base. The rule-engine baseline is included
 * as "STARTING POINT" — the LLM may discard or restructure it.
 *
 * Kept separate from the author entry point so the prompt-building logic
 * can be edited without touching the LLM call / fallback handling.
 */

import { db, today } from '@/lib/db/database';
import { getFullKnowledge } from './knowledge-base';
import { retrieveRelevantMemories } from './memory';
import { loadRecentLiftExposures, formatExposureLines } from '@/lib/engine/lift-exposures';
import { resolveArcMode, type ArcMode } from '@/lib/engine/session';
import {
  getActiveArc,
  arcDayCount,
  ARC_PRIORITY_LABELS,
  ARC_CONSTRAINT_LABELS,
} from '@/lib/arcs';
import {
  listActiveInjuries,
  INJURY_STATUS_LABELS,
  INJURY_CONSTRAINT_LABELS,
  BODY_REGION_LABELS,
  INJURY_MOVEMENT_PATTERN_LABELS,
} from '@/lib/injuries';
import type { Lift } from '@/lib/db/types';
import type { AuthorInput } from './session-author';

/**
 * Metadata returned alongside the prompt context so the caller can hard-
 * validate the LLM's output. Without these, the LLM's prior dominates and
 * we end up with a powerlifting-flavoured session on a Get Healthy arc.
 */
export interface AuthorContextMeta {
  /** Active arc routing mode — BARBELL means SBD rails are appropriate. */
  arcMode: ArcMode;
  /** Per-arc exercise ceiling — total including remedial prep + accessories. */
  exerciseCap: number;
  /**
   * Locked primary lift when the arc isn't BARBELL — the LLM must use this
   * exactly. The deterministic engine already routed to UPPER/LOWER per the
   * arc; the LLM's job is to fill in the rest, not re-pick the primary.
   */
  lockedPrimary: Lift | null;
  /**
   * True when the arc deprioritizes COMPETITION (or doesn't include it as a
   * priority) — the LLM may not slot Competition SBD lifts as primary or
   * secondary work in this case.
   */
  forbidsCompetitionSbd: boolean;
}

export async function buildAuthorContext(
  input: AuthorInput,
): Promise<{ context: string; memoryCount: number; meta: AuthorContextMeta }> {
  const { profile, block, baseline, readinessScore, preferredPrimary } = input;
  const dateStr = today();
  const sections: string[] = [];

  // ── 1. Athlete snapshot ──────────────────────────────────────────────────
  const total = profile.maxSquat + profile.maxBench + profile.maxDeadlift;
  const disciplines = profile.disciplines ?? ['POWERLIFTING'];
  const primaryDisc = profile.primaryDiscipline ?? disciplines[0];
  const secondaryDisc = disciplines.filter((d) => d !== primaryDisc);
  const hasStreetLift = disciplines.some(
    (d) => d === 'STREET_LIFT' || d === 'CALISTHENICS' || d === 'HYBRID',
  );

  const streetLiftLines: string[] = [];
  if (hasStreetLift) {
    if (profile.maxWeightedPullUp !== undefined)
      streetLiftLines.push(`Weighted pull-up max: +${profile.maxWeightedPullUp} kg`);
    if (profile.maxWeightedDip !== undefined)
      streetLiftLines.push(`Weighted dip max: +${profile.maxWeightedDip} kg`);
    if (profile.maxWeightedMuscleUp !== undefined)
      streetLiftLines.push(`Weighted muscle-up max: +${profile.maxWeightedMuscleUp} kg`);
    if (streetLiftLines.length === 0)
      streetLiftLines.push('Street lift maxes not yet logged — use bodyweight fraction estimates');
  }

  sections.push(`# ATHLETE
Name: ${profile.name || 'Athlete'}
Powerlifting maxes: S${profile.maxSquat} / B${profile.maxBench} / D${profile.maxDeadlift} (total: ${total} kg)
Gym PRs: S${profile.gymSquat ?? profile.maxSquat} / B${profile.gymBench ?? profile.maxBench} / D${profile.gymDeadlift ?? profile.maxDeadlift}${streetLiftLines.length ? `\nStreet lift: ${streetLiftLines.join('  |  ')}` : ''}
Bodyweight: ${profile.weightKg} kg  |  Target class: ${profile.targetWeightClass} kg
Federation: ${profile.federation}  |  Equipment: ${profile.equipment}
Training age: ${profile.trainingAgeMonths ? `${(profile.trainingAgeMonths / 12).toFixed(1)} years` : 'unknown'}
Phenotype: bottleneck=${profile.bottleneck}, responder=${profile.responder}, overshooter=${profile.overshooter ? 'YES' : 'no'}
Reward system: ${profile.rewardSystem}`);

  // ── 1b. Goals + disciplines ───────────────────────────────────────────────
  const goalLines: string[] = [];
  goalLines.push(`Primary discipline: ${primaryDisc}`);
  if (secondaryDisc.length > 0) {
    goalLines.push(`Secondary disciplines (the athlete actively pursues these — author work that serves them, do not omit): ${secondaryDisc.join(', ')}`);
  }
  const goalLine = [
    profile.trainingGoal,
    profile.trainingGoalTarget ? `"${profile.trainingGoalTarget}"` : '',
    profile.trainingGoalDeadline ? `by ${profile.trainingGoalDeadline}` : '',
  ].filter(Boolean).join(' — ');
  if (goalLine) goalLines.push(`Primary goal: ${goalLine}`);
  if (profile.calisthenicsGoals?.length) {
    goalLines.push(`Skill goals: ${profile.calisthenicsGoals.join(', ')}`);
  }
  if (preferredPrimary) {
    goalLines.push(`Athlete picked at check-in — primary lift today: ${preferredPrimary}`);
  }
  // Honour the secondary-comp override exactly as picked. 'NONE' means the
  // session must have NO secondary comp lift (no extra squat/bench/deadlift
  // work beyond the primary). A specific lift means pin that lift as the
  // secondary. 'AUTO' / undefined means the LLM is free to pick.
  if (input.preferredSecondary && input.preferredSecondary !== 'AUTO') {
    if (input.preferredSecondary === 'NONE') {
      goalLines.push(`Athlete picked at check-in — secondary comp lift: NONE. Do not include any secondary squat / bench / deadlift work today; the primary stands alone.`);
    } else {
      goalLines.push(`Athlete picked at check-in — secondary comp lift today: ${input.preferredSecondary}. This is an explicit override — do not substitute a different lift.`);
    }
  }
  sections.push(`# GOALS\n${goalLines.join('\n')}`);

  // ── 1c. Active arc — the binding frame for this session ──────────────────
  // The chat coach reads the arc on every turn (see buildArcSection in
  // coach.ts). Without this section the author defaults to its powerlifting
  // training prior and overwrites the arc-aware deterministic baseline.
  const activeArc = await getActiveArc().catch(() => null);

  // ── Compute hard constraints up-front so they can be surfaced AND used by
  // the post-validator in session-author.ts. The arcMode + cap come from the
  // engine's resolveArcMode so the LLM is bound by the same routing the
  // deterministic baseline already followed.
  const arcMode = resolveArcMode(activeArc?.priorities);
  const exerciseCap = arcMode === 'BARBELL' ? 8 : arcMode === 'CALISTHENICS' ? 7 : 6;
  const arcHasCompetition = activeArc?.priorities.includes('COMPETITION') ?? false;
  const forbidsCompetitionSbd =
    activeArc != null
    && !arcHasCompetition
    && activeArc.primaryGoal !== 'COMPETITION_PREP';
  // Lock the primary lift the engine picked when the arc isn't BARBELL —
  // the LLM may not flip a CALISTHENICS UPPER to a barbell BENCH.
  const lockedPrimary: Lift | null =
    arcMode !== 'BARBELL' ? baseline.primaryLift : null;

  // Hard constraints surfaced at the TOP so the LLM reads them first. These
  // are also enforced post-hoc in session-author.ts — any violation triggers
  // a fallback to the deterministic baseline.
  const hardConstraints: string[] = [];
  hardConstraints.push(
    `EXERCISE CEILING — TOTAL: ${exerciseCap}. Count every row you author (remedial prep + primary + secondary + variations + accessories). Do NOT exceed this number. If you would need more, drop the lowest-priority accessory.`,
  );
  if (lockedPrimary) {
    hardConstraints.push(
      `PRIMARY LIFT IS LOCKED: "${lockedPrimary}". The active arc routed to this primary via the engine's arc-aware selector — you may NOT substitute a different lift. UPPER means a weighted vertical pull (weighted pull-up, weighted chin) or vertical push as appropriate; LOWER means a unilateral or weighted-calisthenics leg movement (pistol squat, Bulgarian split squat, weighted step-up); FULL means a full-body movement. Build the session around this primary.`,
    );
  }
  if (forbidsCompetitionSbd) {
    hardConstraints.push(
      `NO COMPETITION SBD: The active arc deprioritizes COMPETITION. Do NOT include "Competition Back Squat", "Competition Bench Press", or "Competition Deadlift" — or any near-equivalent ("Comp Squat", "Comp Bench", etc.) — as primary, secondary, or variation work. Heavy SBD belongs on a Back-to-Powerlifting / COMPETITION arc, not here. A non-comp barbell variation (paused, tempo, box, deficit) at moderate intensity is acceptable if it serves the arc.`,
    );
  }
  sections.push(`# HARD CONSTRAINTS (your output will be REJECTED if any are violated)\n${hardConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);

  if (activeArc) {
    const day = arcDayCount(activeArc, dateStr);
    const priorityList = activeArc.priorities.length > 0
      ? activeArc.priorities.map((p) => ARC_PRIORITY_LABELS[p] ?? p).join(' > ')
      : '(none specified)';
    const deprioritized = activeArc.deprioritized.length > 0
      ? activeArc.deprioritized.map((p) => ARC_PRIORITY_LABELS[p] ?? p).join(', ')
      : 'none';
    const arcConstraints = activeArc.constraints.length > 0
      ? activeArc.constraints.map((c) => ARC_CONSTRAINT_LABELS[c] ?? c).join(', ')
      : 'none';
    const directive = activeArc.coachDirective.trim() || '(no specific directive set)';
    const budgetLine = activeArc.weeklyTimeBudgetMin
      ? `Weekly time budget: ${activeArc.weeklyTimeBudgetMin} min.`
      : 'No weekly time cap.';
    const competitionMode = activeArc.priorities.includes('COMPETITION');
    const phasingLine = competitionMode
      ? 'Macrocycle framing: COMPETITION mode — the linear powerlifting macrocycle applies (accumulation → intensification → realization). Meet-prep vocabulary and peak timing are appropriate.'
      : 'Macrocycle framing: LONGEVITY mode — open-ended sustainable rhythm. Do NOT frame this session around "weeks out", peaking, realization, or meet prep. Strength compounds through consistent dosed work.';
    sections.push(`# ACTIVE ARC (binding frame)
"${activeArc.name}" — started ${activeArc.startDate}, day ${day}.
Intent: ${activeArc.intent.trim()}
Primary goal: ${activeArc.primaryGoal}.
Priorities (ordered, dominant first): ${priorityList}.
Deprioritized: ${deprioritized}.
Constraints: ${arcConstraints}. ${budgetLine}
Athlete's directive to you: ${directive}
${phasingLine}

The arc IS the frame. Every exercise must serve its intent and ordered priorities. Do NOT silently push generic powerlifting on a "Get Healthy", "Mobility Rebuild", or other non-competition arc. If a CALISTHENICS-dominant arc is active, the primary should be UPPER or LOWER (weighted pull-up, pistol, etc.) — not SBD. If MOBILITY or INJURY_HEALING leads the priority list, lean on REMEDIAL_KNOWLEDGE and FRC mobility, and treat barbell + weighted-calisthenics strength as co-equal.`);
  }

  // ── 1d. Active injuries — hard constraints on exercise selection ──────────
  // Structured Injury rows are the source of truth (AthleteMemory(kind=INJURY)
  // is a fallback annotation only). The author must respect contraindicated
  // patterns and constraints, and slot remedial work per REMEDIAL_KNOWLEDGE.
  const activeInjuries = await listActiveInjuries().catch(() => []);
  if (activeInjuries.length > 0) {
    const injuryLines = activeInjuries.map((inj, i) => {
      const regions = inj.regions.length > 0
        ? inj.regions.map((r) => BODY_REGION_LABELS[r] ?? r).join(', ')
        : '—';
      const constraintsStr = inj.constraints.length > 0
        ? inj.constraints.map((c) => INJURY_CONSTRAINT_LABELS[c] ?? c).join(', ')
        : '—';
      const contraPatterns = inj.contraindicatedPatterns?.length
        ? inj.contraindicatedPatterns.map((p) => INJURY_MOVEMENT_PATTERN_LABELS[p] ?? p).join(', ')
        : '—';
      const preferredPatterns = inj.preferredPatterns?.length
        ? inj.preferredPatterns.map((p) => INJURY_MOVEMENT_PATTERN_LABELS[p] ?? p).join(', ')
        : '—';
      const statusLabel = INJURY_STATUS_LABELS[inj.status] ?? inj.status;
      return `${i + 1}. ${inj.label} — ${statusLabel}, severity ${inj.severity}/5. Regions: ${regions}. Constraints: ${constraintsStr}. Contraindicated patterns: ${contraPatterns}. Preferred patterns: ${preferredPatterns}.`;
    });
    sections.push(`# ACTIVE INJURIES (${activeInjuries.length} — hard constraints)
${injuryLines.join('\n')}

These are structured injury rows — the source of truth for what the athlete cannot do today. Never load a contraindicated movement pattern. For tendon / chronic complaints, slot heavy-slow-resistance (3-1-3 tempo, ~70 % 1RM) or isometric remedial work into accessory positions per REMEDIAL_KNOWLEDGE — not static stretching. For ACUTE / SUBACUTE or severity-4+ lower-body injuries, no jumping or explosive lower-body work today.`);
  }

  // ── 2. Athlete memories — durable instructions from prior coach chats ─────
  const memoryQuery = [
    baseline.primaryLift,
    ...(baseline.secondaryLifts ?? []),
    block.blockType,
    baseline.sessionType,
    primaryDisc,
    ...secondaryDisc,
  ].join(' ').toLowerCase();
  const memories = await retrieveRelevantMemories(memoryQuery, 12);
  const memoryCount = memories.length;
  if (memoryCount > 0) {
    const memLines = memories.map(
      (m, i) => `${i + 1}. [${m.kind}] ${m.content}${m.tags.length ? ` (${m.tags.join(', ')})` : ''}`,
    );
    sections.push(`# ATHLETE MEMORIES (${memoryCount} active — you MUST honour each)
Durable instructions from prior conversations. Treat them as constraints on what you author. A memory that says "no unilateral movements" or "include streetlift work" or "returning from layoff" is a hard rule, not advisory.

${memLines.join('\n')}`);
  }

  // ── 3. Program map — current cycle + block position ──────────────────────
  const cycle = await db.cycles.filter((c) => c.status === 'ACTIVE').first();
  if (cycle) {
    const allBlocks = await db.blocks
      .where('cycleId').equals(cycle.id)
      .sortBy('weekStart');
    const blockLines = allBlocks.map((b) => {
      const isCurrent = b.id === block.id;
      const totalWeeks = b.weekEnd - b.weekStart + 1;
      const weekInBlock = isCurrent ? cycle.currentWeek - b.weekStart + 1 : null;
      return `  ${isCurrent ? '▶' : ' '} ${b.blockType} (weeks ${b.weekStart}–${b.weekEnd}, ${totalWeeks}w) | vol×${b.volumeTarget} | int${Math.round(b.intensityTarget * 100)}%${isCurrent && weekInBlock !== null ? ` ← CURRENT (week ${weekInBlock}/${totalWeeks})` : ''}`;
    });
    let programMap = `Cycle: ${cycle.totalWeeks} weeks total, currently week ${cycle.currentWeek}\n${blockLines.join('\n')}`;

    const meet = await db.meets.filter((m) => m.status === 'UPCOMING').first();
    if (meet) {
      const daysLeft = Math.ceil((new Date(meet.date).getTime() - Date.now()) / 86_400_000);
      programMap += `\nUpcoming meet: "${meet.name}" in ${daysLeft} days (${meet.federation}, ${meet.weightClass} kg)`;
    }
    sections.push(`# PROGRAM MAP\n${programMap}`);
  }

  // ── 4. Readiness today + 14-day trend ────────────────────────────────────
  const [todayReadiness, recentReadiness] = await Promise.all([
    db.readiness.where('date').equals(dateStr).first(),
    db.readiness.orderBy('date').reverse().limit(14).toArray(),
  ]);
  const rdLines: string[] = [];
  if (todayReadiness) {
    const parts = [`Score: ${todayReadiness.readinessScore}/100`];
    if (todayReadiness.sleepHours)  parts.push(`sleep ${todayReadiness.sleepHours}h (quality ${todayReadiness.sleepQuality}/5)`);
    if (todayReadiness.energy)      parts.push(`energy ${todayReadiness.energy}/5`);
    if (todayReadiness.motivation)  parts.push(`motivation ${todayReadiness.motivation}/5`);
    if (todayReadiness.soreness)    parts.push(`soreness ${todayReadiness.soreness}/5`);
    if (todayReadiness.stress)      parts.push(`stress ${todayReadiness.stress}/5`);
    if (todayReadiness.hrv)         parts.push(`HRV ${todayReadiness.hrv}ms${todayReadiness.hrvDeviation !== undefined ? ` (${todayReadiness.hrvDeviation > 0 ? '+' : ''}${todayReadiness.hrvDeviation.toFixed(1)}% vs 7d avg)` : ''}`);
    if (todayReadiness.note)        parts.push(`note: "${todayReadiness.note}"`);
    if (todayReadiness.sessionModality && todayReadiness.sessionModality !== 'FULL') {
      parts.push(`modality: ${todayReadiness.sessionModality.toLowerCase()}`);
    }
    rdLines.push(`Today: ${parts.join(' | ')}`);
  } else {
    rdLines.push(`Today: composite readiness ${readinessScore}/100 (no detailed check-in row found)`);
  }
  if (recentReadiness.length >= 3) {
    const scores = recentReadiness.map((r) => r.readinessScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const trend = scores[0] > scores[scores.length - 1] ? '↑ improving'
                : scores[0] < scores[scores.length - 1] ? '↓ declining'
                : '→ stable';
    rdLines.push(`14-day avg: ${avg}/100 | trend: ${trend} | scores (newest first): [${scores.join(', ')}]`);
  }
  sections.push(`# READINESS\n${rdLines.join('\n')}`);

  // ── Per-lift recency (FRESH / RECOVERED / OVERDUE / STACKED) ─────────────
  // Drives the recent-exposure protocol from STRUCTURE_KNOWLEDGE.
  const exposures = await loadRecentLiftExposures(dateStr);
  if (exposures.length > 0) {
    sections.push(
      `# PER-LIFT RECENCY (use with the recent-exposure protocol)\n${formatExposureLines(exposures).map((l) => `  ${l}`).join('\n')}`,
    );
  }

  // ── 5. Recent training (last 21 completed sessions) ──────────────────────
  const all = await db.sessions.filter((s) => s.status === 'COMPLETED').toArray();
  const last21 = all
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, 21);
  if (last21.length > 0) {
    const summaries = await Promise.all(last21.map(async (s) => {
      const [sets, compExercises, accExercises] = await Promise.all([
        db.sets
          .where('sessionId').equals(s.id)
          .filter((sl) => sl.rpeLogged !== undefined)
          .toArray(),
        db.exercises
          .where('sessionId').equals(s.id)
          .filter((e) => e.exerciseType === 'COMPETITION')
          .sortBy('order'),
        db.exercises
          .where('sessionId').equals(s.id)
          .filter((e) => e.exerciseType === 'ACCESSORY' || e.exerciseType === 'VARIATION')
          .sortBy('order'),
      ]);
      const avgRpe = sets.length > 0
        ? (sets.reduce((acc, sl) => acc + (sl.rpeLogged ?? 0), 0) / sets.length).toFixed(1)
        : '—';
      const totalVol = sets.reduce((sum, sl) => sum + sl.loadKg * sl.reps, 0);
      const volStr = totalVol > 0 ? `${Math.round(totalVol / 1000 * 10) / 10}t` : '—';
      const liftLabel = (s.secondaryLifts && s.secondaryLifts.length > 0)
        ? `${s.primaryLift}+${s.secondaryLifts.join('+')}`
        : s.primaryLift;
      const compNames = compExercises.map((e) => e.name).join(', ');
      const compTail = compNames ? ` | comp: ${compNames}` : '';
      const accNames = accExercises.map((e) => e.name).join(', ');
      const accTail = accNames ? ` | acc: ${accNames}` : '';
      return `  ${s.scheduledDate} | ${liftLabel.padEnd(16)} | ${s.sessionType.padEnd(14)} | RPE ${avgRpe} | vol ${volStr} | ${sets.length} sets${compTail}${accTail}`;
    }));
    sections.push(`# RECENT TRAINING (last ${last21.length})
The 'acc:' list is the accessory + variation lineup actually run in each session. Use it to decide which accessories to repeat today (default behaviour) versus rotate (only with cause — see system prompt).
${summaries.join('\n')}`);
  }

  // ── 6. Rule-engine baseline (informational only) ──────────────────────────
  const baseLines = baseline.exercises.map(
    (e) => `  ${e.order}. ${e.name} (${e.exerciseType}): ${e.sets}×${e.reps} @ RPE ${e.rpeTarget}, ~${e.estimatedLoadKg} kg${e.notes ? ` — ${e.notes}` : ''}`,
  );
  sections.push(`# RULE-ENGINE BASELINE (starting point only — feel free to discard or restructure)
Date: ${dateStr}
Type: ${baseline.sessionType}
Primary: ${baseline.primaryLift}${baseline.secondaryLifts?.length ? `  |  Secondary: ${baseline.secondaryLifts.join(', ')}` : ''}
Engine note: "${baseline.coachNote}"

Exercises:
${baseLines.join('\n')}`);

  // ── 7. Knowledge base — full body of coaching principles ─────────────────
  sections.push(`# COACHING KNOWLEDGE BASE\n${getFullKnowledge()}`);

  return {
    context: sections.join('\n\n'),
    memoryCount,
    meta: { arcMode, exerciseCap, lockedPrimary, forbidsCompetitionSbd },
  };
}
