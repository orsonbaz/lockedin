/**
 * cycle-sync.ts — Keep the active training cycle aligned with the active arc.
 *
 * When the athlete switches arcs (START_ARC / RESUME_ARC via the coach), the
 * old cycle's phasing is no longer correct for their new training context.
 * This module regenerates the macrocycle:
 *   1. Mark the currently-ACTIVE cycle COMPLETED (its sessions remain valid
 *      history rows pointing at the old cycleId).
 *   2. Build a new cycle + blocks via generateMacrocycle, branching on the
 *      new arc's priorities (COMPETITION → linear meet-prep phasing;
 *      otherwise → sustainable longevity rhythm).
 *   3. Insert the new cycle + blocks as the active set.
 *
 * Sessions are intentionally never touched. Any session already in the DB
 * keeps its original cycleId/blockId references — today's already-scheduled
 * session continues to drive today's training; tomorrow's fresh session pulls
 * from the new active cycle via ensureTodaySession.
 */

import { db, today, newId } from '@/lib/db/database';
import { generateMacrocycle } from '@/lib/engine/macrocycle';
import { invalidateCache } from '@/lib/ai/coach-cache';
import type { TrainingArc, TrainingBlock } from '@/lib/db/types';

export interface RegenerateCycleResult {
  /** Cycle that was just marked COMPLETED, if any. */
  previousCycleId?: string;
  /** Cycle that is now ACTIVE. */
  newCycleId: string;
  /** Number of blocks in the new cycle. */
  blockCount: number;
}

/**
 * Regenerate the active training cycle from `arc`'s priorities.
 *
 * Returns `null` (no-op) when the athlete profile isn't ready yet — e.g. an
 * arc gets created during onboarding before profile completion. The seed
 * cycle stays in place until profile exists and the next arc switch fires.
 */
export async function regenerateCycleFromArc(
  arc: TrainingArc,
): Promise<RegenerateCycleResult | null> {
  const profile = await db.profile.get('me');
  if (!profile) return null;

  const previous = await db.cycles.filter((c) => c.status === 'ACTIVE').first();
  if (previous) {
    await db.cycles.update(previous.id, { status: 'COMPLETED' });
  }

  const { cycle: cycleSpec, blocks: blockSpecs } = generateMacrocycle({
    profile,
    startDate: today(),
    priorities: arc.priorities,
  });

  const cycleId = newId();
  await db.cycles.add({ ...cycleSpec, id: cycleId });

  const blocks: TrainingBlock[] = blockSpecs.map((b) => ({
    ...b,
    id: newId(),
    cycleId,
  }));
  await db.blocks.bulkAdd(blocks);

  await invalidateCache();

  return {
    previousCycleId: previous?.id,
    newCycleId: cycleId,
    blockCount: blocks.length,
  };
}
