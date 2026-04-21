/**
 * capture.ts — record a short clip via getUserMedia and extract keyframes.
 *
 * Design goals:
 *   - No backend: everything runs in the browser.
 *   - Sidestep iOS mp4 ↔ webm divergence by never persisting the video.
 *     We only keep keyframe JPEGs (≈200KB total) for vision analysis.
 *   - Bounded cost: 10 s max, 4–6 frames, max 768px on the long edge.
 *
 * `recordAndExtract` orchestrates the full flow; components can also call
 * `extractKeyframesFromBlob` directly when they already hold a video blob.
 */

const MAX_DURATION_MS = 10_000;
const DEFAULT_FRAME_COUNT = 5;
const MAX_EDGE_PX = 768;
const JPEG_QUALITY = 0.72;

export interface Keyframe {
  /** Data-URI-encoded JPEG — safe to persist in Dexie without a separate blob store. */
  dataUri: string;
  /** Relative position in the clip (0–1). */
  timestamp: number;
  /** Pixel dimensions after downscaling. */
  width: number;
  height: number;
}

export interface CaptureResult {
  keyframes: Keyframe[];
  durationMs: number;
}

/** Whether the browser supports the APIs we need. */
export function canCaptureVideo(): boolean {
  if (typeof window === 'undefined') return false;
  const md = navigator.mediaDevices;
  return !!(md && typeof md.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined');
}

/** Pick a mime type the current browser's MediaRecorder supports. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Record the supplied MediaStream until `stop()` is called or `maxMs` elapses.
 * Returns the resulting video blob (webm on Chrome/Firefox, mp4 on Safari).
 */
export function recordStream(
  stream: MediaStream,
  maxMs: number = MAX_DURATION_MS,
): { stop: () => void; done: Promise<Blob> } {
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let stopped = false;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType ?? 'video/webm' }));
    };
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { recorder.stop(); } catch { /* already stopped */ }
    stream.getTracks().forEach((t) => t.stop());
  };

  recorder.start();
  const cap = setTimeout(stop, maxMs);
  done.finally(() => clearTimeout(cap));

  return { stop, done };
}

/**
 * Seek a <video> element to `time` seconds and resolve once the frame is ready.
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Seek failed')); };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/** Compute downscaled width/height keeping the long edge ≤ MAX_EDGE_PX. */
function fitSize(w: number, h: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= MAX_EDGE_PX) return { w, h };
  const scale = MAX_EDGE_PX / long;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * Extract evenly-spaced keyframes from a video blob. The blob is loaded into
 * an off-DOM <video> via an object URL, each frame is drawn to a <canvas>,
 * then encoded as a JPEG data URI. Caller-controlled `count` lets us trade
 * off analysis fidelity vs. payload size (vision APIs charge per image).
 */
export async function extractKeyframesFromBlob(
  blob: Blob,
  count: number = DEFAULT_FRAME_COUNT,
): Promise<CaptureResult> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { video.removeEventListener('loadedmetadata', onReady); resolve(); };
      const onError = () => { video.removeEventListener('error', onError); reject(new Error('Load failed')); };
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('error', onError);
    });

    // Safari sometimes reports Infinity until the video has played/seeked once.
    if (!Number.isFinite(video.duration)) {
      try { await seekTo(video, 1e-6); } catch { /* non-fatal */ }
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;

    const { w, h } = fitSize(video.videoWidth || 640, video.videoHeight || 360);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context unavailable');

    const frameCount = Math.max(1, Math.min(6, count));
    const keyframes: Keyframe[] = [];
    for (let i = 0; i < frameCount; i++) {
      // Sample slightly inside [0, duration] to avoid decoders returning a
      // black frame at the exact boundaries.
      const t = (duration * (i + 0.5)) / frameCount;
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, w, h);
      keyframes.push({
        dataUri: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
        timestamp: t / duration,
        width: w,
        height: h,
      });
    }

    return { keyframes, durationMs: duration * 1000 };
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

/**
 * Convenience helper for the happy path: open the camera, record until the
 * user presses stop (or MAX_DURATION_MS elapses), then extract keyframes.
 */
export async function recordAndExtract(opts: {
  stream: MediaStream;
  onRecordingChange?: (recording: boolean) => void;
  maxMs?: number;
  frameCount?: number;
}): Promise<CaptureResult & { stop: () => void }> {
  const { stream, onRecordingChange, maxMs = MAX_DURATION_MS, frameCount } = opts;
  onRecordingChange?.(true);
  const { stop, done } = recordStream(stream, maxMs);
  const blob = await done;
  onRecordingChange?.(false);
  const result = await extractKeyframesFromBlob(blob, frameCount);
  return { ...result, stop };
}
