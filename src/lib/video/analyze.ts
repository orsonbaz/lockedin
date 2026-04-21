/**
 * analyze.ts — run Groq vision over keyframes to produce a form-check verdict.
 *
 * Wraps `llama-3.2-90b-vision-preview` with a JSON-only prompt conditioned on
 * the lift. Returns a shape that matches the FormCheck Dexie row so the UI
 * can persist with zero adaptation.
 *
 * Rate limit:
 *   - Vision preview is the tightest free-tier bucket, so we enforce one
 *     analysis per 20 s at the call site and cap the upload at 6 frames.
 *
 * Fallback:
 *   - If the call fails (no network, rate limit, schema mismatch) the caller
 *     receives an UNCLEAR verdict with the raw error so they can retry. We
 *     don't silently write a bad verdict to the DB.
 */

import Groq from 'groq-sdk';
import type { FormVerdict, Lift } from '@/lib/db/types';
import type { Keyframe } from './capture';

const MODEL = 'llama-3.2-90b-vision-preview';
const MIN_INTERVAL_MS = 20_000;

let _lastRunAt = 0;

export interface AnalysisResult {
  verdict: FormVerdict;
  cues: string[];
  safetyFlags: string[];
  score?: number;
  model: string;
}

export interface AnalyzeOptions {
  lift: Lift;
  note?: string;
  keyframes: Keyframe[];
  apiKey: string;
}

// ── Lift-specific coaching cues ────────────────────────────────────────────
//
// Kept here rather than in knowledge-base.ts to keep the on-device prompt
// context small. Vision calls are Groq-only, so they can carry a slightly
// richer prompt.
const LIFT_CUES: Record<Lift, string> = {
  SQUAT:
    'Look for: depth (hip crease below knee), knee tracking (not caving), upright torso, neutral spine, ' +
    'symmetric bar path, controlled descent, brace through every rep.',
  BENCH:
    'Look for: stable arch, tight lats, elbow path at ~45° from torso, touch point at lower sternum, ' +
    'feet planted, bar path slight J-curve, locked-out elbows at the top.',
  DEADLIFT:
    'Look for: neutral spine (no rounding), hips and bar starting together, bar traveling in a vertical line ' +
    'over mid-foot, shoulders slightly ahead of bar at start, lockout with hips through (no hyperextension).',
  UPPER:
    'Look for: controlled bar/handle path, full range of motion, stable shoulder position, neutral wrists, ' +
    'no excessive compensation from other muscles.',
  LOWER:
    'Look for: balanced loading across both legs, neutral spine, controlled descent, ' +
    'full ROM appropriate to the movement, no knee valgus.',
  FULL:
    'Look for: coordination between upper and lower halves, neutral spine throughout, ' +
    'controlled tempo, full ROM, no compensatory patterns.',
};

function buildSystemPrompt(lift: Lift, note?: string): string {
  return [
    'You are a powerlifting / calisthenics form-check coach.',
    'You will receive 4–6 still frames taken evenly across a single set of one lift.',
    `The lift is ${lift}. ${LIFT_CUES[lift]}`,
    note ? `Athlete note: "${note}"` : '',
    '',
    'Respond with a single JSON object and nothing else. The schema is:',
    '{',
    '  "verdict": "GOOD" | "MINOR_FIXES" | "MAJOR_FIXES" | "UNSAFE" | "UNCLEAR",',
    '  "score": integer 0–100 (higher = better form),',
    '  "cues": string[] (2–5 concise coaching bullets, imperative voice),',
    '  "safetyFlags": string[] (red flags like rounded back under load, deep knee valgus — [] if none)',
    '}',
    '',
    'Rules:',
    '- UNSAFE triggers safetyFlags non-empty. Do not mince words about injury risk.',
    '- UNCLEAR when lift cannot be identified or frames are too dark/blurry.',
    '- Keep cues actionable: "brace harder before descent" beats "bracing could be better".',
    '- Do not add commentary outside the JSON.',
  ].filter(Boolean).join('\n');
}

/** How long the caller must wait before the next call will be accepted. */
export function msUntilNextAllowed(): number {
  const delta = Date.now() - _lastRunAt;
  return Math.max(0, MIN_INTERVAL_MS - delta);
}

function parseJsonObject(raw: string): unknown {
  // Vision responses sometimes come wrapped in ```json fences.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in response');
  return JSON.parse(body.slice(start, end + 1));
}

function coerceVerdict(v: unknown): FormVerdict {
  const s = String(v ?? '').toUpperCase();
  if (s === 'GOOD' || s === 'MINOR_FIXES' || s === 'MAJOR_FIXES' || s === 'UNSAFE' || s === 'UNCLEAR') {
    return s;
  }
  return 'UNCLEAR';
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0)
    .slice(0, 8);
}

export async function analyzeForm(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const { lift, note, keyframes, apiKey } = opts;
  if (!apiKey.trim()) {
    throw new Error('Form check requires a Groq API key. Add one in Settings.');
  }
  if (keyframes.length === 0) {
    throw new Error('No keyframes supplied');
  }
  const waitMs = msUntilNextAllowed();
  if (waitMs > 0) {
    throw new Error(`Rate limited — try again in ${Math.ceil(waitMs / 1000)}s`);
  }

  const frames = keyframes.slice(0, 6);
  const client = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

  const userContent: Groq.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: 'Analyze the following frames and return the JSON form-check.' },
    ...frames.map((f) => ({
      type: 'image_url' as const,
      image_url: { url: f.dataUri },
    })),
  ];

  _lastRunAt = Date.now();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(lift, note) },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '';
  const parsed = parseJsonObject(raw) as Record<string, unknown>;

  const verdict = coerceVerdict(parsed.verdict);
  const scoreRaw = typeof parsed.score === 'number' ? parsed.score : undefined;
  const score = scoreRaw !== undefined
    ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
    : undefined;

  return {
    verdict,
    cues: coerceStringArray(parsed.cues),
    safetyFlags: coerceStringArray(parsed.safetyFlags),
    score,
    model: MODEL,
  };
}
