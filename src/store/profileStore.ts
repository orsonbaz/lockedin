import { create } from 'zustand';
import { db } from '@/lib/db/database';
import type { AthleteProfile } from '@/lib/db/types';

interface ProfileState {
  profile: AthleteProfile | null;
  isLoading: boolean;
  loadProfile: () => Promise<void>;
  saveProfile: (updates: Partial<AthleteProfile>) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,

  loadProfile: async () => {
    set({ isLoading: true });
    try {
      const profile = await db.profile.get('me');
      set({ profile: profile ?? null });
    } finally {
      set({ isLoading: false });
    }
  },

  saveProfile: async (updates: Partial<AthleteProfile>) => {
    const current = get().profile;
    const now = new Date().toISOString();

    const merged: AthleteProfile = current
      ? { ...current, ...updates, updatedAt: now }
      : ({
          id: 'me',
          name: '',
          weightKg: 0,
          targetWeightClass: 0,
          sex: 'MALE',
          federation: 'IPF',
          equipment: 'RAW',
          weighIn: 'TWO_HOUR',
          trainingAgeMonths: 0,
          maxSquat: 0,
          maxBench: 0,
          maxDeadlift: 0,
          bottleneck: 'BALANCED',
          rewardSystem: 'CONSISTENCY',
          responder: 'STANDARD',
          overshooter: false,
          timeToPeakWeeks: 3,
          weeklyFrequency: 4,
          peakDayOfWeek: 6,
          unitSystem: 'KG',
          onboardingComplete: false,
          createdAt: now,
          updatedAt: now,
          ...updates,
        } satisfies AthleteProfile);

    await db.profile.put(merged);
    set({ profile: merged });
  },
}));
