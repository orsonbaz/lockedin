'use client';

/**
 * /session/today — Redirect to today's scheduled session, or home if none.
 * Static segment "today" takes priority over the dynamic [id] route.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, today } from '@/lib/db/database';

export default function TodaySessionPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      // Prefer a session that hasn't been completed yet
      const active = await db.sessions
        .where('scheduledDate')
        .equals(today())
        .filter((s) => s.status === 'SCHEDULED' || s.status === 'MODIFIED')
        .first();

      if (active) {
        router.replace(`/session/${active.id}`);
        return;
      }

      // Fall back to a completed session (so athlete can review it)
      const done = await db.sessions
        .where('scheduledDate')
        .equals(today())
        .filter((s) => s.status === 'COMPLETED')
        .first();

      router.replace(done ? `/session/${done.id}` : '/home');
    }
    void redirect();
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#111113' }}
    >
      <div
        className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: '#D4844C transparent transparent transparent' }}
      />
    </div>
  );
}
