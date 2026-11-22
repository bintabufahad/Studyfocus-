import { Clock, MoonStar, Timer } from 'lucide-react';
import type { DeadlineMode, GoalTaskEntry, PriorityDeadline, SalahName } from '../types';

const SALAH_NAMES: SalahName[] = ['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha'];

export function formatClock24To12(clock24?: string): string {
  if (!clock24 || !clock24.includes(':')) return '';
  const [hRaw, mRaw] = clock24.split(':');
  const h = Number.parseInt(hRaw, 10);
  const m = Number.parseInt(mRaw, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return clock24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatPriorityDeadline(deadline?: PriorityDeadline): string | null {
  if (!deadline || deadline.mode === 'none') return null;
  if (deadline.mode === 'salah' && deadline.salah) {
    return `By ${deadline.salah}`;
  }
  if (deadline.mode === 'clock' && deadline.clockTime) {
    return `By ${formatClock24To12(deadline.clockTime)}`;
  }
  if (deadline.mode === 'hours' && deadline.durationHours) {
    const hrs = deadline.durationHours;
    return hrs === 1 ? 'Within 1 hr' : `Within ${hrs} hrs`;
  }
  return null;
}

export function computeDueTimestampForDeadline(
  deadline: PriorityDeadline | undefined,
  referenceDateKey?: string
): PriorityDeadline | undefined {
  if (!deadline || deadline.mode === 'none') return undefined;
  if (deadline.mode === 'salah') {
    return { mode: 'salah', salah: deadline.salah ?? 'Asr' };
  }
  if (deadline.mode === 'hours') {
    const hrs = Math.max(1, Math.min(24, deadline.durationHours ?? 1));
    return {
      mode: 'hours',
      durationHours: hrs,
      dueTimestamp: Date.now() + hrs * 60 * 60 * 1000,
    };
  }
  if (deadline.mode === 'clock') {
    const clock = deadline.clockTime || '17:00';
    const [hStr, mStr] = clock.split(':');
    const h = Number.parseInt(hStr, 10) || 0;
    const m = Number.parseInt(mStr, 10) || 0;
    const base = referenceDateKey ? new Date(`${referenceDateKey}T00:00:00`) : new Date();
    base.setHours(h, m, 0, 0);
    return {
      mode: 'clock',
      clockTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      dueTimestamp: base.getTime(),
    };
  }
  return undefined;
}

export function isPriorityOverdue(
  entry: GoalTaskEntry,
  nowMs: number,
  isTodayPlan: boolean
): boolean {
  if (!isTodayPlan || entry.status !== 'pending' || !entry.deadline) return false;
  if (entry.deadline.mode === 'clock' || entry.deadline.mode === 'hours') {
    return typeof entry.deadline.dueTimestamp === 'number' && nowMs >= entry.deadline.dueTimestamp;
  }
  return false;
}

interface PriorityDeadlinePickerProps {
  value: PriorityDeadline;
  onChange: (next: PriorityDeadline) => void;
}

export function PriorityDeadlinePicker({ value, onChange }: PriorityDeadlinePickerProps) {
  const mode: DeadlineMode = value?.mode ?? 'none';

  // Parse 24h clockTime into 12h controls
  const [hRaw, mRaw] = (value?.clockTime ?? '15:00').split(':');
  const h24 = Number.parseInt(hRaw, 10);
  const safeH24 = Number.isFinite(h24) ? h24 : 15;
  const minute = Number.isFinite(Number.parseInt(mRaw, 10)) ? Number.parseInt(mRaw, 10) : 0;
  const isPm = safeH24 >= 12;
  const hour12 = safeH24 % 12 === 0 ? 12 : safeH24 % 12;

  const updateClock = (nextHour12: number, nextMin: number, nextPm: boolean) => {
    let h = nextHour12 % 12;
    if (nextPm) h += 12;
    onChange({
      mode: 'clock',
      clockTime: `${String(h).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {/* Mode Selector */}
      <div className="flex items-center rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5">
        <button
          type="button"
          onClick={() => onChange({ mode: 'clock', clockTime: value.clockTime ?? '15:00' })}
          className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
            mode === 'clock' ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="h-3 w-3" />
          Time
        </button>

        <button
          type="button"
          onClick={() => onChange({ mode: 'hours', durationHours: value.durationHours ?? 1 })}
          className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
            mode === 'hours' ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Timer className="h-3 w-3" />
          Hours
        </button>

        <button
          type="button"
          onClick={() => onChange({ mode: 'salah', salah: value.salah ?? 'Asr' })}
          className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
            mode === 'salah' ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MoonStar className="h-3 w-3" />
          Salah
        </button>

        <button
          type="button"
          onClick={() => onChange({ mode: 'none' })}
          className={`cursor-pointer rounded-md px-2 py-1 font-medium transition-colors ${
            mode === 'none' ? 'bg-slate-700/70 text-slate-100' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Off
        </button>
      </div>

      {/* Mode Specific Controls */}
      {mode === 'clock' && (
        <div className="flex items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/60 px-2 py-1">
          <select
            aria-label="Hour"
            value={hour12}
            onChange={(e) => updateClock(Number(e.target.value), minute, isPm)}
            className="font-mono-tabular cursor-pointer bg-transparent text-slate-100 focus:outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h} className="bg-slate-900">
                {h}
              </option>
            ))}
          </select>
          <span className="text-slate-400">:</span>
          <select
            aria-label="Minute"
            value={minute}
            onChange={(e) => updateClock(hour12, Number(e.target.value), isPm)}
            className="font-mono-tabular cursor-pointer bg-transparent text-slate-100 focus:outline-none"
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m} className="bg-slate-900">
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => updateClock(hour12, minute, !isPm)}
            className="font-mono-tabular ml-1 cursor-pointer rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/25"
          >
            {isPm ? 'PM' : 'AM'}
          </button>
        </div>
      )}

      {mode === 'hours' && (
        <div className="flex items-center gap-1.5 rounded-lg border border-cyan-200/15 bg-slate-950/60 px-2.5 py-1">
          <span className="text-slate-400">In</span>
          <input
            type="number"
            min={1}
            max={24}
            value={value.durationHours ?? 1}
            onChange={(e) =>
              onChange({
                mode: 'hours',
                durationHours: Math.max(1, Math.min(24, Number(e.target.value) || 1)),
              })
            }
            aria-label="Number of hours"
            className="font-mono-tabular w-10 bg-transparent text-center font-semibold text-cyan-100 focus:outline-none"
          />
          <span className="text-slate-300">
            {(value.durationHours ?? 1) === 1 ? 'hour' : 'hours'}
          </span>
        </div>
      )}

      {mode === 'salah' && (
        <div className="flex flex-wrap items-center gap-1">
          {SALAH_NAMES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ mode: 'salah', salah: s })}
              className={`cursor-pointer rounded-md border px-2 py-1 font-medium transition-colors ${
                (value.salah ?? 'Asr') === s
                  ? 'border-amber-300/60 bg-amber-400/20 text-amber-100'
                  : 'border-cyan-200/15 bg-slate-950/50 text-slate-300 hover:text-amber-100'
              }`}
            >
              By {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
