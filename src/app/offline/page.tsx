'use client';

/**
 * Offline fallback page — served by the service worker when navigation
 * fails and there is no cached version of the requested route.
 */

import { useState } from 'react';

export default function OfflinePage() {
  const [checking, setChecking] = useState(false);
  const [result,   setResult]   = useState<'online' | 'still-offline' | null>(null);

  async function retry() {
    setChecking(true);
    setResult(null);
    try {
      // Ping a tiny cacheable asset that will always be fresh when online
      const r = await fetch('/manifest.json', { cache: 'no-store' });
      if (r.ok) {
        setResult('online');
        // Reload the original page after a short delay
        setTimeout(() => window.location.replace('/home'), 800);
      } else {
        setResult('still-offline');
      }
    } catch {
      setResult('still-offline');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: '#1A1A2E', color: '#E8E8F0' }}
    >
      {/* Icon */}
      <div
        className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 text-5xl"
        style={{ backgroundColor: '#0F3460' }}
      >
        {/* Barbell SVG */}
        <svg
          viewBox="0 0 64 32"
          width="56"
          height="28"
          fill="none"
          aria-hidden
        >
          {/* Left collar */}
          <rect x="0" y="10" width="8" height="12" rx="2" fill="#E94560" />
          {/* Left sleeve */}
          <rect x="8" y="12" width="10" height="8" rx="1" fill="#9AA0B4" />
          {/* Bar */}
          <rect x="18" y="14" width="28" height="4" rx="2" fill="#9AA0B4" />
          {/* Right sleeve */}
          <rect x="46" y="12" width="10" height="8" rx="1" fill="#9AA0B4" />
          {/* Right collar */}
          <rect x="56" y="10" width="8" height="12" rx="2" fill="#E94560" />
          {/* Left plate */}
          <rect x="5" y="6" width="6" height="20" rx="2" fill="#E94560" opacity="0.8" />
          {/* Right plate */}
          <rect x="53" y="6" width="6" height="20" rx="2" fill="#E94560" opacity="0.8" />
        </svg>
      </div>

      {/* Heading */}
      <h1
        className="text-3xl font-black mb-2 tracking-tight"
        style={{ color: '#E8E8F0' }}
      >
        You&rsquo;re offline
      </h1>

      {/* Subtitle */}
      <p className="text-base mb-6 max-w-xs leading-relaxed" style={{ color: '#9AA0B4' }}>
        Your training data is saved on this device.
      </p>

      {/* Feature list */}
      <div
        className="w-full max-w-xs rounded-2xl p-4 mb-6 text-left"
        style={{ backgroundColor: '#0F3460', border: '1px solid #1E3A5F' }}
      >
        {[
          { icon: '✅', text: 'Session logging works offline' },
          { icon: '✅', text: 'Check-in and readiness scoring' },
          { icon: '✅', text: 'Training history & charts' },
          { icon: '✅', text: 'Meet attempt planner' },
          { icon: '⚡', text: 'Connect to use Groq AI Coach', dim: true },
        ].map(({ icon, text, dim }) => (
          <div key={text} className="flex items-center gap-3 py-1.5">
            <span>{icon}</span>
            <span
              className="text-sm"
              style={{ color: dim ? '#9AA0B4' : '#E8E8F0' }}
            >
              {text}
            </span>
          </div>
        ))}
      </div>

      {/* Retry button */}
      <button
        type="button"
        onClick={() => void retry()}
        disabled={checking}
        className="px-8 py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ backgroundColor: '#E94560', color: '#fff' }}
      >
        {checking ? 'Checking…' : 'Retry Connection'}
      </button>

      {result === 'online' && (
        <p className="mt-4 text-sm" style={{ color: '#22C55E' }}>
          ✓ Back online — reloading…
        </p>
      )}
      {result === 'still-offline' && (
        <p className="mt-4 text-sm" style={{ color: '#9AA0B4' }}>
          Still offline. Your data is safe — try again when connected.
        </p>
      )}

      <p className="mt-8 text-xs" style={{ color: '#3A3A5C' }}>
        LOCKEDIN — AI Powerlifting Coach
      </p>
    </div>
  );
}
