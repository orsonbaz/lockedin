/**
 * timer-cues.ts — Audio + haptic feedback for the rest timer.
 *
 * Browsers gate AudioContext until a user gesture, so we lazily construct it
 * on first use (the rest timer always starts from a tap on "Log Set"). The
 * tones are short sine beeps generated in-process — no audio asset to ship.
 *
 * navigator.vibrate is a no-op on iOS Safari; we still call it because it's
 * supported on Android Chrome / Firefox where it's the most useful.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

interface BeepOpts {
  /** Hz, default 880. */
  frequency?: number;
  /** ms, default 120. */
  durationMs?: number;
  /** 0–1, default 0.08 (intentionally quiet). */
  volume?: number;
}

/** Fire-and-forget short tone. Safe to call from a render path. */
export function beep(opts: BeepOpts = {}): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const { frequency = 880, durationMs = 120, volume = 0.08 } = opts;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    // Quick attack + release to avoid clicks.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.setValueAtTime(volume, now + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // Silent — audio is a non-critical UX nicety.
  }
}

/** Short haptic pulse, no-op when unsupported. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return;
  type VibFn = (p: number | number[]) => boolean;
  const nav = navigator as unknown as { vibrate?: VibFn };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(pattern);
  } catch {
    // Silent.
  }
}

/** Tick: subtle short beep + quick haptic at T-3, T-2, T-1. */
export function timerTick(): void {
  beep({ frequency: 660, durationMs: 80, volume: 0.06 });
  vibrate(60);
}

/** Done: louder/longer tone + double haptic. */
export function timerDone(): void {
  beep({ frequency: 988, durationMs: 220, volume: 0.12 });
  vibrate([180, 90, 180]);
}
