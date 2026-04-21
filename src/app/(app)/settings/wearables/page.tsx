'use client';

/**
 * Settings → Wearables — /settings/wearables
 *
 * Drag-drop import of wearable exports. We detect the source (Apple Health
 * Auto Export JSON, Oura, Whoop, or MANUAL CSV) from the payload shape and
 * normalize everything into WearableMetric rows. File-hash idempotency means
 * re-importing the same file is a no-op.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, UploadCloud, Trash2, FileText, Watch } from 'lucide-react';
import { C } from '@/lib/theme';
import {
  detectSource,
  parseAppleHealth,
  parseManualCsv,
  parseOura,
  parseWhoop,
  type ParsedPayload,
} from '@/lib/engine/wearables/parse';
import { saveImport, deleteImport, listImports } from '@/lib/engine/wearables/wearables-db';
import type { WearableImport, WearableSource } from '@/lib/db/types';

const SOURCE_LABEL: Record<WearableSource, string> = {
  APPLE_HEALTH: 'Apple Health',
  OURA:         'Oura',
  WHOOP:        'Whoop',
  MANUAL_CSV:   'CSV',
};

interface StagedFile {
  name:    string;
  source:  WearableSource;
  rawText: string;
  parsed:  ParsedPayload;
}

function parseByShape(rawText: string): { source: WearableSource; parsed: ParsedPayload } | null {
  const trimmed = rawText.trim();
  // Try JSON first; fall back to CSV if that fails.
  try {
    const json = JSON.parse(trimmed);
    const source = detectSource(json);
    if (!source || source === 'MANUAL_CSV') return null;
    const parsed =
      source === 'APPLE_HEALTH' ? parseAppleHealth(json)
    : source === 'OURA'         ? parseOura(json)
    :                             parseWhoop(json);
    return { source, parsed };
  } catch {
    // Not JSON — try CSV.
    if (trimmed.includes(',') && /^[a-z_]+\s*,/i.test(trimmed)) {
      return { source: 'MANUAL_CSV', parsed: parseManualCsv(trimmed) };
    }
    return null;
  }
}

export default function WearablesSettingsPage() {
  const router = useRouter();
  const [imports, setImports] = useState<WearableImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setImports(await listImports(30));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const file = arr[0];
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File too large (limit 20MB).');
      return;
    }
    const text = await file.text();
    const result = parseByShape(text);
    if (!result) {
      toast.error('Unrecognised format. Expected Apple Health / Oura / Whoop JSON or a CSV with headers date,metric,value,unit.');
      return;
    }
    if (result.parsed.metrics.length === 0) {
      toast.error('No metrics found in this file.');
      return;
    }
    setStaged({ name: file.name, source: result.source, rawText: text, parsed: result.parsed });
    setLabel(file.name);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    // Reset so re-selecting the same file re-fires.
    e.target.value = '';
  }, [handleFiles]);

  const confirmImport = useCallback(async () => {
    if (!staged || saving) return;
    setSaving(true);
    try {
      const res = await saveImport({
        source:  staged.source,
        rawText: staged.rawText,
        parsed:  staged.parsed,
        label:   label.trim() || undefined,
      });
      if (res.skipped) {
        toast('Already imported — no changes.', { duration: 2500 });
      } else {
        toast.success(`Imported ${res.metricCount} data points`);
      }
      setStaged(null);
      setLabel('');
      await refresh();
    } catch (err) {
      console.error('[wearables] import failed:', err);
      toast.error('Import failed. See console.');
    } finally {
      setSaving(false);
    }
  }, [staged, label, saving, refresh]);

  const cancelImport = useCallback(() => {
    setStaged(null);
    setLabel('');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this import and all metrics it contributed?')) return;
    await deleteImport(id);
    toast.success('Import deleted');
    await refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    if (!staged) return null;
    const counts = new Map<string, number>();
    for (const m of staged.parsed.metrics) {
      counts.set(m.metricKind, (counts.get(m.metricKind) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort();
  }, [staged]);

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.bg, color: C.text }}>
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
          Wearables
        </h1>
      </header>

      <div className="px-4 pt-4 max-w-xl mx-auto">
        <p className="text-xs mb-5" style={{ color: C.muted }}>
          Drop in an export from Apple Health Auto Export (JSON), Oura, Whoop,
          or a plain CSV (<code>date,metric,value,unit</code>). Wearable HRV
          and sleep automatically feed your daily readiness.
        </p>

        {/* Drop zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="block cursor-pointer rounded-2xl p-6 text-center transition-colors"
          style={{
            backgroundColor: dragging ? `${C.accent}15` : C.surface,
            border: `2px dashed ${dragging ? C.accent : C.border}`,
          }}
        >
          <UploadCloud size={28} style={{ color: C.accent, margin: '0 auto 8px' }} />
          <p className="text-sm font-semibold" style={{ color: C.text }}>
            {dragging ? 'Drop to import' : 'Drop a file or tap to choose'}
          </p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>
            JSON or CSV, up to 20 MB
          </p>
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv,text/plain"
            onChange={onFileInput}
            className="hidden"
          />
        </label>

        {/* Diff preview */}
        {staged && summary && (
          <div
            className="rounded-xl p-4 mt-4 space-y-3"
            style={{ backgroundColor: C.surface, border: `1px solid ${C.accent}` }}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} color={C.accent} />
              <p className="text-sm font-semibold" style={{ color: C.text }}>
                {staged.name}
              </p>
              <span
                className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${C.accent}20`, color: C.accent }}
              >
                {SOURCE_LABEL[staged.source]}
              </span>
            </div>

            <p className="text-xs" style={{ color: C.muted }}>
              {staged.parsed.rangeStart} → {staged.parsed.rangeEnd} · {staged.parsed.metrics.length} data points
            </p>

            <ul className="text-xs space-y-1" style={{ color: C.text }}>
              {summary.map(([kind, count]) => (
                <li key={kind} className="flex justify-between">
                  <span>{kind.replace('_', ' ').toLowerCase()}</span>
                  <span style={{ color: C.muted }}>{count}</span>
                </li>
              ))}
            </ul>

            <label className="block">
              <span className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>
                Label (optional)
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Oura April 2026"
                className="mt-1 w-full rounded-lg px-2 py-2 text-sm"
                style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void confirmImport()}
                disabled={saving}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-60"
                style={{ backgroundColor: C.accent, color: '#fff' }}
              >
                {saving ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={cancelImport}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: C.dim, color: C.text }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Import history */}
        <section className="mt-6">
          <p
            className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
            style={{ color: C.muted }}
          >
            Import history
          </p>

          {loading && <p className="text-sm" style={{ color: C.muted }}>Loading…</p>}

          {!loading && imports.length === 0 && (
            <div
              className="rounded-xl p-5 text-center text-sm"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
            >
              No imports yet. Drop an export above and your readiness check-ins will start auto-filling.
            </div>
          )}

          <div className="space-y-2">
            {imports.map((imp) => (
              <div
                key={imp.id}
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${C.accent}20` }}
                >
                  <Watch size={16} color={C.accent} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
                    {imp.label ?? SOURCE_LABEL[imp.source]}
                  </p>
                  <p className="text-xs" style={{ color: C.muted }}>
                    {SOURCE_LABEL[imp.source]} · {imp.rangeStart} → {imp.rangeEnd} · {imp.recordCount} pts
                  </p>
                </div>
                <button
                  onClick={() => void handleDelete(imp.id)}
                  className="p-2 rounded-lg"
                  style={{ color: C.muted }}
                  aria-label="Delete import"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
