/**
 * Shared date utility functions.
 *
 * Consolidates helpers that were previously duplicated across page files.
 */

/** Days from now until a YYYY-MM-DD date string (minimum 0). */
export function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86_400_000,
  ));
}

/** Today as YYYY-MM-DD in local time (alias for the canonical db helper). */
export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Monday of the week containing `dateStr` (YYYY-MM-DD). */
export function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

/** N weeks before today as YYYY-MM-DD. */
export function nWeeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split('T')[0];
}

/** Short display format: "Mar 25" */
export function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Time-of-day greeting. */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
