'use client';

import { useEffect } from 'react';
import { seedIfEmpty, ensureAthleteCalibration } from '@/lib/db/seed';

/**
 * Runs the DB seed check once on first client render.
 * Renders nothing — purely a side-effect component.
 */
export function DbSeedInitializer() {
  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await ensureAthleteCalibration();
    })().catch((err) =>
      console.error('[Lockedin] DB seed failed:', err)
    );
  }, []);

  return null;
}
