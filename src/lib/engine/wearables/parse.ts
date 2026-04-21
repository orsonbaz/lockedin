/**
 * parse.ts — normalize raw exports from Apple Health / Oura / Whoop / CSV
 * into canonical WearableMetric rows.
 *
 * Principles:
 *   - Pure functions — no Dexie, no fetch. They take a parsed JSON value (or
 *     a CSV string) and return metric rows. Callers persist via wearables-db.ts.
 *   - Be defensive: these schemas are user-configurable (Apple Health Auto
 *     Export in particular). We skip malformed rows rather than throwing.
 *   - Deduplicate by (date, metricKind): keep the last value per day so
 *     multiple samples don't stack.
 */

import type {
  WearableMetric,
  WearableMetricKind,
  WearableSource,
} from '@/lib/db/types';

export interface ParsedPayload {
  metrics: RawMetric[];
  rangeStart: string;
  rangeEnd:   string;
}

/** Internal type — lacks `id` and `importId`; assembled by the DB layer. */
export type RawMetric = Omit<WearableMetric, 'id' | 'importId'>;

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(input: string | number | undefined): string | null {
  if (input === undefined || input === null) return null;
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function dedupeLatest(rows: RawMetric[]): RawMetric[] {
  const map = new Map<string, RawMetric>();
  for (const r of rows) {
    const key = `${r.date}|${r.metricKind}|${r.source}`;
    map.set(key, r);  // later writes win — upstream ordering is chronological per source
  }
  return Array.from(map.values());
}

function summarizeRange(rows: RawMetric[]): { rangeStart: string; rangeEnd: string } {
  if (rows.length === 0) {
    const today = toDateStr(new Date().toISOString()) ?? '1970-01-01';
    return { rangeStart: today, rangeEnd: today };
  }
  const dates = rows.map((r) => r.date).sort();
  return { rangeStart: dates[0], rangeEnd: dates[dates.length - 1] };
}

// ── Apple Health — "Auto Export" JSON format ──────────────────────────────
//
// Schema (simplified) from the Auto Export app:
//   {
//     data: {
//       metrics: [
//         { name: 'heart_rate_variability', units: 'ms', data: [{ date: '...', qty: 56 }]
//         { name: 'resting_heart_rate',     units: 'count/min', data: [...] }
//         { name: 'sleep_analysis',         data: [{ date, inBed, asleep }] }
//         ...
//       ]
//     }
//   }
//
// The ecosystem has several variants. We detect by key presence and skip
// metrics we don't recognize instead of erroring.

interface AppleMetricRow {
  date?: string;
  qty?: number;
  inBed?: number;
  asleep?: number;
  value?: number;
  source?: string;
}

interface AppleMetric {
  name?: string;
  units?: string;
  data?: AppleMetricRow[];
}

const APPLE_NAME_MAP: Record<string, { kind: WearableMetricKind; unit: string }> = {
  heart_rate_variability: { kind: 'HRV',              unit: 'ms' },
  hrv:                    { kind: 'HRV',              unit: 'ms' },
  resting_heart_rate:     { kind: 'RESTING_HR',       unit: 'bpm' },
  respiratory_rate:       { kind: 'RESPIRATORY_RATE', unit: 'breaths/min' },
  apple_sleeping_wrist_temperature: { kind: 'BODY_TEMP_DELTA', unit: '°C' },
};

export function parseAppleHealth(raw: unknown): ParsedPayload {
  const rows: RawMetric[] = [];
  const data = (raw as { data?: { metrics?: AppleMetric[] } })?.data;
  const metrics: AppleMetric[] = data?.metrics ?? [];

  for (const m of metrics) {
    const name = (m.name ?? '').toLowerCase();
    const mapping = APPLE_NAME_MAP[name];
    const samples = m.data ?? [];

    if (mapping) {
      for (const s of samples) {
        const date = toDateStr(s.date);
        const value = asNumber(s.qty ?? s.value);
        if (!date || value === null) continue;
        rows.push({ date, metricKind: mapping.kind, value, unit: mapping.unit, source: 'APPLE_HEALTH' });
      }
    } else if (name === 'sleep_analysis') {
      // Auto Export sometimes reports hours under `asleep` in hours, other times
      // in seconds. Heuristic: > 24 → treat as seconds.
      for (const s of samples) {
        const date = toDateStr(s.date);
        const asleep = asNumber(s.asleep);
        if (!date || asleep === null) continue;
        const hours = asleep > 24 ? asleep / 3600 : asleep;
        rows.push({ date, metricKind: 'SLEEP_HOURS', value: Math.round(hours * 10) / 10, unit: 'h', source: 'APPLE_HEALTH' });
      }
    }
  }

  const deduped = dedupeLatest(rows);
  return { metrics: deduped, ...summarizeRange(deduped) };
}

// ── Oura — v2 API-style JSON export ──────────────────────────────────────
//
// Oura's "daily sleep" and "daily readiness" endpoints return:
//   { data: [{ day: 'YYYY-MM-DD', score: N, contributors: {...} }] }
// Users commonly save the combined daily JSON. We look for the two document
// shapes we care about: sleep and readiness.

interface OuraDailyDoc {
  day?: string;
  score?: number;
  average_hrv?: number;
  lowest_heart_rate?: number;
  total_sleep_duration?: number;
  respiratory_rate?: number;
}

export function parseOura(raw: unknown): ParsedPayload {
  const rows: RawMetric[] = [];
  const container = raw as {
    sleep?: { data?: OuraDailyDoc[] };
    readiness?: { data?: OuraDailyDoc[] };
    daily_sleep?: { data?: OuraDailyDoc[] };
    daily_readiness?: { data?: OuraDailyDoc[] };
    data?: OuraDailyDoc[];
  };

  const sleepDocs   = container.sleep?.data ?? container.daily_sleep?.data ?? [];
  const readyDocs   = container.readiness?.data ?? container.daily_readiness?.data ?? [];
  // Some Oura exports just dump a flat `data` array that mixes both shapes.
  const flatDocs    = container.data ?? [];

  for (const d of sleepDocs) {
    const date = toDateStr(d.day);
    if (!date) continue;
    if (d.total_sleep_duration !== undefined) {
      rows.push({ date, metricKind: 'SLEEP_HOURS', value: Math.round((d.total_sleep_duration / 3600) * 10) / 10, unit: 'h', source: 'OURA' });
    }
    if (d.average_hrv !== undefined) {
      rows.push({ date, metricKind: 'HRV', value: d.average_hrv, unit: 'ms', source: 'OURA' });
    }
    if (d.lowest_heart_rate !== undefined) {
      rows.push({ date, metricKind: 'RESTING_HR', value: d.lowest_heart_rate, unit: 'bpm', source: 'OURA' });
    }
    if (d.respiratory_rate !== undefined) {
      rows.push({ date, metricKind: 'RESPIRATORY_RATE', value: d.respiratory_rate, unit: 'breaths/min', source: 'OURA' });
    }
    if (d.score !== undefined) {
      rows.push({ date, metricKind: 'SLEEP_QUALITY', value: d.score, unit: '%', source: 'OURA' });
    }
  }

  for (const d of readyDocs) {
    const date = toDateStr(d.day);
    if (!date) continue;
    if (d.score !== undefined) {
      rows.push({ date, metricKind: 'RECOVERY_SCORE', value: d.score, unit: '%', source: 'OURA' });
    }
  }

  for (const d of flatDocs) {
    const date = toDateStr(d.day);
    if (!date) continue;
    if (d.score !== undefined && d.total_sleep_duration === undefined) {
      // Flat score docs without a sleep-duration hint are assumed to be readiness.
      rows.push({ date, metricKind: 'RECOVERY_SCORE', value: d.score, unit: '%', source: 'OURA' });
    }
  }

  const deduped = dedupeLatest(rows);
  return { metrics: deduped, ...summarizeRange(deduped) };
}

// ── Whoop — export JSON from the developer API / user export ─────────────

interface WhoopRecovery {
  created_at?: string;
  score?: { recovery_score?: number; hrv_rmssd_milli?: number; resting_heart_rate?: number };
}
interface WhoopCycle {
  start?: string;
  score?: { strain?: number };
}
interface WhoopSleep {
  start?: string;
  end?: string;
  score?: { sleep_performance_percentage?: number; total_in_bed_time_milli?: number };
}

export function parseWhoop(raw: unknown): ParsedPayload {
  const rows: RawMetric[] = [];
  const container = raw as {
    recovery?: WhoopRecovery[];
    cycles?: WhoopCycle[];
    sleep?: WhoopSleep[];
  };

  for (const r of container.recovery ?? []) {
    const date = toDateStr(r.created_at);
    if (!date) continue;
    if (r.score?.recovery_score !== undefined) {
      rows.push({ date, metricKind: 'RECOVERY_SCORE', value: r.score.recovery_score, unit: '%', source: 'WHOOP' });
    }
    if (r.score?.hrv_rmssd_milli !== undefined) {
      rows.push({ date, metricKind: 'HRV', value: r.score.hrv_rmssd_milli, unit: 'ms', source: 'WHOOP' });
    }
    if (r.score?.resting_heart_rate !== undefined) {
      rows.push({ date, metricKind: 'RESTING_HR', value: r.score.resting_heart_rate, unit: 'bpm', source: 'WHOOP' });
    }
  }

  for (const c of container.cycles ?? []) {
    const date = toDateStr(c.start);
    if (!date) continue;
    if (c.score?.strain !== undefined) {
      rows.push({ date, metricKind: 'STRAIN', value: c.score.strain, unit: '/21', source: 'WHOOP' });
    }
  }

  for (const s of container.sleep ?? []) {
    const date = toDateStr(s.start);
    if (!date) continue;
    if (s.score?.total_in_bed_time_milli !== undefined) {
      const hours = s.score.total_in_bed_time_milli / 3_600_000;
      rows.push({ date, metricKind: 'SLEEP_HOURS', value: Math.round(hours * 10) / 10, unit: 'h', source: 'WHOOP' });
    }
    if (s.score?.sleep_performance_percentage !== undefined) {
      rows.push({ date, metricKind: 'SLEEP_QUALITY', value: s.score.sleep_performance_percentage, unit: '%', source: 'WHOOP' });
    }
  }

  const deduped = dedupeLatest(rows);
  return { metrics: deduped, ...summarizeRange(deduped) };
}

// ── Generic CSV (the escape hatch) ───────────────────────────────────────
//
// Expected header row:
//   date,metric,value,unit
// Example:
//   2026-04-20,HRV,54,ms
//   2026-04-20,SLEEP_HOURS,7.8,h

const VALID_KINDS = new Set<WearableMetricKind>([
  'HRV', 'RESTING_HR', 'SLEEP_HOURS', 'SLEEP_QUALITY',
  'RECOVERY_SCORE', 'STRAIN', 'RESPIRATORY_RATE', 'BODY_TEMP_DELTA',
]);

export function parseManualCsv(csv: string): ParsedPayload {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { metrics: [], rangeStart: '1970-01-01', rangeEnd: '1970-01-01' };

  // Skip header row if present (first row starts with "date")
  const dataLines = lines[0].toLowerCase().startsWith('date') ? lines.slice(1) : lines;

  const rows: RawMetric[] = [];
  for (const line of dataLines) {
    const [dateRaw, kindRaw, valueRaw, unitRaw] = line.split(',').map((x) => x.trim());
    const date = toDateStr(dateRaw);
    const kind = (kindRaw ?? '').toUpperCase() as WearableMetricKind;
    const value = asNumber(valueRaw);
    if (!date || value === null || !VALID_KINDS.has(kind)) continue;
    rows.push({ date, metricKind: kind, value, unit: unitRaw || '', source: 'MANUAL_CSV' });
  }

  const deduped = dedupeLatest(rows);
  return { metrics: deduped, ...summarizeRange(deduped) };
}

// ── Source auto-detect ───────────────────────────────────────────────────

export function detectSource(raw: unknown): WearableSource | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.data === 'object' && r.data !== null && 'metrics' in (r.data as object)) {
    return 'APPLE_HEALTH';
  }
  if ('recovery' in r || 'cycles' in r || (Array.isArray(r.sleep) && (r.sleep as unknown[]).length > 0 && typeof (r.sleep as unknown[])[0] === 'object' && (r.sleep as { score?: unknown }[])[0]?.score !== undefined)) {
    return 'WHOOP';
  }
  if ('daily_sleep' in r || 'daily_readiness' in r || 'readiness' in r ||
      (typeof r.sleep === 'object' && r.sleep !== null && 'data' in (r.sleep as object))) {
    return 'OURA';
  }
  return null;
}

// ── Small SHA-256 helper (browser-only) ──────────────────────────────────

export async function hashPayload(payload: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // FNV-1a 32-bit fallback — only used in tests / Node w/o subtle. Good
    // enough for idempotent re-import dedup (collisions are acceptable here).
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  const enc = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
