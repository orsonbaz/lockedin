'use client';

/**
 * Form Check — /form-check
 *
 * Captures a short clip via the camera, extracts keyframes client-side,
 * ships them to Groq's llama-3.2-90b vision preview, and persists the
 * analysis as a FormCheck row.
 *
 * Query params:
 *   lift         — SQUAT | BENCH | DEADLIFT | UPPER | LOWER | FULL (default SQUAT)
 *   session_id   — optional: link the check to an in-progress session
 *   exercise_id  — optional: link to a specific exercise in that session
 */

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Circle, Square, Video, AlertTriangle, CheckCircle2, XCircle, History, Upload } from 'lucide-react';
import { C } from '@/lib/theme';
import { db } from '@/lib/db/database';
import {
  canCaptureVideo,
  recordStream,
  extractKeyframesFromBlob,
  type Keyframe,
} from '@/lib/video/capture';
import {
  analyzeForm,
  msUntilNextAllowed,
  type AnalysisResult,
} from '@/lib/video/analyze';
import { saveFormCheck } from '@/lib/video/form-check-db';
import type { AthleteProfile, Lift, FormVerdict } from '@/lib/db/types';

const LIFTS: Lift[] = ['SQUAT', 'BENCH', 'DEADLIFT', 'UPPER', 'LOWER', 'FULL'];

type Stage = 'idle' | 'recording' | 'extracting' | 'analyzing' | 'done' | 'error';

const VERDICT_META: Record<FormVerdict, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  GOOD:         { label: 'Clean',         color: C.green,  icon: CheckCircle2 },
  MINOR_FIXES:  { label: 'Minor fixes',   color: C.gold,   icon: Video },
  MAJOR_FIXES:  { label: 'Major fixes',   color: C.accent, icon: AlertTriangle },
  UNSAFE:       { label: 'Unsafe',        color: C.red,    icon: AlertTriangle },
  UNCLEAR:      { label: 'Unclear',       color: C.muted,  icon: XCircle },
};

export default function FormCheckPage() {
  // useSearchParams needs a Suspense boundary for Next 16 static prerender.
  return (
    <Suspense fallback={<FormCheckFallback />}>
      <FormCheckInner />
    </Suspense>
  );
}

function FormCheckFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: C.bg, color: C.muted }}
    >
      <div
        className="w-8 h-8 rounded-full border-4 animate-spin"
        style={{ borderColor: `${C.accent} transparent transparent transparent` }}
      />
    </div>
  );
}

function FormCheckInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialLift = (search.get('lift')?.toUpperCase() as Lift) || 'SQUAT';
  const sessionId = search.get('session_id') ?? undefined;
  const exerciseId = search.get('exercise_id') ?? undefined;

  const [lift, setLift] = useState<Lift>(LIFTS.includes(initialLift) ? initialLift : 'SQUAT');
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [apiKey, setApiKey] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supported = useMemo(() => canCaptureVideo(), []);

  // Load API key
  useEffect(() => {
    void db.profile.get('me').then((p?: AthleteProfile) => setApiKey(p?.groqApiKey ?? ''));
  }, []);

  // Bind stream to <video> when we have one
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => { /* Safari needs a user gesture — ignore */ });
    }
  }, [stream]);

  // Release camera on unmount
  useEffect(() => () => {
    stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const resetForNextClip = useCallback(() => {
    setStage('idle');
    setError(null);
    setKeyframes([]);
    setAnalysis(null);
  }, []);

  /**
   * Upload a pre-recorded clip from the device instead of shooting in-app.
   * No 10-second cap: the athlete trims before uploading if they want. We
   * extract up to 6 evenly-spaced keyframes from whatever they hand us.
   */
  const handleUpload = useCallback(async (file: File) => {
    resetForNextClip();
    setStage('extracting');
    try {
      const { keyframes: frames } = await extractKeyframesFromBlob(file, 6);
      if (frames.length === 0) {
        setError('No frames could be read from that file.');
        setStage('error');
        return;
      }
      setKeyframes(frames);
      setStage('idle');
    } catch (e) {
      console.error('[form-check] upload extract failed', e);
      setError('Couldn\'t read that video. Try a different file.');
      setStage('error');
    }
  }, [resetForNextClip]);

  const onFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires change
    if (e.target) e.target.value = '';
    if (!file) return;
    void handleUpload(file);
  }, [handleUpload]);

  const startRecording = useCallback(async () => {
    if (!supported) {
      setError('This browser can\'t access the camera.');
      setStage('error');
      return;
    }
    resetForNextClip();
    try {
      const s = stream ?? await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(s);
      const { stop, done } = recordStream(s);
      stopRef.current = stop;
      setStage('recording');

      done.then(async (blob) => {
        stopRef.current = null;
        setStage('extracting');
        try {
          const { keyframes: frames } = await extractKeyframesFromBlob(blob);
          setKeyframes(frames);
          setStage('idle');
        } catch (e) {
          console.error('[form-check] extract failed', e);
          setError('Could not read the recording.');
          setStage('error');
        }
      }).catch((e) => {
        console.error('[form-check] record failed', e);
        setError('Recording failed.');
        setStage('error');
      });
    } catch (e) {
      console.error('[form-check] camera denied', e);
      setError('Camera permission denied.');
      setStage('error');
    }
  }, [supported, stream, resetForNextClip]);

  const stopRecording = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (keyframes.length === 0) return;
    if (!apiKey.trim()) {
      setError('Form check needs a Groq API key. Add one in Settings.');
      setStage('error');
      return;
    }
    const wait = msUntilNextAllowed();
    if (wait > 0) {
      toast.error(`Wait ${Math.ceil(wait / 1000)}s before another check.`);
      return;
    }
    setStage('analyzing');
    setError(null);
    try {
      const result = await analyzeForm({
        lift,
        note: note.trim() || undefined,
        keyframes,
        apiKey,
      });
      setAnalysis(result);
      await saveFormCheck({
        lift,
        note: note.trim() || undefined,
        sessionId,
        exerciseId,
        analysis: result,
        keyframes,
      });
      setStage('done');
      toast.success('Form check saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed.';
      console.error('[form-check] analyze failed', e);
      setError(msg);
      setStage('error');
    }
  }, [keyframes, apiKey, lift, note, sessionId, exerciseId]);

  const retakeClip = useCallback(() => {
    resetForNextClip();
  }, [resetForNextClip]);

  const verdictMeta = analysis ? VERDICT_META[analysis.verdict] : null;

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <div className="pt-6 pb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl transition-all active:scale-95"
            style={{ color: C.muted, backgroundColor: C.surface }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Form Check</h1>
          <button
            type="button"
            onClick={() => router.push('/progress/form-history')}
            className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95"
            style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
          >
            <History size={13} />
            History
          </button>
        </div>

        {!supported && (
          <div
            className="rounded-2xl p-4 mt-4"
            style={{ backgroundColor: `${C.red}10`, border: `1px solid ${C.red}40` }}
          >
            <p className="text-sm font-bold mb-1" style={{ color: C.red }}>Camera unavailable</p>
            <p className="text-xs" style={{ color: C.muted }}>
              Your browser doesn&apos;t expose the camera API. Try Safari or Chrome on a phone.
            </p>
          </div>
        )}

        {!apiKey.trim() && supported && (
          <div
            className="rounded-2xl p-4 mt-4"
            style={{ backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}40` }}
          >
            <p className="text-sm font-bold mb-1" style={{ color: C.accent }}>Groq API key required</p>
            <p className="text-xs" style={{ color: C.muted }}>
              Form checks use Groq&apos;s free vision model. Add a key in Settings to enable.
            </p>
          </div>
        )}

        {/* Lift selector */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.muted }}>
            Lift
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {LIFTS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLift(l)}
                className="py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                style={{
                  backgroundColor: lift === l ? C.accent : C.dim,
                  color: lift === l ? '#fff' : C.muted,
                  border: `1px solid ${lift === l ? C.accent : C.border}`,
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Viewfinder / preview area */}
        <div
          className="relative rounded-3xl overflow-hidden mt-4 flex items-center justify-center"
          style={{
            backgroundColor: '#000',
            border: `1px solid ${C.border}`,
            aspectRatio: '3 / 4',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ display: stream ? 'block' : 'none' }}
          />
          {!stream && keyframes.length === 0 && (
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <Camera size={36} color={C.muted} />
              <p className="text-sm" style={{ color: C.muted }}>
                Point the camera at the lift. Keep it steady, shoot from 45° if possible.
              </p>
              <p className="text-xs" style={{ color: C.muted }}>Max 10 seconds · 5 frames sampled</p>
            </div>
          )}
          {stage === 'recording' && (
            <div
              className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ backgroundColor: `${C.red}cc`, color: '#fff' }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: '#fff' }}
              />
              REC
            </div>
          )}
          {(stage === 'extracting' || stage === 'analyzing') && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: '#000c' }}
            >
              <div
                className="w-10 h-10 rounded-full border-4 animate-spin"
                style={{ borderColor: `${C.accent} transparent transparent transparent` }}
              />
            </div>
          )}
        </div>

        {/* Keyframe strip */}
        {keyframes.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.muted }}>
              Sampled frames
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {keyframes.map((kf, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={kf.dataUri}
                  alt={`Frame ${i + 1}`}
                  className="rounded-xl flex-shrink-0"
                  style={{ height: 88, border: `1px solid ${C.border}` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Note input */}
        {stage !== 'recording' && stage !== 'analyzing' && (
          <input
            type="text"
            placeholder="Context (e.g. final set, 180kg) — optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-3 rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
          />
        )}

        {/* Primary CTA */}
        <div className="mt-4 space-y-2">
          {stage === 'recording' ? (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ backgroundColor: C.red, color: '#fff' }}
            >
              <Square size={18} />
              Stop recording
            </button>
          ) : keyframes.length > 0 && stage !== 'analyzing' && stage !== 'done' ? (
            <>
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={!apiKey.trim()}
                className="w-full py-4 rounded-2xl text-base font-bold active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ backgroundColor: C.accent, color: '#fff' }}
              >
                Analyze form
              </button>
              <button
                type="button"
                onClick={retakeClip}
                className="w-full py-3 rounded-2xl text-sm font-semibold active:scale-[0.98] transition-all"
                style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
              >
                Retake
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={!supported || stage === 'extracting' || stage === 'analyzing'}
                className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ backgroundColor: C.accent, color: '#fff' }}
              >
                <Circle size={18} fill="currentColor" />
                {stage === 'extracting' ? 'Extracting frames…' : stage === 'analyzing' ? 'Analyzing…' : 'Record in app (10 s)'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={stage === 'extracting' || stage === 'analyzing'}
                className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
              >
                <Upload size={15} />
                Upload a video
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={onFilePicked}
                className="hidden"
              />
              <p className="text-xs text-center" style={{ color: C.muted }}>
                Record on your phone, trim if needed, then pick it here. No length limit.
              </p>
            </>
          )}
        </div>

        {/* Error */}
        {error && stage === 'error' && (
          <div
            className="mt-4 rounded-2xl p-4 text-sm"
            style={{ backgroundColor: `${C.red}12`, border: `1px solid ${C.red}40`, color: C.text }}
          >
            {error}
          </div>
        )}

        {/* Result */}
        {stage === 'done' && analysis && verdictMeta && (
          <div
            className="mt-5 rounded-3xl overflow-hidden"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: `${verdictMeta.color}15`, borderBottom: `1px solid ${C.border}` }}
            >
              <verdictMeta.icon size={20} color={verdictMeta.color} />
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: verdictMeta.color }}>
                  {verdictMeta.label}
                </p>
                {analysis.score !== undefined && (
                  <p className="text-sm" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    Score {analysis.score}/100
                  </p>
                )}
              </div>
            </div>

            {analysis.safetyFlags.length > 0 && (
              <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.red }}>
                  Safety
                </p>
                <ul className="space-y-1">
                  {analysis.safetyFlags.map((flag, i) => (
                    <li key={i} className="text-sm flex gap-2" style={{ color: C.text }}>
                      <span style={{ color: C.red }}>⚠</span>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.cues.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>
                  Coaching cues
                </p>
                <ul className="space-y-1.5">
                  {analysis.cues.map((cue, i) => (
                    <li key={i} className="text-sm flex gap-2" style={{ color: C.text }}>
                      <span style={{ color: C.accent }}>→</span>
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: C.border }}>
              <button
                type="button"
                onClick={retakeClip}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
              >
                Another take
              </button>
              <button
                type="button"
                onClick={() => router.push('/progress/form-history')}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all"
                style={{ backgroundColor: C.accent, color: '#fff' }}
              >
                See history
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
