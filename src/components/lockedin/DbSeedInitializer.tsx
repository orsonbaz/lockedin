'use client';

import { useEffect } from 'react';
import { seedIfEmpty } from '@/lib/db/seed';

/**
 * Runs the DB seed check once on first client render.
 * Renders nothing — purely a side-effect component.
 */
export function DbSeedInitializer() {
  useEffect(() => {
    seedIfEmpty().catch((err) =>
      console.error('[Lockedin] DB seed failed:', err)
    );
  }, []);

  return null;
}
