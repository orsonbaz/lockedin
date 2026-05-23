/**
 * Injury system — single source of truth for injury reads + writes.
 *
 * The swap engine consults `listActiveInjuries()` on every session
 * generation; the coach reads it on every turn. AthleteMemory(kind=INJURY)
 * stays as a free-text annotation layer (the v8 migration backfilled
 * structured Injury rows from those memories) but no longer drives gating.
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  Injury,
  InjuryStatus,
  InjurySeverity,
  InjuryConstraint,
  InjuryMovementPattern,
  BodyRegion,
  SymptomLog,
  PainScale,
  StiffnessScale,
  IrritabilityLevel,
} from '@/lib/db/types';

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Returns every non-resolved injury. The swap engine uses this list to filter
 * candidate exercises; the coach uses it to inject injury context.
 */
export async function listActiveInjuries(): Promise<Injury[]> {
  const rows = await db.injuries.toArray();
  return rows
    .filter((i) => i.status !== 'RESOLVED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAllInjuries(): Promise<Injury[]> {
  const rows = await db.injuries.toArray();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getInjury(id: string): Promise<Injury | undefined> {
  return db.injuries.get(id);
}

/** Symptom history for an injury, newest first. */
export async function listSymptoms(injuryId: string): Promise<SymptomLog[]> {
  const rows = await db.symptomLogs.where('injuryId').equals(injuryId).toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Latest symptom log per injury (used by the home banner). */
export async function latestSymptomFor(injuryId: string): Promise<SymptomLog | undefined> {
  const all = await listSymptoms(injuryId);
  return all[0];
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateInjuryInput {
  label: string;
  regions: BodyRegion[];
  status?: InjuryStatus;
  severity?: InjurySeverity;
  onsetDate?: string;
  contraindicatedPatterns?: InjuryMovementPattern[];
  contraindicatedSwapGroups?: string[];
  preferredPatterns?: InjuryMovementPattern[];
  constraints?: InjuryConstraint[];
  notes?: string;
}

export async function createInjury(input: CreateInjuryInput): Promise<Injury> {
  const nowIso = new Date().toISOString();
  const injury: Injury = {
    id: newId(),
    label: input.label.trim(),
    regions: input.regions,
    status: input.status ?? 'MANAGING',
    severity: input.severity ?? 3,
    onsetDate: input.onsetDate ?? today(),
    contraindicatedPatterns: input.contraindicatedPatterns ?? [],
    contraindicatedSwapGroups: input.contraindicatedSwapGroups ?? [],
    preferredPatterns: input.preferredPatterns ?? [],
    constraints: input.constraints ?? [],
    notes: input.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.injuries.add(injury);
  return injury;
}

export async function updateInjury(
  id: string,
  patch: Partial<Omit<Injury, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db.injuries.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function updateInjuryStatus(
  id: string,
  status: InjuryStatus,
): Promise<void> {
  const patch: Partial<Injury> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'RESOLVED') patch.resolvedDate = today();
  await db.injuries.update(id, patch);
}

export async function deleteInjury(id: string): Promise<void> {
  await db.transaction('rw', db.injuries, db.symptomLogs, async () => {
    await db.symptomLogs.where('injuryId').equals(id).delete();
    await db.injuries.delete(id);
  });
}

// ── Symptom logging ──────────────────────────────────────────────────────────

export interface LogSymptomInput {
  injuryId: string;
  painAtRest: PainScale;
  painUnderLoad: PainScale;
  stiffness: StiffnessScale;
  irritability: IrritabilityLevel;
  note?: string;
  date?: string;
}

export async function logSymptom(input: LogSymptomInput): Promise<SymptomLog> {
  const entry: SymptomLog = {
    id: newId(),
    injuryId: input.injuryId,
    date: input.date ?? today(),
    painAtRest: input.painAtRest,
    painUnderLoad: input.painUnderLoad,
    stiffness: input.stiffness,
    irritability: input.irritability,
    note: input.note,
    loggedAt: new Date().toISOString(),
  };
  await db.symptomLogs.add(entry);
  await db.injuries.update(input.injuryId, { updatedAt: entry.loggedAt });
  return entry;
}

// ── UI labels ────────────────────────────────────────────────────────────────

export const INJURY_STATUS_LABELS: Record<InjuryStatus, string> = {
  ACUTE:    'Acute',
  SUBACUTE: 'Subacute',
  CHRONIC:  'Chronic',
  MANAGING: 'Managing',
  REHAB:    'Rehab',
  RESOLVED: 'Resolved',
};

/** Sort order for status — hot stuff first. */
export const INJURY_STATUS_ORDER: InjuryStatus[] = [
  'ACUTE', 'SUBACUTE', 'REHAB', 'MANAGING', 'CHRONIC', 'RESOLVED',
];

export const INJURY_CONSTRAINT_LABELS: Record<InjuryConstraint, string> = {
  NO_AXIAL_LOAD:        'No axial load',
  NO_MAX_EFFORT:        'No max effort',
  TEMPO_ONLY:           'Tempo only',
  FULL_ROM_REQUIRED:    'Full ROM required',
  UNILATERAL_ONLY:      'Unilateral only',
  NO_OVERHEAD:          'No overhead',
  NO_BILATERAL_HINGE:   'No bilateral hinge',
  PAIN_FREE_RANGE_ONLY: 'Pain-free range only',
  ISOMETRIC_PREFERRED:  'Isometric preferred',
  HEAVY_SLOW_RESISTANCE:'Heavy slow resistance',
};

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  NECK:            'Neck',
  CERVICAL_SPINE:  'Cervical spine',
  T_SPINE:         'T-spine',
  L_SPINE:         'L-spine',
  SI_JOINT:        'SI joint',
  LEFT_SHOULDER:   'L shoulder',
  RIGHT_SHOULDER:  'R shoulder',
  LEFT_ELBOW:      'L elbow',
  RIGHT_ELBOW:    'R elbow',
  LEFT_WRIST:      'L wrist',
  RIGHT_WRIST:     'R wrist',
  LEFT_HIP:        'L hip',
  RIGHT_HIP:       'R hip',
  LEFT_KNEE:       'L knee',
  RIGHT_KNEE:      'R knee',
  LEFT_ANKLE:      'L ankle',
  RIGHT_ANKLE:     'R ankle',
  CORE:            'Core',
  PELVIC_FLOOR:    'Pelvic floor',
  OTHER:           'Other',
};

export const INJURY_MOVEMENT_PATTERN_LABELS: Record<InjuryMovementPattern, string> = {
  SQUAT:           'Squat',
  HINGE:           'Hinge',
  HORIZONTAL_PUSH: 'Horizontal push',
  VERTICAL_PUSH:   'Vertical push',
  HORIZONTAL_PULL: 'Horizontal pull',
  VERTICAL_PULL:   'Vertical pull',
  SINGLE_LEG:      'Single leg',
  CARRY:           'Carry',
  CORE:            'Core',
};

// ── Pure helpers (testable) ──────────────────────────────────────────────────

/**
 * Given a candidate exercise's movement pattern + swap groups + spinal load,
 * return:
 *   - blocked: true if any active injury hard-contraindicates this candidate
 *   - penalty: 0-100 deduction to apply to the swap engine's score for soft
 *     constraints (NO_AXIAL_LOAD against high spinal load, etc.)
 *   - boost: 0-100 boost when the candidate matches a preferred pattern or
 *     constraint-friendly profile (tempo, single-leg, etc.)
 *   - reasons: short strings to surface in the swap card's reason text
 */
export interface InjuryFilterResult {
  blocked: boolean;
  penalty: number;
  boost: number;
  reasons: string[];
}

export interface InjuryFilterCandidate {
  movementPattern: string;
  swapGroups: readonly string[];
  spinalLoad: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** True if the exercise is tagged with a tempo (e.g. "3-1-0"). */
  hasTempo?: boolean;
  /** True for SINGLE_LEG_* swap groups. */
  isUnilateral?: boolean;
  /** True for overhead vertical pushes — used by NO_OVERHEAD. */
  isOverhead?: boolean;
}

export function applyInjuryFilters(
  candidate: InjuryFilterCandidate,
  injuries: readonly Injury[],
): InjuryFilterResult {
  if (injuries.length === 0) {
    return { blocked: false, penalty: 0, boost: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let penalty = 0;
  let boost = 0;

  for (const inj of injuries) {
    // Hard contraindications
    if (inj.contraindicatedPatterns.includes(candidate.movementPattern as InjuryMovementPattern)) {
      return {
        blocked: true,
        penalty: 0,
        boost: 0,
        reasons: [`${inj.label} contraindicates ${candidate.movementPattern.toLowerCase().replace('_', ' ')}`],
      };
    }
    for (const grp of inj.contraindicatedSwapGroups) {
      if (candidate.swapGroups.includes(grp)) {
        return {
          blocked: true,
          penalty: 0,
          boost: 0,
          reasons: [`${inj.label} contraindicates the "${grp}" swap group`],
        };
      }
    }

    // Soft constraints — penalties
    for (const c of inj.constraints) {
      switch (c) {
        case 'NO_AXIAL_LOAD':
          if (candidate.spinalLoad === 'HIGH') {
            penalty += 40;
            reasons.push(`NO_AXIAL_LOAD vs high-load (${inj.label})`);
          } else if (candidate.spinalLoad === 'MEDIUM') {
            penalty += 15;
          }
          break;
        case 'NO_OVERHEAD':
          if (candidate.isOverhead) {
            penalty += 50;
            reasons.push(`NO_OVERHEAD (${inj.label})`);
          }
          break;
        case 'NO_BILATERAL_HINGE':
          if (candidate.movementPattern === 'HINGE' && !candidate.isUnilateral) {
            penalty += 35;
            reasons.push(`NO_BILATERAL_HINGE (${inj.label})`);
          }
          break;
        case 'UNILATERAL_ONLY':
          if (candidate.isUnilateral) {
            boost += 15;
            reasons.push(`unilateral preferred (${inj.label})`);
          } else {
            penalty += 25;
          }
          break;
        case 'TEMPO_ONLY':
          if (candidate.hasTempo) {
            boost += 15;
            reasons.push(`tempo preferred (${inj.label})`);
          } else {
            penalty += 25;
          }
          break;
        case 'HEAVY_SLOW_RESISTANCE':
          if (candidate.hasTempo) {
            boost += 10;
            reasons.push(`HSR-friendly (${inj.label})`);
          }
          break;
        case 'NO_MAX_EFFORT':
        case 'FULL_ROM_REQUIRED':
        case 'PAIN_FREE_RANGE_ONLY':
        case 'ISOMETRIC_PREFERRED':
          // These are signals for the coach + load math, not the swap engine
          // candidate scorer. The swap engine doesn't see RPE targets.
          break;
      }
    }

    // Preferred patterns
    if (inj.preferredPatterns.includes(candidate.movementPattern as InjuryMovementPattern)) {
      boost += 12;
      reasons.push(`preferred pattern for ${inj.label}`);
    }
  }

  return { blocked: false, penalty, boost, reasons };
}
