'use client';

/**
 * AI Coach Chat — /app/coach
 *
 * Full-screen conversational interface.
 * Supports two modes selected automatically from the athlete's profile:
 *   MODE A — On-device  (Phi-3.5-mini via Transformers.js Worker, offline-first)
 *   MODE B — Groq       (llama-3.3-70b-versatile, needs a free Groq API key)
 *
 * Chat history is persisted to db.chat (IndexedDB).
 * Only the last 10 messages are sent as context to the AI backend.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { toast }                                            from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Progress }                                         from '@/components/ui/progress';
import { db, newId }                                        from '@/lib/db/database';
import type { ChatMessage as DBChatMessage }                from '@/lib/db/types';
import {
  buildSystemPrompt,
  sendMessage,
  loadOnDeviceModel,
  stopGeneration,
  isModelLoaded,
  type ChatMessage,
  type ProgressPayload,
} from '@/lib/ai/coach';
import { parseActions, executeAction, type CoachAction, type ActionResult } from '@/lib/ai/coach-actions';
import { loadChatContext, summarizeIfNeeded }            from '@/lib/ai/memory';
import { C }                                            from '@/lib/theme';

// ── Suggested quick-prompts ───────────────────────────────────────────────────
const DEFAULT_PROMPTS = [
  'What should I eat today for my training?',
  'I only have 45 minutes — adjust my session.',
  'Why is my program structured this way?',
  'How should I warm up for squats today?',
];

interface CoachContext {
  blockType?: string;
  meetInDays?: number;
  overshooter?: boolean;
  lowReadinessTrend?: boolean;
}

/**
 * Generate contextual suggested prompts based on the athlete's current
 * training state. Falls back to defaults when no interesting context exists.
 */
function getContextualPrompts(ctx: CoachContext): string[] {
  const prompts: string[] = [];

  if (ctx.meetInDays !== undefined && ctx.meetInDays <= 14) {
    prompts.push('Help me plan my attempt selections for the meet.');
  }

  if (ctx.meetInDays !== undefined && ctx.meetInDays <= 7) {
    prompts.push('What should I eat the day before the meet?');
  }

  if (ctx.blockType === 'DELOAD') {
    prompts.push('What should my deload nutrition look like?');
  }

  if (ctx.overshooter) {
    prompts.push('I keep overshooting RPE — adjust my session targets.');
  }

  if (ctx.lowReadinessTrend) {
    prompts.push('My readiness has been low — reduce today\'s session.');
  }

  // Fill remaining slots with defaults (avoid duplicates)
  for (const d of DEFAULT_PROMPTS) {
    if (prompts.length >= 4) break;
    if (!prompts.includes(d)) prompts.push(d);
  }

  return prompts.slice(0, 4);
}

// ── Model status type ─────────────────────────────────────────────────────────
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoNow() {
  return new Date().toISOString();
}

function bytesToMb(bytes: number) {
  return (bytes / 1_048_576).toFixed(0);
}

// ── Settings sheet ────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  groqKey:         string;
  onGroqKeyChange: (key: string) => void;
  modelStatus:     ModelStatus;
  loadProgress:    ProgressPayload | null;
  onClearChat:     () => void;
}

function SettingsSheet({
  groqKey,
  onGroqKeyChange,
  modelStatus,
  loadProgress,
  onClearChat,
}: SettingsSheetProps) {
  const [draft, setDraft]         = useState(groqKey);
  const [showKey, setShowKey]     = useState(false);

  function saveKey() {
    onGroqKeyChange(draft.trim());
    toast('API key saved.', { duration: 2000 });
  }

  const pct = loadProgress?.progress ?? (
    loadProgress?.loaded && loadProgress?.total
      ? Math.round((loadProgress.loaded / loadProgress.total) * 100)
      : 0
  );

  return (
    <SheetContent
      side="right"
      className="border-l"
      style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text, width: '100%', maxWidth: 380 }}
    >
      <SheetHeader className="mb-6">
        <SheetTitle style={{ color: C.text }}>Coach Settings</SheetTitle>
      </SheetHeader>

      {/* Mode indicator */}
      <div className="mb-6 rounded-xl p-4" style={{ backgroundColor: C.surface }}>
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>Active mode</p>
        {groqKey ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.green }} />
            <span className="font-semibold" style={{ color: C.green }}>Groq — Online</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.muted }} />
            <span className="font-semibold" style={{ color: C.muted }}>On-device — Offline</span>
          </div>
        )}
      </div>

      {/* Groq key input */}
      <div className="mb-6">
        <label htmlFor="coach-groq-key" className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: C.muted }}>
          Groq API Key
        </label>
        <p className="text-xs mb-3" style={{ color: C.muted }}>
          Free tier at <span style={{ color: C.gold }}>console.groq.com</span>. Unlocks better AI quality.
        </p>
        <div className="flex gap-2 mb-2">
          <input
            id="coach-groq-key"
            type={showKey ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="gsk_xxxxxxxxxxxxxxxx"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: C.dim, borderColor: C.border, color: C.text }}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: C.dim, color: C.muted }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <button
          type="button"
          onClick={saveKey}
          className="w-full py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: C.accent, color: C.text }}
        >
          Save key
        </button>
        {groqKey && (
          <button
            type="button"
            onClick={() => { setDraft(''); onGroqKeyChange(''); }}
            className="w-full mt-2 py-2 rounded-lg text-sm"
            style={{ color: C.muted }}
          >
            Remove key (switch to on-device)
          </button>
        )}
      </div>

      {/* On-device model status */}
      {!groqKey && (
        <div className="mb-6 rounded-xl p-4" style={{ backgroundColor: C.surface }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
            On-device model — Phi-3.5-mini (~2.2 GB)
          </p>
          {modelStatus === 'ready' && (
            <p className="text-sm" style={{ color: C.green }}>✓ Downloaded &amp; ready</p>
          )}
          {modelStatus === 'loading' && (
            <>
              <p className="text-sm mb-2" style={{ color: C.gold }}>Downloading…</p>
              {loadProgress && (
                <>
                  <Progress value={pct} className="h-2 mb-1" />
                  <p className="text-xs" style={{ color: C.muted }}>
                    {loadProgress.loaded ? `${bytesToMb(loadProgress.loaded)} MB` : ''}
                    {loadProgress.total  ? ` / ${bytesToMb(loadProgress.total)} MB` : ''}
                    {pct > 0            ? ` (${pct}%)` : ''}
                  </p>
                </>
              )}
            </>
          )}
          {modelStatus === 'idle' && (
            <p className="text-sm" style={{ color: C.muted }}>Not yet loaded.</p>
          )}
          {modelStatus === 'error' && (
            <p className="text-sm" style={{ color: C.accent }}>Error loading model. Check connection &amp; retry.</p>
          )}
        </div>
      )}

      {/* Clear conversation */}
      <button
        type="button"
        onClick={onClearChat}
        className="w-full py-3 rounded-xl text-sm font-semibold border"
        style={{ borderColor: C.accent, color: C.accent }}
      >
        Clear conversation
      </button>
    </SheetContent>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

interface BubbleProps {
  role:    'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

function MessageBubble({ role, content, streaming = false }: BubbleProps) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
        style={{
          backgroundColor: isUser ? C.accent  : C.surface,
          color:           isUser ? '#FFFFFF' : C.text,
          borderRadius:    isUser
            ? '1rem 1rem 0.25rem 1rem'
            : '1rem 1rem 1rem 0.25rem',
        }}
      >
        {content || (streaming ? '' : '…')}
        {streaming && (
          <span
            className="inline-block w-2 h-4 ml-0.5 align-middle rounded-sm animate-pulse"
            style={{ backgroundColor: C.muted }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CoachPage() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [messages,       setMessages]       = useState<DBChatMessage[]>([]);
  const [groqKey,        setGroqKey]        = useState<string>('');
  const [modelStatus,    setModelStatus]    = useState<ModelStatus>('idle');
  const [loadProgress,   setLoadProgress]   = useState<ProgressPayload | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(DEFAULT_PROMPTS);

  // ── Input state ───────────────────────────────────────────────────────────
  const [input,          setInput]          = useState('');
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [streamingText,  setStreamingText]  = useState('');

  // ── Settings sheet ────────────────────────────────────────────────────────
  const [settingsOpen,   setSettingsOpen]   = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef     = useRef(false);

  // ── Load chat history + profile on mount ─────────────────────────────────
  useEffect(() => {
    async function init() {
      // Load last 20 messages (chronological order)
      const recent = await db.chat
        .orderBy('createdAt')
        .reverse()
        .limit(20)
        .toArray();
      setMessages(recent.reverse());

      // Load Groq key from profile + build contextual prompts
      const profile = await db.profile.get('me');
      const key = profile?.groqApiKey ?? '';
      setGroqKey(key);

      // Build context for suggested prompts
      const ctx: CoachContext = { overshooter: profile?.overshooter };
      try {
        // Check for active cycle + block
        const cycle = await db.cycles.where('status').equals('ACTIVE').first();
        if (cycle) {
          const blocks = await db.blocks.where('cycleId').equals(cycle.id).toArray();
          const currentBlock = blocks.find(
            (b) => cycle.currentWeek >= b.weekStart && cycle.currentWeek <= b.weekEnd,
          );
          if (currentBlock) ctx.blockType = currentBlock.blockType;
        }
        // Check for upcoming meet within 14 days
        const meets = await db.meets.where('status').equals('UPCOMING').toArray();
        const now = Date.now();
        for (const m of meets) {
          const daysUntil = Math.floor((new Date(m.date).getTime() - now) / 86_400_000);
          if (daysUntil >= 0 && (ctx.meetInDays === undefined || daysUntil < ctx.meetInDays)) {
            ctx.meetInDays = daysUntil;
          }
        }
        // Check for low readiness trend (last 3 check-ins avg < 60)
        const recentReadiness = await db.readiness.orderBy('date').reverse().limit(3).toArray();
        if (recentReadiness.length >= 3) {
          const avg = recentReadiness.reduce((s, r) => s + r.readinessScore, 0) / recentReadiness.length;
          ctx.lowReadinessTrend = avg < 60;
        }
      } catch {
        // Non-critical — fall back to defaults
      }
      setSuggestedPrompts(getContextualPrompts(ctx));

      // If model is already cached, mark as ready.
      // Otherwise wait for explicit user action — don't auto-download 2.2 GB.
      if (isModelLoaded()) {
        setModelStatus('ready');
      }
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Model loader ──────────────────────────────────────────────────────────
  function startModelLoad() {
    setModelStatus('loading');
    loadOnDeviceModel((p) => {
      setLoadProgress(p);
    })
      .then(() => {
        setModelStatus('ready');
        setLoadProgress(null);
      })
      .catch((err) => {
        console.error('[coach] model load error:', err);
        setModelStatus('error');
      });
  }

  // ── Save Groq key ─────────────────────────────────────────────────────────
  const handleGroqKeyChange = useCallback(async (key: string) => {
    setGroqKey(key);
    try {
      await db.profile.update('me', {
        groqApiKey: key || undefined,
        updatedAt:  new Date().toISOString(),
      });
      // Switch to on-device if key removed
      if (!key && !isModelLoaded()) {
        startModelLoad();
      }
    } catch (err) {
      console.error('[coach] save key failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clear conversation ────────────────────────────────────────────────────
  const handleClearChat = useCallback(async () => {
    await db.chat.clear();
    setMessages([]);
    setStreamingText('');
    setSettingsOpen(false);
    toast('Conversation cleared.', { duration: 2000 });
  }, []);

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 84) + 'px'; // max ~3 lines
  }

  // ── Pending actions from AI responses ────────────────────────────────────
  const [pendingActions,   setPendingActions]   = useState<CoachAction[]>([]);
  const [executingAction,  setExecutingAction]  = useState<string | null>(null);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isGenerating) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    abortRef.current = false;

    // Build + save user message
    const userMsg: DBChatMessage = {
      id:        newId(),
      role:      'user',
      content:   userText,
      createdAt: isoNow(),
    };
    void db.chat.add(userMsg);
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);
    setStreamingText('');
    setPendingActions([]);

    const isGroq = Boolean(groqKey);

    // Build context: system prompt (with memory + summary baked in) + tiered
    // chat window (rolling summary already inside the system prompt, so raw
    // messages only include the portion after the last summarized range).
    const [systemPrompt, chatCtx] = await Promise.all([
      buildSystemPrompt(userText, isGroq),
      loadChatContext(isGroq ? 'groq' : 'local'),
    ]);
    const context: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chatCtx.messages.map((m) => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Stream response (increased token limit for richer responses)
    let fullResponse = '';
    try {
      const gen = sendMessage(context, groqKey || undefined, 1024);
      for await (const token of gen) {
        if (abortRef.current) break;
        fullResponse += token;
        setStreamingText(fullResponse);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[coach] generation error:', msg);
      fullResponse = 'Something went wrong. Check your connection or API key.';
    }

    // Parse actions from response and clean the display text
    const { cleanText, actions } = parseActions(fullResponse);

    // Persist assistant message (clean text without action tags)
    if (cleanText) {
      const assistantMsg: DBChatMessage = {
        id:        newId(),
        role:      'assistant',
        content:   cleanText,
        createdAt: isoNow(),
      };
      void db.chat.add(assistantMsg);
      setMessages((prev) => [...prev, assistantMsg]);
    }

    // Set pending actions for the user to confirm
    if (actions.length > 0) {
      setPendingActions(actions);
    }

    setStreamingText('');
    setIsGenerating(false);
    abortRef.current = false;

    // Rolling summarization runs in the background; it's an optimization, not
    // a correctness requirement. Swallow errors — the next turn will retry.
    void summarizeIfNeeded(groqKey || undefined).catch(() => undefined);
  }, [input, isGenerating, groqKey]);

  // ── Execute a confirmed action ─────────────────────────────────────────────
  const handleExecuteAction = useCallback(async (action: CoachAction) => {
    setExecutingAction(action.type);
    const result = await executeAction(action);

    // Add a system message confirming the action
    const statusMsg: DBChatMessage = {
      id:        newId(),
      role:      'assistant',
      content:   result.success ? `✓ ${result.message}` : `✗ ${result.message}`,
      createdAt: isoNow(),
    };
    void db.chat.add(statusMsg);
    setMessages((prev) => [...prev, statusMsg]);

    if (result.success) {
      toast(result.message, { duration: 3000 });
    } else {
      toast(result.message, { duration: 4000 });
    }

    // Remove executed action from pending
    setPendingActions((prev) => prev.filter((a) => a !== action));
    setExecutingAction(null);
  }, []);

  const handleDismissAction = useCallback((action: CoachAction) => {
    setPendingActions((prev) => prev.filter((a) => a !== action));
  }, []);

  // ── Stop generation ───────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    abortRef.current = true;
    stopGeneration();
  }, []);

  // ── Keyboard send (Cmd/Ctrl+Enter) ────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Determine active mode ─────────────────────────────────────────────────
  const isGroqMode = Boolean(groqKey);

  // ── Setup choice screen (no key, model not started yet) ──────────────────
  if (!isGroqMode && modelStatus === 'idle') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: C.bg, color: C.text }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8"
          style={{ backgroundColor: C.surface }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-6"
            style={{ backgroundColor: `${C.accent}20`, border: `2px solid ${C.accent}` }}
          >
            🧠
          </div>

          <h2 className="text-xl font-bold mb-1 text-center">Set up your AI Coach</h2>
          <p className="text-sm text-center mb-6" style={{ color: C.muted }}>
            Choose how you want to power the coach.
          </p>

          {/* Option A — Groq (recommended) */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-full rounded-xl p-4 mb-3 text-left border-2 transition-all active:opacity-70"
            style={{ backgroundColor: C.bg, borderColor: C.accent }}
          >
            <p className="font-bold mb-0.5" style={{ color: C.accent }}>
              ⚡ Groq — Recommended
            </p>
            <p className="text-sm" style={{ color: C.muted }}>
              Free API key at <span style={{ color: C.gold }}>console.groq.com</span>.
              Fast, no download needed.
            </p>
          </button>

          {/* Option B — On-device */}
          <button
            type="button"
            onClick={() => startModelLoad()}
            className="w-full rounded-xl p-4 text-left border transition-all active:opacity-70"
            style={{ backgroundColor: C.bg, borderColor: C.border }}
          >
            <p className="font-bold mb-0.5" style={{ color: C.text }}>
              📱 On-device — Offline
            </p>
            <p className="text-sm" style={{ color: C.muted }}>
              Downloads Phi-3.5-mini once (~2.2 GB). Works offline, no key needed.
            </p>
          </button>
        </div>

        {/* Settings sheet for entering Groq key */}
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SettingsSheet
            groqKey={groqKey}
            onGroqKeyChange={async (key) => {
              await handleGroqKeyChange(key);
              if (key) setSettingsOpen(false);
            }}
            modelStatus={modelStatus}
            loadProgress={loadProgress}
            onClearChat={handleClearChat}
          />
        </Sheet>
      </div>
    );
  }

  // ── Model download progress screen ────────────────────────────────────────
  if (!isGroqMode && modelStatus === 'loading') {
    const pct = loadProgress?.progress ?? (
      loadProgress?.loaded && loadProgress?.total
        ? Math.round((loadProgress.loaded / loadProgress.total) * 100)
        : 0
    );
    const loadedMb = loadProgress?.loaded ? bytesToMb(loadProgress.loaded) : '0';
    const totalMb  = loadProgress?.total  ? bytesToMb(loadProgress.total)  : '~2250';

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: C.bg, color: C.text }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{ backgroundColor: C.surface }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 animate-pulse"
            style={{ backgroundColor: `${C.accent}20`, border: `2px solid ${C.accent}` }}
          >
            🧠
          </div>

          <h2 className="text-xl font-bold mb-2">Downloading AI Model</h2>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            This happens once (~2.2 GB). After this, everything runs offline.
          </p>

          <div className="mb-3">
            <Progress value={pct} className="h-3" />
          </div>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            {loadedMb} MB / {totalMb} MB
            {pct > 0 ? ` — ${pct}%` : ''}
          </p>

          <p className="text-xs" style={{ color: C.muted }}>
            Keep the app open. This may take a few minutes on mobile data.
          </p>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-6 text-xs underline"
            style={{ color: C.gold }}
          >
            Add a free Groq key for instant access instead →
          </button>
        </div>

        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SettingsSheet
            groqKey={groqKey}
            onGroqKeyChange={handleGroqKeyChange}
            modelStatus={modelStatus}
            loadProgress={loadProgress}
            onClearChat={handleClearChat}
          />
        </Sheet>
      </div>
    );
  }

  // ── Main chat interface ───────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden animate-fade-in"
      style={{ height: '100dvh', backgroundColor: C.bg, color: C.text }}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 pt-10 pb-3 border-b"
        style={{ borderColor: C.border }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">AI Coach</h1>
          {/* Mode badge */}
          {isGroqMode ? (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.green}20`, color: C.green }}
            >
              Groq
            </span>
          ) : (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.muted}20`, color: C.muted }}
            >
              On-device
            </span>
          )}
        </div>

        {/* Settings trigger — base-ui Dialog.Trigger renders as a button; style it directly */}
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetTrigger
            className="w-9 h-9 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: C.dim }}
            aria-label="Coach settings"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" style={{ color: C.muted }}>
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </SheetTrigger>
          <SettingsSheet
            groqKey={groqKey}
            onGroqKeyChange={handleGroqKeyChange}
            modelStatus={modelStatus}
            loadProgress={loadProgress}
            onClearChat={handleClearChat}
          />
        </Sheet>
      </div>

      {/* ── MESSAGE LIST ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* Suggested prompts when chat is empty */}
        {messages.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center gap-3 mt-8 mb-6">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-2"
              style={{ backgroundColor: `${C.accent}18`, border: `1.5px solid ${C.accent}` }}
            >
              💪
            </div>
            <p className="text-sm text-center mb-2" style={{ color: C.muted }}>
              Ask about nutrition, technique, recovery — or ask me to adjust your session.
            </p>
            <div className="w-full max-w-sm grid gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSend(prompt)}
                  className="text-left px-4 py-3 rounded-xl text-sm border transition-colors active:opacity-70"
                  style={{
                    backgroundColor: C.surface,
                    borderColor:     C.border,
                    color:           C.text,
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Persisted messages */}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role as 'user' | 'assistant'} content={m.content} />
        ))}

        {/* Streaming message */}
        {isGenerating && (
          <MessageBubble
            role="assistant"
            content={streamingText}
            streaming
          />
        )}

        {/* Action cards — shown after the AI suggests a change */}
        {pendingActions.length > 0 && !isGenerating && (
          <div className="flex flex-col gap-2 mb-3 max-w-[85%]">
            {pendingActions.map((action, i) => (
              <div
                key={`${action.type}-${i}`}
                className="rounded-xl p-3 border"
                style={{
                  backgroundColor: `${C.gold}10`,
                  borderColor: C.gold,
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: C.gold }}>
                  Suggested Change
                </p>
                <p className="text-sm mb-3" style={{ color: C.text }}>
                  {action.displayText}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExecuteAction(action)}
                    disabled={executingAction !== null}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: C.gold, color: C.bg }}
                  >
                    {executingAction === action.type ? 'Applying...' : action.confirmText}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismissAction(action)}
                    className="px-4 py-2 rounded-lg text-sm transition-all active:scale-[0.97]"
                    style={{ backgroundColor: C.dim, color: C.muted }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── INPUT AREA ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t px-3 py-3"
        style={{ backgroundColor: C.surface, borderColor: C.border }}
      >
        <div className="flex items-end gap-2">
          {/* Multi-line input */}
          <textarea
            id="coach-message"
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach…"
            aria-label="Message to coach"
            rows={1}
            disabled={isGenerating}
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm resize-none outline-none leading-relaxed transition-colors"
            style={{
              backgroundColor: C.bg,
              borderColor:     input ? C.accent : C.border,
              color:           C.text,
              minHeight:       40,
              maxHeight:       84,
            }}
          />

          {/* Stop / Send button */}
          {isGenerating ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: C.dim }}
              aria-label="Stop generating"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: C.muted }}>
                <rect x="4" y="4" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-30 active:scale-95"
              style={{ backgroundColor: C.accent }}
              aria-label="Send message"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" style={{ color: '#fff' }}>
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs mt-1.5 text-center" style={{ color: C.muted }}>
          {isGenerating ? 'Generating…' : 'Cmd+Enter to send'}
        </p>
      </div>
    </div>
  );
}
