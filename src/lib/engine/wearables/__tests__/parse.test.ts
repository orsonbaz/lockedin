import { describe, expect, it } from 'vitest';
import {
  detectSource,
  parseAppleHealth,
  parseManualCsv,
  parseOura,
  parseWhoop,
  hashPayload,
} from '../parse';

// ── Apple Health Auto Export ────────────────────────────────────────────────

describe('parseAppleHealth', () => {
  it('extracts HRV, RHR, respiratory rate, and sleep hours', () => {
    const raw = {
      data: {
        metrics: [
          {
            name: 'heart_rate_variability',
            units: 'ms',
            data: [
              { date: '2026-04-15 08:00:00 +0000', qty: 52 },
              { date: '2026-04-16 08:00:00 +0000', qty: 58 },
            ],
          },
          {
            name: 'resting_heart_rate',
            units: 'bpm',
            data: [{ date: '2026-04-16 07:30:00 +0000', qty: 54 }],
          },
          {
            name: 'respiratory_rate',
            units: 'breaths/min',
            data: [{ date: '2026-04-16 07:30:00 +0000', qty: 14.2 }],
          },
          {
            name: 'sleep_analysis',
            units: 'h',
            data: [{ date: '2026-04-16 07:30:00 +0000', asleep: 7.4 }],
          },
        ],
      },
    };
    const out = parseAppleHealth(raw);
    expect(out.metrics.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(out.metrics.map((m) => m.metricKind));
    expect(kinds.has('HRV')).toBe(true);
    expect(kinds.has('RESTING_HR')).toBe(true);
    expect(kinds.has('RESPIRATORY_RATE')).toBe(true);
    expect(kinds.has('SLEEP_HOURS')).toBe(true);
    expect(out.metrics.every((m) => m.source === 'APPLE_HEALTH')).toBe(true);
    expect(out.rangeStart).toBe('2026-04-15');
    expect(out.rangeEnd).toBe('2026-04-16');
  });

  it('converts seconds-asleep to hours when value > 24', () => {
    const raw = {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          units: 's',
          data: [{ date: '2026-04-16', asleep: 26400 }], // 7.33 h
        }],
      },
    };
    const out = parseAppleHealth(raw);
    const sleep = out.metrics.find((m) => m.metricKind === 'SLEEP_HOURS');
    expect(sleep).toBeDefined();
    expect(sleep!.value).toBeCloseTo(7.33, 1);
  });

  it('returns empty metrics + safe range for malformed payloads', () => {
    const out = parseAppleHealth({ garbage: true });
    expect(out.metrics).toEqual([]);
    expect(out.rangeStart).toBeDefined();
    expect(out.rangeEnd).toBeDefined();
  });
});

// ── Oura ────────────────────────────────────────────────────────────────────

describe('parseOura', () => {
  it('pulls sleep + readiness from the v2 daily endpoints', () => {
    const raw = {
      daily_sleep: {
        data: [{
          day: '2026-04-16',
          score: 82,
          total_sleep_duration: 27000,
          average_hrv: 61,
          lowest_heart_rate: 48,
          respiratory_rate: 13.8,
        }],
      },
      daily_readiness: {
        data: [{ day: '2026-04-16', score: 78 }],
      },
    };
    const out = parseOura(raw);
    const by = (k: string) => out.metrics.find((m) => m.metricKind === k);
    expect(by('SLEEP_HOURS')?.value).toBeCloseTo(7.5, 1);
    expect(by('SLEEP_QUALITY')?.value).toBe(82);
    expect(by('HRV')?.value).toBe(61);
    expect(by('RESTING_HR')?.value).toBe(48);
    expect(by('RECOVERY_SCORE')?.value).toBe(78);
    expect(out.metrics.every((m) => m.source === 'OURA')).toBe(true);
  });
});

// ── Whoop ───────────────────────────────────────────────────────────────────

describe('parseWhoop', () => {
  it('extracts recovery, strain, and sleep', () => {
    const raw = {
      recovery: [{
        created_at: '2026-04-16T08:00:00Z',
        score: {
          recovery_score: 72,
          hrv_rmssd_milli: 56.4,
          resting_heart_rate: 55,
        },
      }],
      cycles: [
        { start: '2026-04-16T04:00:00Z', score: { strain: 14.8 } },
      ],
      sleep: [{
        start: '2026-04-16T04:00:00Z',
        score: {
          total_in_bed_time_milli: 7 * 60 * 60 * 1000,
          sleep_performance_percentage: 88,
        },
      }],
    };
    const out = parseWhoop(raw);
    const by = (k: string) => out.metrics.find((m) => m.metricKind === k);
    expect(by('RECOVERY_SCORE')?.value).toBe(72);
    expect(by('HRV')?.value).toBeCloseTo(56.4, 1);
    expect(by('RESTING_HR')?.value).toBe(55);
    expect(by('STRAIN')?.value).toBeCloseTo(14.8, 1);
    expect(by('SLEEP_HOURS')?.value).toBe(7);
    expect(by('SLEEP_QUALITY')?.value).toBe(88);
    expect(out.metrics.every((m) => m.source === 'WHOOP')).toBe(true);
  });
});

// ── Manual CSV ──────────────────────────────────────────────────────────────

describe('parseManualCsv', () => {
  it('parses a well-formed CSV and skips malformed rows', () => {
    const csv =
`date,metric,value,unit
2026-04-14,HRV,55,ms
2026-04-15,RESTING_HR,52,bpm
2026-04-15,SLEEP_HOURS,7.5,h
2026-04-16,GARBAGE,10,x
2026-04-16,HRV,notanumber,ms`;
    const out = parseManualCsv(csv);
    expect(out.metrics.map((m) => m.metricKind).sort())
      .toEqual(['HRV', 'RESTING_HR', 'SLEEP_HOURS']);
    expect(out.rangeStart).toBe('2026-04-14');
    expect(out.rangeEnd).toBe('2026-04-15');
    expect(out.metrics.every((m) => m.source === 'MANUAL_CSV')).toBe(true);
  });
});

// ── detectSource ────────────────────────────────────────────────────────────

describe('detectSource', () => {
  it('identifies Apple Health Auto Export payloads', () => {
    expect(detectSource({ data: { metrics: [] } })).toBe('APPLE_HEALTH');
  });
  it('identifies Whoop payloads by recovery/cycles keys', () => {
    expect(detectSource({ recovery: { records: [] } })).toBe('WHOOP');
    expect(detectSource({ cycles: { records: [] } })).toBe('WHOOP');
  });
  it('identifies Oura payloads by daily_* keys', () => {
    expect(detectSource({ daily_sleep: { data: [] } })).toBe('OURA');
    expect(detectSource({ daily_readiness: { data: [] } })).toBe('OURA');
  });
  it('returns null for unknown shapes', () => {
    expect(detectSource({ foo: 1 })).toBeNull();
    expect(detectSource(null)).toBeNull();
  });
});

// ── hashPayload ─────────────────────────────────────────────────────────────

describe('hashPayload', () => {
  it('is deterministic for the same input', async () => {
    const a = await hashPayload('hello world');
    const b = await hashPayload('hello world');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await hashPayload('hello world');
    const b = await hashPayload('hello world!');
    expect(a).not.toBe(b);
  });
});
