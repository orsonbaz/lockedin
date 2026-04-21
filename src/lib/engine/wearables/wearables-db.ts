/**
 * wearables-db.ts — persist parsed wearable payloads transactionally.
 *
 * One `saveImport` call creates a single `WearableImport` row plus N
 * `WearableMetric` rows under one Dexie transaction. Re-importing the same
 * file short-circuits via `fileHash` so restoring backups / re-uploading
 * exports doesn't double-count days.
 *
 * Per-day metrics are replaced (upserted by `date+metricKind+source`) so the
 * most recent import wins when the athlete reimports an overlapping range.
 */

import { db, newId } from '@/lib/db/database';
import type {
  HRVSource,
  WearableImport,
  WearableMetric,
  WearableSource,
} from '@/lib/db/types';
import { calcHrvBaseline, calcHrvDeviation, type ReadinessInput } from '../readiness';
import { hashPayload, type ParsedPayload } from './parse';

const SOURCE_TO_HRV_SOURCE: Record<WearableSource, HRVSource> = {
  APPLE_HEALTH: 'APPLE_HEALTH',
  OURA:         'OURA',
  WHOOP:        'WHOOP',
  MANUAL_CSV:   'MANUAL',
};

export interface SaveImportArgs {
  source:  WearableSource;
  /** Raw text used to compute the idempotency hash. */
  rawText: string;
  parsed:  ParsedPayload;
  label?:  string;
}

export interface SaveImportResult {
  importId:    string;
  metricCount: number;
  /** True when the same file was previously imported — no writes performed. */
  skipped:     boolean;
  fileHash:    string;
}

/**
 * Idempotently persist a parsed wearable payload.
 *
 * Flow:
 *  1. Hash `rawText`; if an existing import has the same hash, return it.
 *  2. Otherwise, within one rw transaction:
 *     - Write the `WearableImport` row.
 *     - For each metric's (date, metricKind, source) triple, delete any
 *       prior rows (from earlier imports) then bulkPut the new ones.
 */
export async function saveImport(args: SaveImportArgs): Promise<SaveImportResult> {
  const { source, rawText, parsed, label } = args;
  const fileHash = await hashPayload(rawText);

  const existing = await db.wearableImports.where('fileHash').equals(fileHash).first();
  if (existing) {
    return {
      importId:    existing.id,
      metricCount: existing.recordCount,
      skipped:     true,
      fileHash,
    };
  }

  const importId = newId();
  const importRow: WearableImport = {
    id:          importId,
    source,
    importedAt:  new Date().toISOString(),
    rangeStart:  parsed.rangeStart,
    rangeEnd:    parsed.rangeEnd,
    recordCount: parsed.metrics.length,
    fileHash,
    ...(label ? { label } : {}),
  };

  await db.transaction('rw', [db.wearableImports, db.wearableMetrics], async () => {
    await db.wearableImports.put(importRow);

    if (parsed.metrics.length === 0) return;

    // Collect the unique (date, metricKind, source) triples we're about to
    // write, then purge prior rows so today's import wins.
    const triples = new Set<string>();
    for (const m of parsed.metrics) {
      triples.add(`${m.date}|${m.metricKind}|${m.source}`);
    }
    for (const key of triples) {
      const [date, metricKind, src] = key.split('|');
      const prior = await db.wearableMetrics
        .where('[date+metricKind]')
        .equals([date, metricKind])
        .toArray();
      const priorIds = prior
        .filter((p) => p.source === src)
        .map((p) => p.id);
      if (priorIds.length) await db.wearableMetrics.bulkDelete(priorIds);
    }

    const rows: WearableMetric[] = parsed.metrics.map((m) => ({
      ...m,
      id:       newId(),
      importId,
    }));
    await db.wearableMetrics.bulkPut(rows);
  });

  return {
    importId,
    metricCount: parsed.metrics.length,
    skipped:     false,
    fileHash,
  };
}

/** Deletes an import and every metric row tagged with its importId. */
export async function deleteImport(importId: string): Promise<void> {
  await db.transaction('rw', [db.wearableImports, db.wearableMetrics], async () => {
    const metricIds = await db.wearableMetrics
      .where('importId')
      .equals(importId)
      .primaryKeys();
    if (metricIds.length) await db.wearableMetrics.bulkDelete(metricIds as string[]);
    await db.wearableImports.delete(importId);
  });
}

/** Newest imports first. */
export async function listImports(limit = 20): Promise<WearableImport[]> {
  return db.wearableImports
    .orderBy('importedAt')
    .reverse()
    .limit(limit)
    .toArray();
}

/**
 * Latest metric of each kind within [startDate, endDate] inclusive.
 * Returned map: metricKind → metric. Used by readiness + prompt snippets.
 */
export async function latestMetricsByKind(
  startDate: string,
  endDate: string,
): Promise<Partial<Record<WearableMetric['metricKind'], WearableMetric>>> {
  const rows = await db.wearableMetrics
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  const out: Partial<Record<WearableMetric['metricKind'], WearableMetric>> = {};
  for (const r of rows) {
    const cur = out[r.metricKind];
    if (!cur || r.date > cur.date) out[r.metricKind] = r;
  }
  return out;
}

// ── Readiness integration ────────────────────────────────────────────────────

export interface WearableReadinessResolution {
  /** Inputs to pass to `calcReadinessScore`. */
  input: ReadinessInput;
  /** Raw wearable HRV value (ms) that drove hrvDeviation, if any. */
  hrv?: number;
  /** Rolling 7d baseline of wearable HRV samples. */
  hrvBaseline7d?: number;
  /** Source tag for the HRV point, so `ReadinessRecord.hrvSource` is accurate. */
  hrvSource?: HRVSource;
  /** True when at least one field was populated from wearable data. */
  hasData: boolean;
}

function dateNDaysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Derive readiness inputs for `date` from stored wearable metrics.
 *
 * Preference ordering (plan spec: prefer wearables over manual):
 *   - HRV        → most recent HRV sample on or before `date`, with a 7-day
 *                  rolling baseline from the 7 days preceding `date`.
 *   - Sleep      → most recent SLEEP_HOURS + SLEEP_QUALITY on or before
 *                  `date` (quality score 0-100 mapped to 1-5).
 *   - Subjective → not sourced from wearables; callers merge with manual input.
 */
export async function resolveReadinessInputs(
  date: string,
): Promise<WearableReadinessResolution> {
  const windowStart = dateNDaysBefore(date, 7);
  const rows = await db.wearableMetrics
    .where('date')
    .between(windowStart, date, true, true)
    .toArray();

  if (rows.length === 0) {
    return { input: {}, hasData: false };
  }

  // HRV: pick the most recent HRV row ≤ date (tie-break by latest-write —
  // dedupe already ran in saveImport so one per day is expected).
  const hrvRows  = rows.filter((r) => r.metricKind === 'HRV').sort((a, b) => a.date.localeCompare(b.date));
  const latestHrv = hrvRows[hrvRows.length - 1];
  const baselineValues = hrvRows.slice(0, -1).map((r) => r.value);
  const baseline = calcHrvBaseline(baselineValues);
  const hrvDeviation =
    latestHrv && baseline !== undefined
      ? calcHrvDeviation(latestHrv.value, baseline)
      : undefined;

  // Sleep: only consider rows at or before `date`, pick the most recent.
  const pickLatestBefore = (kind: WearableMetric['metricKind']) =>
    rows
      .filter((r) => r.metricKind === kind && r.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop();

  const hoursRow   = pickLatestBefore('SLEEP_HOURS');
  const qualityRow = pickLatestBefore('SLEEP_QUALITY');

  // Map 0-100 sleep quality to the 1-5 scale used by ReadinessInput.
  let sleepQuality: number | undefined;
  if (qualityRow) {
    const q = qualityRow.value;
    sleepQuality =
      q >= 85 ? 5 :
      q >= 70 ? 4 :
      q >= 55 ? 3 :
      q >= 35 ? 2 : 1;
  }

  const input: ReadinessInput = {
    ...(hrvDeviation !== undefined ? { hrvDeviation } : {}),
    ...(hoursRow     ? { sleepHours:   hoursRow.value } : {}),
    ...(sleepQuality !== undefined ? { sleepQuality } : {}),
  };

  return {
    input,
    hrv:           latestHrv?.value,
    hrvBaseline7d: baseline,
    hrvSource:     latestHrv ? SOURCE_TO_HRV_SOURCE[latestHrv.source] : undefined,
    hasData:       !!(latestHrv || hoursRow || qualityRow),
  };
}

// ── Coach prompt section ─────────────────────────────────────────────────────

/**
 * Returns a compact "Wearable Signals (last 7d)" section body for the coach
 * prompt. Empty string when no wearable data exists — the renderer drops
 * empty sections so the prompt stays tight.
 */
export async function buildWearablesSection(charCap: number): Promise<string> {
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = dateNDaysBefore(endDate, 7);
  const rows = await db.wearableMetrics
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  if (rows.length === 0) return '';

  // Group by kind and keep the most recent per kind + the 7-day average.
  const byKind: Partial<Record<WearableMetric['metricKind'], WearableMetric[]>> = {};
  for (const r of rows) {
    (byKind[r.metricKind] ??= []).push(r);
  }

  const lines: string[] = [];
  const order: WearableMetric['metricKind'][] = [
    'HRV', 'RESTING_HR', 'SLEEP_HOURS', 'SLEEP_QUALITY',
    'RECOVERY_SCORE', 'STRAIN', 'RESPIRATORY_RATE', 'BODY_TEMP_DELTA',
  ];
  const labels: Record<WearableMetric['metricKind'], string> = {
    HRV:              'HRV',
    RESTING_HR:       'RHR',
    SLEEP_HOURS:      'Sleep',
    SLEEP_QUALITY:    'Sleep score',
    RECOVERY_SCORE:   'Recovery',
    STRAIN:           'Strain',
    RESPIRATORY_RATE: 'Resp rate',
    BODY_TEMP_DELTA:  'Temp Δ',
  };

  for (const kind of order) {
    const list = byKind[kind];
    if (!list || list.length === 0) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const latest = list[list.length - 1];
    const avg    = list.reduce((s, r) => s + r.value, 0) / list.length;
    const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));
    lines.push(
      `${labels[kind]}: ${fmt(latest.value)}${latest.unit} (today), 7d avg ${fmt(avg)}${latest.unit} — ${latest.source.toLowerCase().replace('_', ' ')}.`,
    );
  }

  if (lines.length === 0) return '';
  const header = 'Values below are auto-imported from the athlete\'s wearable.';
  const body = `${header}\n${lines.join('\n')}`;
  return body.length <= charCap ? body : body.slice(0, charCap - 1).trimEnd() + '…';
}
