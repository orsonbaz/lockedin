/**
 * Coach prompt caching (v9).
 *
 * Gemini's explicit context caching drops repeated input tokens from
 * $0.30/M → $0.03/M on 2.5 Flash. Most of our coach prompt is stable
 * across turns (system prompt + athlete profile + active arc + injuries
 * + memory snapshot + current cycle); only the per-turn dynamic context
 * (today's session, today's symptoms, latest readiness, conversation
 * history, user message) actually changes. That stable core is what
 * we cache.
 *
 * Architecture:
 *
 *   client                                            server (/api/chat)
 *   ──────                                            ──────────────────
 *   1. build stable-core string + hash it
 *   2. lookup `coachCaches.get('me')`
 *   3. POST { cacheName, stableCoreText, dynamic } ─→
 *                                                     4. if cacheName valid
 *                                                        → use it as context
 *                                                        else cacheManager
 *                                                        .create(stableCore),
 *                                                        return new name
 *                                                        via X-Cache-Name
 *                                                        header
 *   5. persist new cache name + expiry  ←─ response
 *   6. record CoachCallStats row
 *
 * Invalidation happens when any input that contributes to the stable-core
 * string changes (arc / injury / profile / important memory / cycle).
 * Each writer in those modules calls `invalidateCache()` which clears the
 * row — next turn will compute a fresh hash and either match a different
 * cache or create one.
 *
 * Note: this module is import-safe in both client and server contexts.
 * The actual Gemini SDK calls live in /api/chat/route.ts.
 */

import { db, newId } from '@/lib/db/database';
import type {
  CoachCache,
  CoachCallStats,
  TrainingArc,
  Injury,
  AthleteProfile,
  AthleteMemory,
  TrainingCycle,
  TrainingBlock,
} from '@/lib/db/types';

/**
 * Bumped whenever the coach's system prompt or action vocabulary changes in a
 * way that should invalidate every athlete's cache. Treat it as the
 * "cache-buster knob" — the hash includes this version string so a single
 * source-code edit invalidates every stored cache name.
 */
export const PROMPT_VERSION = 'v8.1';

/** Default cache TTL — match Gemini's default. */
export const DEFAULT_CACHE_TTL_SEC = 60 * 60; // 1 hour

// ── Stable-core builder ──────────────────────────────────────────────────────

export interface StableCoreInputs {
  profile: AthleteProfile | null;
  arc: TrainingArc | null;
  injuries: readonly Injury[];
  /**
   * Top-N high-importance memories rolled up into a compact summary. Caller
   * decides how many — keep small (≤ 12) so the stable core stays cacheable.
   */
  memorySnapshot: readonly AthleteMemory[];
  cycle: TrainingCycle | null;
  currentBlock: TrainingBlock | null;
}

/**
 * Build the deterministic "stable core" string the cache wraps. Order matters
 * — every input is serialized identically so the hash is reproducible across
 * page loads and machines. Anything not in this string is per-turn dynamic
 * context, sent on every request and charged at the full input rate.
 */
export function buildStableCore(inputs: StableCoreInputs): string {
  const sections: string[] = [];

  sections.push(`PROMPT_VERSION=${PROMPT_VERSION}`);

  if (inputs.profile) {
    const p = inputs.profile;
    sections.push([
      '## Athlete Profile',
      `name=${p.name}`,
      `sex=${p.sex}`,
      `bodyweight_kg=${p.weightKg}`,
      `training_age_months=${p.trainingAgeMonths}`,
      `bottleneck=${p.bottleneck}`,
      `responder=${p.responder}`,
      `overshooter=${p.overshooter}`,
      `max_squat=${p.maxSquat}`,
      `max_bench=${p.maxBench}`,
      `max_deadlift=${p.maxDeadlift}`,
      `max_weighted_pullup=${p.maxWeightedPullUp ?? '_'}`,
      `max_weighted_dip=${p.maxWeightedDip ?? '_'}`,
      `training_goal=${p.trainingGoal ?? 'LONGEVITY'}`,
    ].join('\n'));
  }

  if (inputs.arc) {
    const a = inputs.arc;
    sections.push([
      '## Active Arc',
      `name=${a.name}`,
      `intent=${a.intent.trim()}`,
      `primary_goal=${a.primaryGoal}`,
      `priorities=${a.priorities.join(',')}`,
      `deprioritized=${a.deprioritized.join(',')}`,
      `constraints=${a.constraints.join(',')}`,
      `weekly_time_min=${a.weeklyTimeBudgetMin ?? '_'}`,
      `coach_directive=${a.coachDirective.trim()}`,
    ].join('\n'));
  }

  if (inputs.injuries.length > 0) {
    const sortedInjuries = [...inputs.injuries].sort((a, b) => a.id.localeCompare(b.id));
    sections.push([
      '## Active Injuries',
      ...sortedInjuries.map((i) => [
        `- ${i.label}`,
        `  status=${i.status}`,
        `  severity=${i.severity}`,
        `  regions=${i.regions.join(',')}`,
        `  constraints=${i.constraints.join(',')}`,
        `  contraindicated_patterns=${i.contraindicatedPatterns.join(',')}`,
        `  preferred_patterns=${i.preferredPatterns.join(',')}`,
      ].join('\n')),
    ].join('\n'));
  }

  if (inputs.memorySnapshot.length > 0) {
    const sortedMemories = [...inputs.memorySnapshot]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 12);
    sections.push([
      '## Long-Term Memory',
      ...sortedMemories.map(
        (m) => `- [${m.kind} imp=${m.importance}] ${m.content.slice(0, 200)}`,
      ),
    ].join('\n'));
  }

  if (inputs.cycle) {
    sections.push([
      '## Training Cycle',
      `name=${inputs.cycle.name}`,
      `total_weeks=${inputs.cycle.totalWeeks}`,
      `current_week=${inputs.cycle.currentWeek}`,
    ].join('\n'));
  }

  if (inputs.currentBlock) {
    const b = inputs.currentBlock;
    sections.push([
      '## Current Block',
      `block_type=${b.blockType}`,
      `week_start=${b.weekStart}`,
      `week_end=${b.weekEnd}`,
      `volume_target=${b.volumeTarget}`,
      `intensity_target=${b.intensityTarget}`,
    ].join('\n'));
  }

  return sections.join('\n\n');
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash, truncated to 16 hex chars. Uses the Web Crypto API (works
 * in both browser and Node — Next runtime exposes it).
 */
export async function computeHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Cache lifecycle ──────────────────────────────────────────────────────────

/**
 * Return the active cache row if (a) it exists and (b) its hash matches the
 * provided hash and (c) it hasn't expired. Returns null otherwise — callers
 * treat null as "create a fresh cache."
 */
export async function getValidCache(currentHash: string): Promise<CoachCache | null> {
  const row = await db.coachCaches.get('me');
  if (!row) return null;
  if (row.hash !== currentHash) return null;
  if (Date.parse(row.expiresAt) <= Date.now()) return null;
  return row;
}

export async function saveCache(input: {
  hash: string;
  cacheName: string;
  expiresAt: string;
  cachedTokenCount?: number;
}): Promise<void> {
  const row: CoachCache = {
    id: 'me',
    hash: input.hash,
    cacheName: input.cacheName,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
    cachedTokenCount: input.cachedTokenCount,
  };
  await db.coachCaches.put(row);
}

/**
 * Invalidate the cache when an input has changed. Called from arc / injury /
 * profile writers. We deliberately delete rather than mark-stale — the next
 * call will compute the new hash and either match an existing cache (if the
 * change happened to land on the same content) or create a fresh one.
 */
export async function invalidateCache(): Promise<void> {
  await db.coachCaches.delete('me');
}

// ── Telemetry ────────────────────────────────────────────────────────────────

export async function logCallStats(
  stats: Omit<CoachCallStats, 'id' | 'timestamp'>,
): Promise<void> {
  const row: CoachCallStats = {
    id: newId(),
    timestamp: new Date().toISOString(),
    ...stats,
  };
  await db.coachCallStats.add(row);
}

export async function recentStats(limit = 20): Promise<CoachCallStats[]> {
  const all = await db.coachCallStats.toArray();
  return all
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export interface AggregatedStats {
  callCount: number;
  hitCount: number;
  hitRatePct: number;
  totalCachedTokens: number;
  totalUncachedInputTokens: number;
  totalOutputTokens: number;
  /**
   * Approximate cost savings in dollars, assuming Gemini 2.5 Flash pricing:
   * cached input $0.03/M, uncached input $0.30/M. So every cached token
   * saves (0.30 - 0.03) / 1_000_000 = $2.7e-7.
   */
  estimatedSavingsUsd: number;
}

export function aggregateStats(stats: readonly CoachCallStats[]): AggregatedStats {
  const callCount = stats.length;
  const hitCount = stats.filter((s) => s.cacheHit).length;
  const totalCachedTokens = stats.reduce((sum, s) => sum + s.cachedTokens, 0);
  const totalUncachedInputTokens = stats.reduce((sum, s) => sum + s.uncachedInputTokens, 0);
  const totalOutputTokens = stats.reduce((sum, s) => sum + s.outputTokens, 0);
  return {
    callCount,
    hitCount,
    hitRatePct: callCount > 0 ? Math.round((hitCount / callCount) * 100) : 0,
    totalCachedTokens,
    totalUncachedInputTokens,
    totalOutputTokens,
    estimatedSavingsUsd: (totalCachedTokens * (0.30 - 0.03)) / 1_000_000,
  };
}
