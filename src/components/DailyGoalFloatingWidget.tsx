import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarOff,
  Check,
  ChevronDown,
  Clock,
  Download,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DailyPlanRecord } from '../types';
import { formatPriorityDeadline, isPriorityOverdue } from './PriorityDeadlinePicker';

const DAILY_WIDGET_CUT_DATE_KEY = 'focuspair.dailyWidgetCutDate.v1';

interface DailyGoalFloatingWidgetProps {
  activeDailyPlan: DailyPlanRecord;
  unfinishedImportCount: number;
  onTickEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onMissEntry: (kind: 'priority' | 'todo', entryId: string) => void;
  onOpenGoalsTab: () => void;
}

export function DailyGoalFloatingWidget({
  activeDailyPlan,
  unfinishedImportCount,
  onTickEntry,
  onMissEntry,
  onOpenGoalsTab,
}: DailyGoalFloatingWidgetProps) {
  // Always starts closed as a compact floating circle orb on other tabs
  const [isOpen, setIsOpen] = useState(false);
  const [isCutThisOpening, setIsCutThisOpening] = useState(false);
  const [cutForDate, setCutForDate] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(DAILY_WIDGET_CUT_DATE_KEY);
    } catch {
      return null;
    }
  });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const savedPriorities = activeDailyPlan.priorities.filter((p) => p.text.trim().length > 0);
  const savedTodos = activeDailyPlan.todos.filter((t) => t.text.trim().length > 0);
  const allSaved = [...savedPriorities, ...savedTodos];

  const isCutForToday = cutForDate === activeDailyPlan.dateKey;

  if (
    isCutThisOpening ||
    isCutForToday ||
    (allSaved.length === 0 && unfinishedImportCount === 0)
  ) {
    return null;
  }

  const totalCount = allSaved.length;
  const doneCount = allSaved.filter((item) => item.status === 'done').length;
  const pendingCount = allSaved.filter((item) => item.status === 'pending').length;
  const hasOverdue = savedPriorities.some((entry) => isPriorityOverdue(entry, nowMs, true));

  const handleCutForToday = () => {
    try {
      window.localStorage.setItem(DAILY_WIDGET_CUT_DATE_KEY, activeDailyPlan.dateKey);
    } catch {
      // Ignore storage quota errors
    }
    setCutForDate(activeDailyPlan.dateKey);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-5 sm:right-5">
      <AnimatePresence mode="wait" initial={false}>
        {!isOpen ? (
          <motion.button
            key="daily-orb"
            type="button"
            onClick={() => setIsOpen(true)}
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.72 }}
            whileHover={{ scale: 1.1, y: -3 }}
            whileTap={{ scale: 0.78, y: 2 }}
            transition={{ type: 'spring', stiffness: 520, damping: 16, mass: 0.65 }}
            aria-label={`Open Today's Daily Plan (${doneCount} of ${totalCount} done)`}
            title="Tap to open Today's Daily Plan"
            className={`group relative flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-full border backdrop-blur-xl transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
              hasOverdue || unfinishedImportCount > 0
                ? 'border-amber-300/65 bg-radial from-amber-300/25 via-[#0b1f33]/92 to-[#040c18]/95 shadow-[0_0_24px_rgba(251,191,36,0.34),inset_0_1px_1px_rgba(255,255,255,0.28)]'
                : 'border-cyan-300/60 bg-radial from-cyan-300/25 via-[#082034]/92 to-[#040c18]/95 shadow-[0_0_24px_rgba(56,189,248,0.34),inset_0_1px_1px_rgba(255,255,255,0.28)]'
            }`}
          >
            <Target
              className={`h-5 w-5 transition-transform duration-150 group-hover:scale-110 ${
                hasOverdue ? 'text-amber-200' : 'text-cyan-200'
              }`}
            />
            {totalCount > 0 ? (
              <span className="font-mono-tabular mt-0.5 text-[10px] font-bold leading-none text-amber-200">
                {doneCount}/{totalCount}
              </span>
            ) : (
              <span className="font-mono-tabular mt-0.5 text-[10px] font-bold leading-none text-amber-200">
                +{unfinishedImportCount}
              </span>
            )}
          </motion.button>
        ) : (
          <motion.aside
            key="daily-container"
            aria-label="Today's Daily Goals Quick Check"
            initial={{ opacity: 0, scale: 0.85, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="glass-panel w-[350px] max-w-[calc(100vw-2rem)] origin-bottom-right rounded-2xl p-4 shadow-2xl"
          >
            {/* Header with Quick Open + Minimize + Cut for Opening + Cut for Today */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/[0.12] pb-2.5">
              <button
                type="button"
                onClick={onOpenGoalsTab}
                className="flex cursor-pointer items-center gap-2 text-left text-xs font-semibold text-slate-100 hover:text-cyan-200"
              >
                <Target className="h-4 w-4 shrink-0 text-cyan-300" />
                <span>Today&apos;s Daily Plan</span>
                {totalCount > 0 && (
                  <span className="font-mono-tabular text-amber-200">
                    {doneCount}/{totalCount}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Collapse back into circle"
                  aria-label="Collapse daily goal widget"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCutForToday}
                  title="Cut off for the rest of today"
                  aria-label="Cut off daily goal widget for today"
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-amber-300/25 bg-amber-400/10 px-2 text-[10px] font-semibold text-amber-200 hover:border-amber-300/50 hover:bg-amber-400/20"
                >
                  <CalendarOff className="h-3 w-3" />
                  <span>Cut today</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCutThisOpening(true)}
                  title="Cut off for this opening"
                  aria-label="Cut off daily goal widget for this opening"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-rose-300/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {unfinishedImportCount > 0 && (
              <button
                type="button"
                onClick={onOpenGoalsTab}
                className="mt-2.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-amber-300/35 bg-amber-400/12 px-3 py-2 text-left text-[11px] text-amber-100 transition-colors hover:bg-amber-400/20"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Download className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  {unfinishedImportCount} unfinished from past days
                </span>
                <span className="font-semibold text-amber-200">Import →</span>
              </button>
            )}

            {allSaved.length > 0 && (
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto quiet-scroll">
                {savedPriorities.length > 0 && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/75">
                    Priorities
                  </p>
                )}
                {savedPriorities.map((entry) => {
                  const isDone = entry.status === 'done';
                  const isMissed = entry.status === 'missed';
                  const deadlineLabel = formatPriorityDeadline(entry.deadline);
                  const overdue = isPriorityOverdue(entry, nowMs, true);

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                        isDone
                          ? 'border-cyan-300/30 bg-cyan-400/10'
                          : isMissed
                            ? 'border-amber-300/25 bg-amber-400/[0.06] opacity-70'
                            : overdue
                              ? 'border-amber-300/50 bg-amber-400/12'
                              : 'border-cyan-200/15 bg-[#04111b]/65'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate font-medium ${
                            isDone
                              ? 'text-cyan-100/75 line-through'
                              : isMissed
                                ? 'text-amber-200/75 line-through'
                                : 'text-slate-100'
                          }`}
                        >
                          {entry.text}
                        </p>
                        {(deadlineLabel || overdue) && (
                          <p
                            className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                              overdue ? 'font-semibold text-amber-200' : 'text-cyan-200/75'
                            }`}
                          >
                            {overdue ? (
                              <AlertCircle className="h-3 w-3 shrink-0 text-amber-300" />
                            ) : (
                              <Clock className="h-3 w-3 shrink-0" />
                            )}
                            {overdue
                              ? `Past ${deadlineLabel?.replace(/^By /, '') ?? 'deadline'} — done?`
                              : deadlineLabel}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onTickEntry('priority', entry.id)}
                          aria-label={isDone ? 'Undo priority' : 'Complete priority'}
                          title={isDone ? 'Completed (click to undo)' : 'Complete (+XP)'}
                          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
                            isDone
                              ? 'border-cyan-300/65 bg-cyan-400/25 text-cyan-100'
                              : 'border-cyan-200/20 bg-cyan-400/[0.08] text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>

                        {!isDone && !isMissed && (
                          <button
                            type="button"
                            onClick={() => onMissEntry('priority', entry.id)}
                            aria-label="Cut off priority"
                            title="Cut off & save to history"
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-rose-300/20 bg-rose-500/[0.08] text-rose-200 hover:border-amber-300/50 hover:bg-amber-400/15 hover:text-amber-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {savedTodos.length > 0 && (
                  <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    To-Do List
                  </p>
                )}
                {savedTodos.map((entry) => {
                  const isDone = entry.status === 'done';
                  const isMissed = entry.status === 'missed';
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                        isDone
                          ? 'border-cyan-300/30 bg-cyan-400/10'
                          : isMissed
                            ? 'border-amber-300/25 bg-amber-400/[0.06] opacity-70'
                            : 'border-cyan-200/15 bg-[#04111b]/65'
                      }`}
                    >
                      <p
                        className={`min-w-0 flex-1 truncate font-medium ${
                          isDone
                            ? 'text-cyan-100/75 line-through'
                            : isMissed
                              ? 'text-amber-200/75 line-through'
                              : 'text-slate-100'
                        }`}
                      >
                        {entry.text}
                      </p>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onTickEntry('todo', entry.id)}
                          aria-label={isDone ? 'Undo to-do' : 'Complete to-do'}
                          title={isDone ? 'Completed (click to undo)' : 'Complete (+XP)'}
                          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
                            isDone
                              ? 'border-cyan-300/65 bg-cyan-400/25 text-cyan-100'
                              : 'border-cyan-200/20 bg-cyan-400/[0.08] text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>

                        {!isDone && !isMissed && (
                          <button
                            type="button"
                            onClick={() => onMissEntry('todo', entry.id)}
                            aria-label="Cut off to-do"
                            title="Cut off & save to history"
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-rose-300/20 bg-rose-500/[0.08] text-rose-200 hover:border-amber-300/50 hover:bg-amber-400/15 hover:text-amber-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-cyan-200/[0.1] pt-2.5 text-[11px]">
              <span className="flex items-center gap-1 text-slate-300/80">
                <Sparkles className="h-3 w-3 text-amber-300" />
                {allSaved.length === 0
                  ? 'No tasks added for today yet'
                  : pendingCount === 0
                    ? 'All daily tasks cleared!'
                    : `${pendingCount} left today`}
              </span>
              <button
                type="button"
                onClick={onOpenGoalsTab}
                className="cursor-pointer font-medium text-cyan-200 hover:text-cyan-100"
              >
                Open Daily Plan →
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
