import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BellRing,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CornerDownRight,
  Download,
  Edit3,
  Flame,
  GripVertical,
  HeartPulse,
  History,
  Layers,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  Send,
  Shield,
  Sparkles,
  Sun,
  Table2,
  Target,
  Trash2,
  Trophy,
  Wand2,
  X,
} from 'lucide-react';
import type {
  CycleDayLog,
  CycleFlowLevel,
  DailyPlanRecord,
  GamificationStats,
  GoalCadence,
  GoalCarryoverItem,
  GoalPhaseKind,
  GoalPlan,
  GoalScopePlan,
  GoalStep,
  GoalTaskEntry,
  GoalUnit,
  PhaseConfig,
  PriorityDeadline,
  StudySessionCard,
} from '../types';
import {
  applyGoalCompletionReward,
  BADGE_DEFS,
  computeCyclePhaseForDay,
  computeLevelInfo,
  computePhaseDayBreakdown,
  PHASE_META,
  resolveActiveCycleContext,
} from '../utils/goalRewards';
import { playCueSound } from '../utils/soundCues';
import { toLocalDateKey } from '../utils/profileStorage';
import { FLOW_LEVEL_OPTIONS } from './DayLogView';
import {
  computeDueTimestampForDeadline,
  formatPriorityDeadline,
  isPriorityOverdue,
  PriorityDeadlinePicker,
} from './PriorityDeadlinePicker';

interface GoalsViewProps {
  profileName: string;
  goals: GoalPlan[];
  activeDailyPlan: DailyPlanRecord;
  dailyHistory: DailyPlanRecord[];
  gamification: GamificationStats;
  cycleLogs: Record<string, CycleDayLog>;
  onUpdateGoals: (updater: (prev: GoalPlan[]) => GoalPlan[]) => void;
  onUpdateDailyPlan: (updater: (prev: DailyPlanRecord) => DailyPlanRecord) => void;
  onUpdateDailyHistory: (updater: (prev: DailyPlanRecord[]) => DailyPlanRecord[]) => void;
  onUpdateGamification: (updater: (prev: GamificationStats) => GamificationStats) => void;
  onUpdateCycleLog: (dateKey: string, updater: (prev: CycleDayLog) => CycleDayLog) => void;
  onOpenDayLogTab?: () => void;
}

interface FloatingEvent {
  id: string;
  label: string;
  tone: 'cyan' | 'gold' | 'amber';
}

const ACCENT_OPTIONS: Array<{
  key: StudySessionCard['accent'];
  swatch: string;
  dot: string;
  label: string;
}> = [
  {
    key: 'sky',
    swatch: 'bg-cyan-200/95 shadow-[0_0_8px_rgba(165,243,252,0.7)]',
    dot: 'bg-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.75)]',
    label: 'Cyan',
  },
  {
    key: 'emerald',
    swatch: 'bg-emerald-100/90 shadow-[0_0_8px_rgba(167,243,208,0.65)]',
    dot: 'bg-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.75)]',
    label: 'Seafoam',
  },
  {
    key: 'amber',
    swatch: 'bg-amber-200/95 shadow-[0_0_8px_rgba(253,230,138,0.65)]',
    dot: 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.75)]',
    label: 'Gold',
  },
  {
    key: 'rose',
    swatch: 'bg-slate-300/85 shadow-[0_0_8px_rgba(226,232,240,0.55)]',
    dot: 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.75)]',
    label: 'Starlight',
  },
];

function makeId(prefix = 'g'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeEmptyEntry(kind: 'priority' | 'todo'): GoalTaskEntry {
  return {
    id: makeId(kind === 'priority' ? 'pri' : 'todo'),
    kind,
    text: '',
    status: 'empty',
  };
}

function toInputDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthsToMonthKey(monthKey: string, deltaMonths: number): string {
  const [yRaw, mRaw] = monthKey.split('-');
  const y = Number.parseInt(yRaw, 10) || new Date().getFullYear();
  const m = Number.parseInt(mRaw, 10) || 1;
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return toMonthKey(d);
}

function formatMonthLabel(monthKey: string): string {
  const [yRaw, mRaw] = monthKey.split('-');
  const y = Number.parseInt(yRaw, 10);
  const m = Number.parseInt(mRaw, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function buildCalendarMonthBreakdown(
  startMonth: string,
  endMonth: string
): {
  months: Array<{ monthKey: string; label: string; days: number }>;
  totalDays: number;
} {
  const [sy, sm] = startMonth.split('-').map((n) => Number.parseInt(n, 10));
  const [ey, em] = endMonth.split('-').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || !Number.isFinite(ey) || !Number.isFinite(em)) {
    const now = new Date();
    const mk = toMonthKey(now);
    const days = getDaysInMonth(now.getFullYear(), now.getMonth() + 1);
    return {
      months: [{ monthKey: mk, label: formatMonthLabel(mk), days }],
      totalDays: days,
    };
  }

  const startIdx = sy * 12 + (sm - 1);
  const endIdx = Math.max(startIdx, Math.min(startIdx + 11, ey * 12 + (em - 1)));
  const months: Array<{ monthKey: string; label: string; days: number }> = [];
  let totalDays = 0;

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    const days = getDaysInMonth(y, m);
    totalDays += days;
    months.push({ monthKey: mk, label: formatMonthLabel(mk), days });
  }

  return { months, totalDays };
}

function addDaysToIso(iso: string, offset: number): string {
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setDate(base.getDate() + offset);
  return toInputDateString(base);
}

function formatShortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDateHeading(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(366, diff));
}

function daysBetweenExclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 28;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function computeAverageCycleFromDates(
  dates: string[],
  fallback = 28
): {
  avgDays: number;
  intervals: number[];
  sortedDates: string[];
} {
  const valid = dates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => a.localeCompare(b));

  const intervals: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    const gap = daysBetweenExclusive(valid[i - 1], valid[i]);
    if (gap >= 15 && gap <= 60) {
      intervals.push(gap);
    }
  }

  if (intervals.length === 0) {
    return {
      avgDays: Math.max(18, Math.min(45, fallback)),
      intervals: [],
      sortedDates: valid,
    };
  }

  const sum = intervals.reduce((a, b) => a + b, 0);
  return {
    avgDays: Math.max(18, Math.min(45, Math.round(sum / intervals.length))),
    intervals,
    sortedDates: valid,
  };
}

function createFreshStep(
  stepNumber: number,
  options?: { dateLabel?: string; monthKey?: string; phase?: GoalPhaseKind }
): GoalStep {
  return {
    stepNumber,
    dateLabel: options?.dateLabel,
    monthKey: options?.monthKey,
    phase: options?.phase,
    priorities: [makeEmptyEntry('priority')],
    todos: [makeEmptyEntry('todo'), makeEmptyEntry('todo'), makeEmptyEntry('todo')],
    taskText: '',
    status: 'empty',
    carryovers: [],
  };
}

function buildMonthSteps(startMonth: string, endMonth: string): GoalStep[] {
  const { months } = buildCalendarMonthBreakdown(startMonth, endMonth);
  const steps: GoalStep[] = [];
  let runningNum = 1;

  for (const m of months) {
    const [y, mon] = m.monthKey.split('-').map((n) => Number.parseInt(n, 10));
    for (let day = 1; day <= m.days; day++) {
      const dateLabel = `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      steps.push(
        createFreshStep(runningNum, {
          dateLabel,
          monthKey: m.monthKey,
        })
      );
      runningNum += 1;
    }
  }

  return steps;
}

function buildGoalSteps(
  count: number,
  cadence: Exclude<GoalCadence, 'daily'>,
  startDate: string,
  phaseConfig?: PhaseConfig,
  monthRange?: { startMonth: string; endMonth: string; useExactDays: boolean },
  assignWeekDates = false
): GoalStep[] {
  if (cadence === 'month' && monthRange && !monthRange.useExactDays) {
    return buildMonthSteps(monthRange.startMonth, monthRange.endMonth);
  }

  const phaseAnchorStart =
    cadence === 'phase' && phaseConfig?.cycleDates?.length
      ? [...phaseConfig.cycleDates].sort((a, b) => a.localeCompare(b))[
          phaseConfig.cycleDates.length - 1
        ]
      : startDate;

  const safeCount = Math.max(1, Math.min(366, Math.round(count)));
  return Array.from({ length: safeCount }, (_, idx) => {
    const stepNum = idx + 1;
    let phase: GoalPhaseKind | undefined;
    if (cadence === 'phase' && phaseConfig) {
      phase = computeCyclePhaseForDay(
        stepNum,
        phaseConfig.averageCycleDays,
        phaseConfig.periodLengthDays
      );
    }
    const dateLabel =
      cadence === 'phase'
        ? addDaysToIso(phaseAnchorStart, idx)
        : cadence === 'custom' ||
            (cadence === 'month' && monthRange?.useExactDays) ||
            (cadence === 'week' && assignWeekDates)
          ? addDaysToIso(startDate, idx)
          : undefined;
    const monthKey = dateLabel ? dateLabel.slice(0, 7) : undefined;
    return createFreshStep(stepNum, { dateLabel, monthKey, phase });
  });
}

function computeChallengeDayProgress(
  goal: GoalPlan,
  todayIso: string
): {
  currentStepNumber: number;
  totalSteps: number;
  remainingSteps: number;
  label: string;
  phase?: GoalPhaseKind;
} {
  const total = Math.max(1, goal.steps.length);

  if (goal.cadence === 'phase' && goal.phaseConfig) {
    const dates = [...goal.phaseConfig.cycleDates].sort((a, b) => a.localeCompare(b));
    const latest = dates[dates.length - 1];
    if (latest) {
      const elapsed = Math.max(0, daysBetweenExclusive(latest, todayIso));
      const cycleDay = (elapsed % goal.phaseConfig.averageCycleDays) + 1;
      const clamped = Math.min(total, cycleDay);
      const phase = computeCyclePhaseForDay(
        clamped,
        goal.phaseConfig.averageCycleDays,
        goal.phaseConfig.periodLengthDays
      );
      return {
        currentStepNumber: clamped,
        totalSteps: total,
        remainingSteps: Math.max(0, total - clamped),
        label: `Cycle Day ${clamped} of ${total}`,
        phase,
      };
    }
  }

  // Check if today matches a specific dateLabel on any step
  const datedIdx = goal.steps.findIndex((s) => s.dateLabel === todayIso);
  if (datedIdx !== -1) {
    const num = datedIdx + 1;
    return {
      currentStepNumber: num,
      totalSteps: total,
      remainingSteps: Math.max(0, total - num),
      label: `Day ${num} of ${total}`,
    };
  }

  // Otherwise calculate days since challenge creation/startDate
  const anchorIso = goal.startDate || toLocalDateKey(goal.createdAt);
  const diffDays = daysBetweenExclusive(anchorIso, todayIso);
  const currentNum =
    goal.unit === 'weeks'
      ? Math.max(1, Math.min(total, Math.floor(Math.max(0, diffDays) / 7) + 1))
      : Math.max(1, Math.min(total, Math.max(0, diffDays) + 1));

  const unitWord = goal.unit === 'weeks' ? 'Week' : 'Day';
  return {
    currentStepNumber: currentNum,
    totalSteps: total,
    remainingSteps: Math.max(0, total - currentNum),
    label: `${unitWord} ${currentNum} of ${total}`,
  };
}

/* ============================================================================
 * Shared Priorities (3 Default + Infinite + Deadlines) & Separate To-Do Editor
 * ============================================================================ */

interface TaskEntriesEditorProps {
  scopeKey: string;
  priorities: GoalTaskEntry[];
  todos: GoalTaskEntry[];
  minPriorities: number;
  minTodos: number;
  isToday: boolean;
  referenceDateKey?: string;
  nowMs: number;
  allowTomorrowPush: boolean;
  onSaveEntry: (
    kind: 'priority' | 'todo',
    entryId: string,
    text: string,
    deadline?: PriorityDeadline
  ) => void;
  onDeleteEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onAddSlot: (kind: 'priority' | 'todo') => void;
  onTickEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onMissEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onRestoreEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onReschedulePriority: (entryId: string, nextDeadline: PriorityDeadline) => void;
  missTooltip: string;
}

function TaskEntriesEditor({
  scopeKey,
  priorities,
  todos,
  minPriorities,
  minTodos,
  isToday,
  referenceDateKey,
  nowMs,
  allowTomorrowPush,
  onSaveEntry,
  onDeleteEntry,
  onAddSlot,
  onTickEntry,
  onMissEntry,
  onRestoreEntry,
  onReschedulePriority,
  missTooltip,
}: TaskEntriesEditorProps) {
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [draftDeadlines, setDraftDeadlines] = useState<Record<string, PriorityDeadline>>({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});
  const [reschedulePickerId, setReschedulePickerId] = useState<string | null>(null);
  const [rescheduleDraftDeadline, setRescheduleDraftDeadline] = useState<PriorityDeadline>({
    mode: 'clock',
    clockTime: '17:00',
  });

  const renderEntryRow = (entry: GoalTaskEntry, index: number) => {
    const fullKey = `${scopeKey}:${entry.id}`;
    const isSaved = Boolean(entry.text.trim());
    const isEditing = Boolean(editingIds[fullKey]) || !isSaved;
    const draftText = draftTexts[fullKey] ?? entry.text;
    const draftDeadline: PriorityDeadline =
      draftDeadlines[fullKey] ?? entry.deadline ?? { mode: 'none' };

    const isDone = entry.status === 'done';
    const isMissed = entry.status === 'missed';
    const isPriority = entry.kind === 'priority';
    const overdue = isPriority && isPriorityOverdue(entry, nowMs, isToday);
    const deadlineText = isPriority ? formatPriorityDeadline(entry.deadline) : null;
    const showingReschedulePicker = reschedulePickerId === entry.id;

    return (
      <div
        key={entry.id}
        className={`rounded-xl border px-3.5 py-2.5 transition-all ${
          isDone
            ? 'border-cyan-300/35 bg-cyan-400/10'
            : isMissed
              ? 'border-amber-300/30 bg-amber-400/[0.06] opacity-75'
              : overdue
                ? 'border-amber-300/60 bg-amber-400/12'
                : 'border-cyan-200/14 bg-[#04111b]/65'
        }`}
      >
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftText.trim()) return;
              const normalizedDeadline = isPriority
                ? computeDueTimestampForDeadline(draftDeadline, referenceDateKey)
                : undefined;
              onSaveEntry(entry.kind, entry.id, draftText.trim(), normalizedDeadline);
              setEditingIds((prev) => {
                const next = { ...prev };
                delete next[fullKey];
                return next;
              });
              setDraftTexts((prev) => {
                const next = { ...prev };
                delete next[fullKey];
                return next;
              });
              setDraftDeadlines((prev) => {
                const next = { ...prev };
                delete next[fullKey];
                return next;
              });
            }}
            className="space-y-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cyan-400/12 text-[11px] font-semibold text-cyan-200">
                {index + 1}
              </span>
              <input
                type="text"
                value={draftText}
                onChange={(e) =>
                  setDraftTexts((prev) => ({ ...prev, [fullKey]: e.target.value }))
                }
                placeholder={
                  isPriority
                    ? `Priority #${index + 1} — type & click Save...`
                    : `To-do item #${index + 1} — type & click Save...`
                }
                aria-label={isPriority ? `Priority ${index + 1}` : `To-Do ${index + 1}`}
                className="min-w-[160px] flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="submit"
                  disabled={!draftText.trim()}
                  className="bio-btn-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>

                {isSaved && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIds((prev) => {
                        const next = { ...prev };
                        delete next[fullKey];
                        return next;
                      });
                    }}
                    className="h-8 cursor-pointer rounded-lg border border-slate-500/30 px-2.5 text-xs text-slate-300 hover:bg-slate-800/70"
                  >
                    Cancel
                  </button>
                )}

                {((isPriority && priorities.length > minPriorities) ||
                  (!isPriority && todos.length > minTodos)) && (
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.kind, entry.id)}
                    title="Remove empty slot"
                    aria-label="Remove slot"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Deadline selector ONLY on Priorities */}
            {isPriority && (
              <div className="pl-8">
                <PriorityDeadlinePicker
                  value={draftDeadline}
                  onChange={(nextDeadline) =>
                    setDraftDeadlines((prev) => ({ ...prev, [fullKey]: nextDeadline }))
                  }
                />
              </div>
            )}
          </form>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  className={`font-mono-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                    isDone
                      ? 'bg-cyan-400/25 text-cyan-100'
                      : isMissed
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'bg-cyan-400/12 text-cyan-200'
                  }`}
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      isDone
                        ? 'text-cyan-100/75 line-through decoration-cyan-300/70'
                        : isMissed
                          ? 'text-amber-100/65 line-through decoration-amber-400/60'
                          : 'text-slate-100'
                    }`}
                  >
                    {entry.text}
                  </p>

                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {deadlineText && (
                      <span
                        className={`flex items-center gap-1 ${
                          overdue ? 'font-semibold text-amber-200' : 'text-cyan-200/80'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {deadlineText}
                      </span>
                    )}
                    {isDone && (
                      <span className="font-medium text-cyan-300">Completed (+XP)</span>
                    )}
                    {isMissed && (
                      <span className="font-medium text-amber-300/90">
                        {allowTomorrowPush
                          ? 'Not completed · Saved in history for tomorrow'
                          : 'Missed — moved to catch-up'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Saved Entry Action Buttons */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {isMissed ? (
                  <>
                    {isPriority && (
                      <button
                        type="button"
                        onClick={() => {
                          setReschedulePickerId((cur) => (cur === entry.id ? null : entry.id));
                          setRescheduleDraftDeadline(
                            entry.deadline ?? { mode: 'clock', clockTime: '17:00' }
                          );
                        }}
                        className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-cyan-300/35 bg-cyan-400/12 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Pick New Time
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReschedulePickerId((cur) => (cur === entry.id ? null : cur));
                        onRestoreEntry(entry.kind, entry.id);
                      }}
                      className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  </>
                ) : (
                  <>
                    {!isDone && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftTexts((prev) => ({ ...prev, [fullKey]: entry.text }));
                            setDraftDeadlines((prev) => ({
                              ...prev,
                              [fullKey]: entry.deadline ?? { mode: 'none' },
                            }));
                            setEditingIds((prev) => ({ ...prev, [fullKey]: true }));
                          }}
                          title="Edit"
                          aria-label="Edit task"
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-cyan-200/15 bg-slate-900/50 text-slate-300 hover:border-cyan-300/45 hover:text-cyan-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.kind, entry.id)}
                          title="Delete task"
                          aria-label="Delete task"
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => onTickEntry(entry.kind, entry.id)}
                      aria-label={isDone ? 'Undo complete' : 'Mark complete'}
                      title={isDone ? 'Completed (click to undo)' : 'Complete (+XP)'}
                      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-all ${
                        isDone
                          ? 'border-cyan-300/70 bg-cyan-400/25 text-cyan-100 shadow-[0_0_14px_rgba(78,235,255,0.28)]'
                          : 'border-cyan-200/20 bg-cyan-400/[0.08] text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>

                    {!isDone && (
                      <button
                        type="button"
                        onClick={() => onMissEntry(entry.kind, entry.id)}
                        aria-label="Mark not completed and save to history"
                        title={missTooltip}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-rose-300/25 bg-rose-500/[0.08] text-rose-200 transition-all hover:border-amber-300/55 hover:bg-amber-400/15 hover:text-amber-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Deadline Reached Prompt (Yes / No — No immediately cuts out & saves to history) */}
            {overdue && !isDone && !isMissed && (
              <div className="ml-8 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-amber-100">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Past {deadlineText?.replace(/^By /, '') ?? 'target time'} — completed?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onTickEntry(entry.kind, entry.id)}
                    className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/50 bg-cyan-400/20 px-2.5 py-1 font-semibold text-cyan-100 hover:bg-cyan-400/30"
                  >
                    <Check className="h-3 w-3" /> Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => onMissEntry(entry.kind, entry.id)}
                    className="flex cursor-pointer items-center gap-1 rounded-md border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-400/25"
                  >
                    <X className="h-3 w-3" /> No
                  </button>
                </div>
              </div>
            )}

            {showingReschedulePicker && (
              <div className="ml-8 space-y-2 rounded-lg border border-cyan-300/30 bg-slate-950/75 p-2.5">
                <PriorityDeadlinePicker
                  value={rescheduleDraftDeadline}
                  onChange={setRescheduleDraftDeadline}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const computed =
                        computeDueTimestampForDeadline(
                          rescheduleDraftDeadline,
                          referenceDateKey
                        ) ?? { mode: 'none' };
                      onReschedulePriority(entry.id, computed);
                      setReschedulePickerId(null);
                    }}
                    className="bio-btn-primary cursor-pointer rounded-md px-3 py-1 text-xs font-semibold"
                  >
                    Save New Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setReschedulePickerId(null)}
                    className="cursor-pointer rounded-md px-2.5 py-1 text-xs text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Section A: Priorities (3 default slots + infinite +, with Clock/Hours/Salah timer) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
            Priorities (with Time / Hours / Salah Target)
          </p>
          <button
            type="button"
            onClick={() => onAddSlot('priority')}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/20 bg-cyan-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:border-cyan-300/45"
          >
            <Plus className="h-3 w-3" />
            Add Priority
          </button>
        </div>

        <div className="space-y-2">
          {priorities.map((p, idx) => renderEntryRow(p, idx))}
        </div>
      </div>

      {/* Section B: Separate To-Do List (Infinite +, NO timers) */}
      <div className="space-y-2 border-t border-cyan-200/[0.1] pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            To-Do List
          </p>
          <button
            type="button"
            onClick={() => onAddSlot('todo')}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/20 bg-cyan-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-300/45"
          >
            <Plus className="h-3 w-3" />
            Add To-Do
          </button>
        </div>

        <div className="space-y-2">
          {todos.map((t, idx) => renderEntryRow(t, idx))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Main GoalsView
 * ============================================================================ */

export function GoalsView({
  profileName,
  goals,
  activeDailyPlan,
  dailyHistory,
  gamification,
  cycleLogs,
  onUpdateGoals,
  onUpdateDailyPlan,
  onUpdateDailyHistory,
  onUpdateGamification,
  onUpdateCycleLog,
  onOpenDayLogTab,
}: GoalsViewProps) {
  const todayIso = toLocalDateKey(Date.now());
  const currentMonthKey = todayIso.slice(0, 7);

  // 'daily' = Today's Auto-Expiring Daily Plan; 'creator' = Build Challenge; or GoalPlan.id
  const [activeSelection, setActiveSelection] = useState<'daily' | 'creator' | string>('daily');
  const [showTrophies, setShowTrophies] = useState(false);
  const [showDailyHistory, setShowDailyHistory] = useState(false);
  const [showGoalImportDrawer, setShowGoalImportDrawer] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Record<string, boolean>>({});
  const [showSplitter, setShowSplitter] = useState(false);

  // Live clock tick (every 30s) for Priority deadline checks
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Multi-day Challenge Builder State (NO default 7-day title!)
  const [goalTitle, setGoalTitle] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [creatorCadence, setCreatorCadence] = useState<Exclude<GoalCadence, 'daily'>>('week');
  const [accent, setAccent] = useState<StudySessionCard['accent']>('sky');

  // Custom Calendar (string-backed total days so user can erase, cut & type freely)
  const [startDate, setStartDate] = useState<string>(() => todayIso);
  const [endDate, setEndDate] = useState<string>(() => todayIso);
  const [customDaysInput, setCustomDaysInput] = useState<string>('1');

  // Week
  const [weekCountInput, setWeekCountInput] = useState<string>('1');
  const weekCount = useMemo(() => {
    const parsed = Number.parseInt(weekCountInput, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(52, parsed)) : 1;
  }, [weekCountInput]);
  const [weekTrackBy, setWeekTrackBy] = useState<'days' | 'weeks'>('days');

  // Month (Real Calendar Months + Optional Exact # of Days)
  const [monthUseExactDays, setMonthUseExactDays] = useState(false);
  const [monthStart, setMonthStart] = useState<string>(() => currentMonthKey);
  const [monthEnd, setMonthEnd] = useState<string>(() => currentMonthKey);
  const [monthExactDaysInput, setMonthExactDaysInput] = useState<string>('30');
  const monthExactDays = useMemo(() => {
    const parsed = Number.parseInt(monthExactDaysInput, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 30;
  }, [monthExactDaysInput]);

  // Phase (string-backed inputs so typing/deleting/cutting works naturally!)
  const [phaseDataMode, setPhaseDataMode] = useState<'3months' | '1month'>('3months');
  const [phaseDate1, setPhaseDate1] = useState<string>(() => addDaysToIso(todayIso, -64));
  const [phaseDate2, setPhaseDate2] = useState<string>(() => addDaysToIso(todayIso, -35));
  const [phaseDate3, setPhaseDate3] = useState<string>(() => addDaysToIso(todayIso, -6));
  const [phaseManualCycleDaysInput, setPhaseManualCycleDaysInput] = useState<string>('28');
  const [phasePeriodDaysInput, setPhasePeriodDaysInput] = useState<string>('6');
  const phaseManualCycleDays = useMemo(() => {
    const parsed = Number.parseInt(phaseManualCycleDaysInput, 10);
    return Number.isFinite(parsed) ? Math.max(18, Math.min(45, parsed)) : 28;
  }, [phaseManualCycleDaysInput]);
  const phasePeriodDays = useMemo(() => {
    const parsed = Number.parseInt(phasePeriodDaysInput, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(14, parsed)) : 6;
  }, [phasePeriodDaysInput]);
  const [phaseFilter, setPhaseFilter] = useState<'all' | GoalPhaseKind>('all');
  const [showCycleTable, setShowCycleTable] = useState<boolean>(true);

  // Week / Month tab filters, Scope Master Plan, Drag-and-Drop & Expanded Bars
  const [selectedWeekTab, setSelectedWeekTab] = useState<'all' | number>('all');
  const [selectedMonthTab, setSelectedMonthTab] = useState<string>('all');
  const [showScopePlan, setShowScopePlan] = useState<boolean>(true);
  const [dragOverStep, setDragOverStep] = useState<number | null>(null);
  const [assignDayTargets, setAssignDayTargets] = useState<Record<string, number>>({});
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Smart Splitter
  const [splitTotalValue, setSplitTotalValue] = useState('');
  const [splitUnitLabel, setSplitUnitLabel] = useState('pages');

  // Floating feedback
  const [floatingEvents, setFloatingEvents] = useState<FloatingEvent[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeGoal = useMemo(() => {
    if (activeSelection === 'daily' || activeSelection === 'creator') {
      return null;
    }
    return goals.find((g) => g.id === activeSelection) ?? null;
  }, [activeSelection, goals]);

  const levelInfo = useMemo(() => computeLevelInfo(gamification.xp), [gamification.xp]);

  const monthBreakdown = useMemo(
    () => buildCalendarMonthBreakdown(monthStart, monthEnd),
    [monthStart, monthEnd]
  );

  const computedPhasePreview = useMemo(() => {
    if (phaseDataMode === '1month') {
      return {
        avgDays: Math.max(18, Math.min(45, phaseManualCycleDays || 28)),
        intervals: [] as number[],
        sortedDates: phaseDate3 ? [phaseDate3] : [],
      };
    }
    return computeAverageCycleFromDates([phaseDate1, phaseDate2, phaseDate3], 28);
  }, [phaseDataMode, phaseDate1, phaseDate2, phaseDate3, phaseManualCycleDays]);

  const pushFloating = (label: string, tone: FloatingEvent['tone'] = 'cyan') => {
    const id = makeId('xp');
    setFloatingEvents((prev) => [...prev.slice(-4), { id, label, tone }]);
    window.setTimeout(() => {
      setFloatingEvents((prev) => prev.filter((e) => e.id !== id));
    }, 1450);
  };

  const showNotice = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3400);
  };

  const awardCompletionRewards = (
    baseXp: number,
    isRescue: boolean,
    updatedGoalSnapshot?: GoalPlan
  ) => {
    const result = applyGoalCompletionReward(
      gamification,
      baseXp,
      isRescue,
      updatedGoalSnapshot
    );
    onUpdateGamification((prev) =>
      applyGoalCompletionReward(prev, baseXp, isRescue, updatedGoalSnapshot).nextStats
    );
    if (result.leveledUpTo) {
      playCueSound('goal_levelup');
      pushFloating(`LEVEL ${result.leveledUpTo} UNLOCKED!`, 'gold');
      showNotice(`Leveled up to Level ${result.leveledUpTo}!`);
    } else {
      playCueSound('goal_tick');
      pushFloating(
        result.nextStats.combo >= 2
          ? `+${result.earnedXp} XP · ${result.nextStats.combo}x Combo!`
          : `+${result.earnedXp} XP`,
        isRescue ? 'gold' : 'cyan'
      );
    }
    if (result.earnedShield) {
      showNotice('3-streak reached — earned +1 Momentum Shield!');
    }
  };

  // Unfinished tasks from Past Daily History
  const unfinishedImportPool = useMemo(() => {
    const list: Array<{
      historyDate: string;
      entry: GoalTaskEntry;
    }> = [];
    for (const day of dailyHistory) {
      for (const p of day.priorities) {
        if (p.text.trim() && (p.status === 'pending' || p.status === 'missed')) {
          list.push({ historyDate: day.dateKey, entry: p });
        }
      }
      for (const t of day.todos) {
        if (t.text.trim() && (t.status === 'pending' || t.status === 'missed')) {
          list.push({ historyDate: day.dateKey, entry: t });
        }
      }
    }
    return list;
  }, [dailyHistory]);

  const mostRecentImportDay = dailyHistory.find(
    (d) =>
      d.priorities.some((p) => p.text.trim() && (p.status === 'pending' || p.status === 'missed')) ||
      d.todos.some((t) => t.text.trim() && (t.status === 'pending' || t.status === 'missed'))
  );

  // ============================================================================
  // Daily Plan Handlers (Today's Auto-Expiring Plan)
  // ============================================================================

  const handleDailySaveEntry = (
    kind: 'priority' | 'todo',
    entryId: string,
    text: string,
    deadline?: PriorityDeadline
  ) => {
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: prev[listKey].map((item) =>
          item.id === entryId
            ? {
                ...item,
                text,
                status: item.status === 'empty' ? 'pending' : item.status,
                ...(kind === 'priority' ? { deadline } : {}),
              }
            : item
        ),
      };
    });
  };

  const handleDailyDeleteEntry = (kind: 'priority' | 'todo', entryId: string) => {
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      const minSlots = kind === 'priority' ? 3 : 5;
      const filtered = prev[listKey].filter((item) => item.id !== entryId);
      while (filtered.length < minSlots) {
        filtered.push(makeEmptyEntry(kind));
      }
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: filtered,
      };
    });
  };

  const handleDailyAddSlot = (kind: 'priority' | 'todo') => {
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: [...prev[listKey], makeEmptyEntry(kind)],
      };
    });
  };

  const handleDailyTickEntry = (kind: 'priority' | 'todo', entryId: string) => {
    const list = kind === 'priority' ? activeDailyPlan.priorities : activeDailyPlan.todos;
    const target = list.find((e) => e.id === entryId);
    if (!target || !target.text.trim()) return;

    const wasDone = target.status === 'done';
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: prev[listKey].map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: wasDone ? 'pending' : 'done',
                completedAt: wasDone ? undefined : Date.now(),
                missedAt: undefined,
              }
            : item
        ),
      };
    });

    if (!wasDone) {
      awardCompletionRewards(kind === 'priority' ? 55 : 35, false);
    }
  };

  const handleDailyMissEntry = (kind: 'priority' | 'todo', entryId: string) => {
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: prev[listKey].map((item) =>
          item.id === entryId
            ? { ...item, status: 'missed', missedAt: Date.now() }
            : item
        ),
      };
    });
    playCueSound('goal_carryover');
    pushFloating('Saved to history for tomorrow', 'amber');
  };

  const handleDailyRestoreEntry = (kind: 'priority' | 'todo', entryId: string) => {
    onUpdateDailyPlan((prev) => {
      const listKey = kind === 'priority' ? 'priorities' : 'todos';
      return {
        ...prev,
        updatedAt: Date.now(),
        [listKey]: prev[listKey].map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: item.text.trim() ? 'pending' : 'empty',
                missedAt: undefined,
              }
            : item
        ),
      };
    });
  };

  const handleDailyReschedulePriority = (entryId: string, nextDeadline: PriorityDeadline) => {
    onUpdateDailyPlan((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      priorities: prev.priorities.map((item) =>
        item.id === entryId
          ? {
              ...item,
              status: 'pending',
              missedAt: undefined,
              deadline: nextDeadline,
            }
          : item
      ),
    }));
    showNotice('Priority deadline updated for today.');
  };

  const handleImportEntriesToToday = (itemsToImport: Array<{ historyDate: string; entry: GoalTaskEntry }>) => {
    if (itemsToImport.length === 0) return;

    const importedIds = new Set(itemsToImport.map((i) => i.entry.id));

    onUpdateDailyPlan((prev) => {
      const nextPriorities = [...prev.priorities];
      const nextTodos = [...prev.todos];

      for (const { entry } of itemsToImport) {
        const cloned: GoalTaskEntry = {
          id: makeId(entry.kind === 'priority' ? 'pri' : 'todo'),
          kind: entry.kind,
          text: entry.text.trim(),
          status: 'pending',
          deadline: entry.deadline
            ? computeDueTimestampForDeadline(entry.deadline, todayIso)
            : undefined,
        };
        if (entry.kind === 'priority') {
          const emptyIdx = nextPriorities.findIndex((p) => !p.text.trim());
          if (emptyIdx !== -1) nextPriorities[emptyIdx] = cloned;
          else nextPriorities.push(cloned);
        } else {
          const emptyIdx = nextTodos.findIndex((t) => !t.text.trim());
          if (emptyIdx !== -1) nextTodos[emptyIdx] = cloned;
          else nextTodos.push(cloned);
        }
      }

      return {
        ...prev,
        priorities: nextPriorities,
        todos: nextTodos,
        dismissedImportBanner: true,
        updatedAt: Date.now(),
      };
    });

    // Mark imported items in dailyHistory as 'done' (resolved/imported) or remove from unfinished pool cleanly by marking status 'done'? Better: filter them or tag? Wait — keeping history accurate by marking a clean note or leaving completed vs imported: actually let's remove them from unfinished by filtering if missed/pending? Wait: users want to see history of what happened AND not be nagged twice! Let's filter imported items out of pending or keep them marked completed? Even cleaner: delete from past history? No, preserve past log by setting a non-unfinished state? `status` only allows `empty | pending | done | missed`, wait: removing just from re-import banner by dismissing banner handles yesterday! And in the Past History drawer users can always manually re-import anything anytime!
    void importedIds;
    setSelectedImportIds({});
    playCueSound('goal_tick');
    pushFloating(`Imported ${itemsToImport.length} task${itemsToImport.length === 1 ? '' : 's'}!`, 'cyan');
  };

  const handleImportStepToDaily = (goal: GoalPlan, step: GoalStep) => {
    const savedPriorities = (step.priorities ?? []).filter((p) => p.text.trim());
    const savedTodos = (step.todos ?? []).filter((t) => t.text.trim());
    const allSaved = [...savedPriorities, ...savedTodos];
    if (allSaved.length === 0) {
      showNotice(`Bar #${step.stepNumber} has no saved tasks to import yet.`);
      return;
    }

    const existingKeys = new Set(
      [...activeDailyPlan.priorities, ...activeDailyPlan.todos]
        .filter((e) => e.text.trim())
        .map((e) => `${e.kind}:${e.text.trim().toLowerCase()}`)
    );

    const pendingToImport: GoalTaskEntry[] = [];
    for (const entry of allSaved) {
      const dedupeKey = `${entry.kind}:${entry.text.trim().toLowerCase()}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      pendingToImport.push(entry);
    }

    if (pendingToImport.length === 0) {
      showNotice(`Tasks from "${goal.title}" #${step.stepNumber} are already in Today's Daily Plan.`);
      return;
    }

    onUpdateDailyPlan((prev) => {
      const prevKeys = new Set(
        [...prev.priorities, ...prev.todos]
          .filter((e) => e.text.trim())
          .map((e) => `${e.kind}:${e.text.trim().toLowerCase()}`)
      );

      const nextPriorities = [...prev.priorities];
      const nextTodos = [...prev.todos];

      for (const entry of pendingToImport) {
        const dedupeKey = `${entry.kind}:${entry.text.trim().toLowerCase()}`;
        if (prevKeys.has(dedupeKey)) continue;
        prevKeys.add(dedupeKey);

        const cloned: GoalTaskEntry = {
          id: makeId(entry.kind === 'priority' ? 'pri' : 'todo'),
          kind: entry.kind,
          text: entry.text.trim(),
          status: entry.status === 'done' ? 'done' : 'pending',
          ...(entry.status === 'done' ? { completedAt: Date.now() } : {}),
          deadline:
            entry.kind === 'priority' && entry.deadline
              ? computeDueTimestampForDeadline(entry.deadline, todayIso)
              : undefined,
        };

        if (entry.kind === 'priority') {
          const emptyIdx = nextPriorities.findIndex((p) => !p.text.trim());
          if (emptyIdx !== -1) nextPriorities[emptyIdx] = cloned;
          else nextPriorities.push(cloned);
        } else {
          const emptyIdx = nextTodos.findIndex((t) => !t.text.trim());
          if (emptyIdx !== -1) nextTodos[emptyIdx] = cloned;
          else nextTodos.push(cloned);
        }
      }

      return {
        ...prev,
        priorities: nextPriorities,
        todos: nextTodos,
        updatedAt: Date.now(),
      };
    });

    playCueSound('goal_tick');
    pushFloating(`Imported ${pendingToImport.length} to Today!`, 'cyan');
    showNotice(
      `Imported ${pendingToImport.length} task${pendingToImport.length === 1 ? '' : 's'} from "${goal.title}" (#${step.stepNumber}) into Today's Daily Plan.`
    );
  };

  // ============================================================================
  // Multi-Day Challenge Handlers (Custom / Week / Month / Phase)
  // ============================================================================

  const updateGoalById = (goalId: string, updater: (g: GoalPlan) => GoalPlan) => {
    onUpdateGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...updater(g), updatedAt: Date.now() } : g))
    );
  };

  const plannedChallengeCount = useMemo(() => {
    if (creatorCadence === 'custom') return daysBetweenInclusive(startDate, endDate);
    if (creatorCadence === 'week') {
      const w = Math.max(1, Math.min(52, weekCount || 1));
      return weekTrackBy === 'days' ? w * 7 : w;
    }
    if (creatorCadence === 'month') {
      return monthUseExactDays
        ? Math.max(1, Math.min(365, monthExactDays || 30))
        : monthBreakdown.totalDays;
    }
    return computedPhasePreview.avgDays;
  }, [
    computedPhasePreview.avgDays,
    creatorCadence,
    endDate,
    monthBreakdown.totalDays,
    monthExactDays,
    monthUseExactDays,
    startDate,
    weekCount,
    weekTrackBy,
  ]);

  const handleCreateChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = goalTitle.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    setTitleError(false);

    let unit: GoalUnit = 'days';
    if (creatorCadence === 'week') unit = weekTrackBy === 'weeks' ? 'weeks' : 'days';
    else if (creatorCadence === 'month') unit = 'days';
    else if (creatorCadence === 'phase') unit = 'phase_days';

    const phaseConfig: PhaseConfig | undefined =
      creatorCadence === 'phase'
        ? {
            cycleDates: computedPhasePreview.sortedDates,
            periodLengthDays: Math.max(1, Math.min(14, phasePeriodDays || 6)),
            averageCycleDays: computedPhasePreview.avgDays,
            dataMode: phaseDataMode,
          }
        : undefined;

    const steps = buildGoalSteps(
      plannedChallengeCount,
      creatorCadence,
      startDate,
      phaseConfig,
      creatorCadence === 'month'
        ? {
            startMonth: monthStart,
            endMonth: monthEnd < monthStart ? monthStart : monthEnd,
            useExactDays: monthUseExactDays,
          }
        : undefined,
      creatorCadence === 'week' && weekTrackBy === 'days'
    );

    const now = Date.now();
    const newGoal: GoalPlan = {
      id: makeId('goal'),
      title: trimmed,
      cadence: creatorCadence,
      unit,
      totalSteps: steps.length,
      startDate:
        creatorCadence === 'custom'
          ? startDate
          : steps[0]?.dateLabel ?? todayIso,
      endDate:
        creatorCadence === 'custom'
          ? endDate
          : steps[steps.length - 1]?.dateLabel,
      startMonth: creatorCadence === 'month' && !monthUseExactDays ? monthStart : undefined,
      endMonth:
        creatorCadence === 'month' && !monthUseExactDays
          ? monthEnd < monthStart
            ? monthStart
            : monthEnd
          : undefined,
      phaseConfig,
      accent,
      steps,
      trailingCarryovers: [],
      createdAt: now,
      updatedAt: now,
    };

    onUpdateGoals((prev) => [newGoal, ...prev]);
    setActiveSelection(newGoal.id);
    setSelectedWeekTab('all');
    setSelectedMonthTab('all');
    setPhaseFilter('all');
    setExpandedSteps({ [`${newGoal.id}:1`]: true });
    setGoalTitle('');
    playCueSound('goal_tick');
    pushFloating('Challenge Created!', 'gold');
  };

  const handleStepSaveEntry = (
    goal: GoalPlan,
    stepNumber: number,
    kind: 'priority' | 'todo',
    entryId: string,
    text: string,
    deadline?: PriorityDeadline
  ) => {
    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        const list =
          kind === 'priority'
            ? [...(s.priorities ?? [makeEmptyEntry('priority')])]
            : [...(s.todos ?? [makeEmptyEntry('todo'), makeEmptyEntry('todo'), makeEmptyEntry('todo')])];
        const updatedList = list.map((item) =>
          item.id === entryId
            ? {
                ...item,
                text,
                status: item.status === 'empty' ? ('pending' as const) : item.status,
                ...(kind === 'priority' ? { deadline } : {}),
              }
            : item
        );
        return {
          ...s,
          priorities: kind === 'priority' ? updatedList : s.priorities,
          todos: kind === 'todo' ? updatedList : s.todos,
        };
      }),
    }));
  };

  const handleStepDeleteEntry = (
    goal: GoalPlan,
    stepNumber: number,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        const minSlots = kind === 'priority' ? 1 : 3;
        const raw = kind === 'priority' ? (s.priorities ?? []) : (s.todos ?? []);
        const filtered = raw.filter((item) => item.id !== entryId);
        while (filtered.length < minSlots) {
          filtered.push(makeEmptyEntry(kind));
        }
        return {
          ...s,
          priorities: kind === 'priority' ? filtered : s.priorities,
          todos: kind === 'todo' ? filtered : s.todos,
        };
      }),
    }));
  };

  const handleStepAddSlot = (goal: GoalPlan, stepNumber: number, kind: 'priority' | 'todo') => {
    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        const list = kind === 'priority' ? [...(s.priorities ?? [])] : [...(s.todos ?? [])];
        list.push(makeEmptyEntry(kind));
        return {
          ...s,
          priorities: kind === 'priority' ? list : s.priorities,
          todos: kind === 'todo' ? list : s.todos,
        };
      }),
    }));
  };

  const handleStepTickEntry = (
    goal: GoalPlan,
    stepNumber: number,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    const step = goal.steps.find((s) => s.stepNumber === stepNumber);
    if (!step) return;
    const list = kind === 'priority' ? (step.priorities ?? []) : (step.todos ?? []);
    const target = list.find((e) => e.id === entryId);
    if (!target || !target.text.trim()) return;
    const wasDone = target.status === 'done';

    const updatedGoal: GoalPlan = {
      ...goal,
      steps: goal.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        const curList = kind === 'priority' ? (s.priorities ?? []) : (s.todos ?? []);
        const nextList = curList.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: wasDone ? ('pending' as const) : ('done' as const),
                completedAt: wasDone ? undefined : Date.now(),
                missedAt: undefined,
              }
            : item
        );
        return {
          ...s,
          priorities: kind === 'priority' ? nextList : s.priorities,
          todos: kind === 'todo' ? nextList : s.todos,
        };
      }),
    };

    updateGoalById(goal.id, () => updatedGoal);
    if (!wasDone) {
      awardCompletionRewards(kind === 'priority' ? 55 : 35, false, updatedGoal);
    }
  };

  const handleStepMissEntry = (
    goal: GoalPlan,
    stepNumber: number,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    const currentIndex = goal.steps.findIndex((s) => s.stepNumber === stepNumber);
    if (currentIndex === -1) return;
    const step = goal.steps[currentIndex];
    const list = kind === 'priority' ? (step.priorities ?? []) : (step.todos ?? []);
    const target = list.find((e) => e.id === entryId);
    if (!target || !target.text.trim() || target.status === 'missed') return;

    const carryoverItem: GoalCarryoverItem = {
      id: makeId('co'),
      originStepNumber: step.stepNumber,
      kind,
      text: target.text.trim(),
      status: 'pending',
    };

    const nextStep = goal.steps[currentIndex + 1];

    updateGoalById(goal.id, (g) => {
      const updatedSteps = g.steps.map((s, idx) => {
        if (s.stepNumber === stepNumber) {
          const curList = kind === 'priority' ? (s.priorities ?? []) : (s.todos ?? []);
          const nextList = curList.map((item) =>
            item.id === entryId
              ? { ...item, status: 'missed' as const, missedAt: Date.now() }
              : item
          );
          return {
            ...s,
            priorities: kind === 'priority' ? nextList : s.priorities,
            todos: kind === 'todo' ? nextList : s.todos,
          };
        }
        if (idx === currentIndex + 1) {
          return { ...s, carryovers: [...s.carryovers, carryoverItem] };
        }
        return s;
      });

      const updatedTrailing = !nextStep
        ? [...(g.trailingCarryovers ?? []), carryoverItem]
        : g.trailingCarryovers ?? [];

      return {
        ...g,
        steps: updatedSteps,
        trailingCarryovers: updatedTrailing,
      };
    });

    const shieldCushioned = gamification.shields > 0 && gamification.combo > 0;
    onUpdateGamification((prev) => {
      if (prev.shields > 0 && prev.combo > 0) {
        return { ...prev, shields: prev.shields - 1, combo: Math.floor(prev.combo / 2) };
      }
      return { ...prev, combo: 0 };
    });

    if (shieldCushioned) {
      showNotice(
        nextStep
          ? `Shield cushioned combo! "${carryoverItem.text}" placed below #${nextStep.stepNumber}.`
          : `Shield cushioned combo! "${carryoverItem.text}" moved to catch-up below #${step.stepNumber}.`
      );
    } else {
      showNotice(
        nextStep
          ? `"${carryoverItem.text}" placed below #${nextStep.stepNumber} for catch-up.`
          : `"${carryoverItem.text}" placed into catch-up below #${step.stepNumber}.`
      );
    }

    playCueSound('goal_carryover');
    pushFloating(
      nextStep ? `Moved below #${nextStep.stepNumber}` : 'Moved to Catch-Up',
      'amber'
    );
  };

  const handleStepRestoreEntry = (
    goal: GoalPlan,
    stepNumber: number,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        const curList = kind === 'priority' ? (s.priorities ?? []) : (s.todos ?? []);
        const nextList = curList.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: item.text.trim() ? ('pending' as const) : ('empty' as const),
                missedAt: undefined,
              }
            : item
        );
        return {
          ...s,
          priorities: kind === 'priority' ? nextList : s.priorities,
          todos: kind === 'todo' ? nextList : s.todos,
        };
      }),
    }));
  };

  const handleStepReschedulePriority = (
    goal: GoalPlan,
    stepNumber: number,
    entryId: string,
    nextDeadline: PriorityDeadline
  ) => {
    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== stepNumber) return s;
        return {
          ...s,
          priorities: (s.priorities ?? []).map((item) =>
            item.id === entryId ? { ...item, deadline: nextDeadline } : item
          ),
        };
      }),
    }));
  };

  const handleTickCarryover = (
    goal: GoalPlan,
    holderStepNumber: number | null,
    carryoverId: string
  ) => {
    let wasUndoing = false;

    const updatedGoal: GoalPlan = {
      ...goal,
      steps: goal.steps.map((s) => {
        if (s.stepNumber !== holderStepNumber) return s;
        return {
          ...s,
          carryovers: s.carryovers.map((c) => {
            if (c.id !== carryoverId) return c;
            if (c.status === 'done') {
              wasUndoing = true;
              return { ...c, status: 'pending', completedAt: undefined };
            }
            return { ...c, status: 'done', completedAt: Date.now() };
          }),
        };
      }),
      trailingCarryovers:
        holderStepNumber === null
          ? (goal.trailingCarryovers ?? []).map((c) => {
              if (c.id !== carryoverId) return c;
              if (c.status === 'done') {
                wasUndoing = true;
                return { ...c, status: 'pending', completedAt: undefined };
              }
              return { ...c, status: 'done', completedAt: Date.now() };
            })
          : goal.trailingCarryovers,
    };

    updateGoalById(goal.id, () => updatedGoal);
    if (!wasUndoing) {
      awardCompletionRewards(65, true, updatedGoal);
    }
  };

  const handlePushCarryoverForward = (
    goal: GoalPlan,
    holderStepNumber: number,
    carryover: GoalCarryoverItem
  ) => {
    const holderIdx = goal.steps.findIndex((s) => s.stepNumber === holderStepNumber);
    if (holderIdx === -1) return;
    const nextStep = goal.steps[holderIdx + 1];

    const forwardedItem: GoalCarryoverItem = {
      ...carryover,
      id: makeId('co'),
      status: 'pending',
    };

    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s, idx) => {
        if (s.stepNumber === holderStepNumber) {
          return {
            ...s,
            carryovers: s.carryovers.filter((c) => c.id !== carryover.id),
          };
        }
        if (nextStep && idx === holderIdx + 1) {
          return { ...s, carryovers: [...s.carryovers, forwardedItem] };
        }
        return s;
      }),
      trailingCarryovers: !nextStep
        ? [...(g.trailingCarryovers ?? []), forwardedItem]
        : g.trailingCarryovers ?? [],
    }));

    playCueSound('goal_carryover');
    pushFloating(
      nextStep ? `Moved below #${nextStep.stepNumber}` : 'Moved to Catch-Up',
      'amber'
    );
  };

  const handleDeleteCarryover = (
    goalId: string,
    holderStepNumber: number | null,
    carryoverId: string
  ) => {
    updateGoalById(goalId, (g) => ({
      ...g,
      steps: g.steps.map((s) =>
        s.stepNumber === holderStepNumber
          ? { ...s, carryovers: s.carryovers.filter((c) => c.id !== carryoverId) }
          : s
      ),
      trailingCarryovers:
        holderStepNumber === null
          ? (g.trailingCarryovers ?? []).filter((c) => c.id !== carryoverId)
          : g.trailingCarryovers,
    }));
  };

  const handleAppendStep = (goal: GoalPlan) => {
    const nextNum = goal.steps.length + 1;
    const lastDate = goal.steps[goal.steps.length - 1]?.dateLabel;
    const nextDate = lastDate ? addDaysToIso(lastDate, 1) : undefined;
    const nextPhase =
      goal.cadence === 'phase' && goal.phaseConfig
        ? computeCyclePhaseForDay(
            nextNum,
            goal.phaseConfig.averageCycleDays,
            goal.phaseConfig.periodLengthDays
          )
        : undefined;

    updateGoalById(goal.id, (g) => ({
      ...g,
      totalSteps: nextNum,
      steps: [
        ...g.steps,
        createFreshStep(nextNum, {
          dateLabel: nextDate,
          monthKey: nextDate ? nextDate.slice(0, 7) : undefined,
          phase: nextPhase,
        }),
      ],
    }));
  };

  const handleAddExtraPhaseDay = (goal: GoalPlan, phase: GoalPhaseKind) => {
    if (goal.cadence !== 'phase') return;
    let lastPhaseIdx = -1;
    for (let i = 0; i < goal.steps.length; i++) {
      if (goal.steps[i].phase === phase) {
        lastPhaseIdx = i;
      }
    }
    const insertIdx = lastPhaseIdx !== -1 ? lastPhaseIdx + 1 : goal.steps.length;
    const insertStepNum = insertIdx + 1;

    updateGoalById(goal.id, (g) => {
      const inserted = createFreshStep(insertStepNum, { phase });
      const rawSteps = [
        ...g.steps.slice(0, insertIdx),
        inserted,
        ...g.steps.slice(insertIdx),
      ];
      const baseAnchor =
        g.steps[0]?.dateLabel ??
        g.phaseConfig?.cycleDates?.[g.phaseConfig.cycleDates.length - 1] ??
        g.startDate;
      const renumberedSteps = rawSteps.map((s, idx) => {
        const nextDate = baseAnchor ? addDaysToIso(baseAnchor, idx) : s.dateLabel;
        return {
          ...s,
          stepNumber: idx + 1,
          dateLabel: nextDate,
          monthKey: nextDate ? nextDate.slice(0, 7) : s.monthKey,
          carryovers: s.carryovers.map((co) => ({
            ...co,
            originStepNumber:
              co.originStepNumber >= insertStepNum
                ? co.originStepNumber + 1
                : co.originStepNumber,
          })),
        };
      });
      const nextPeriodDays =
        phase === 'menstrual'
          ? renumberedSteps.filter((s) => s.phase === 'menstrual').length
          : g.phaseConfig?.periodLengthDays ?? 6;

      return {
        ...g,
        totalSteps: renumberedSteps.length,
        endDate: renumberedSteps[renumberedSteps.length - 1]?.dateLabel ?? g.endDate,
        ...(g.phaseConfig
          ? {
              phaseConfig: {
                ...g.phaseConfig,
                periodLengthDays: nextPeriodDays,
                averageCycleDays: renumberedSteps.length,
              },
            }
          : {}),
        steps: renumberedSteps,
      };
    });

    setExpandedSteps((prev) => ({
      ...prev,
      [`${goal.id}:${insertStepNum}`]: true,
    }));
    playCueSound('goal_tick');
    showNotice(`Added +1 day to ${PHASE_META[phase].label} Phase (Day #${insertStepNum}).`);
  };

  const handleUpdateStepPhase = (
    goal: GoalPlan,
    stepNumber: number,
    nextPhase: GoalPhaseKind
  ) => {
    updateGoalById(goal.id, (g) => {
      const nextSteps = g.steps.map((s) =>
        s.stepNumber === stepNumber ? { ...s, phase: nextPhase } : s
      );
      const nextPeriodDays = nextSteps.filter((s) => s.phase === 'menstrual').length;
      return {
        ...g,
        ...(g.phaseConfig
          ? {
              phaseConfig: {
                ...g.phaseConfig,
                periodLengthDays: Math.max(1, nextPeriodDays),
              },
            }
          : {}),
        steps: nextSteps,
      };
    });
  };

  const handleStartNewCycleToday = (goal: GoalPlan) => {
    if (goal.cadence !== 'phase') return;
    const periodLen = goal.phaseConfig?.periodLengthDays ?? 6;
    updateGoalById(goal.id, (g) => {
      const existingDates = g.phaseConfig?.cycleDates ?? [];
      const nextDates = Array.from(new Set([...existingDates, todayIso])).sort((a, b) =>
        a.localeCompare(b)
      );
      const total = g.steps.length;
      const nextSteps = g.steps.map((s, idx) => {
        const dateLabel = addDaysToIso(todayIso, idx);
        return {
          ...s,
          dateLabel,
          monthKey: dateLabel.slice(0, 7),
          phase: computeCyclePhaseForDay(idx + 1, total, periodLen),
        };
      });
      return {
        ...g,
        startDate: todayIso,
        endDate: nextSteps[nextSteps.length - 1]?.dateLabel ?? g.endDate,
        phaseConfig: {
          cycleDates: nextDates,
          periodLengthDays: periodLen,
          averageCycleDays: total,
          dataMode: g.phaseConfig?.dataMode ?? '1month',
        },
        steps: nextSteps,
      };
    });
    playCueSound('goal_tick');
    showNotice(`Started fresh Cycle Day 1 from ${todayIso} (${periodLen} menstrual days).`);
  };

  const handleQuickCreatePeriodGoal = () => {
    const now = Date.now();
    const phaseConfig: PhaseConfig = {
      cycleDates: [todayIso],
      periodLengthDays: 6,
      averageCycleDays: 28,
      dataMode: '1month',
    };
    const steps = buildGoalSteps(28, 'phase', todayIso, phaseConfig);
    const created: GoalPlan = {
      id: makeId('goal'),
      title: 'My Cycle Tracker',
      cadence: 'phase',
      unit: 'phase_days',
      totalSteps: steps.length,
      startDate: todayIso,
      endDate: steps[steps.length - 1]?.dateLabel,
      phaseConfig,
      accent: 'rose',
      steps,
      trailingCarryovers: [],
      createdAt: now,
      updatedAt: now,
    };
    onUpdateGoals((prev) => [created, ...prev]);
    setActiveSelection(created.id);
    setPhaseFilter('all');
    setShowCycleTable(true);
    playCueSound('goal_tick');
    showNotice('Created 28-day Monthly Phases tracker (Days 1–6 Menstrual).');
  };

  const handleSmartSplit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGoal) return;
    const total = Number.parseInt(splitTotalValue, 10);
    if (!Number.isFinite(total) || total <= 0) return;

    const emptySteps = activeGoal.steps.filter(
      (s) => !(s.priorities ?? []).some((p) => p.text.trim())
    );
    const targetSteps = emptySteps.length > 0 ? emptySteps : activeGoal.steps;
    const n = targetSteps.length;
    const base = Math.floor(total / n);
    let rem = total % n;

    const mapAmounts = new Map<number, string>();
    for (const s of targetSteps) {
      const amount = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      if (amount > 0) {
        mapAmounts.set(s.stepNumber, `${amount} ${splitUnitLabel.trim() || 'items'}`);
      }
    }

    updateGoalById(activeGoal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        const nextTxt = mapAmounts.get(s.stepNumber);
        if (!nextTxt) return s;
        const priList = [...(s.priorities ?? [makeEmptyEntry('priority')])];
        priList[0] = {
          ...priList[0],
          text: nextTxt,
          status: priList[0].status === 'empty' ? 'pending' : priList[0].status,
        };
        return { ...s, priorities: priList };
      }),
    }));
    setShowSplitter(false);
    setSplitTotalValue('');
    playCueSound('goal_tick');
    pushFloating('Filled Priority #1 Across Bars!', 'cyan');
  };

  // ============================================================================
  // Scope-Level Master Priorities & To-Do List + Drag/Place Into Days
  // ============================================================================

  const getScopePlan = (goal: GoalPlan, scopeKey: string): GoalScopePlan => {
    const existing = goal.scopePlans?.[scopeKey];
    const priorities =
      existing && existing.priorities.length > 0
        ? existing.priorities
        : [makeEmptyEntry('priority')];
    const todos =
      existing && existing.todos.length >= 3
        ? existing.todos
        : [
            ...(existing?.todos ?? []),
            ...Array.from(
              { length: Math.max(0, 3 - (existing?.todos.length ?? 0)) },
              () => makeEmptyEntry('todo')
            ),
          ];
    return { priorities, todos };
  };

  const handleScopeSaveEntry = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo',
    entryId: string,
    text: string,
    deadline?: PriorityDeadline
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      const list = kind === 'priority' ? current.priorities : current.todos;
      const updatedList = list.map((item) =>
        item.id === entryId
          ? {
              ...item,
              text,
              status: item.status === 'empty' ? ('pending' as const) : item.status,
              ...(kind === 'priority' ? { deadline } : {}),
            }
          : item
      );
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            priorities: kind === 'priority' ? updatedList : current.priorities,
            todos: kind === 'todo' ? updatedList : current.todos,
          },
        },
      };
    });
  };

  const handleScopeDeleteEntry = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      const minSlots = kind === 'priority' ? 1 : 3;
      const raw = kind === 'priority' ? current.priorities : current.todos;
      const filtered = raw.filter((item) => item.id !== entryId);
      while (filtered.length < minSlots) {
        filtered.push(makeEmptyEntry(kind));
      }
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            priorities: kind === 'priority' ? filtered : current.priorities,
            todos: kind === 'todo' ? filtered : current.todos,
          },
        },
      };
    });
  };

  const handleScopeAddSlot = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo'
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      const list =
        kind === 'priority'
          ? [...current.priorities, makeEmptyEntry('priority')]
          : [...current.todos, makeEmptyEntry('todo')];
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            priorities: kind === 'priority' ? list : current.priorities,
            todos: kind === 'todo' ? list : current.todos,
          },
        },
      };
    });
  };

  const handleScopeTickEntry = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    const current = getScopePlan(goal, scopeKey);
    const list = kind === 'priority' ? current.priorities : current.todos;
    const target = list.find((e) => e.id === entryId);
    if (!target || !target.text.trim()) return;
    const wasDone = target.status === 'done';

    const updatedList = list.map((item) =>
      item.id === entryId
        ? {
            ...item,
            status: wasDone ? ('pending' as const) : ('done' as const),
            completedAt: wasDone ? undefined : Date.now(),
            missedAt: undefined,
          }
        : item
    );

    const updatedGoal: GoalPlan = {
      ...goal,
      scopePlans: {
        ...(goal.scopePlans ?? {}),
        [scopeKey]: {
          priorities: kind === 'priority' ? updatedList : current.priorities,
          todos: kind === 'todo' ? updatedList : current.todos,
        },
      },
    };

    updateGoalById(goal.id, () => updatedGoal);
    if (!wasDone) {
      awardCompletionRewards(kind === 'priority' ? 55 : 35, false, updatedGoal);
    }
  };

  const handleScopeMissEntry = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      const list = kind === 'priority' ? current.priorities : current.todos;
      const nextList = list.map((item) =>
        item.id === entryId ? { ...item, status: 'missed' as const, missedAt: Date.now() } : item
      );
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            priorities: kind === 'priority' ? nextList : current.priorities,
            todos: kind === 'todo' ? nextList : current.todos,
          },
        },
      };
    });
    playCueSound('goal_carryover');
  };

  const handleScopeRestoreEntry = (
    goal: GoalPlan,
    scopeKey: string,
    kind: 'priority' | 'todo',
    entryId: string
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      const list = kind === 'priority' ? current.priorities : current.todos;
      const nextList = list.map((item) =>
        item.id === entryId
          ? {
              ...item,
              status: item.text.trim() ? ('pending' as const) : ('empty' as const),
              missedAt: undefined,
            }
          : item
      );
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            priorities: kind === 'priority' ? nextList : current.priorities,
            todos: kind === 'todo' ? nextList : current.todos,
          },
        },
      };
    });
  };

  const handleScopeReschedulePriority = (
    goal: GoalPlan,
    scopeKey: string,
    entryId: string,
    nextDeadline: PriorityDeadline
  ) => {
    updateGoalById(goal.id, (g) => {
      const current = getScopePlan(g, scopeKey);
      return {
        ...g,
        scopePlans: {
          ...(g.scopePlans ?? {}),
          [scopeKey]: {
            ...current,
            priorities: current.priorities.map((item) =>
              item.id === entryId ? { ...item, deadline: nextDeadline } : item
            ),
          },
        },
      };
    });
  };

  const handlePlaceScopeTaskIntoStep = (
    goal: GoalPlan,
    entryData: {
      kind: 'priority' | 'todo';
      text: string;
      deadline?: PriorityDeadline;
    },
    targetStepNumber: number
  ) => {
    const cleanText = entryData.text.trim();
    if (!cleanText) return;
    const targetStep = goal.steps.find((s) => s.stepNumber === targetStepNumber);
    if (!targetStep) return;

    const existingList =
      entryData.kind === 'priority'
        ? targetStep.priorities ?? [makeEmptyEntry('priority')]
        : targetStep.todos ?? [
            makeEmptyEntry('todo'),
            makeEmptyEntry('todo'),
            makeEmptyEntry('todo'),
          ];
    const alreadyExists = existingList.some(
      (item) => item.text.trim().toLowerCase() === cleanText.toLowerCase()
    );

    if (alreadyExists) {
      setExpandedSteps((prev) => ({
        ...prev,
        [`${goal.id}:${targetStepNumber}`]: true,
      }));
      showNotice(`"${cleanText}" is already planned in #${targetStepNumber}.`);
      return;
    }

    const cloned: GoalTaskEntry = {
      id: makeId(entryData.kind === 'priority' ? 'pri' : 'todo'),
      kind: entryData.kind,
      text: cleanText,
      status: 'pending',
      deadline:
        entryData.kind === 'priority' && entryData.deadline
          ? computeDueTimestampForDeadline(
              entryData.deadline,
              targetStep.dateLabel ?? todayIso
            )
          : undefined,
    };

    updateGoalById(goal.id, (g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (s.stepNumber !== targetStepNumber) return s;
        const baseList =
          entryData.kind === 'priority'
            ? [...(s.priorities ?? [makeEmptyEntry('priority')])]
            : [
                ...(s.todos ?? [
                  makeEmptyEntry('todo'),
                  makeEmptyEntry('todo'),
                  makeEmptyEntry('todo'),
                ]),
              ];
        const emptyIdx = baseList.findIndex((item) => !item.text.trim());
        if (emptyIdx !== -1) baseList[emptyIdx] = cloned;
        else baseList.push(cloned);

        return {
          ...s,
          priorities: entryData.kind === 'priority' ? baseList : s.priorities,
          todos: entryData.kind === 'todo' ? baseList : s.todos,
        };
      }),
    }));

    setExpandedSteps((prev) => ({
      ...prev,
      [`${goal.id}:${targetStepNumber}`]: true,
    }));
    playCueSound('goal_tick');
    pushFloating(`Placed in #${targetStepNumber}!`, 'cyan');
    showNotice(`Placed "${cleanText}" into #${targetStepNumber}.`);
  };

  const goalStats = useMemo(() => {
    if (!activeGoal) {
      return {
        planned: 0,
        done: 0,
        missed: 0,
        pendingCarryovers: 0,
        doneCarryovers: 0,
        pct: 0,
        allClear: false,
      };
    }

    const allSavedEntries = activeGoal.steps.flatMap((s) => [
      ...(s.priorities ?? []).filter((e) => e.text.trim()),
      ...(s.todos ?? []).filter((e) => e.text.trim()),
    ]);
    const done = allSavedEntries.filter((e) => e.status === 'done').length;
    const missed = allSavedEntries.filter((e) => e.status === 'missed').length;

    const allCarryovers = [
      ...activeGoal.steps.flatMap((s) => s.carryovers),
      ...(activeGoal.trailingCarryovers ?? []),
    ];
    const pendingCarryovers = allCarryovers.filter((c) => c.status === 'pending').length;
    const doneCarryovers = allCarryovers.filter((c) => c.status === 'done').length;

    const denominator = allSavedEntries.length + allCarryovers.length;
    const numerator = done + doneCarryovers;
    const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
    const allClear = denominator > 0 && numerator === denominator;

    return {
      planned: allSavedEntries.length,
      done,
      missed,
      pendingCarryovers,
      doneCarryovers,
      pct,
      allClear,
    };
  }, [activeGoal]);

  const challengeDayInfo = useMemo(
    () => (activeGoal ? computeChallengeDayProgress(activeGoal, todayIso) : null),
    [activeGoal, todayIso]
  );

  const weekTabsForActiveGoal = useMemo(() => {
    if (!activeGoal || activeGoal.cadence !== 'week' || activeGoal.unit === 'weeks') {
      return [];
    }
    const totalWeeks = Math.ceil(activeGoal.steps.length / 7);
    if (totalWeeks <= 1) return [];
    return Array.from({ length: totalWeeks }, (_, idx) => {
      const weekNum = idx + 1;
      const startStep = idx * 7 + 1;
      const endStep = Math.min(activeGoal.steps.length, weekNum * 7);
      return {
        weekNum,
        startStep,
        endStep,
        count: endStep - startStep + 1,
      };
    });
  }, [activeGoal]);

  const monthTabsForActiveGoal = useMemo(() => {
    if (!activeGoal) return [];
    const map = new Map<string, number>();
    for (const s of activeGoal.steps) {
      if (s.monthKey) {
        map.set(s.monthKey, (map.get(s.monthKey) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([monthKey, count]) => ({
      monthKey,
      label: formatMonthLabel(monthKey),
      count,
    }));
  }, [activeGoal]);

  const displayedSteps = useMemo(() => {
    if (!activeGoal) return [];
    let list = activeGoal.steps;
    if (activeGoal.cadence === 'phase' && phaseFilter !== 'all') {
      list = list.filter((s) => s.phase === phaseFilter);
    }
    if (weekTabsForActiveGoal.length > 0 && selectedWeekTab !== 'all') {
      const start = (selectedWeekTab - 1) * 7 + 1;
      const end = selectedWeekTab * 7;
      list = list.filter((s) => s.stepNumber >= start && s.stepNumber <= end);
    }
    if (
      monthTabsForActiveGoal.length > 1 &&
      selectedMonthTab !== 'all'
    ) {
      list = list.filter((s) => s.monthKey === selectedMonthTab);
    }
    return list;
  }, [
    activeGoal,
    monthTabsForActiveGoal.length,
    phaseFilter,
    selectedMonthTab,
    selectedWeekTab,
    weekTabsForActiveGoal.length,
  ]);

  const activeScopeInfo = useMemo(() => {
    if (!activeGoal) {
      return { scopeKey: 'all', label: 'Goal Plan' };
    }
    if (activeGoal.cadence === 'phase' && phaseFilter !== 'all') {
      return {
        scopeKey: `phase:${phaseFilter}`,
        label: `${PHASE_META[phaseFilter].label} Phase`,
      };
    }
    if (weekTabsForActiveGoal.length > 0 && selectedWeekTab !== 'all') {
      return {
        scopeKey: `week:${selectedWeekTab}`,
        label: `Week ${selectedWeekTab}`,
      };
    }
    if (monthTabsForActiveGoal.length > 1 && selectedMonthTab !== 'all') {
      return {
        scopeKey: `month:${selectedMonthTab}`,
        label: formatMonthLabel(selectedMonthTab),
      };
    }
    const label =
      activeGoal.cadence === 'phase'
        ? 'All Phases Cycle'
        : activeGoal.cadence === 'week'
          ? weekTabsForActiveGoal.length > 1
            ? `All ${weekTabsForActiveGoal.length} Weeks`
            : 'Whole Week Plan'
          : activeGoal.cadence === 'month'
            ? monthTabsForActiveGoal.length > 1
              ? 'All Months'
              : monthTabsForActiveGoal[0]?.label ?? 'Monthly Plan'
            : 'Entire Challenge';
    return { scopeKey: 'all', label };
  }, [
    activeGoal,
    monthTabsForActiveGoal,
    phaseFilter,
    selectedMonthTab,
    selectedWeekTab,
    weekTabsForActiveGoal.length,
  ]);

  const activeScopePlan = useMemo(
    () =>
      activeGoal
        ? getScopePlan(activeGoal, activeScopeInfo.scopeKey)
        : { priorities: [], todos: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGoal, activeScopeInfo.scopeKey]
  );

  const activeScopeSavedItems = useMemo(
    () => [
      ...activeScopePlan.priorities.filter((p) => p.text.trim()),
      ...activeScopePlan.todos.filter((t) => t.text.trim()),
    ],
    [activeScopePlan]
  );

  // Daily plan progress stats
  const dailySavedCount = useMemo(() => {
    const all = [...activeDailyPlan.priorities, ...activeDailyPlan.todos];
    const saved = all.filter((e) => e.text.trim());
    const done = saved.filter((e) => e.status === 'done').length;
    return { total: saved.length, done };
  }, [activeDailyPlan]);

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 quiet-scroll">
      {/* Floating XP / Gamification Bursts */}
      {floatingEvents.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-6 top-20 z-50 flex flex-col items-end gap-2"
        >
          {floatingEvents.map((ev) => (
            <div
              key={ev.id}
              className={`animate-xp-float font-mono-tabular rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md ${
                ev.tone === 'gold'
                  ? 'border-amber-300/60 bg-amber-400/20 text-amber-100 shadow-amber-500/20'
                  : ev.tone === 'amber'
                    ? 'border-amber-300/45 bg-slate-900/85 text-amber-200'
                    : 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100 shadow-cyan-500/20'
              }`}
            >
              {ev.label}
            </div>
          ))}
        </div>
      )}

      {toastMessage && (
        <div className="glass-panel flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs text-cyan-100">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            {toastMessage}
          </span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss message"
            className="cursor-pointer text-slate-400 hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 1. Gamified Command Strip */}
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="goal-number-node-done font-mono-tabular flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-slate-100">
              L{levelInfo.level}
            </div>
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2 text-xs text-cyan-200/85">
                <span className="font-semibold text-slate-100">{levelInfo.rankTitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-amber-200">
                  {gamification.xp} XP
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="h-2 w-44 overflow-hidden rounded-full bg-slate-900/80 sm:w-56">
                  <div
                    className="bio-progress h-full rounded-full transition-all duration-300"
                    style={{ width: `${levelInfo.progressPct}%` }}
                  />
                </div>
                <span className="font-mono-tabular text-[11px] text-slate-300/80">
                  {levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <Flame
                className={`h-4 w-4 ${
                  gamification.combo >= 3
                    ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'text-cyan-300/80'
                }`}
              />
              <div className="text-xs">
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {gamification.combo}x
                </span>{' '}
                <span className="text-slate-400">
                  Combo (best {gamification.bestCombo}x)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-300" />
              <div className="text-xs">
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {gamification.shields}/3
                </span>{' '}
                <span className="text-slate-400">Shields</span>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              <span className="font-mono-tabular font-semibold text-slate-100">
                {gamification.totalStepsCompleted}
              </span>{' '}
              cleared
              {gamification.rescuesCompleted > 0 && (
                <>
                  {' '}
                  <span aria-hidden="true">·</span>{' '}
                  <span className="font-mono-tabular text-amber-200">
                    {gamification.rescuesCompleted} rescued
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTrophies((v) => !v)}
              className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showTrophies
                  ? 'bio-glow-chip'
                  : 'border-cyan-200/20 bg-cyan-400/[0.06] text-slate-200 hover:border-cyan-300/45'
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-300" />
              Trophies ({gamification.unlockedBadges.length}/{BADGE_DEFS.length})
            </button>
          </div>
        </div>

        {showTrophies && (
          <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-cyan-200/[0.1] pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {BADGE_DEFS.map((b) => {
              const unlocked = gamification.unlockedBadges.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                    unlocked
                      ? 'border-amber-300/40 bg-gradient-to-r from-cyan-400/10 to-amber-400/10'
                      : 'border-cyan-200/10 bg-slate-950/35 opacity-60'
                  }`}
                >
                  <Award
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      unlocked ? 'text-amber-300' : 'text-slate-500'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{b.title}</p>
                    <p className="text-[11px] text-slate-300/80">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Organized Goals & Daily Plan Shelf (With Direct Delete Buttons) */}
      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Your Goals &amp; Daily Plan</h2>
            <p className="text-[11px] text-slate-400">
              Select a plan to work on, or remove extra challenges anytime.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setActiveSelection((cur) => (cur === 'creator' ? 'daily' : 'creator'))
            }
            className="bio-btn-primary flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold"
          >
            {activeSelection === 'creator' ? (
              <>
                <Sun className="h-4 w-4" />
                Back to Daily Plan
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                New Challenge
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Today's Daily Plan Card (Always Present & Auto-Dated) */}
          <button
            type="button"
            onClick={() => setActiveSelection('daily')}
            className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
              activeSelection === 'daily'
                ? 'bio-glow-chip'
                : 'border-cyan-200/15 bg-[#04111b]/65 hover:border-cyan-300/40'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="text-xs font-semibold text-slate-100">
                  Today&apos;s Daily Plan
                </span>
              </div>
              {unfinishedImportPool.length > 0 && !activeDailyPlan.dismissedImportBanner && (
                <span className="font-mono-tabular rounded bg-amber-400/25 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                  {unfinishedImportPool.length} import
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-300/80">
              <span>{formatShortDate(todayIso)} · Resets midnight</span>
              <span className="font-mono-tabular text-cyan-200">
                {dailySavedCount.done}/{dailySavedCount.total} cleared
              </span>
            </div>
          </button>

          {/* Created Multi-Day Challenge Cards with Instant Delete */}
          {goals.map((g) => {
            const isSelected = activeSelection === g.id;
            const dotClass =
              ACCENT_OPTIONS.find((a) => a.key === g.accent)?.dot ?? ACCENT_OPTIONS[0].dot;
            const dayProg = computeChallengeDayProgress(g, todayIso);
            const allEntries = g.steps.flatMap((s) => [
              ...(s.priorities ?? []).filter((e) => e.text.trim()),
              ...(s.todos ?? []).filter((e) => e.text.trim()),
            ]);
            const doneCount = allEntries.filter((e) => e.status === 'done').length;
            const pct =
              allEntries.length > 0 ? Math.round((doneCount / allEntries.length) * 100) : 0;

            return (
              <div
                key={g.id}
                onClick={() => {
                  setActiveSelection(g.id);
                  setSelectedWeekTab('all');
                  setSelectedMonthTab('all');
                  setPhaseFilter('all');
                  setExpandedSteps((prev) => ({
                    ...prev,
                    [`${g.id}:${dayProg.currentStepNumber}`]: true,
                  }));
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveSelection(g.id);
                    setSelectedWeekTab('all');
                    setSelectedMonthTab('all');
                    setPhaseFilter('all');
                  }
                }}
                className={`group flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'bio-glow-chip'
                    : 'border-cyan-200/15 bg-[#04111b]/65 hover:border-cyan-300/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                    <span className="truncate text-xs font-semibold text-slate-100">
                      {g.title}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateGoals((prev) => prev.filter((item) => item.id !== g.id));
                      if (activeSelection === g.id) {
                        setActiveSelection('daily');
                      }
                      showNotice(`Deleted "${g.title}"`);
                    }}
                    title={`Delete ${g.title}`}
                    aria-label={`Delete ${g.title}`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-rose-400/35 hover:bg-rose-500/15 hover:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-300/80">
                    <span className="capitalize">
                      {g.cadence} · {dayProg.label}
                    </span>
                    <span className="font-mono-tabular text-cyan-200">
                      {allEntries.length > 0 ? `${doneCount}/${allEntries.length} (${pct}%)` : `${g.steps.length} bars`}
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950/75">
                    <div
                      className="bio-progress h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
       * VIEW A: TODAY'S AUTO-EXPIRING DAILY PLAN (3 Priorities + 5 To-Dos)
       * ==================================================================== */}
      {activeSelection === 'daily' && (
        <section className="glass-panel space-y-5 rounded-2xl p-5 sm:p-7">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-200/[0.1] pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-200/85">
                <Sun className="h-3.5 w-3.5 text-amber-300" />
                <span>Auto-resets daily at midnight · 3 Priorities + 5 To-Dos</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {dailySavedCount.done}/{dailySavedCount.total} cleared
                </span>
              </div>
              <h2 className="font-display mt-1 text-xl font-semibold text-slate-100 sm:text-2xl">
                {formatFullDateHeading(activeDailyPlan.dateKey)}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {goals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowGoalImportDrawer((v) => !v)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    showGoalImportDrawer
                      ? 'bio-glow-chip'
                      : 'border-cyan-200/20 bg-cyan-400/[0.06] text-cyan-100 hover:border-cyan-300/45'
                  }`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Import from Goals / Phases
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDailyHistory((v) => !v)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  showDailyHistory
                    ? 'bio-glow-chip'
                    : 'border-cyan-200/20 bg-cyan-400/[0.06] text-cyan-100 hover:border-cyan-300/45'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                Past Days History ({dailyHistory.length})
              </button>

              {dailySavedCount.total > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const snapshot: DailyPlanRecord = {
                      ...activeDailyPlan,
                      priorities: activeDailyPlan.priorities.filter((p) => p.text.trim()),
                      todos: activeDailyPlan.todos.filter((t) => t.text.trim()),
                    };
                    onUpdateDailyHistory((prev) => {
                      const others = prev.filter((h) => h.dateKey !== snapshot.dateKey);
                      return [snapshot, ...others].slice(0, 60);
                    });
                    onUpdateDailyPlan(() => ({
                      dateKey: todayIso,
                      priorities: [
                        makeEmptyEntry('priority'),
                        makeEmptyEntry('priority'),
                        makeEmptyEntry('priority'),
                      ],
                      todos: [
                        makeEmptyEntry('todo'),
                        makeEmptyEntry('todo'),
                        makeEmptyEntry('todo'),
                        makeEmptyEntry('todo'),
                        makeEmptyEntry('todo'),
                      ],
                      dismissedImportBanner: false,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    }));
                    showNotice("Archived today's list to history & opened a fresh slate.");
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-300/45"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Archive &amp; Clear
                </button>
              )}
            </div>
          </div>

          {/* Unfinished Tasks Import Notification Banner */}
          {unfinishedImportPool.length > 0 && !activeDailyPlan.dismissedImportBanner && (
            <div className="rounded-xl border border-amber-300/45 bg-gradient-to-r from-amber-400/14 via-cyan-400/10 to-amber-400/12 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      {unfinishedImportPool.length} unfinished task
                      {unfinishedImportPool.length === 1 ? '' : 's'} waiting from{' '}
                      {mostRecentImportDay
                        ? formatShortDate(mostRecentImportDay.dateKey)
                        : 'past days'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-200/85">
                      Select which tasks you want to bring into today&apos;s plan, or dismiss.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleImportEntriesToToday(unfinishedImportPool)}
                    className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Import All ({unfinishedImportPool.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDailyPlan((prev) => ({
                        ...prev,
                        dismissedImportBanner: true,
                      }))
                    }
                    className="cursor-pointer rounded-lg border border-slate-400/25 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {unfinishedImportPool.slice(0, 8).map(({ historyDate, entry }) => {
                  const checked = selectedImportIds[entry.id] ?? true;
                  return (
                    <label
                      key={entry.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-amber-200/20 bg-slate-950/55 px-3 py-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedImportIds((prev) => ({
                              ...prev,
                              [entry.id]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-cyan-400"
                        />
                        <span className="truncate font-medium text-slate-100">
                          {entry.text}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                        <span className="capitalize">
                          {entry.kind === 'priority' ? 'Priority' : 'To-Do'}
                        </span>
                        <span>· {formatShortDate(historyDate)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const chosen = unfinishedImportPool.filter(
                      ({ entry }) => selectedImportIds[entry.id] ?? true
                    );
                    handleImportEntriesToToday(chosen);
                  }}
                  className="cursor-pointer rounded-lg border border-cyan-300/45 bg-cyan-400/15 px-3.5 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/25"
                >
                  Import Selected
                </button>
              </div>
            </div>
          )}

          {/* Import From Goals & Monthly Phases Drawer */}
          {showGoalImportDrawer && (
            <div className="space-y-3 rounded-xl border border-cyan-300/25 bg-[#04111b]/75 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                  Import Tasks from Active Goals &amp; Cycle Phases
                </p>
                <button
                  type="button"
                  onClick={() => setShowGoalImportDrawer(false)}
                  className="cursor-pointer text-xs text-slate-400 hover:text-slate-100"
                >
                  Close
                </button>
              </div>

              {(() => {
                const importableRows = goals.flatMap((g) => {
                  const prog = computeChallengeDayProgress(g, todayIso);
                  return g.steps
                    .filter((s) => {
                      const hasSaved =
                        (s.priorities ?? []).some((p) => p.text.trim()) ||
                        (s.todos ?? []).some((t) => t.text.trim());
                      return hasSaved;
                    })
                    .map((s) => ({
                      goal: g,
                      step: s,
                      isTodayMatch: s.stepNumber === prog.currentStepNumber,
                    }));
                });

                if (importableRows.length === 0) {
                  return (
                    <p className="text-xs text-slate-400">
                      Save some Priorities or To-Dos inside any Goal or Monthly Phase day first, and they will appear here to import straight into Today&apos;s Daily Plan!
                    </p>
                  );
                }

                // Sort today's steps to the top
                importableRows.sort((a, b) => Number(b.isTodayMatch) - Number(a.isTodayMatch));

                return (
                  <div className="max-h-72 space-y-2.5 overflow-y-auto quiet-scroll">
                    {importableRows.map(({ goal, step, isTodayMatch }) => {
                      const items = [
                        ...(step.priorities ?? []).filter((p) => p.text.trim()),
                        ...(step.todos ?? []).filter((t) => t.text.trim()),
                      ];
                      const phaseLabel = step.phase ? PHASE_META[step.phase].label : null;
                      return (
                        <div
                          key={`${goal.id}-${step.stepNumber}`}
                          className="rounded-xl border border-cyan-200/15 bg-slate-950/60 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-100">{goal.title}</span>
                              <span className="font-mono-tabular rounded bg-cyan-400/15 px-1.5 py-0.5 text-[11px] text-cyan-100">
                                #{step.stepNumber}
                              </span>
                              {phaseLabel && (
                                <span className="text-amber-200">{phaseLabel} Phase</span>
                              )}
                              {isTodayMatch && (
                                <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                                  Today&apos;s Step
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleImportStepToDaily(goal, step)}
                              className="bio-btn-primary flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                            >
                              <Download className="h-3 w-3" />
                              Import ({items.length})
                            </button>
                          </div>

                          <p className="mt-1.5 truncate text-[11px] text-slate-300/80">
                            {items.map((i) => i.text).join(' · ')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Past Days History Drawer */}
          {showDailyHistory && (
            <div className="space-y-3 rounded-xl border border-cyan-200/15 bg-[#04111b]/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                  Archived Past Days
                </p>
                <button
                  type="button"
                  onClick={() => setShowDailyHistory(false)}
                  className="cursor-pointer text-xs text-slate-400 hover:text-slate-100"
                >
                  Close
                </button>
              </div>

              {dailyHistory.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No past days archived yet — each day&apos;s plan saves here automatically at midnight.
                </p>
              ) : (
                <div className="max-h-72 space-y-2.5 overflow-y-auto quiet-scroll">
                  {dailyHistory.map((day) => {
                    const dayItems = [
                      ...day.priorities.filter((p) => p.text.trim()),
                      ...day.todos.filter((t) => t.text.trim()),
                    ];
                    const doneCount = dayItems.filter((i) => i.status === 'done').length;
                    return (
                      <div
                        key={day.dateKey}
                        className="rounded-xl border border-cyan-200/12 bg-slate-950/60 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-100">
                            {formatFullDateHeading(day.dateKey)}
                          </span>
                          <span className="font-mono-tabular text-slate-400">
                            {doneCount}/{dayItems.length} completed
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {dayItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span
                                className={`flex min-w-0 items-center gap-2 ${
                                  item.status === 'done'
                                    ? 'text-cyan-200/80 line-through'
                                    : 'text-amber-100'
                                }`}
                              >
                                {item.status === 'done' ? (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                ) : (
                                  <X className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                                )}
                                <span className="truncate">{item.text}</span>
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  handleImportEntriesToToday([
                                    { historyDate: day.dateKey, entry: item },
                                  ])
                                }
                                className="shrink-0 cursor-pointer rounded-md border border-cyan-200/20 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-400/20"
                              >
                                + Import
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Synced Cycle & Daily Check-In Strip (links Daily Plan <-> Monthly Phases <-> Day Log) */}
          {(() => {
            const cycleCtx = resolveActiveCycleContext(goals, activeDailyPlan.dateKey);
            const todayLog: CycleDayLog = cycleLogs[activeDailyPlan.dateKey] ?? {
              dateKey: activeDailyPlan.dateKey,
              flow: 'none',
              symptoms: [],
              note: '',
              updatedAt: Date.now(),
            };
            return (
              <div className="rounded-xl border border-rose-300/25 bg-rose-500/[0.06] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-rose-300" />
                    <span className="text-xs font-semibold text-rose-100">
                      Period &amp; Cycle Sync ({activeDailyPlan.dateKey})
                    </span>
                    {cycleCtx ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (cycleCtx.phaseGoal) {
                            setActiveSelection(cycleCtx.phaseGoal.id);
                          }
                        }}
                        className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          PHASE_META[cycleCtx.phase].chipClass
                        }`}
                      >
                        Cycle Day {cycleCtx.cycleDay}/{cycleCtx.totalCycleDays} ·{' '}
                        {PHASE_META[cycleCtx.phase].label}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleQuickCreatePeriodGoal}
                        className="flex cursor-pointer items-center gap-1 rounded-md border border-rose-300/40 bg-rose-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/25"
                      >
                        <Sparkles className="h-3 w-3" />
                        Start 28-Day Period Tracker (6d Menstrual)
                      </button>
                    )}
                  </div>

                  {onOpenDayLogTab && (
                    <button
                      type="button"
                      onClick={onOpenDayLogTab}
                      className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/20"
                    >
                      <PenTool className="h-3 w-3" />
                      Open 4 AM–3 AM Sheet
                    </button>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-300">Today&apos;s Flow:</span>
                  {FLOW_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        onUpdateCycleLog(activeDailyPlan.dateKey, (prev) => ({
                          ...prev,
                          dateKey: activeDailyPlan.dateKey,
                          flow: opt.value,
                          updatedAt: Date.now(),
                        }))
                      }
                      className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        todayLog.flow === opt.value
                          ? `${opt.chipClass} ring-1 ring-rose-300/70`
                          : 'border-cyan-200/12 bg-slate-950/50 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  <input
                    type="text"
                    value={todayLog.note}
                    onChange={(e) =>
                      onUpdateCycleLog(activeDailyPlan.dateKey, (prev) => ({
                        ...prev,
                        dateKey: activeDailyPlan.dateKey,
                        note: e.target.value,
                        updatedAt: Date.now(),
                      }))
                    }
                    placeholder="Synced cycle / wellness note..."
                    className="bio-input min-w-[210px] flex-1 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
              </div>
            );
          })()}

          {/* Priorities (3 default + infinite) + To-Do List (5 default + infinite) */}
          <TaskEntriesEditor
            scopeKey={`daily:${activeDailyPlan.dateKey}`}
            priorities={activeDailyPlan.priorities}
            todos={activeDailyPlan.todos}
            minPriorities={3}
            minTodos={5}
            isToday={true}
            referenceDateKey={activeDailyPlan.dateKey}
            nowMs={nowMs}
            allowTomorrowPush={true}
            onSaveEntry={handleDailySaveEntry}
            onDeleteEntry={handleDailyDeleteEntry}
            onAddSlot={handleDailyAddSlot}
            onTickEntry={handleDailyTickEntry}
            onMissEntry={handleDailyMissEntry}
            onRestoreEntry={handleDailyRestoreEntry}
            onReschedulePriority={handleDailyReschedulePriority}
            missTooltip="Cut off & save to history for tomorrow"
          />
        </section>
      )}

      {/* ====================================================================
       * VIEW B: CREATE MULTI-DAY CHALLENGE (Custom / Week / Month / Phase)
       * ==================================================================== */}
      {activeSelection === 'creator' && (
        <section className="glass-panel rounded-2xl p-6 sm:p-7">
          <form onSubmit={handleCreateChallenge} className="space-y-6">
            <div>
              <p className="text-xs font-medium text-cyan-200/85">
                Step 1 · What challenge do you want to plan, {profileName}?
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => {
                    setGoalTitle(e.target.value);
                    if (titleError && e.target.value.trim()) setTitleError(false);
                  }}
                  placeholder="Enter your challenge name (e.g. Finish Tafsir Volume 1, Memorize Juz Amma...)"
                  aria-label="Challenge name"
                  className={`bio-input min-w-0 flex-1 rounded-xl px-4 py-3 text-sm placeholder:text-slate-400/75 ${
                    titleError ? 'border-rose-400/70 ring-2 ring-rose-400/20' : ''
                  }`}
                />

                <div className="fp-dot-picker flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-2 sm:self-auto">
                  {ACCENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAccent(opt.key)}
                      aria-label={`Color ${opt.label}`}
                      className={`h-4 w-4 cursor-pointer rounded-full transition-transform ${
                        opt.swatch
                      } ${
                        accent === opt.key
                          ? 'scale-115 ring-2 ring-white/90 ring-offset-1 ring-offset-slate-900'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
              {titleError && (
                <p className="mt-1.5 text-xs text-rose-300">
                  Please type what this challenge is about before creating it.
                </p>
              )}
            </div>

            <div className="border-t border-cyan-200/[0.1] pt-5">
              <p className="mb-3 text-xs font-medium text-cyan-200/85">
                Step 2 · Choose Challenge Format (Looking for today only? Use{' '}
                <button
                  type="button"
                  onClick={() => setActiveSelection('daily')}
                  className="cursor-pointer underline text-amber-200 hover:text-amber-100"
                >
                  Today&apos;s Daily Plan
                </button>
                )
              </p>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {(
                  [
                    {
                      key: 'custom' as const,
                      label: 'Custom Calendar',
                      sub: 'Pick exact dates',
                      icon: Calendar,
                    },
                    {
                      key: 'week' as const,
                      label: 'Week',
                      sub: '1, 2, 3, or 7 weeks',
                      icon: Target,
                    },
                    {
                      key: 'month' as const,
                      label: 'Month',
                      sub: 'Real calendar days & range',
                      icon: Trophy,
                    },
                    {
                      key: 'phase' as const,
                      label: 'Phase',
                      sub: 'Cycle energy planner',
                      icon: HeartPulse,
                    },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = creatorCadence === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setCreatorCadence(mode.key)}
                      className={`flex cursor-pointer flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                        active
                          ? 'bio-glow-chip'
                          : 'border-cyan-200/14 bg-[#04111b]/55 text-slate-200 hover:border-cyan-300/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                        <span>{mode.label}</span>
                      </div>
                      <span className="mt-1 text-[11px] text-slate-300/75">{mode.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-200/14 bg-[#04111b]/65 p-4 sm:p-5">
              {creatorCadence === 'custom' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setStartDate(nextStart);
                        const nextEnd = nextStart > endDate ? nextStart : endDate;
                        if (nextStart > endDate) setEndDate(nextStart);
                        setCustomDaysInput(String(daysBetweenInclusive(nextStart, nextEnd)));
                      }}
                      className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setEndDate(nextEnd);
                        setCustomDaysInput(String(daysBetweenInclusive(startDate, nextEnd)));
                      }}
                      className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Total Days
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customDaysInput}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        setCustomDaysInput(cleaned);
                        const parsed = Number.parseInt(cleaned, 10);
                        if (Number.isFinite(parsed) && parsed >= 1) {
                          const clamped = Math.min(365, parsed);
                          setEndDate(addDaysToIso(startDate, clamped - 1));
                        }
                      }}
                      onBlur={() => {
                        setCustomDaysInput(String(daysBetweenInclusive(startDate, endDate)));
                      }}
                      className="bio-input font-mono-tabular w-24 rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                </div>
              )}

              {creatorCadence === 'week' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-200">Quick Week Shortcuts</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[1, 2, 3, 7].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setWeekCountInput(String(w))}
                            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              weekCount === w
                                ? 'bio-glow-chip'
                                : 'border-cyan-200/15 bg-slate-950/50 text-slate-300 hover:border-cyan-300/40'
                            }`}
                          >
                            {w} {w === 1 ? 'Week' : 'Weeks'} ({w * 7} days)
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Number of Weeks
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={weekCountInput}
                          onChange={(e) =>
                            setWeekCountInput(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          onBlur={() => setWeekCountInput(String(weekCount))}
                          className="bio-input font-mono-tabular w-20 rounded-lg px-2.5 py-1.5 text-center text-xs"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Show Bars As
                        </label>
                        <div className="flex rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setWeekTrackBy('days')}
                            className={`cursor-pointer rounded-md px-2.5 py-1 ${
                              weekTrackBy === 'days'
                                ? 'bg-cyan-400/20 text-cyan-100'
                                : 'text-slate-400'
                            }`}
                          >
                            Days ({weekCount * 7})
                          </button>
                          <button
                            type="button"
                            onClick={() => setWeekTrackBy('weeks')}
                            className={`cursor-pointer rounded-md px-2.5 py-1 ${
                              weekTrackBy === 'weeks'
                                ? 'bg-cyan-400/20 text-cyan-100'
                                : 'text-slate-400'
                            }`}
                          >
                            Weeks ({weekCount})
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {creatorCadence === 'month' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-200">
                      Month Challenge Planner (uses real 28/29/30/31 calendar days per month!)
                    </p>
                    <div className="flex rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setMonthUseExactDays(false)}
                        className={`cursor-pointer rounded-md px-2.5 py-1 ${
                          !monthUseExactDays
                            ? 'bg-cyan-400/20 text-cyan-100'
                            : 'text-slate-400'
                        }`}
                      >
                        By Calendar Month(s)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthUseExactDays(true)}
                        className={`cursor-pointer rounded-md px-2.5 py-1 ${
                          monthUseExactDays
                            ? 'bg-cyan-400/20 text-cyan-100'
                            : 'text-slate-400'
                        }`}
                      >
                        Custom # of Days
                      </button>
                    </div>
                  </div>

                  {!monthUseExactDays ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {[1, 3, 6, 12].map((m) => {
                          const selectedMatch =
                            monthBreakdown.months.length === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMonthEnd(addMonthsToMonthKey(monthStart, m - 1))}
                              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                selectedMatch
                                  ? 'bio-glow-chip'
                                  : 'border-cyan-200/15 bg-slate-950/50 text-slate-300 hover:border-cyan-300/40'
                              }`}
                            >
                              {m} {m === 1 ? 'Month' : 'Months'}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-300">
                            From Month (which month does this start?)
                          </label>
                          <input
                            type="month"
                            value={monthStart}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (!next) return;
                              const span = Math.max(0, monthBreakdown.months.length - 1);
                              setMonthStart(next);
                              setMonthEnd(addMonthsToMonthKey(next, span));
                            }}
                            className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-300">
                            To Month (up to 12 months)
                          </label>
                          <input
                            type="month"
                            value={monthEnd}
                            min={monthStart}
                            max={addMonthsToMonthKey(monthStart, 11)}
                            onChange={(e) => {
                              if (e.target.value) setMonthEnd(e.target.value);
                            }}
                            className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100"
                          />
                        </div>

                        <div className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                          <span className="font-mono-tabular font-semibold">
                            {monthBreakdown.totalDays}
                          </span>{' '}
                          real calendar days (
                          {monthBreakdown.months
                            .slice(0, 4)
                            .map((m) => `${m.label}: ${m.days}d`)
                            .join(' + ')}
                          {monthBreakdown.months.length > 4
                            ? ` + ${monthBreakdown.months.length - 4} more`
                            : ''}
                          )
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs text-slate-300">Exact number of days:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={monthExactDaysInput}
                        onChange={(e) =>
                          setMonthExactDaysInput(e.target.value.replace(/[^0-9]/g, ''))
                        }
                        onBlur={() => setMonthExactDaysInput(String(monthExactDays))}
                        className="bio-input font-mono-tabular w-24 rounded-lg px-3 py-1.5 text-center text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {creatorCadence === 'phase' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-100">
                        Women&apos;s Cycle Calibration
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-300/80">
                        Use your last 3 period start dates for an accurate cycle length, or quick-enter 1 month.
                      </p>
                    </div>

                    <div className="flex rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setPhaseDataMode('3months')}
                        className={`cursor-pointer rounded-md px-3 py-1 ${
                          phaseDataMode === '3months'
                            ? 'bg-cyan-400/20 text-cyan-100'
                            : 'text-slate-400'
                        }`}
                      >
                        3 Months Data
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhaseDataMode('1month')}
                        className={`cursor-pointer rounded-md px-3 py-1 ${
                          phaseDataMode === '1month'
                            ? 'bg-cyan-400/20 text-cyan-100'
                            : 'text-slate-400'
                        }`}
                      >
                        Only 1 Month
                      </button>
                    </div>
                  </div>

                  {phaseDataMode === '3months' ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Cycle 1 Start Date
                        </label>
                        <input
                          type="date"
                          value={phaseDate1}
                          onChange={(e) => setPhaseDate1(e.target.value)}
                          className="bio-input w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Cycle 2 Start Date
                        </label>
                        <input
                          type="date"
                          value={phaseDate2}
                          onChange={(e) => setPhaseDate2(e.target.value)}
                          className="bio-input w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Most Recent Period Start
                        </label>
                        <input
                          type="date"
                          value={phaseDate3}
                          onChange={(e) => setPhaseDate3(e.target.value)}
                          className="bio-input w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Period Length (days)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={phasePeriodDaysInput}
                          onChange={(e) =>
                            setPhasePeriodDaysInput(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          onBlur={() => setPhasePeriodDaysInput(String(phasePeriodDays))}
                          placeholder="e.g. 5 or 6"
                          className="bio-input font-mono-tabular w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Last Period Start Date
                        </label>
                        <input
                          type="date"
                          value={phaseDate3}
                          onChange={(e) => setPhaseDate3(e.target.value)}
                          className="bio-input w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Typical Cycle Days
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={phaseManualCycleDaysInput}
                          onChange={(e) =>
                            setPhaseManualCycleDaysInput(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          onBlur={() =>
                            setPhaseManualCycleDaysInput(String(phaseManualCycleDays))
                          }
                          placeholder="e.g. 28"
                          className="bio-input font-mono-tabular w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-300">
                          Period Length (days)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={phasePeriodDaysInput}
                          onChange={(e) =>
                            setPhasePeriodDaysInput(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          onBlur={() => setPhasePeriodDaysInput(String(phasePeriodDays))}
                          placeholder="e.g. 5 or 6"
                          className="bio-input font-mono-tabular w-full rounded-lg px-2.5 py-2 text-xs text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-cyan-200/15 bg-slate-950/45 px-3.5 py-2 text-xs text-slate-200">
                    Computed cycle:{' '}
                    <strong className="text-cyan-200">{computedPhasePreview.avgDays} days</strong>
                    {computedPhasePreview.intervals.length > 0 && (
                      <span className="text-slate-400">
                        {' '}
                        (from {computedPhasePreview.intervals.join('d & ')}d cycles)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-300/80">
                Builds{' '}
                <strong className="font-mono-tabular text-cyan-200">
                  {plannedChallengeCount}
                </strong>{' '}
                numbered {creatorCadence === 'week' && weekTrackBy === 'weeks' ? 'weeks' : 'days'}{' '}
                — each bar starts with 1 Priority (with Time/Hours/Salah target) + 3 To-Dos.
              </p>
              <button
                type="submit"
                className="bio-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                Create Challenge
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ====================================================================
       * VIEW C: MULTI-DAY CHALLENGE WORKSPACE (Day X of Y + Bars 1..N)
       * ==================================================================== */}
      {activeGoal && challengeDayInfo && (
        <section className="glass-panel rounded-2xl p-5 sm:p-7">
          {/* Header with Live "Day X of Y" Counter */}
          <div className="flex flex-col gap-4 border-b border-cyan-200/[0.1] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
                  <span className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-0.5 font-mono-tabular font-semibold text-cyan-100">
                    {challengeDayInfo.label}
                  </span>
                  {challengeDayInfo.remainingSteps > 0 && (
                    <span className="font-mono-tabular text-amber-200">
                      {challengeDayInfo.remainingSteps} remaining
                    </span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="capitalize text-cyan-200">{activeGoal.cadence}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {activeGoal.steps.length}{' '}
                    {activeGoal.cadence === 'phase'
                      ? 'cycle days'
                      : activeGoal.unit === 'weeks'
                        ? 'weeks'
                        : 'days total'}
                  </span>
                  {activeGoal.startDate && activeGoal.endDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatShortDate(activeGoal.startDate)} –{' '}
                        {formatShortDate(activeGoal.endDate)}
                      </span>
                    </>
                  )}
                </div>

                <h2 className="font-display mt-1.5 text-xl font-semibold text-slate-100 sm:text-2xl">
                  {activeGoal.title}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSplitter((v) => !v)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-cyan-400/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-100 hover:border-cyan-300/45"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-Divide Helper
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onUpdateGoals((prev) => prev.filter((g) => g.id !== activeGoal.id));
                    setActiveSelection('daily');
                  }}
                  aria-label={`Delete ${activeGoal.title}`}
                  className="cursor-pointer rounded-lg border border-rose-400/20 bg-rose-500/[0.07] p-2 text-rose-200/80 hover:bg-rose-500/20 hover:text-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Today's Cycle Phase Callout (for Phase Goals) */}
            {activeGoal.cadence === 'phase' && challengeDayInfo.phase && (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
                  PHASE_META[challengeDayInfo.phase].chipClass
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HeartPulse className="h-4 w-4 shrink-0" />
                  <span>
                    Today is <strong>Cycle Day {challengeDayInfo.currentStepNumber}</strong> ·{' '}
                    <strong>{PHASE_META[challengeDayInfo.phase].label} Phase</strong> (
                    {PHASE_META[challengeDayInfo.phase].energy})
                  </span>
                </div>
                <span className="opacity-85">
                  {PHASE_META[challengeDayInfo.phase].suggestion}
                </span>
              </div>
            )}

            {/* Week Tabs when Weekly Goal spans multiple weeks */}
            {weekTabsForActiveGoal.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedWeekTab('all')}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    selectedWeekTab === 'all'
                      ? 'bio-glow-chip'
                      : 'border-cyan-200/15 bg-slate-950/40 text-slate-300 hover:text-slate-100'
                  }`}
                >
                  All Weeks ({activeGoal.steps.length}d)
                </button>
                {weekTabsForActiveGoal.map((wk) => (
                  <button
                    key={wk.weekNum}
                    type="button"
                    onClick={() => setSelectedWeekTab(wk.weekNum)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      selectedWeekTab === wk.weekNum
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/15 bg-slate-950/40 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    Week {wk.weekNum} (Days {wk.startStep}–{wk.endStep})
                  </button>
                ))}
              </div>
            )}

            {/* Month Tabs when Goal spans multiple calendar months */}
            {monthTabsForActiveGoal.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedMonthTab('all')}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    selectedMonthTab === 'all'
                      ? 'bio-glow-chip'
                      : 'border-cyan-200/15 bg-slate-950/40 text-slate-300 hover:text-slate-100'
                  }`}
                >
                  All Days ({activeGoal.steps.length})
                </button>
                {monthTabsForActiveGoal.map((m) => (
                  <button
                    key={m.monthKey}
                    type="button"
                    onClick={() => setSelectedMonthTab(m.monthKey)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      selectedMonthTab === m.monthKey
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/15 bg-slate-950/40 text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    {m.label} ({m.count}d)
                  </button>
                ))}
              </div>
            )}

            {/* Phase Filter Tabs + Phase-Only "+1 Extra Day" Controls */}
            {activeGoal.cadence === 'phase' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPhaseFilter('all')}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        phaseFilter === 'all'
                          ? 'bio-glow-chip'
                          : 'border-cyan-200/15 bg-slate-950/40 text-slate-300'
                      }`}
                    >
                      All Phases ({activeGoal.steps.length})
                    </button>
                    {(['menstrual', 'follicular', 'ovulation', 'luteal'] as const).map((ph) => {
                      const meta = PHASE_META[ph];
                      const count = activeGoal.steps.filter((s) => s.phase === ph).length;
                      return (
                        <button
                          key={ph}
                          type="button"
                          onClick={() => setPhaseFilter(ph)}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            phaseFilter === ph
                              ? meta.chipClass
                              : 'border-cyan-200/15 bg-slate-950/40 text-slate-300 hover:text-slate-100'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                          {meta.label} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {phaseFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => handleAddExtraPhaseDay(activeGoal, phaseFilter)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300/45 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/25"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add +1 {PHASE_META[phaseFilter].label} Day
                    </button>
                  )}
                </div>

                {phaseFilter === 'all' && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300/80">
                    <span>Need an extra day in a phase (e.g. longer period or delayed cycle)?</span>
                    {(['menstrual', 'follicular', 'ovulation', 'luteal'] as const).map((ph) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => handleAddExtraPhaseDay(activeGoal, ph)}
                        className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-200/20 bg-slate-950/60 px-2 py-0.5 text-[11px] font-medium text-cyan-100 hover:border-amber-300/45 hover:text-amber-100"
                      >
                        <Plus className="h-3 w-3" />
                        1 {PHASE_META[ph].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Horizon Milestone Progress Track */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300/80">
                  Horizon Progress ({goalStats.done}/{goalStats.planned} saved tasks)
                </span>
                <span className="font-mono-tabular font-semibold text-cyan-200">
                  {goalStats.pct}%
                </span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-950/75">
                <div
                  className="bio-progress h-full rounded-full transition-all duration-300"
                  style={{ width: `${goalStats.pct}%` }}
                />
              </div>
              <div className="flex justify-between font-mono-tabular text-[11px] text-slate-400">
                {[25, 50, 75, 100].map((mark) => (
                  <span
                    key={mark}
                    className={
                      goalStats.pct >= mark ? 'font-semibold text-amber-200' : 'text-slate-500'
                    }
                  >
                    {mark === 100 ? '100% Clear' : `${mark}%`}
                  </span>
                ))}
              </div>
            </div>

            {goalStats.allClear && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/45 bg-gradient-to-r from-cyan-400/15 to-amber-400/15 px-4 py-3">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-amber-100">
                  <Trophy className="h-5 w-5 text-amber-300" />
                  Challenge Conquered! Every saved item in &ldquo;{activeGoal.title}&rdquo; is cleared.
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSelection('creator')}
                  className="bio-btn-primary cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold"
                >
                  Create Another Challenge
                </button>
              </div>
            )}

            {showSplitter && (
              <form
                onSubmit={handleSmartSplit}
                className="flex flex-wrap items-center gap-2.5 rounded-xl border border-cyan-200/15 bg-[#04111b]/75 p-3.5 text-xs"
              >
                <span className="text-slate-300">
                  Auto-fill Priority #1 across bars (you can customize any bar freely):
                </span>
                <input
                  type="number"
                  min={1}
                  value={splitTotalValue}
                  onChange={(e) => setSplitTotalValue(e.target.value)}
                  placeholder="e.g. 200"
                  className="bio-input font-mono-tabular w-24 rounded-lg px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={splitUnitLabel}
                  onChange={(e) => setSplitUnitLabel(e.target.value)}
                  placeholder="pages / mins / verses"
                  className="bio-input w-32 rounded-lg px-2.5 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  className="bio-btn-primary cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  Fill Priority #1
                </button>
              </form>
            )}
          </div>

          {/* Structured Cycle Phase Breakdown & Synced Flow Table (Monthly Phases Only) */}
          {activeGoal.cadence === 'phase' && (() => {
            const periodDays = activeGoal.phaseConfig?.periodLengthDays ?? 6;
            const breakdown = computePhaseDayBreakdown(activeGoal.steps.length, periodDays);
            return (
              <div className="mt-5 rounded-xl border border-rose-300/25 bg-[#04111b]/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-300/35 bg-rose-400/15 text-rose-200">
                      <Table2 className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        Structured Cycle Phase Table &amp; Flow Log
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        First <strong className="text-rose-200">{periodDays} days</strong> are Menstrual, followed by calculated Follicular, Ovulation &amp; Luteal phases — edits sync live with Day Log &amp; Today&apos;s Daily Plan.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartNewCycleToday(activeGoal)}
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-rose-300/40 bg-rose-400/15 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/25"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Period Started Today (New Day 1)
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowCycleTable((v) => !v)}
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/20 bg-slate-950/55 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-300/45"
                    >
                      {showCycleTable ? (
                        <>
                          Hide Table <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Open Table ({activeGoal.steps.length}d){' '}
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Structured 4-Phase Range Cards */}
                <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {(
                    [
                      { key: 'menstrual', range: breakdown.menstrual, tag: 'Confirmed Bleed' },
                      { key: 'follicular', range: breakdown.follicular, tag: 'Rising Focus' },
                      { key: 'ovulation', range: breakdown.ovulation, tag: 'Peak Clarity' },
                      { key: 'luteal', range: breakdown.luteal, tag: 'Calm Review' },
                    ] as const
                  ).map((item) => {
                    const meta = PHASE_META[item.key];
                    return (
                      <div
                        key={item.key}
                        className={`rounded-lg border px-3 py-2 text-xs ${meta.chipClass}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold">{meta.label}</span>
                          <span className="font-mono-tabular font-bold">
                            Days {item.range.start}–{item.range.end}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-85">
                          {item.tag} · {meta.energy}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {showCycleTable && (
                  <div className="mt-3.5 max-h-80 overflow-auto rounded-lg border border-cyan-200/15 bg-slate-950/65 quiet-scroll">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#051624] text-[11px] text-slate-300 shadow-sm">
                        <tr className="border-b border-cyan-200/15">
                          <th className="px-3 py-2 font-semibold">Day #</th>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Phase</th>
                          <th className="px-3 py-2 font-semibold">Flow</th>
                          <th className="px-3 py-2 font-semibold">Synced Note (Daily / Day Log)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-200/[0.08]">
                        {activeGoal.steps.map((step) => {
                          const dateKey = step.dateLabel;
                          const log = dateKey ? cycleLogs[dateKey] : undefined;
                          const isCurrentDay =
                            step.stepNumber === challengeDayInfo.currentStepNumber;
                          const stepPhase = step.phase ?? 'menstrual';

                          return (
                            <tr
                              key={step.stepNumber}
                              className={
                                isCurrentDay
                                  ? 'bg-cyan-400/[0.09]'
                                  : 'hover:bg-slate-900/50'
                              }
                            >
                              <td className="font-mono-tabular whitespace-nowrap px-3 py-1.5 font-semibold text-slate-100">
                                Day {step.stepNumber}
                                {isCurrentDay && (
                                  <span className="ml-1.5 rounded bg-cyan-400/25 px-1.5 py-0.5 text-[10px] text-cyan-100">
                                    Today
                                  </span>
                                )}
                              </td>
                              <td className="font-mono-tabular whitespace-nowrap px-3 py-1.5 text-slate-300">
                                {formatShortDate(dateKey) ?? `Cycle +${step.stepNumber - 1}`}
                              </td>
                              <td className="px-3 py-1.5">
                                <select
                                  aria-label={`Phase for Day ${step.stepNumber}`}
                                  value={stepPhase}
                                  onChange={(e) =>
                                    handleUpdateStepPhase(
                                      activeGoal,
                                      step.stepNumber,
                                      e.target.value as GoalPhaseKind
                                    )
                                  }
                                  className="bio-input rounded px-2 py-1 text-[11px] font-medium text-slate-100"
                                >
                                  <option value="menstrual">Menstrual</option>
                                  <option value="follicular">Follicular</option>
                                  <option value="ovulation">Ovulation</option>
                                  <option value="luteal">Luteal</option>
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                {dateKey ? (
                                  <select
                                    aria-label={`Flow for ${dateKey}`}
                                    value={log?.flow ?? 'none'}
                                    onChange={(e) =>
                                      onUpdateCycleLog(dateKey, (prev) => ({
                                        ...prev,
                                        dateKey,
                                        flow: e.target.value as CycleFlowLevel,
                                        updatedAt: Date.now(),
                                      }))
                                    }
                                    className="bio-input rounded px-2 py-1 text-[11px] text-slate-100"
                                  >
                                    {FLOW_LEVEL_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[11px] text-slate-500">—</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                {dateKey ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={log?.note ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        onUpdateCycleLog(dateKey, (prev) => ({
                                          ...prev,
                                          dateKey,
                                          note: val,
                                          updatedAt: Date.now(),
                                        }));
                                      }}
                                      placeholder="Add note (syncs to Daily & Day Log)..."
                                      className="bio-input w-full min-w-[170px] rounded px-2 py-1 text-[11px] text-slate-100"
                                    />
                                    {log?.symptoms && log.symptoms.length > 0 && (
                                      <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                                        {log.symptoms.join(', ')}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-500">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Scope-Level Master Priorities & To-Do List + Drag into Days */}
          <div className="mt-5 rounded-xl border border-cyan-300/25 bg-[#04111b]/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-400/12 text-cyan-200">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {activeScopeInfo.label} — Master Priorities &amp; To-Do List
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Plan overarching goals for {activeScopeInfo.label.toLowerCase()}, then drag or send any saved item straight onto a numbered day bar below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowScopePlan((v) => !v)}
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/20 bg-slate-950/50 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-300/45"
              >
                {showScopePlan ? (
                  <>
                    Hide <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Open ({activeScopeSavedItems.length}) <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {showScopePlan && (
              <div className="mt-4 space-y-4 border-t border-cyan-200/[0.1] pt-3.5">
                <TaskEntriesEditor
                  scopeKey={`${activeGoal.id}:scope:${activeScopeInfo.scopeKey}`}
                  priorities={activeScopePlan.priorities}
                  todos={activeScopePlan.todos}
                  minPriorities={1}
                  minTodos={3}
                  isToday={false}
                  referenceDateKey={todayIso}
                  nowMs={nowMs}
                  allowTomorrowPush={false}
                  onSaveEntry={(kind, entryId, text, deadline) =>
                    handleScopeSaveEntry(
                      activeGoal,
                      activeScopeInfo.scopeKey,
                      kind,
                      entryId,
                      text,
                      deadline
                    )
                  }
                  onDeleteEntry={(kind, entryId) =>
                    handleScopeDeleteEntry(activeGoal, activeScopeInfo.scopeKey, kind, entryId)
                  }
                  onAddSlot={(kind) =>
                    handleScopeAddSlot(activeGoal, activeScopeInfo.scopeKey, kind)
                  }
                  onTickEntry={(kind, entryId) =>
                    handleScopeTickEntry(activeGoal, activeScopeInfo.scopeKey, kind, entryId)
                  }
                  onMissEntry={(kind, entryId) =>
                    handleScopeMissEntry(activeGoal, activeScopeInfo.scopeKey, kind, entryId)
                  }
                  onRestoreEntry={(kind, entryId) =>
                    handleScopeRestoreEntry(activeGoal, activeScopeInfo.scopeKey, kind, entryId)
                  }
                  onReschedulePriority={(entryId, nextDeadline) =>
                    handleScopeReschedulePriority(
                      activeGoal,
                      activeScopeInfo.scopeKey,
                      entryId,
                      nextDeadline
                    )
                  }
                  missTooltip="Mark as not done"
                />

                {activeScopeSavedItems.length > 0 && displayedSteps.length > 0 && (
                  <div className="rounded-xl border border-cyan-200/15 bg-slate-950/55 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-cyan-200">
                        Drag onto any bar below (or pick a day to place):
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Drops into matching Priorities or To-Do List
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activeScopeSavedItems.map((item) => {
                        const defaultTarget =
                          assignDayTargets[item.id] ?? displayedSteps[0].stepNumber;
                        const safeTarget = displayedSteps.some(
                          (s) => s.stepNumber === defaultTarget
                        )
                          ? defaultTarget
                          : displayedSteps[0].stepNumber;

                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData(
                                'application/focuspair-task',
                                JSON.stringify({
                                  kind: item.kind,
                                  text: item.text,
                                  deadline: item.deadline,
                                })
                              );
                            }}
                            className="flex cursor-grab items-center gap-2 rounded-lg border border-cyan-300/25 bg-[#061826]/90 px-2.5 py-1.5 text-xs active:cursor-grabbing hover:border-cyan-300/55"
                          >
                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-cyan-300/75" />
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                item.kind === 'priority'
                                  ? 'bg-amber-400/20 text-amber-200'
                                  : 'bg-cyan-400/15 text-cyan-200'
                              }`}
                            >
                              {item.kind === 'priority' ? 'Priority' : 'To-Do'}
                            </span>
                            <span className="max-w-[180px] truncate font-medium text-slate-100">
                              {item.text}
                            </span>

                            <div className="ml-1 flex items-center gap-1 border-l border-cyan-200/15 pl-2">
                              <select
                                aria-label={`Target day for ${item.text}`}
                                value={safeTarget}
                                onChange={(e) =>
                                  setAssignDayTargets((prev) => ({
                                    ...prev,
                                    [item.id]: Number.parseInt(e.target.value, 10),
                                  }))
                                }
                                className="bio-input font-mono-tabular h-6 rounded px-1.5 text-[11px] text-slate-100"
                              >
                                {displayedSteps.map((st) => (
                                  <option key={st.stepNumber} value={st.stepNumber}>
                                    #{st.stepNumber}
                                    {st.dateLabel ? ` (${formatShortDate(st.dateLabel)})` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  handlePlaceScopeTaskIntoStep(activeGoal, item, safeTarget)
                                }
                                title={`Add into #${safeTarget}`}
                                className="flex h-6 cursor-pointer items-center gap-1 rounded bg-cyan-400/20 px-2 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/35"
                              >
                                <Send className="h-3 w-3" />
                                Place
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Numbered Day / Step Bars Arena (1, 2, 3...) */}
          <div className="mt-6 space-y-3">
            {displayedSteps.map((step, idx) => {
              const priorities =
                step.priorities && step.priorities.length > 0
                  ? step.priorities
                  : [makeEmptyEntry('priority')];
              const todos =
                step.todos && step.todos.length > 0
                  ? step.todos
                  : [makeEmptyEntry('todo'), makeEmptyEntry('todo'), makeEmptyEntry('todo')];

              const savedItems = [
                ...priorities.filter((p) => p.text.trim()),
                ...todos.filter((t) => t.text.trim()),
              ];
              const doneItems = savedItems.filter((i) => i.status === 'done').length;
              const missedItems = savedItems.filter((i) => i.status === 'missed').length;
              const allStepDone = savedItems.length > 0 && doneItems === savedItems.length;
              const isTodayStep = step.stepNumber === challengeDayInfo.currentStepNumber;
              const stepExpandKey = `${activeGoal.id}:${step.stepNumber}`;
              const isExpanded =
                expandedSteps[stepExpandKey] ?? (isTodayStep || idx === 0);

              const formattedDate = formatShortDate(step.dateLabel);
              const phaseMeta = step.phase ? PHASE_META[step.phase] : null;
              const nextStepNum = activeGoal.steps[step.stepNumber]?.stepNumber;
              const isDropActive = dragOverStep === step.stepNumber;

              return (
                <div
                  key={step.stepNumber}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/focuspair-task')) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      if (dragOverStep !== step.stepNumber) {
                        setDragOverStep(step.stepNumber);
                      }
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setDragOverStep((cur) => (cur === step.stepNumber ? null : cur));
                    }
                  }}
                  onDrop={(e) => {
                    const raw = e.dataTransfer.getData('application/focuspair-task');
                    setDragOverStep(null);
                    if (!raw) return;
                    e.preventDefault();
                    try {
                      const parsed = JSON.parse(raw) as {
                        kind: 'priority' | 'todo';
                        text: string;
                        deadline?: PriorityDeadline;
                      };
                      handlePlaceScopeTaskIntoStep(activeGoal, parsed, step.stepNumber);
                    } catch {
                      // Ignore malformed drag payload
                    }
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-stretch gap-3 sm:gap-4">
                    {/* Number Node ONLY (1, 2, 3...) */}
                    <div
                      className={`font-mono-tabular flex w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-all sm:w-14 sm:text-lg ${
                        isDropActive
                          ? 'goal-number-node-done ring-2 ring-cyan-300 text-cyan-50 scale-105'
                          : allStepDone
                            ? 'goal-number-node-done text-cyan-100'
                            : isTodayStep
                              ? 'goal-number-node ring-2 ring-cyan-300/75 text-cyan-100'
                              : 'goal-number-node text-slate-100'
                      }`}
                    >
                      {step.stepNumber}
                    </div>

                    {/* Rectangular Expandable Container */}
                    <div
                      className={`flex-1 rounded-xl px-4 py-3 transition-all ${
                        isDropActive
                          ? 'goal-rect-bar ring-2 ring-cyan-300 bg-cyan-400/15'
                          : allStepDone
                            ? 'goal-rect-bar-done'
                            : 'goal-rect-bar'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSteps((prev) => ({
                              ...prev,
                              [stepExpandKey]: !isExpanded,
                            }))
                          }
                          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-2 text-left text-xs"
                        >
                          {isDropActive && (
                            <span className="rounded bg-cyan-300/30 px-2 py-0.5 font-semibold text-cyan-50">
                              Drop here to add to #{step.stepNumber}
                            </span>
                          )}
                          {isTodayStep && (
                            <span className="rounded bg-cyan-400/20 px-2 py-0.5 font-semibold text-cyan-100">
                              Today
                            </span>
                          )}
                          {formattedDate && (
                            <span className="font-mono-tabular font-medium text-slate-200">
                              {formattedDate}
                            </span>
                          )}
                          {phaseMeta && (
                            <span className="flex items-center gap-1 text-slate-300">
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${phaseMeta.dotClass}`}
                              />
                              {phaseMeta.label}
                            </span>
                          )}
                          {step.dateLabel &&
                            cycleLogs[step.dateLabel] &&
                            cycleLogs[step.dateLabel].flow !== 'none' && (
                              <span className="rounded border border-rose-300/35 bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100">
                                {FLOW_LEVEL_OPTIONS.find(
                                  (f) => f.value === cycleLogs[step.dateLabel!].flow
                                )?.label ?? cycleLogs[step.dateLabel].flow}
                              </span>
                            )}
                          {step.dateLabel && cycleLogs[step.dateLabel]?.note?.trim() && (
                            <span className="max-w-[190px] truncate rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-amber-200/90">
                              {cycleLogs[step.dateLabel].note.trim()}
                            </span>
                          )}

                          <span className="text-slate-300/80">
                            {savedItems.length === 0
                              ? 'Click to add Priorities & To-Dos'
                              : `${doneItems}/${savedItems.length} cleared${
                                  missedItems > 0 ? ` · ${missedItems} catch-up` : ''
                                }`}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {savedItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleImportStepToDaily(activeGoal, step)}
                              title="Copy this bar's tasks into Today's Daily Plan"
                              className="flex cursor-pointer items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-400/20"
                            >
                              <Download className="h-3 w-3" />
                              To Today&apos;s Daily
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSteps((prev) => ({
                                ...prev,
                                [stepExpandKey]: !isExpanded,
                              }))
                            }
                            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/50 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-300/45"
                          >
                            {isExpanded ? (
                              <>
                                Hide <ChevronUp className="h-3.5 w-3.5" />
                              </>
                            ) : (
                              <>
                                Plan <ChevronDown className="h-3.5 w-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 border-t border-cyan-200/[0.1] pt-3.5">
                          <TaskEntriesEditor
                            scopeKey={stepExpandKey}
                            priorities={priorities}
                            todos={todos}
                            minPriorities={1}
                            minTodos={3}
                            isToday={
                              Boolean(step.dateLabel && step.dateLabel === todayIso) ||
                              isTodayStep
                            }
                            referenceDateKey={step.dateLabel ?? todayIso}
                            nowMs={nowMs}
                            allowTomorrowPush={false}
                            onSaveEntry={(kind, entryId, text, deadline) =>
                              handleStepSaveEntry(
                                activeGoal,
                                step.stepNumber,
                                kind,
                                entryId,
                                text,
                                deadline
                              )
                            }
                            onDeleteEntry={(kind, entryId) =>
                              handleStepDeleteEntry(activeGoal, step.stepNumber, kind, entryId)
                            }
                            onAddSlot={(kind) =>
                              handleStepAddSlot(activeGoal, step.stepNumber, kind)
                            }
                            onTickEntry={(kind, entryId) =>
                              handleStepTickEntry(activeGoal, step.stepNumber, kind, entryId)
                            }
                            onMissEntry={(kind, entryId) =>
                              handleStepMissEntry(activeGoal, step.stepNumber, kind, entryId)
                            }
                            onRestoreEntry={(kind, entryId) =>
                              handleStepRestoreEntry(activeGoal, step.stepNumber, kind, entryId)
                            }
                            onReschedulePriority={(entryId, nextDeadline) =>
                              handleStepReschedulePriority(
                                activeGoal,
                                step.stepNumber,
                                entryId,
                                nextDeadline
                              )
                            }
                            missTooltip={
                              nextStepNum
                                ? `Missed — move below #${nextStepNum}`
                                : 'Missed — move to catch-up below'
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Separate Space BELOW bar i (between bar i and bar i+1): Missed Carryover Tasks */}
                  {step.carryovers.length > 0 && (
                    <div className="ml-15 space-y-2 sm:ml-18">
                      {step.carryovers.map((co) => {
                        const coDone = co.status === 'done';
                        return (
                          <div
                            key={co.id}
                            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 transition-all ${
                              coDone ? 'goal-rect-bar-done opacity-80' : 'goal-carryover-slot'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <CornerDownRight
                                className={`h-4 w-4 shrink-0 ${
                                  coDone ? 'text-cyan-300' : 'text-amber-300'
                                }`}
                              />
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-medium ${
                                    coDone
                                      ? 'text-cyan-100/70 line-through decoration-cyan-300/70'
                                      : 'text-amber-50'
                                  }`}
                                >
                                  {co.text}
                                </p>
                                <p className="text-[11px] text-amber-200/75">
                                  Missed {co.kind === 'todo' ? 'To-Do' : 'Priority'} from #
                                  {co.originStepNumber}
                                  {coDone ? ' · Rescued (+65 XP)' : ' · Catch-up slot'}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleTickCarryover(activeGoal, step.stepNumber, co.id)
                                }
                                title={
                                  coDone
                                    ? 'Rescued! (click to undo)'
                                    : 'Complete Catch-Up (+65 XP)'
                                }
                                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all ${
                                  coDone
                                    ? 'border-cyan-300/65 bg-cyan-400/25 text-cyan-100'
                                    : 'border-cyan-200/25 bg-cyan-400/12 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-400/25'
                                }`}
                              >
                                <Check className="h-4 w-4" />
                              </button>

                              {!coDone && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePushCarryoverForward(activeGoal, step.stepNumber, co)
                                  }
                                  title={
                                    nextStepNum
                                      ? `Still missed — push below #${nextStepNum}`
                                      : 'Push to catch-up after final bar'
                                  }
                                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-amber-300/25 bg-amber-400/[0.08] text-amber-200 hover:border-amber-300/60 hover:bg-amber-400/20"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteCarryover(activeGoal.id, step.stepNumber, co.id)
                                }
                                title="Remove catch-up item"
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {(activeGoal.trailingCarryovers ?? []).length > 0 && (
              <div className="ml-15 space-y-2 pt-1 sm:ml-18">
                {(activeGoal.trailingCarryovers ?? []).map((co) => {
                  const coDone = co.status === 'done';
                  return (
                    <div
                      key={co.id}
                      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 transition-all ${
                        coDone ? 'goal-rect-bar-done opacity-80' : 'goal-carryover-slot'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <CornerDownRight
                          className={`h-4 w-4 shrink-0 ${
                            coDone ? 'text-cyan-300' : 'text-amber-300'
                          }`}
                        />
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              coDone
                                ? 'text-cyan-100/70 line-through decoration-cyan-300/70'
                                : 'text-amber-50'
                            }`}
                          >
                            {co.text}
                          </p>
                          <p className="text-[11px] text-amber-200/75">
                            Missed from #{co.originStepNumber}
                            {coDone ? ' · Rescued (+65 XP)' : ' · Final Catch-Up slot'}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTickCarryover(activeGoal, null, co.id)}
                          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all ${
                            coDone
                              ? 'border-cyan-300/65 bg-cyan-400/25 text-cyan-100'
                              : 'border-cyan-200/25 bg-cyan-400/12 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-400/25'
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCarryover(activeGoal.id, null, co.id)}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {activeGoal.cadence === 'phase' && phaseFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => handleAddExtraPhaseDay(activeGoal, phaseFilter)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-amber-300/45 bg-amber-400/[0.06] px-4 py-2 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/15"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add +1 Extra {PHASE_META[phaseFilter].label} Day
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAppendStep(activeGoal)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-cyan-200/20 px-4 py-2 text-xs font-medium text-cyan-200/80 transition-colors hover:border-cyan-300/45 hover:bg-cyan-400/[0.06] hover:text-cyan-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add #{activeGoal.steps.length + 1}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
