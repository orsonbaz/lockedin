'use client';

/**
 * Settings — /settings
 *
 * Sections:
 *   1. Profile summary (name, maxes, weight class, federation)
 *   2. Update maxes — inline editable S / B / D
 *   3. Unit system toggle (kg / lbs)
 *   4. Peak day of week selector
 *   5. Groq API key field
 *   6. Reset all data (type 'DELETE' to confirm)
 *
 * Accessible via the ⚙️ icon on the home header.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import { toast }                             from 'sonner';
import { ArrowLeft, TriangleAlert, Check, Download, Upload }   from 'lucide-react';
import { db, exportAll, importAll }           from '@/lib/db/database';
import { ProfilePatchSchema }                 from '@/lib/db/schemas';
import { SegmentedControl }                   from '@/components/lockedin/SegmentedControl';
import { C }                                  from '@/lib/theme';
import type { AthleteProfile, Federation }    from '@/lib/db/types';
import type { UserEquipmentProfile }          from '@/lib/exercises/types';

const FEDERATIONS: Federation[] = ['IPF', 'USAPL', 'USPA', 'RPS', 'CPU', 'OTHER'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Row components ──────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest px-1 mb-2 mt-6 first:mt-0"
      style={{ color: C.muted }}
    >
      {title}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden divide-y mb-1"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderColor: C.border }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: C.border }}>
      {children}
    </div>
  );
}

function RowLabel({ label, sub, htmlFor }: { label: string; sub?: string; htmlFor?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={htmlFor} className="text-sm font-medium block" style={{ color: C.text }}>{label}</label>
      {sub && <p className="text-xs" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [profile,  setProfile]  = useState<AthleteProfile | null>(null);
  const [saving,   setSaving]   = useState(false);

  // Local editable copies
  const [name,         setName]         = useState('');
  const [maxSquat,     setMaxSquat]     = useState('');
  const [maxBench,     setMaxBench]     = useState('');
  const [maxDeadlift,  setMaxDeadlift]  = useState('');
  const [weightKg,     setWeightKg]     = useState('');
  const [targetWC,     setTargetWC]     = useState('');
  const [federation,   setFederation]   = useState<Federation>('IPF');
  const [unitSystem,   setUnitSystem]   = useState<'KG' | 'LBS'>('KG');
  const [peakDay,      setPeakDay]      = useState(6); // Saturday
  const [groqKey,      setGroqKey]      = useState('');
  const [showGroqKey,  setShowGroqKey]  = useState(false);

  // Reset flow
  const [resetOpen,    setResetOpen]    = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting,    setResetting]    = useState(false);

  // Export / Import
  const [exporting,    setExporting]    = useState(false);
  const [importing,    setImporting]    = useState(false);
  const fileInputRef   = { current: null as HTMLInputElement | null };

  // Equipment profile
  const [hasBelt,          setHasBelt]          = useState(false);
  const [hasKneeSleeves,   setHasKneeSleeves]   = useState(false);
  const [hasWristWraps,    setHasWristWraps]     = useState(false);

  useEffect(() => {
    async function load() {
      const [p, eq] = await Promise.all([
        db.profile.get('me'),
        db.equipmentProfile.get('me'),
      ]);
      if (p) {
        setProfile(p);
        setName(p.name);
        setMaxSquat(String(p.maxSquat));
        setMaxBench(String(p.maxBench));
        setMaxDeadlift(String(p.maxDeadlift));
        setWeightKg(String(p.weightKg));
        setTargetWC(String(p.targetWeightClass));
        setFederation(p.federation);
        setUnitSystem(p.unitSystem);
        setPeakDay(p.peakDayOfWeek);
        setGroqKey(p.groqApiKey ?? '');
      }
      if (eq) {
        setHasBelt(eq.hasBelt);
        setHasKneeSleeves(eq.hasKneeSleeves);
        setHasWristWraps(eq.hasWristWraps);
      }
      setLoading(false);
    }
    void load();
  }, []);

  // ── Save helper ──────────────────────────────────────────────────────────────
  const save = useCallback(async (patch: Partial<AthleteProfile>) => {
    if (!profile) return;

    const result = ProfilePatchSchema.safeParse(patch);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? 'Invalid value';
      toast(`Invalid input: ${msg}`, { duration: 3000 });
      return;
    }

    setSaving(true);
    try {
      await db.profile.update('me', { ...patch, updatedAt: new Date().toISOString() });
      setProfile((p) => (p ? { ...p, ...patch } : p));
      toast('Saved', { duration: 1500 });
    } catch {
      toast('Failed to save', { duration: 3000 });
    } finally {
      setSaving(false);
    }
  }, [profile]);

  // ── Save equipment profile ────────────────────────────────────────────────────
  const saveEquipment = useCallback(async (patch: Partial<Pick<UserEquipmentProfile, 'hasBelt' | 'hasKneeSleeves' | 'hasWristWraps'>>) => {
    const now = new Date().toISOString();
    const existing = await db.equipmentProfile.get('me');
    if (existing) {
      await db.equipmentProfile.update('me', { ...patch, updatedAt: now });
    } else {
      const newProfile: UserEquipmentProfile = {
        id: 'me',
        availableEquipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
        hasBelt:          patch.hasBelt          ?? false,
        hasKneeSleeves:   patch.hasKneeSleeves   ?? false,
        hasWristWraps:    patch.hasWristWraps     ?? false,
        updatedAt: now,
      };
      await db.equipmentProfile.add(newProfile);
    }
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (resetConfirm !== 'DELETE') return;
    setResetting(true);
    try {
      await Promise.all([
        db.profile.clear(),
        db.cycles.clear(),
        db.blocks.clear(),
        db.sessions.clear(),
        db.exercises.clear(),
        db.sets.clear(),
        db.readiness.clear(),
        db.meets.clear(),
        db.attempts.clear(),
        db.bodyweight.clear(),
        db.chat.clear(),
        db.equipmentProfile.clear(),
        db.customExercises.clear(),
      ]);
      localStorage.removeItem('lockedin_onboarding_complete');
      toast('All data erased.', { duration: 2000 });
      // Small delay so toast shows, then redirect to onboarding
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch {
      toast('Reset failed.', { duration: 3000 });
      setResetting(false);
    }
  }, [resetConfirm]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `lockedin-backup-${data.exportedAt.split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Backup downloaded!', { duration: 2500 });
    } catch {
      toast('Export failed.', { duration: 3000 });
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImportFile = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data?.version || !data?.tables) {
        toast('Invalid backup file.', { duration: 3000 });
        return;
      }
      const counts = await importAll(data);
      const total  = Object.values(counts).reduce((a, b) => a + b, 0);
      toast(`Restored ${total} records. Reloading…`, { duration: 2000 });
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast('Import failed — file may be corrupted.', { duration: 3000 });
    } finally {
      setImporting(false);
    }
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  const numInput = (
    value: string,
    onChange: (v: string) => void,
    onBlurFn: (v: number) => void,
    unit = 'kg',
    id?: string,
  ) => (
    <div className="flex items-center gap-1">
      <input
        id={id}
        type="number"
        value={value}
        step={0.5}
        min={0}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n) && n > 0) onBlurFn(n);
        }}
        className="w-20 rounded-xl border px-3 py-2 text-right text-sm font-bold outline-none"
        style={{
          backgroundColor: C.bg,
          borderColor:     C.border,
          color:           C.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      <span className="text-xs" style={{ color: C.muted }}>{unit}</span>
    </div>
  );

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
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
          <h1 className="text-xl font-bold" style={{ color: C.text }}>Settings</h1>
          {saving && (
            <span className="ml-auto text-xs" style={{ color: C.muted }}>Saving…</span>
          )}
        </div>

        {/* ── 1. PROFILE ─────────────────────────────────────────────────── */}
        <SectionHeader title="Profile" />
        <SettingsCard>
          {/* Name */}
          <Row>
            <RowLabel label="Name" htmlFor="settings-name" />
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { void save({ name: name.trim() || 'Athlete' }); }}
              className="rounded-xl border px-3 py-2 text-sm text-right outline-none w-36"
              style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
            />
          </Row>

          {/* Body weight */}
          <Row>
            <RowLabel label="Body Weight" sub="Used for DOTS calculation" htmlFor="settings-weight" />
            {numInput(weightKg, setWeightKg, (n) => void save({ weightKg: n }), 'kg', 'settings-weight')}
          </Row>

          {/* Target weight class */}
          <Row>
            <RowLabel label="Target Weight Class" htmlFor="settings-wc" />
            {numInput(targetWC, setTargetWC, (n) => void save({ targetWeightClass: n }), 'kg', 'settings-wc')}
          </Row>

          {/* Federation */}
          <Row>
            <RowLabel label="Federation" htmlFor="settings-federation" />
            <select
              id="settings-federation"
              value={federation}
              onChange={(e) => {
                const v = e.target.value as Federation;
                setFederation(v);
                void save({ federation: v });
              }}
              className="rounded-xl border px-3 py-2 text-sm outline-none appearance-none"
              style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
            >
              {FEDERATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
        </SettingsCard>

        {/* ── 2. TRAINING MAXES ──────────────────────────────────────────── */}
        <SectionHeader title="Current Maxes" />
        <SettingsCard>
          <Row>
            <RowLabel label="Squat" htmlFor="settings-squat" />
            {numInput(maxSquat, setMaxSquat, (n) => void save({ maxSquat: n }), 'kg', 'settings-squat')}
          </Row>
          <Row>
            <RowLabel label="Bench Press" htmlFor="settings-bench" />
            {numInput(maxBench, setMaxBench, (n) => void save({ maxBench: n }), 'kg', 'settings-bench')}
          </Row>
          <Row>
            <RowLabel label="Deadlift" htmlFor="settings-deadlift" />
            {numInput(maxDeadlift, setMaxDeadlift, (n) => void save({ maxDeadlift: n }), 'kg', 'settings-deadlift')}
          </Row>
        </SettingsCard>

        {/* ── 3. UNIT SYSTEM ─────────────────────────────────────────────── */}
        <SectionHeader title="Preferences" />
        <SettingsCard>
          {/* Unit system */}
          <Row>
            <RowLabel label="Unit System" />
            <SegmentedControl
              options={[{ value: 'KG', label: 'KG' }, { value: 'LBS', label: 'LBS' }]}
              value={unitSystem}
              onChange={(u) => {
                setUnitSystem(u);
                void save({ unitSystem: u });
              }}
            />
          </Row>

          {/* Peak day of week */}
          <Row>
            <RowLabel label="Peak Day of Week" sub="Heaviest session scheduled on this day" htmlFor="settings-peak-day" />
            <select
              id="settings-peak-day"
              value={peakDay}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setPeakDay(v);
                void save({ peakDayOfWeek: v });
              }}
              className="rounded-xl border px-3 py-2 text-sm outline-none appearance-none"
              style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </Row>
        </SettingsCard>

        {/* ── 4. EQUIPMENT & GEAR ────────────────────────────────────────── */}
        <SectionHeader title="Gym Equipment & Gear" />
        <SettingsCard>
          <Row>
            <RowLabel
              label="Powerlifting Belt"
              sub="Increases effective squat and deadlift max by ~7%"
            />
            <button
              type="button"
              role="switch"
              aria-checked={hasBelt}
              onClick={async () => {
                const v = !hasBelt;
                setHasBelt(v);
                await saveEquipment({ hasBelt: v });
                toast(v ? 'Belt enabled' : 'Belt disabled', { duration: 1500 });
              }}
              className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors"
              style={{ backgroundColor: hasBelt ? C.accent : C.dim }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: hasBelt ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </Row>
          <Row>
            <RowLabel
              label="Knee Sleeves"
              sub="Increases effective squat max by ~3%"
            />
            <button
              type="button"
              role="switch"
              aria-checked={hasKneeSleeves}
              onClick={async () => {
                const v = !hasKneeSleeves;
                setHasKneeSleeves(v);
                await saveEquipment({ hasKneeSleeves: v });
                toast(v ? 'Sleeves enabled' : 'Sleeves disabled', { duration: 1500 });
              }}
              className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors"
              style={{ backgroundColor: hasKneeSleeves ? C.accent : C.dim }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: hasKneeSleeves ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </Row>
          <Row>
            <RowLabel
              label="Wrist Wraps"
              sub="Noted on bench press and overhead press — no strength modifier"
            />
            <button
              type="button"
              role="switch"
              aria-checked={hasWristWraps}
              onClick={async () => {
                const v = !hasWristWraps;
                setHasWristWraps(v);
                await saveEquipment({ hasWristWraps: v });
                toast(v ? 'Wrist wraps enabled' : 'Wrist wraps disabled', { duration: 1500 });
              }}
              className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors"
              style={{ backgroundColor: hasWristWraps ? C.accent : C.dim }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: hasWristWraps ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </Row>
        </SettingsCard>

        {/* ── 5. AI ──────────────────────────────────────────────────────── */}
        <SectionHeader title="AI Coach" />
        <SettingsCard>
          <Row>
            <RowLabel
              label="Groq API Key"
              sub={groqKey.trim()
                ? 'Online mode active (llama-3.3-70b)'
                : 'Leave blank for on-device AI (Phi-3.5-mini)'}
            />
          </Row>
          <Row>
            <div className="flex-1 relative">
              <input
                id="settings-groq-key"
                type={showGroqKey ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                onBlur={() => void save({ groqApiKey: groqKey.trim() || undefined })}
                placeholder="gsk_…"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none pr-24"
                style={{ backgroundColor: C.bg, borderColor: C.border, color: C.text }}
              />
              <button
                type="button"
                onClick={() => setShowGroqKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: C.muted }}
              >
                {showGroqKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Row>
          {groqKey.trim() && (
            <Row>
              <button
                type="button"
                onClick={() => {
                  setGroqKey('');
                  void save({ groqApiKey: undefined });
                }}
                className="text-xs"
                style={{ color: C.accent }}
              >
                Remove key (switch to on-device)
              </button>
            </Row>
          )}
          <Row>
            <RowLabel
              label="Coach Memory"
              sub="Review what the coach remembers across conversations"
            />
            <button
              type="button"
              onClick={() => router.push('/settings/memory')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              Manage
            </button>
          </Row>
          <Row>
            <RowLabel
              label="Schedule"
              sub="Busy week, travel, time-boxed sessions"
            />
            <button
              type="button"
              onClick={() => router.push('/schedule')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              Open
            </button>
          </Row>
          <Row>
            <RowLabel
              label="Nutrition"
              sub="Training-day, rest-day, and refeed targets"
            />
            <button
              type="button"
              onClick={() => router.push('/nutrition')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              Open
            </button>
          </Row>
        </SettingsCard>

        {/* ── 5. ABOUT ─────────────────────────────────────────────────── */}
        {profile && (
          <>
            <SectionHeader title="About Your Profile" />
            <div
              className="rounded-2xl p-4 mb-1 text-xs"
              style={{ backgroundColor: C.dim, border: `1px solid ${C.border}` }}
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  ['Sex',         profile.sex],
                  ['Training age', `${profile.trainingAgeMonths}m`],
                  ['Bottleneck',  profile.bottleneck],
                  ['Responder',   profile.responder],
                  ['Overshooter', profile.overshooter ? 'Yes' : 'No'],
                  ['Weigh-in',    profile.weighIn === 'TWO_HOUR' ? '2-hour' : '24-hour'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span style={{ color: C.muted }}>{label}:</span>
                    <span style={{ color: C.text }}>{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: C.muted }}>
                To change these values, complete onboarding again after resetting all data.
              </p>
            </div>
          </>
        )}

        {/* ── 6. DATA ──────────────────────────────────────────────────── */}
        <SectionHeader title="Your Data" />
        <SettingsCard>
          <Row>
            <RowLabel label="Export Backup" sub="Download all training data as JSON" />
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.text }}
            >
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </Row>
          <Row>
            <RowLabel label="Import Backup" sub="Restore from a previous backup file" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, color: C.text }}
            >
              <Upload size={15} />
              {importing ? 'Importing…' : 'Import'}
            </button>
            <input
              ref={(el) => { fileInputRef.current = el; }}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = '';
              }}
            />
          </Row>
        </SettingsCard>

        {/* ── 7. DANGER ZONE ────────────────────────────────────────────── */}
        <SectionHeader title="Danger Zone" />
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${C.red}40` }}
        >
          {!resetOpen ? (
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all"
              style={{ backgroundColor: `${C.red}10` }}
            >
              <TriangleAlert size={18} color={C.red} />
              <div>
                <p className="text-sm font-semibold" style={{ color: C.red }}>
                  Reset All Data
                </p>
                <p className="text-xs" style={{ color: C.muted }}>
                  Permanently erases your profile, sessions, and history.
                </p>
              </div>
            </button>
          ) : (
            <div className="p-4" style={{ backgroundColor: `${C.red}08` }}>
              <div className="flex items-center gap-2 mb-3">
                <TriangleAlert size={16} color={C.red} />
                <p className="text-sm font-bold" style={{ color: C.red }}>
                  This cannot be undone.
                </p>
              </div>
              <p className="text-xs mb-3" style={{ color: C.muted }}>
                All data — profile, cycles, sessions, readiness logs, meet records, and chat history —
                will be permanently deleted. Type <strong style={{ color: C.text }}>DELETE</strong> to confirm.
              </p>
              <label htmlFor="settings-reset-confirm" className="sr-only">Type DELETE to confirm</label>
              <input
                id="settings-reset-confirm"
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none mb-3"
                style={{ backgroundColor: C.bg, borderColor: `${C.red}60`, color: C.text }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setResetOpen(false); setResetConfirm(''); }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold border"
                  style={{ borderColor: C.border, color: C.muted, backgroundColor: C.dim }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={resetConfirm !== 'DELETE' || resetting}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                  style={{ backgroundColor: C.red, color: '#fff' }}
                >
                  {resetting ? 'Erasing…' : 'Erase Everything'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Version */}
        <p className="text-center text-xs mt-8" style={{ color: C.muted }}>
          Lockedin · local-first powerlifting coach · v0.1
        </p>

      </div>
    </div>
  );
}
