/**
 * plate-math.ts — Decompose a target load into plates per side.
 *
 * Pure: no DB, no I/O. The session logger renders this under the load
 * input so athletes don't do mental math at the bar.
 */

/** Standard kg pairs commonly available in a powerlifting gym. */
export const DEFAULT_KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/** Standard lb pairs. 1.25 lb micro-plates included for very fine progression. */
export const DEFAULT_LB_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25] as const;

export interface PlateBreakdown {
  /** kg the bar weighs (defaults below). */
  barKg: number;
  /** Plates per side, descending by weight. May be empty if load == bar. */
  perSide: number[];
  /** Sum of plates per side (×2 + bar = total achieved). */
  achievedKg: number;
  /** Difference between requested and achieved load (e.g. 0.5 if 0.25 plates not in set). */
  remainderKg: number;
}

export interface PlateOptions {
  barKg?: number;
  /** Pairs of plates, one of each weight per side. Defaults to DEFAULT_KG_PLATES. */
  available?: readonly number[];
}

/**
 * Greedy decomposition. Common case (e.g. 180kg = 20kg bar + 80/side) lands
 * on 25+20+20+10+5 per side. We accept that the available pairs aren't
 * unlimited — if the athlete only has one 25 and one 20 per side, this still
 * decomposes greedily, which matches how lifters actually load a bar.
 */
export function plateBreakdown(
  loadKg: number,
  options: PlateOptions = {},
): PlateBreakdown {
  const barKg = options.barKg ?? 20;
  const available = options.available ?? DEFAULT_KG_PLATES;

  const total = Math.max(0, loadKg);
  if (total <= barKg) {
    return {
      barKg,
      perSide: [],
      achievedKg: barKg,
      remainderKg: total < barKg ? 0 : 0, // can't go below bar
    };
  }

  let perSideKg = (total - barKg) / 2;
  const perSide: number[] = [];

  for (const plate of available) {
    while (perSideKg + 1e-6 >= plate) {
      perSide.push(plate);
      perSideKg -= plate;
    }
  }

  const achievedPerSide = perSide.reduce((s, p) => s + p, 0);
  const achievedKg = barKg + achievedPerSide * 2;
  const remainderKg = round2(total - achievedKg);

  return { barKg, perSide, achievedKg, remainderKg };
}

/** Compact display: "25 + 20 + 10 + 5". Empty bar shown as "bar only". */
export function formatPlateBreakdown(b: PlateBreakdown): string {
  if (b.perSide.length === 0) return 'bar only';
  return b.perSide.map((p) => trimPlate(p)).join(' + ');
}

function trimPlate(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/\.?0+$/, '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
