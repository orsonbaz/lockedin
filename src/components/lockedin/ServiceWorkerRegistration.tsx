'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and listens for updates.
 * When a new SW version is detected and waiting, a toast-style banner
 * appears prompting the user to reload for the latest version.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg;
        // Check for updates on registration
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            // New SW is installed and waiting — prompt user
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(reg);
            }
          });
        });
      })
      .catch((err) => console.error('SW registration failed:', err));

    // Also handle case where SW was already waiting before this component mounted
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        showUpdateBanner(reg);
      }
    });

    // ── Update polling ────────────────────────────────────────────────────
    // Safari iOS PWAs almost never check for SW updates on their own. Poll
    // explicitly so the update banner reliably fires after a deploy:
    //   • Every time the app comes back to the foreground
    //   • Every 15 minutes while it's foregrounded
    const checkForUpdate = () => {
      registration?.update().catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkForUpdate);
    const interval = window.setInterval(checkForUpdate, 15 * 60_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkForUpdate);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

/**
 * Nuclear force-refresh — unregisters every SW, wipes every cache, and
 * reloads. Used by the "Force refresh app" button in Settings when the
 * normal update flow doesn't deliver a new build (typical on Safari
 * home-screen webapps).
 *
 * Does NOT touch localStorage or IndexedDB, so athlete data is preserved.
 */
export async function forceRefreshApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

/** Show a fixed banner prompting the user to reload for updates. */
function showUpdateBanner(registration: ServiceWorkerRegistration) {
  // Prevent duplicate banners
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#1C1C1F',
    color: '#ECECEF',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });

  const text = document.createElement('span');
  text.textContent = 'A new version is available.';

  const btn = document.createElement('button');
  btn.textContent = 'Refresh';
  Object.assign(btn.style, {
    padding: '6px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#D4844C',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  });
  btn.addEventListener('click', () => {
    // Tell the waiting SW to activate immediately
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  Object.assign(dismiss.style, {
    padding: '4px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#787882',
    fontSize: '16px',
    cursor: 'pointer',
  });
  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(btn);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}
