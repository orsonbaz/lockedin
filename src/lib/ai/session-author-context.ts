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
import type { AuthorInput } from './session-author';

export async function buildAuthorContext(
  input: AuthorInput,
): Promise<{ context: string; memoryCount: number }> {
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

  // ── 5. Recent training (last 21 completed sessions) ──────────────────────
  const all = await db.sessions.filter((s) => s.status === 'COMPLETED').toArray();
  const last21 = all
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, 21);
  if (last21.length > 0) {
    const summaries = await Promise.all(last21.map(async (s) => {
      const [sets, compExercises] = await Promise.all([
        db.sets
          .where('sessionId').equals(s.id)
          .filter((sl) => sl.rpeLogged !== undefined)
          .toArray(),
        db.exercises
          .where('sessionId').equals(s.id)
          .filter((e) => e.exerciseType === 'COMPETITION')
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
      return `  ${s.scheduledDate} | ${liftLabel.padEnd(16)} | ${s.sessionType.padEnd(14)} | RPE ${avgRpe} | vol ${volStr} | ${sets.length} sets${compTail}`;
    }));
    sections.push(`# RECENT TRAINING (last ${last21.length})\n${summaries.join('\n')}`);
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

  return { context: sections.join('\n\n'), memoryCount };
}
