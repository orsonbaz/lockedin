/**
 * Long-term coach memory.
 *
 * Replaces the old "send last 10 messages" chat window with a tiered approach:
 *   1. Rolling conversation summaries — older messages collapse into paragraph
 *      summaries so context stays bounded across long relationships.
 *   2. Structured athlete memories — durable facts (injuries, preferences,
 *      goals, constraints) stored separately from chat and retrieved by
 *      relevance to the incoming message.
 *
 * Memory writes happen via REMEMBER / FORGET action tags emitted by the coach
 * and confirmed by the user (same pattern as every other coach action).
 */

import Groq from 'groq-sdk';
import { db, newId } from '@/lib/db/database';
import type {
  AthleteMemory,
  ConversationSummary,
  ChatMessage,
  MemoryKind,
} from '@/lib/db/types';

const MEMORY_KINDS: MemoryKind[] = [
  'INJURY', 'PREFERENCE', 'LIFE_EVENT', 'PAST_ADVICE', 'GOAL', 'CONSTRAINT',
];

const SUMMARIZE_TRIGGER = 20;   // messages since last summary
const SUMMARIZE_BATCH_MAX = 40; // upper bound per summary pass

// ── Memory retrieval ─────────────────────────────────────────────────────────

/**
 * Score a memory's relevance to the user's incoming message.
 * Simple BM25-ish heuristic: tag overlap + importance + recency.
 * No vectors — the dataset is small and this is good enough.
 */
function scoreMemory(m: AthleteMemory, queryTokens: Set<string>, nowMs: number): number {
  let score = m.importance * 2; // 2-10 base

  for (const tag of m.tags) {
    if (queryTokens.has(tag.toLowerCase())) score += 4;
  }
  // Token overlap with content (loose)
  const contentTokens = m.content.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  for (const tok of contentTokens) {
    if (queryTokens.has(tok)) { score += 1; break; }
  }

  // Recency boost: full strength within 30 days, decaying to 0 at 180 days.
  const ageDays = (nowMs - new Date(m.createdAt).getTime()) / 86_400_000;
  if (ageDays < 30) score += 2;
  else if (ageDays < 90) score += 1;

  return score;
}

function tokenize(text: string | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().split(/\W+/).filter((t) => t.length > 2),
  );
}

export async function retrieveRelevantMemories(
  userMessage: string | undefined,
  limit = 8,
): Promise<AthleteMemory[]> {
  const all = await db.athleteMemory.toArray();
  if (all.length === 0) return [];

  const now = Date.now();
  // Drop expired
  const live = all.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);

  const query = tokenize(userMessage);
  const scored = live.map((m) => ({ m, s: scoreMemory(m, query, now) }));
  scored.sort((a, b) => b.s - a.s);

  return scored.slice(0, limit).map((x) => x.m);
}

export async function buildMemorySection(
  userMessage: string | undefined,
  maxChars: number,
): Promise<string> {
  const memories = await retrieveRelevantMemories(userMessage);
  if (memories.length === 0) return '';

  const lines: string[] = [];
  let used = 0;
  for (const m of memories) {
    const line = `- [${m.kind}] ${m.content}${m.tags.length ? ` (${m.tags.join(', ')})` : ''}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

// ── Conversation summaries ───────────────────────────────────────────────────

export async function getLatestSummary(): Promise<ConversationSummary | undefined> {
  return db.conversationSummaries.orderBy('periodEnd').reverse().first();
}

export async function buildSummarySection(maxChars: number): Promise<string> {
  const latest = await getLatestSummary();
  if (!latest) return '';
  const header = `(Through ${latest.periodEnd}, ${latest.messageCount} prior messages)`;
  const body = `${header}\n${latest.summary}`;
  return body.length <= maxChars ? body : `${header}\n${latest.summary.slice(0, maxChars - header.length - 2)}…`;
}

// ── Chat context loading (replaces .limit(10)) ───────────────────────────────

export interface ChatContext {
  /** Summary of everything before these messages, if any. */
  summary?: ConversationSummary;
  /** Raw recent messages that should be sent verbatim. */
  messages: ChatMessage[];
}

/**
 * Load the effective chat context. Anything covered by the latest summary is
 * excluded from the raw window (the summary stands in for it in the prompt).
 *
 * @param mode 'groq' gets a wider raw window; 'local' keeps it tight for Phi.
 */
export async function loadChatContext(mode: 'groq' | 'local' = 'groq'): Promise<ChatContext> {
  const rawLimit = mode === 'groq' ? 20 : 6;
  const summary = await getLatestSummary();

  // Pull messages strictly after the last summarized range.
  const all = await db.chat.orderBy('createdAt').toArray();
  const fresh = summary
    ? all.filter((m) => m.createdAt > summary.periodEnd)
    : all;

  const recent = fresh.slice(-rawLimit);
  return { summary, messages: recent };
}

// ── Rolling summarization ─────────────────────────────────────────────────────

/**
 * If enough unsummarized messages have accumulated, produce a new rolling
 * summary. Uses Groq `llama-3.1-8b-instant` when available (cheap + fast);
 * otherwise silently skips (on-device summarization TBD).
 *
 * Returns the new summary row, or undefined if no summary was produced.
 */
export async function summarizeIfNeeded(groqApiKey?: string): Promise<ConversationSummary | undefined> {
  const last = await getLatestSummary();
  const since = last?.periodEnd ?? '';
  const pending = await db.chat
    .where('createdAt').above(since)
    .toArray();

  if (pending.length < SUMMARIZE_TRIGGER) return undefined;

  const batch = pending.slice(0, SUMMARIZE_BATCH_MAX);
  const transcript = batch
    .map((m) => `${m.role === 'user' ? 'Athlete' : m.role === 'assistant' ? 'Coach' : 'System'}: ${m.content}`)
    .join('\n')
    .slice(0, 8000); // hard cap

  const systemPrompt = `You are a summarizer for a powerlifting coaching app. Condense the conversation into a tight paragraph (under 600 chars) capturing: durable facts about the athlete, decisions made, advice given, and open questions. Then on a new line output TOPICS: a comma-separated list of 3-6 lowercase topic tags.`;

  let summaryText = '';
  let topics: string[] = [];

  if (groqApiKey?.trim()) {
    try {
      const client = new Groq({ apiKey: groqApiKey.trim(), dangerouslyAllowBrowser: true });
      // Non-streaming call — guard against hung sockets with a 25s timeout.
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 25_000);
      let res;
      try {
        res = await client.chat.completions.create(
          {
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: transcript },
            ],
            max_tokens: 400,
          },
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timeoutId);
      }
      const out = res.choices[0]?.message?.content ?? '';
      const topicMatch = out.match(/TOPICS:\s*(.+)$/im);
      topics = topicMatch
        ? topicMatch[1].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];
      summaryText = out.replace(/TOPICS:.*$/im, '').trim();
    } catch (err) {
      console.warn('[memory] summarization failed:', err);
      return undefined;
    }
  } else {
    // Without Groq we skip silently; on-device summarization can be added later.
    // Falling back to a naive extractive summary risks polluting the memory.
    return undefined;
  }

  if (!summaryText) return undefined;

  const summary: ConversationSummary = {
    id: newId(),
    periodStart: batch[0].createdAt,
    periodEnd: batch[batch.length - 1].createdAt,
    messageCount: batch.length,
    summary: summaryText,
    topics,
    createdAt: new Date().toISOString(),
  };
  await db.conversationSummaries.add(summary);
  return summary;
}

// ── Memory CRUD (used by REMEMBER / FORGET actions and the settings page) ────

export function isValidMemoryKind(s: string): s is MemoryKind {
  return (MEMORY_KINDS as string[]).includes(s);
}

export interface MemoryInput {
  kind: MemoryKind;
  content: string;
  tags?: string[];
  importance?: number;
  expiresAt?: string;
  sourceMessageId?: string;
}

export async function addMemory(input: MemoryInput): Promise<AthleteMemory> {
  const content = input.content.trim().slice(0, 280);
  if (!content) throw new Error('Memory content required.');

  const memory: AthleteMemory = {
    id: newId(),
    kind: input.kind,
    content,
    tags: (input.tags ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    importance: Math.max(1, Math.min(5, Math.round(input.importance ?? 3))),
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    sourceMessageId: input.sourceMessageId,
  };
  await db.athleteMemory.add(memory);
  return memory;
}

export async function removeMemory(id: string): Promise<boolean> {
  const existing = await db.athleteMemory.get(id);
  if (!existing) return false;
  await db.athleteMemory.delete(id);
  return true;
}

export async function listMemories(): Promise<AthleteMemory[]> {
  return db.athleteMemory.orderBy('createdAt').reverse().toArray();
}
