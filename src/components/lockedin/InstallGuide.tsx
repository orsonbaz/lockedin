'use client';

/**
 * InstallGuide — iOS "Add to Home Screen" bottom sheet.
 *
 * Shown once on first load when:
 *   • The device is iOS (iPhone / iPad / iPod)
 *   • Safari is NOT already in standalone (installed PWA) mode
 *   • localStorage key 'lockedin_install_shown' is not set
 *
 * After the user taps "Got it", the key is set and the sheet never shows again.
 */

import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

const STORAGE_KEY = 'lockedin_install_shown';

function isIosSafariNotInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const ua  = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  // navigator.standalone is true when running as installed PWA
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return ios && standalone !== true;
}

export function InstallGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIosSafariNotInstalled()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Small delay so it doesn't flash immediately on load
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
  }

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <SheetContent
        side="bottom"
        className="px-6 pb-10 rounded-t-3xl"
        style={{ backgroundColor: '#1A1A2E', border: '1px solid #1E3A5F', color: '#E8E8F0' }}
      >
        <SheetHeader className="mb-6">
          <SheetTitle
            className="text-xl font-bold text-center"
            style={{ color: '#E8E8F0' }}
          >
            Install Lockedin on your iPhone
          </SheetTitle>
          <p className="text-sm text-center" style={{ color: '#9AA0B4' }}>
            Run like a native app — works offline, no App Store needed.
          </p>
        </SheetHeader>

        {/* Steps */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Step 1 */}
          <div
            className="flex items-start gap-4 p-4 rounded-2xl"
            style={{ backgroundColor: '#0F3460', border: '1px solid #1E3A5F' }}
          >
            {/* Share icon */}
            <div
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: '#1A3A6A' }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#E94560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold mb-0.5" style={{ color: '#E8E8F0' }}>
                Step 1 — Tap the Share button
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#9AA0B4' }}>
                At the bottom of Safari, tap the{' '}
                <span style={{ color: '#E8E8F0' }}>↑ Share</span>{' '}
                icon in the middle of the toolbar.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className="flex items-start gap-4 p-4 rounded-2xl"
            style={{ backgroundColor: '#0F3460', border: '1px solid #1E3A5F' }}
          >
            {/* Home screen icon */}
            <div
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#1A3A6A' }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h7v7H14z" />
                <path d="M17 17v.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold mb-0.5" style={{ color: '#E8E8F0' }}>
                Step 2 — Add to Home Screen
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#9AA0B4' }}>
                Scroll down the share sheet and tap{' '}
                <span style={{ color: '#E8E8F0' }}>Add to Home Screen</span>.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className="flex items-start gap-4 p-4 rounded-2xl"
            style={{ backgroundColor: '#0F3460', border: '1px solid #1E3A5F' }}
          >
            {/* Checkmark icon */}
            <div
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#1A3A6A' }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold mb-0.5" style={{ color: '#E8E8F0' }}>
                Step 3 — Tap Add
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#9AA0B4' }}>
                Tap{' '}
                <span style={{ color: '#E8E8F0' }}>Add</span>{' '}
                in the top-right corner. Lockedin appears on your home screen.
              </p>
            </div>
          </div>
        </div>

        {/* Callout */}
        <p className="text-xs text-center mb-6" style={{ color: '#9AA0B4' }}>
          Once installed, Lockedin runs like a native app — offline, full-screen, no browser chrome.
        </p>

        {/* Dismiss */}
        <button
          type="button"
          onClick={dismiss}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98]"
          style={{ backgroundColor: '#E94560', color: '#fff' }}
        >
          Got it
        </button>
      </SheetContent>
    </Sheet>
  );
}
