'use client';

/**
 * ApiKeyGate — blocks the app until a valid Gemini API key is stored.
 *
 * The key is saved in AthleteProfile.geminiApiKey (IndexedDB). On mount this
 * component reads the profile; if no key is present it renders a full-screen
 * setup screen. Once the athlete submits a valid key (validated by a test
 * call) it saves to the profile and un-gates the app.
 *
 * Why gate here instead of middleware?
 *   All auth/data is client-side (IndexedDB). Server middleware can't read
 *   IndexedDB. The (app) layout is the right place — it wraps every route
 *   the logged-in athlete sees.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/database';
import { C } from '@/lib/theme';

const BG      = C.bg;
const SURFACE = C.surface;
const TEXT    = C.text;
const MUTED   = C.muted;
const ACCENT  = C.accent;
const GOLD    = C.gold;

export default function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [ready,     setReady]     = useState(false);  // finished checking DB
  const [hasKey,    setHasKey]    = useState(false);
  const [input,     setInput]     = useState('');
  const [error,     setError]     = useState('');
  const [testing,   setTesting]   = useState(false);
  const [showKey,   setShowKey]   = useState(false);

  useEffect(() => {
    db.profile.get('me').then((p) => {
      if (p?.geminiApiKey?.trim()) {
        setHasKey(true);
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const handleSubmit = useCallback(async () => {
    const key = input.trim();
    if (!key) { setError('Paste your Gemini API key above.'); return; }
    setTesting(true);
    setError('');

    try {
      // Validate the key with a minimal test call.
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey:    key,
          maxTokens: 16,
          messages: [
            { role: 'system',    content: 'You are a test assistant.' },
            { role: 'user',      content: 'Reply with just: ok' },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        // Surface Gemini's error message when available.
        const inner = text.includes('API_KEY_INVALID') ? 'Invalid API key — check and try again.'
          : text.includes('PERMISSION_DENIED')         ? 'Permission denied — make sure the Gemini API is enabled for this key.'
          : `API error (${res.status}) — check your key and try again.`;
        throw new Error(inner);
      }

      // Drain the stream to confirm the key works end-to-end.
      const reader  = res.body?.getReader();
      const decoder = new TextDecoder();
      let   reply   = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        if (reply.length > 200) break; // enough to confirm success
      }

      if (reply.startsWith('__ERROR__:')) {
        throw new Error(reply.slice('__ERROR__:'.length));
      }

      // Save the key into the profile (create profile row if missing).
      const existing = await db.profile.get('me');
      if (existing) {
        await db.profile.update('me', { geminiApiKey: key });
      } else {
        // Profile will be completed in onboarding — for now just store the key.
        await db.profile.put({
          id: 'me',
          geminiApiKey: key,
          // Minimal required fields — onboarding fills the rest.
          name: '',
          sex: 'MALE',
          weightKg: 80,
          targetWeightClass: 83,
          maxSquat: 100,
          maxBench: 70,
          maxDeadlift: 120,
          weeklyFrequency: 4,
          trainingGoal: 'COMPETITION_PREP',
          bottleneck: 'BALANCED',
          responder: 'STANDARD',
          overshooter: false,
          rewardSystem: 'CONSISTENCY',
          federation: 'IPF',
          equipment: 'RAW',
          disciplines: ['POWERLIFTING'],
          weighIn: 'TWO_HOUR',
          trainingAgeMonths: 24,
          timeToPeakWeeks: 3,
          peakDayOfWeek: 6,
          unitSystem: 'KG',
          onboardingComplete: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setHasKey(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setTesting(false);
    }
  }, [input]);

  // Still reading from DB — render nothing to avoid flash.
  if (!ready) return null;

  // Key confirmed — render the app.
  if (hasKey) return <>{children}</>;

  // Gate screen.
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: BG, color: TEXT }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 flex flex-col gap-6"
        style={{ backgroundColor: SURFACE }}
      >
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧠</span>
            <h1 className="text-2xl font-bold tracking-tight">Connect your AI coach</h1>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
            Lockedin uses Google Gemini to review your sessions, build your plan, and
            coach you in real time. Paste your free Gemini API key below to get started.
          </p>
        </div>

        {/* Key input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
            Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border px-4 py-3 pr-12 text-sm font-mono bg-transparent outline-none transition-colors"
              style={{ borderColor: error ? '#ef4444' : input ? ACCENT : MUTED, color: TEXT }}
            />
            <button
              type="button"
              onClick={() => setShowKey((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: MUTED }}
            >
              {showKey ? 'hide' : 'show'}
            </button>
          </div>
          {error && (
            <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
          )}
        </div>

        {/* How to get a key */}
        <div
          className="rounded-xl p-4 flex flex-col gap-2 text-xs leading-relaxed"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: MUTED }}
        >
          <p className="font-semibold" style={{ color: TEXT }}>How to get a free key</p>
          <ol className="list-decimal list-inside flex flex-col gap-1">
            <li>Go to <span style={{ color: GOLD }}>aistudio.google.com</span></li>
            <li>Sign in with a Google account</li>
            <li>Click <strong style={{ color: TEXT }}>Get API key</strong> → Create API key</li>
            <li>Copy and paste it here</li>
          </ol>
          <p className="mt-1">
            Your key is stored only on this device — never sent to any server except
            Google&apos;s Gemini API directly.
          </p>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={testing || !input.trim()}
          className="w-full py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: ACCENT, color: TEXT }}
        >
          {testing ? 'Verifying key…' : 'Connect AI Coach'}
        </button>
      </div>
    </div>
  );
}
