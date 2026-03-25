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

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates on registration
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            // New SW is installed and waiting — prompt user
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(registration);
            }
          });
        });
      })
      .catch((err) => console.error('SW registration failed:', err));

    // Also handle case where SW was already waiting before this component mounted
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        showUpdateBanner(registration);
      }
    });
  }, []);

  return null;
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
    backgroundColor: '#0F3460',
    color: '#E8E8F0',
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
    backgroundColor: '#E94560',
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
    color: '#9AA0B4',
    fontSize: '16px',
    cursor: 'pointer',
  });
  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(btn);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}
