'use client';

/**
 * Form History — /progress/form-history
 *
 * Chronological list of past form checks with their verdict, cues, and
 * sampled keyframes. Tap an entry to expand it inline.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { C } from '@/lib/theme';
import { listFormChecks, deleteFormCheck } from '@/lib/video/form-check-db';
import { db } from '@/lib/db/database';
import type { FormCheck, FormCheckKeyframe, FormVerdict } from '@/lib/db/types';

const VERDICT_COLOR: Record<FormVerdict, string> = {
  GOOD:        C.green,
  MINOR_FIXES: C.gold,
  MAJOR_FIXES: C.accent,
  UNSAFE:      C.red,
  UNCLEAR:     C.muted,
};

const VERDICT_LABEL: Record<FormVerdict, string> = {
  GOOD:        'Clean',
  MINOR_FIXES: 'Minor fixes',
  MAJOR_FIXES: 'Major fixes',
  UNSAFE:      'Unsafe',
  UNCLEAR:     'Unclear',
};

export default function FormHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<FormCheck[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [frames, setFrames] = useState<Record<string, FormCheckKeyframe[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await listFormChecks({ limit: 50 });
    setChecks(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!frames[id]) {
      const fs = await db.formCheckKeyframes.where('formCheckId').equals(id).sortBy('index');
      setFrames((prev) => ({ ...prev, [id]: fs }));
    }
  }, [expanded, frames]);

  const remove = useCallback(async (id: string) => {
    await deleteFormCheck(id);
    toast('Removed', { duration: 1500 });
    setFrames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await load();
  }, [load]);

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
          <h1 className="text-xl font-bold">Form History</h1>
          <button
            type="button"
            onClick={() => router.push('/form-check')}
            className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            <Camera size={13} />
            New
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center pt-12">
            <div className="w-8 h-8 rounded-full border-4 animate-spin"
              style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
          </div>
        ) : checks.length === 0 ? (
          <div
            className="mt-6 rounded-3xl p-6 text-center"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: `${C.accent}20` }}
            >
              <Camera size={24} color={C.accent} />
            </div>
            <h2 className="text-base font-bold mb-1">No form checks yet</h2>
            <p className="text-sm mb-5" style={{ color: C.muted }}>
              Record a short clip of any lift and the vision model will flag technique issues.
            </p>
            <button
              type="button"
              onClick={() => router.push('/form-check')}
              className="px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95"
              style={{ backgroundColor: C.accent, color: '#fff' }}
            >
              Record first check
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {checks.map((c) => {
              const color = VERDICT_COLOR[c.verdict];
              const isOpen = expanded === c.id;
              return (
                <div
                  key={c.id}
                  className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                >
                  <button
                    type="button"
                    onClick={() => void toggle(c.id)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <div
                      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <span className="text-xs font-black" style={{ color }}>
                        {c.score ?? '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                        {c.lift} · <span style={{ color }}>{VERDICT_LABEL[c.verdict]}</span>
                      </p>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {new Date(c.analyzedAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                        {c.note ? ` · ${c.note}` : ''}
                      </p>
                    </div>
                    {isOpen
                      ? <ChevronDown size={18} color={C.muted} />
                      : <ChevronRight size={18} color={C.muted} />}
                  </button>

                  {isOpen && (
                    <div
                      className="px-4 py-3 border-t space-y-3"
                      style={{ borderColor: C.border, backgroundColor: C.bg }}
                    >
                      {(frames[c.id] ?? []).length > 0 && (
                        <div className="flex gap-2 overflow-x-auto">
                          {(frames[c.id] ?? []).map((f) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              key={f.id}
                              src={f.dataUri}
                              alt={`Frame ${f.index + 1}`}
                              className="rounded-xl flex-shrink-0"
                              style={{ height: 80, border: `1px solid ${C.border}` }}
                            />
                          ))}
                        </div>
                      )}
                      {c.safetyFlags.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.red }}>
                            Safety
                          </p>
                          <ul className="space-y-1">
                            {c.safetyFlags.map((f, i) => (
                              <li key={i} className="text-sm flex gap-2" style={{ color: C.text }}>
                                <span style={{ color: C.red }}>⚠</span>{f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {c.cues.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                            Cues
                          </p>
                          <ul className="space-y-1">
                            {c.cues.map((cue, i) => (
                              <li key={i} className="text-sm flex gap-2" style={{ color: C.text }}>
                                <span style={{ color: C.accent }}>→</span>{cue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void remove(c.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95"
                          style={{ backgroundColor: `${C.red}15`, color: C.red, border: `1px solid ${C.red}40` }}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
