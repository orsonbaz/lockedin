'use client';

/**
 * Schedule — /schedule
 *
 * Weekly calendar view. Each day shows its effective training budget
 * (from the profile's weeklyScheduleTemplate + any ScheduleOverrides).
 * Tap a day to add or remove overrides: UNAVAILABLE, TIME_BOX, EQUIPMENT_ONLY,
 * LOCATION. The home banner and session generator both consume the same
 * EffectiveWeekPlan that's rendered here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Clock } from 'lucide-react';
import { C } from '@/lib/theme';
import { today } from '@/lib/db/database';
import {
  loadWeekPlan,
  addOverride,
  removeOverride,
  applyWeekTimeBox,
  mondayOf,
  describeDay,
  DAY_LABELS_SHORT,
  DAY_LABELS_LONG,
  type EffectiveWeekPlan,
  type DayBudget,
} from '@/lib/engine/schedule';
import type { ScheduleOverrideKind } from '@/lib/db/types';

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatRange(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(weekStart + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (sameMonth) {
    return `${start.toLocaleDateString('en-US', opts)} – ${end.getDate()}`;
  }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

export default function SchedulePage() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(today()));
  const [plan, setPlan] = useState<EffectiveWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const [editDate, setEditDate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await loadWeekPlan(weekStart);
    setPlan(next);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const todayStr = useMemo(() => today(), []);

  async function handleAddOverride(
    date: string,
    kind: ScheduleOverrideKind,
    opts: { minutes?: number; equipment?: string[]; location?: string; note?: string },
  ) {
    try {
      await addOverride({
        date,
        kind,
        minutesAvailable: opts.minutes,
        allowedEquipment: opts.equipment,
        location: opts.location,
        note: opts.note,
      });
      toast.success('Override added');
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error('Couldn\'t save override');
    }
  }

  async function handleRemoveOverride(id: string) {
    try {
      await removeOverride(id);
      toast.success('Override removed');
      await refresh();
    } catch {
      toast.error('Couldn\'t remove override');
    }
  }

  async function handleCapWeek(minutes: number) {
    try {
      const created = await applyWeekTimeBox(weekStart, minutes);
      toast.success(`Capped ${created.length} days at ${minutes} min`);
      await refresh();
    } catch {
      toast.error('Couldn\'t cap week');
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="p-2 -ml-2 rounded-xl active:scale-95 transition-transform"
            style={{ color: C.text }}
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-xl font-bold leading-tight">Schedule</h1>
            <p className="text-xs" style={{ color: C.muted }}>
              Cap days, flag unavailable dates, limit equipment.
            </p>
          </div>
        </div>

        {/* Week picker */}
        <div
          className="rounded-2xl p-3 mb-4 flex items-center justify-between"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="p-2 rounded-lg active:scale-95 transition-transform"
            aria-label="Previous week"
          >
            <ChevronLeft size={20} color={C.muted} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatRange(weekStart)}</p>
            <p className="text-xs" style={{ color: C.muted }}>
              {plan ? `${plan.trainableDays} trainable · ${plan.totalMinutes} min total` : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 rounded-lg active:scale-95 transition-transform"
            aria-label="Next week"
          >
            <ChevronRight size={20} color={C.muted} />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[30, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleCapWeek(m)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              <Clock size={13} /> Cap week to {m} min
            </button>
          ))}
        </div>

        {/* Day rows */}
        {loading || !plan ? (
          <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {plan.days.map((day) => (
              <DayRow
                key={day.date}
                day={day}
                isToday={day.date === todayStr}
                onEdit={() => setEditDate(day.date)}
                onRemoveOverride={handleRemoveOverride}
              />
            ))}
          </div>
        )}
      </div>

      {editDate && plan && (
        <OverrideSheet
          day={plan.days.find((d) => d.date === editDate)!}
          onClose={() => setEditDate(null)}
          onAdd={async (kind, opts) => {
            await handleAddOverride(editDate, kind, opts);
            setEditDate(null);
          }}
        />
      )}
    </div>
  );
}

// ── Day Row ─────────────────────────────────────────────────────────────────

function DayRow({
  day,
  isToday,
  onEdit,
  onRemoveOverride,
}: {
  day: DayBudget;
  isToday: boolean;
  onEdit: () => void;
  onRemoveOverride: (id: string) => void;
}) {
  const date = new Date(day.date + 'T12:00:00');
  const isUnavailable = day.minutes === null;

  const accentColour = isUnavailable
    ? C.red
    : typeof day.minutes === 'number' && day.minutes <= 45
    ? C.gold
    : C.accent;

  return (
    <div
      className="rounded-2xl p-3"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${isToday ? C.accent : C.border}`,
        opacity: isUnavailable ? 0.75 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
            style={{ backgroundColor: `${accentColour}20` }}
          >
            <span className="text-[10px] font-bold uppercase" style={{ color: accentColour }}>
              {DAY_LABELS_SHORT[day.dayOfWeek]}
            </span>
            <span className="text-base font-black leading-none" style={{ color: accentColour }}>
              {date.getDate()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
              {DAY_LABELS_LONG[day.dayOfWeek]}
              {isToday && <span className="ml-2 text-xs" style={{ color: C.accent }}>Today</span>}
            </p>
            <p className="text-xs truncate" style={{ color: C.muted }}>
              {describeDay(day)}
              {day.location ? ` · ${day.location}` : ''}
              {day.allowedEquipment?.length ? ` · ${day.allowedEquipment.join(', ')}` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="flex-shrink-0 p-2 rounded-lg active:scale-95 transition-transform"
          style={{ backgroundColor: C.dim, color: C.text }}
          aria-label="Add override"
        >
          <Plus size={16} />
        </button>
      </div>

      {day.overrides.length > 0 && (
        <div className="mt-3 pt-3 flex flex-col gap-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
          {day.overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2">
              <span className="text-xs truncate" style={{ color: C.muted }}>
                <span className="font-semibold" style={{ color: C.text }}>
                  {o.kind.replace(/_/g, ' ').toLowerCase()}
                </span>
                {o.minutesAvailable ? ` · ${o.minutesAvailable} min` : ''}
                {o.location ? ` · ${o.location}` : ''}
                {o.allowedEquipment?.length ? ` · ${o.allowedEquipment.join(', ')}` : ''}
                {o.note ? ` · ${o.note}` : ''}
              </span>
              <button
                type="button"
                onClick={() => onRemoveOverride(o.id)}
                className="flex-shrink-0 p-1 rounded active:scale-95"
                aria-label="Remove override"
              >
                <Trash2 size={13} color={C.muted} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Override Sheet ──────────────────────────────────────────────────────────

type AddHandler = (
  kind: ScheduleOverrideKind,
  opts: { minutes?: number; equipment?: string[]; location?: string; note?: string },
) => Promise<void>;

function OverrideSheet({
  day,
  onClose,
  onAdd,
}: {
  day: DayBudget;
  onClose: () => void;
  onAdd: AddHandler;
}) {
  const [kind, setKind] = useState<ScheduleOverrideKind>('TIME_BOX');
  const [minutes, setMinutes] = useState('45');
  const [equipment, setEquipment] = useState('BODYWEIGHT');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    if (kind === 'TIME_BOX') {
      const m = parseInt(minutes, 10);
      if (!m || m < 10) return;
      await onAdd(kind, { minutes: m, note: note.trim() || undefined });
    } else if (kind === 'UNAVAILABLE') {
      await onAdd(kind, { note: note.trim() || undefined });
    } else if (kind === 'EQUIPMENT_ONLY') {
      const list = equipment.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (list.length === 0) return;
      await onAdd(kind, { equipment: list, note: note.trim() || undefined });
    } else {
      await onAdd(kind, { location: location.trim() || undefined, note: note.trim() || undefined });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl p-5"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold mb-1">
          {DAY_LABELS_LONG[day.dayOfWeek]} · {day.date}
        </h2>
        <p className="text-xs mb-4" style={{ color: C.muted }}>
          Add a constraint for this day.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {(['TIME_BOX', 'UNAVAILABLE', 'EQUIPMENT_ONLY', 'LOCATION'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                backgroundColor: kind === k ? C.accent : C.dim,
                color: kind === k ? '#fff' : C.text,
              }}
            >
              {k.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>

        {kind === 'TIME_BOX' && (
          <div className="mb-3">
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.muted }}>
              Minutes available
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            />
          </div>
        )}

        {kind === 'EQUIPMENT_ONLY' && (
          <div className="mb-3">
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.muted }}>
              Allowed equipment (comma separated)
            </label>
            <input
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="BODYWEIGHT, BANDS"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            />
          </div>
        )}

        {kind === 'LOCATION' && (
          <div className="mb-3">
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.muted }}>
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Hotel gym, home, travel"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            />
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.muted }}>
            Note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Travel day"
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-bold"
            style={{ backgroundColor: C.dim, color: C.text }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 py-3 rounded-2xl text-sm font-bold"
            style={{ backgroundColor: C.accent, color: '#fff' }}
          >
            Add override
          </button>
        </div>
      </div>
    </div>
  );
}
