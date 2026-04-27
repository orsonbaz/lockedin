'use client';

/**
 * Settings → Memory — /settings/memory
 *
 * Lists everything the coach remembers about the athlete. Grouped by kind so
 * injuries, preferences, goals, etc. are easy to review. Each row can be
 * deleted (that's the user-facing FORGET).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus, MessageSquare } from 'lucide-react';
import { C } from '@/lib/theme';
import { addMemory, listMemories, removeMemory, describeExpiry, parseExpiry } from '@/lib/ai/memory';
import type { AthleteMemory, MemoryKind } from '@/lib/db/types';

const KIND_LABELS: Record<MemoryKind, string> = {
  INJURY:      'Injuries',
  PREFERENCE:  'Preferences',
  CONSTRAINT:  'Constraints',
  GOAL:        'Goals',
  LIFE_EVENT:  'Life events',
  PAST_ADVICE: 'Past advice',
};

const KIND_ORDER: MemoryKind[] = [
  'INJURY', 'CONSTRAINT', 'PREFERENCE', 'GOAL', 'LIFE_EVENT', 'PAST_ADVICE',
];

const EXPIRY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'permanent', label: 'Permanent' },
  { value: '7d',        label: '1 week'    },
  { value: '14d',       label: '2 weeks'   },
  { value: '1m',        label: '1 month'   },
  { value: '3m',        label: '3 months'  },
];

export default function MemorySettingsPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<AthleteMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState<MemoryKind>('PREFERENCE');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newExpiry, setNewExpiry] = useState<string>('permanent');

  const refresh = useCallback(async () => {
    const rows = await listMemories();
    setMemories(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await removeMemory(id);
    toast.success('Memory forgotten');
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    const content = newContent.trim();
    if (!content) {
      toast.error('Content required');
      return;
    }
    await addMemory({
      kind: newKind,
      content,
      tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
      importance: 3,
      expiresAt: parseExpiry(newExpiry),
    });
    setNewContent('');
    setNewTags('');
    setNewExpiry('permanent');
    setAddOpen(false);
    toast.success('Memory saved');
    void refresh();
  }, [newKind, newContent, newTags, newExpiry, refresh]);

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: memories.filter((m) => m.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.bg, color: C.text }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: C.bg, borderColor: C.border }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm"
          style={{ color: C.muted }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-base font-semibold" style={{ color: C.text }}>
          Coach Memory
        </h1>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: C.accent, color: '#1a1000' }}
        >
          <Plus size={16} />
          Add
        </button>
      </header>

      <div className="px-4 pt-4 max-w-xl mx-auto">
        <p className="text-xs mb-5" style={{ color: C.muted }}>
          Durable facts your coach remembers across conversations. Add an injury
          or preference here and it will be considered the next time you chat.
        </p>

        {/* Add form */}
        {addOpen && (
          <div
            className="rounded-xl p-3 mb-4 space-y-2"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <label className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Kind</label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as MemoryKind)}
              className="w-full rounded-lg px-2 py-2 text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>

            <label className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Content</label>
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={280}
              placeholder="e.g. Left shoulder impingement, avoid overhead press"
              className="w-full rounded-lg px-2 py-2 text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            />

            <label className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="shoulder, mobility"
              className="w-full rounded-lg px-2 py-2 text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            />

            <label className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Duration</label>
            <select
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full rounded-lg px-2 py-2 text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAdd}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: C.accent, color: '#1a1000' }}
              >
                Save
              </button>
              <button
                onClick={() => setAddOpen(false)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: C.dim, color: C.text }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-sm" style={{ color: C.muted }}>Loading…</p>}

        {!loading && grouped.length === 0 && (
          <div
            className="rounded-xl p-5 text-center text-sm"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
          >
            No memories yet. Tell your coach something durable (an injury, a
            preference, a constraint) and use the <em>Remember</em> action when it appears.
          </div>
        )}

        {grouped.map((group) => (
          <section key={group.kind} className="mb-5">
            <p
              className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
              style={{ color: C.muted }}
            >
              {KIND_LABELS[group.kind]}
            </p>
            <div
              className="rounded-xl overflow-hidden divide-y"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
            >
              {group.items.map((m) => {
                const meta: string[] = [];
                if (m.tags.length > 0)   meta.push(m.tags.map((t) => `#${t}`).join(' '));
                if (m.importance >= 4)   meta.push('priority');
                meta.push(describeExpiry(m.expiresAt));
                return (
                  <div
                    key={m.id}
                    className="flex items-start gap-3 px-3 py-3"
                    style={{ borderColor: C.border }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: C.text }}>
                        {m.content}
                      </p>
                      <p className="text-xs mt-1" style={{ color: C.muted }}>
                        {meta.join(' · ')}
                      </p>
                      {m.sourceMessageId && (
                        <Link
                          href={`/coach?msg=${m.sourceMessageId}`}
                          className="inline-flex items-center gap-1 text-xs mt-1.5 underline-offset-2 hover:underline"
                          style={{ color: C.accent }}
                        >
                          <MessageSquare size={12} />
                          From chat
                        </Link>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      aria-label="Forget memory"
                      className="p-1.5 rounded"
                      style={{ color: C.muted }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
