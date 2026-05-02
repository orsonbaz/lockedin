/**
 * rest-notify.ts — Wake lock + local notification for the rest timer.
 *
 * Browsers throttle (and on iOS Safari, fully suspend) `setTimeout` when a tab
 * is backgrounded — that's why the rest timer used to "freeze" if the athlete
 * tabbed away. The mitigations here:
 *
 *  • Wake Lock API (Chrome/Edge/Android, Safari 16.4+): keeps the screen on
 *    during the session so the page doesn't suspend at all.
 *  • Notifications API: when the timer expires, fire a local notification so
 *    the athlete gets pulled back to the app even if the tab isn't visible.
 *    On iOS Safari the page must be installed as a PWA AND foregrounded for
 *    notifications to actually fire from JS — there's no way around that
 *    without a server-side push subscription.
 *
 * Everything here is best-effort and silent on failure. The rest timer must
 * still work without any of these capabilities.
 */

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released: boolean;
  addEventListener: (event: 'release', cb: () => void) => void;
};

type WakeLockApi = {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
};

let activeSentinel: WakeLockSentinelLike | null = null;

function getWakeLock(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { wakeLock?: WakeLockApi };
  return nav.wakeLock ?? null;
}

/**
 * Acquire a screen wake lock. Idempotent — calling twice returns the existing
 * sentinel. The lock is automatically dropped when the page is hidden; the
 * caller is expected to call `acquireWakeLock()` again on visibilitychange.
 */
export async function acquireWakeLock(): Promise<void> {
  const api = getWakeLock();
  if (!api) return;
  if (activeSentinel && !activeSentinel.released) return;
  try {
    const sentinel = await api.request('screen');
    activeSentinel = sentinel;
    sentinel.addEventListener('release', () => {
      if (activeSentinel === sentinel) activeSentinel = null;
    });
  } catch {
    // Permission denied / not focused — fine, screen will sleep normally.
  }
}

export async function releaseWakeLock(): Promise<void> {
  const sentinel = activeSentinel;
  activeSentinel = null;
  if (!sentinel || sentinel.released) return;
  try { await sentinel.release(); } catch { /* silent */ }
}

/**
 * Ask for permission to show local notifications. Safe to call repeatedly —
 * the browser only prompts once per origin. Resolves to the final permission
 * string ('granted' | 'denied' | 'default' | 'unsupported').
 */
export async function ensureNotificationPermission():
  Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const N = window.Notification;
  if (N.permission === 'granted' || N.permission === 'denied') return N.permission;
  try {
    const result = await N.requestPermission();
    return result;
  } catch {
    return 'default';
  }
}

const REST_TIMER_TAG = 'lockedin-rest-timer';

/**
 * Fire a "rest is up" notification. Prefers the service worker registration
 * (so the notification persists in the OS tray and survives the tab being
 * backgrounded on Android) and falls back to a plain `new Notification(...)`.
 */
export async function notifyRestComplete(exerciseName?: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  const title = 'Rest complete — back to the bar';
  const body  = exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set.';
  const opts: NotificationOptions = {
    body,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   REST_TIMER_TAG,
    // renotify: true,  // not in TS lib but supported on Chrome
    silent: false,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, opts);
        return;
      }
    }
    new window.Notification(title, opts);
  } catch {
    // Silent — notification is a non-critical UX nicety.
  }
}

/**
 * Schedule the "rest is up" notification to fire from the service worker at
 * `endsAt`. This is the path that survives the tab being backgrounded —
 * page-level setTimeout is suspended on iOS Safari and throttled on desktop
 * Chrome, but the SW timer keeps running. Idempotent per tag: scheduling a
 * new one supersedes the old.
 *
 * Both this and `notifyRestComplete` use the same notification `tag`, so
 * if both fire (page foreground + SW background) the OS collapses them
 * into one notification. No risk of duplicates.
 */
export async function scheduleRestNotification(
  endsAt: number,
  exerciseName?: string,
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const target = reg.active ?? reg.waiting ?? reg.installing;
    if (!target) return;
    target.postMessage({
      type:  'SCHEDULE_REST_NOTIFICATION',
      tag:   REST_TIMER_TAG,
      endsAt,
      title: 'Rest complete — back to the bar',
      body:  exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set.',
    });
  } catch {
    // Silent — backup path; page-level notifyRestComplete still fires
    // when the tab is in foreground.
  }
}

/**
 * Cancel any pending SW-scheduled rest notification. Called whenever the
 * timer is reset, the next set is logged before the previous timer expires,
 * the exercise advances, or the session ends.
 */
export async function cancelScheduledRestNotification(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const target = reg.active ?? reg.waiting ?? reg.installing;
    if (!target) return;
    target.postMessage({ type: 'CANCEL_REST_NOTIFICATION', tag: REST_TIMER_TAG });
  } catch {
    /* silent */
  }
}
