'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      const onboardingComplete = localStorage.getItem('lockedin_onboarding_complete');
      if (onboardingComplete) {
        router.replace('/home');
      } else {
        router.replace('/onboarding/step1');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ backgroundColor: '#1A1A2E' }}
    >
      <div className="flex flex-col items-center gap-3">
        <h1
          className="text-6xl font-black tracking-widest"
          style={{ color: '#E94560' }}
        >
          LOCKEDIN
        </h1>
        <p
          className="text-lg font-medium tracking-wide"
          style={{ color: '#9AA0B4' }}
        >
          AI Powerlifting Coach
        </p>
      </div>
    </div>
  );
}
