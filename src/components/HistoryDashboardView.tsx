import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Download,
  Flame,
  Grid3X3,
  HeartPulse,
  Sun,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import type {
  ChecklistTableRecord,
  DailyPlanRecord,
  GoalPlan,
  GoalTaskEntry,
  StudySessionCard,
} from '../types';
import { PHASE_META } from '../utils/goalRewards';
import { computeProductivityStats } from '../utils/profileStorage';
import { isCellChecked } from './ChecklistTableSection';

interface HistoryDashboardViewProps {
  profileName: string;
  cards: StudySessionCard[];
  goals: GoalPlan[];
  checklistTables: ChecklistTableRecord[];
  activeDailyPlan: DailyPlanRecord;
  dailyHistory: DailyPlanRecord[];
  hasActiveCard: boolean;
  onDeleteLog: (cardId: string | undefined, logId: string) => void;
  onBackToHub: () => void;
  onBackToWorkspace: () => void;
  onOpenGoalsTab: () => void;
  onOpenChecklistsTab: () => void;
}

type HistorySectionFilter = 'all' | 'sessions' | 'goals' | 'checklists';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function collectSavedEntries(list: GoalTaskEntry[] | undefined): GoalTaskEntry[] {
  return (list ?? []).filter((item) => item.text.trim().length > 0);
}

export function HistoryDashboardView({
  profileName,
  cards,
  goals,
  checklistTables,
  activeDailyPlan,
  dailyHistory,
  hasActiveCard,
  onDeleteLog,
  onBackToHub,
  onBackToWorkspace,
  onOpenGoalsTab,
  onOpenChecklistsTab,
}: HistoryDashboardViewProps) {
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<HistorySectionFilter>('all');

  const { allTasks, allLogs } = useMemo(() => {
    const tasksWithCard = cards.flatMap((c) =>
      c.tasks.map((t) => ({ ...t, cardTitle: c.title }))
    );
    const logsWithCard = cards.flatMap((c) =>
      c.sessionLogs.map((l) => ({
        ...l,
        sessionCardId: l.sessionCardId ?? c.id,
        sessionCardTitle: l.sessionCardTitle ?? c.title,
      }))
    );
    logsWithCard.sort((a, b) => b.endedAt - a.endedAt);
    return { allTasks: tasksWithCard, allLogs: logsWithCard };
  }, [cards]);

  const stats = useMemo(
    () => computeProductivityStats(allTasks, allLogs),
    [allTasks, allLogs]
  );

  const completedStudyTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.completed)
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt)),
    [allTasks]
  );

  // Unified Daily Plans timeline (Today + Archived past dates, excluding completely blank days)
  const allDailyTimeline = useMemo(() => {
    const combined = [activeDailyPlan, ...dailyHistory];
    const seen = new Set<string>();
    const deduped: DailyPlanRecord[] = [];
    for (const day of combined) {
      if (seen.has(day.dateKey)) continue;
      seen.add(day.dateKey);
      const savedPriorities = collectSavedEntries(day.priorities);
      const savedTodos = collectSavedEntries(day.todos);
      if (day.dateKey === activeDailyPlan.dateKey || savedPriorities.length + savedTodos.length > 0) {
        deduped.push(day);
      }
    }
    return deduped;
  }, [activeDailyPlan, dailyHistory]);

  // Goals & Daily completion totals for KPI summary
  const goalsAndDailySummary = useMemo(() => {
    let goalDone = 0;
    let goalMissed = 0;
    let goalTotal = 0;

    for (const g of goals) {
      for (const s of g.steps) {
        const saved = [
          ...collectSavedEntries(s.priorities),
          ...collectSavedEntries(s.todos),
        ];
        goalTotal += saved.length;
        goalDone += saved.filter((e) => e.status === 'done').length;
        goalMissed += saved.filter((e) => e.status === 'missed').length;

        for (const co of s.carryovers) {
          goalTotal += 1;
          if (co.status === 'done') goalDone += 1;
        }
      }
      for (const co of g.trailingCarryovers ?? []) {
        goalTotal += 1;
        if (co.status === 'done') goalDone += 1;
      }
      for (const sp of Object.values(g.scopePlans ?? {})) {
        const scopeSaved = [
          ...collectSavedEntries(sp.priorities),
          ...collectSavedEntries(sp.todos),
        ];
        goalTotal += scopeSaved.length;
        goalDone += scopeSaved.filter((e) => e.status === 'done').length;
        goalMissed += scopeSaved.filter((e) => e.status === 'missed').length;
      }
    }

    let dailyDone = 0;
    let dailyMissed = 0;
    for (const day of allDailyTimeline) {
      const items = [
        ...collectSavedEntries(day.priorities),
        ...collectSavedEntries(day.todos),
      ];
      dailyDone += items.filter((e) => e.status === 'done').length;
      dailyMissed += items.filter((e) => e.status === 'missed').length;
    }

    return {
      goalDone,
      goalMissed,
      goalTotal,
      dailyDone,
      dailyMissed,
    };
  }, [allDailyTimeline, goals]);

  // Checklist Tables summary
  const checklistSummary = useMemo(() => {
    let checked = 0;
    let total = 0;
    for (const tbl of checklistTables) {
      const tableCells = tbl.rows.length * tbl.columns.length;
      total += tableCells;
      for (const r of tbl.rows) {
        for (const c of tbl.columns) {
          if (isCellChecked(tbl.checks, r.id, c.id)) checked += 1;
        }
      }
    }
    return {
      tableCount: checklistTables.length,
      checked,
      total,
      pct: total > 0 ? Math.round((checked / total) * 100) : 0,
    };
  }, [checklistTables]);

  const maxMinutes = Math.max(
    30,
    ...stats.dailySeries.map((d) => d.focusMinutes)
  );
  const hoveredDay = stats.dailySeries.find((d) => d.dateKey === hoveredDayKey);

  const showSessions = sectionFilter === 'all' || sectionFilter === 'sessions';
  const showGoals = sectionFilter === 'all' || sectionFilter === 'goals';
  const showChecklists = sectionFilter === 'all' || sectionFilter === 'checklists';

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1320px] flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 quiet-scroll">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-200/[0.09] pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            {profileName}&apos;s Complete History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Everything in one place — study sessions, daily plans, multi-day goals, monthly phases, and checklist tables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenGoalsTab}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-cyan-400/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-300/45"
          >
            <Target className="h-3.5 w-3.5 text-amber-300" />
            Goals
          </button>
          <button
            type="button"
            onClick={onOpenChecklistsTab}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-cyan-400/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-300/45"
          >
            <Grid3X3 className="h-3.5 w-3.5 text-cyan-300" />
            Checklists
          </button>
          <button
            type="button"
            onClick={hasActiveCard ? onBackToWorkspace : onBackToHub}
            className="bio-btn-primary cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap"
          >
            {hasActiveCard ? 'Back to Session' : 'Study Sessions'}
          </button>
        </div>
      </div>

      {/* Unified View Filter Bar (Everything shown by default) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: 'Everything' },
            { id: 'sessions', label: `Study Sessions (${allLogs.length})` },
            {
              id: 'goals',
              label: `Goals & Daily (${goals.length + allDailyTimeline.length})`,
            },
            {
              id: 'checklists',
              label: `Checklist Tables (${checklistTables.length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSectionFilter(tab.id)}
            className={`cursor-pointer rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all ${
              sectionFilter === tab.id
                ? 'bio-glow-chip'
                : 'border-cyan-200/15 bg-slate-950/45 text-slate-300 hover:border-cyan-300/35 hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI Strip */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass-panel rounded-xl px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Focus Streak</span>
            <Flame className="h-4 w-4 text-amber-300" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-100">
            {stats.currentStreakDays}{' '}
            <span className="text-sm font-normal text-slate-400">
              {stats.currentStreakDays === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="font-mono-tabular mt-0.5 text-[11px] text-slate-500">
            Best {stats.longestStreakDays}d · {allLogs.length} logged sessions
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Focus Time</span>
            <Trophy className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="font-mono-tabular mt-2 bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-2xl font-semibold text-transparent">
            {stats.totalFocusMinutes >= 60
              ? `${(stats.totalFocusMinutes / 60).toFixed(1)} hrs`
              : `${stats.totalFocusMinutes} min`}
          </p>
          <p className="font-mono-tabular mt-0.5 text-[11px] text-slate-500">
            Across {cards.length} study {cards.length === 1 ? 'card' : 'cards'}
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <p className="text-xs text-slate-400">Tasks Cleared</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-cyan-300">
            {stats.totalCompletedTasks +
              goalsAndDailySummary.dailyDone +
              goalsAndDailySummary.goalDone}
          </p>
          <p className="font-mono-tabular mt-0.5 text-[11px] text-slate-500">
            {stats.totalCompletedTasks} study · {goalsAndDailySummary.dailyDone} daily ·{' '}
            {goalsAndDailySummary.goalDone} goals
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Checklist Matrices</span>
            <Grid3X3 className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-amber-200">
            {checklistSummary.checked}
            <span className="text-sm font-normal text-slate-400">
              /{checklistSummary.total}
            </span>
          </p>
          <p className="font-mono-tabular mt-0.5 text-[11px] text-slate-500">
            {checklistSummary.tableCount}{' '}
            {checklistSummary.tableCount === 1 ? 'table' : 'tables'} · {checklistSummary.pct}% ticked
          </p>
        </div>
      </div>

      {/* SECTION 1: STUDY SESSIONS & ACTIVITY */}
      {showSessions && (
        <>
          <section
            aria-label="14-day focus and task activity"
            className="glass-panel mt-5 rounded-xl p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  14-Day Focus Activity
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {hoveredDay
                    ? `${hoveredDay.label} · ${hoveredDay.focusMinutes} min focused · ${hoveredDay.completedTasks} study tasks done`
                    : 'Hover any day to inspect focus minutes and completed study tasks'}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-tr from-cyan-400 to-amber-300" />
                  Focus minutes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                  Tasks completed
                </span>
              </div>
            </div>

            <div className="mt-5 grid h-44 grid-cols-14 items-end gap-2 border-b border-cyan-200/[0.09] pb-2">
              {stats.dailySeries.map((day) => {
                const barPct = Math.round((day.focusMinutes / maxMinutes) * 100);
                const hasActivity = day.focusMinutes > 0 || day.completedTasks > 0;
                return (
                  <div
                    key={day.dateKey}
                    onMouseEnter={() => setHoveredDayKey(day.dateKey)}
                    onMouseLeave={() => setHoveredDayKey(null)}
                    className="group flex h-full flex-col items-center justify-end gap-1.5"
                  >
                    {day.completedTasks > 0 && (
                      <span className="font-mono-tabular text-[10px] font-medium text-cyan-200">
                        +{day.completedTasks}
                      </span>
                    )}
                    <div className="relative flex w-full flex-1 items-end justify-center">
                      <div
                        style={{ height: `${Math.max(hasActivity ? 8 : 3, barPct)}%` }}
                        className={`w-full max-w-[26px] rounded-t-md transition-all duration-200 ${
                          day.focusMinutes > 0
                            ? 'bg-gradient-to-t from-cyan-400/80 via-cyan-300/85 to-amber-300 group-hover:brightness-110'
                            : day.completedTasks > 0
                              ? 'bg-cyan-400/50'
                              : 'bg-cyan-200/[0.07]'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 grid grid-cols-14 gap-2 text-center">
              {stats.dailySeries.map((day) => (
                <span
                  key={day.dateKey}
                  className="font-mono-tabular truncate text-[10px] text-slate-500"
                >
                  {day.shortLabel}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="glass-panel rounded-xl p-5 lg:col-span-5">
              <h2 className="font-display text-base font-semibold text-slate-100">
                Completed Study Tasks
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Tasks checked off inside your study session cards
              </p>

              {completedStudyTasks.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No completed study card tasks yet.
                </p>
              ) : (
                <ul className="quiet-scroll mt-4 max-h-[340px] divide-y divide-cyan-200/[0.07] overflow-y-auto">
                  {completedStudyTasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2.5 py-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-cyan-300 to-amber-300 text-slate-950">
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{t.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          <span className="text-cyan-200/85">{t.cardTitle}</span>
                          {' · '}
                          {new Date(t.completedAt ?? t.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {t.subtasks.length > 0 ? ` · ${t.subtasks.length} micro-steps` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="glass-panel rounded-xl p-5 lg:col-span-7">
              <h2 className="font-display text-base font-semibold text-slate-100">
                Focus Sessions &amp; Video Logs
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Completed sprints and self-view accountability clips
              </p>

              {allLogs.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  Complete a sprint or record an accountability clip to log your first session.
                </p>
              ) : (
                <div className="quiet-scroll mt-4 max-h-[380px] space-y-3 overflow-y-auto">
                  {allLogs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded-lg border border-cyan-200/[0.1] bg-[#040814]/55 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            {log.sessionCardTitle && (
                              <>
                                <span className="font-medium text-cyan-200">
                                  {log.sessionCardTitle}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span>
                              {new Date(log.endedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-amber-200">
                              {formatDuration(log.durationSeconds)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{log.phase === 'break' ? 'Break' : 'Work Sprint'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">
                              {log.completedTasksCount} tasks done
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-sm font-medium text-slate-100">
                            {log.note}
                          </h3>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {log.videoUrl && (
                            <a
                              href={log.videoUrl}
                              download={`focuspair-session-${log.id}.webm`}
                              className="flex h-8 items-center gap-1.5 rounded-md border border-cyan-200/15 bg-cyan-400/[0.06] px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/15"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Clip
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteLog(log.sessionCardId, log.id)}
                            aria-label="Delete session log"
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {log.videoUrl && (
                        <div className="mt-3 overflow-hidden rounded-md border border-cyan-200/15 bg-black">
                          <video
                            src={log.videoUrl}
                            controls
                            className="max-h-[180px] w-full object-contain"
                          />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* SECTION 2: DAILY PLANS + GOALS & MONTHLY PHASES HISTORY */}
      {showGoals && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Daily Plans History (Today + Archived Past Days) */}
          <section className="glass-panel rounded-xl p-5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-300" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Daily Plans Archive
                </h2>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                {allDailyTimeline.length} {allDailyTimeline.length === 1 ? 'day' : 'days'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Completed and missed Priorities &amp; To-Dos by date
            </p>

            {allDailyTimeline.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                No daily plan entries recorded yet.
              </p>
            ) : (
              <div className="quiet-scroll mt-4 max-h-[460px] space-y-3 overflow-y-auto">
                {allDailyTimeline.map((day, idx) => {
                  const savedP = collectSavedEntries(day.priorities);
                  const savedT = collectSavedEntries(day.todos);
                  const allItems = [...savedP, ...savedT];
                  const doneCount = allItems.filter((i) => i.status === 'done').length;
                  const missedCount = allItems.filter((i) => i.status === 'missed').length;
                  const isCurrentDay = idx === 0 && day.dateKey === activeDailyPlan.dateKey;

                  return (
                    <article
                      key={day.dateKey}
                      className="rounded-xl border border-cyan-200/14 bg-[#04111b]/70 p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {formatDateKeyLabel(day.dateKey)}
                          </span>
                          {isCurrentDay && (
                            <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="font-mono-tabular flex items-center gap-2 text-[11px]">
                          <span className="text-cyan-200">{doneCount} done</span>
                          {missedCount > 0 && (
                            <span className="text-amber-300">{missedCount} failed</span>
                          )}
                          <span className="text-slate-400">{allItems.length} total</span>
                        </div>
                      </div>

                      {allItems.length === 0 ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          No saved tasks yet for today.
                        </p>
                      ) : (
                        <ul className="mt-2.5 space-y-1.5">
                          {allItems.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-cyan-200/[0.08] bg-slate-950/45 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {item.status === 'done' ? (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                ) : item.status === 'missed' ? (
                                  <X className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                )}
                                <span
                                  className={`truncate ${
                                    item.status === 'done'
                                      ? 'text-cyan-100/80 line-through'
                                      : item.status === 'missed'
                                        ? 'text-amber-200/85'
                                        : 'text-slate-200'
                                  }`}
                                >
                                  {item.text}
                                </span>
                              </div>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  item.kind === 'priority'
                                    ? 'bg-amber-400/15 text-amber-200'
                                    : 'bg-cyan-400/12 text-cyan-200'
                                }`}
                              >
                                {item.status === 'missed'
                                  ? 'Failed'
                                  : item.kind === 'priority'
                                    ? 'Priority'
                                    : 'To-Do'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Multi-Day Goals & Monthly Phases Progress */}
          <section className="glass-panel rounded-xl p-5 lg:col-span-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-cyan-300" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Goals, Challenges &amp; Monthly Phases
                </h2>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Full progress across custom calendars, weeks, months, scope plans, and cycle phases
            </p>

            {goals.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                No multi-day challenges or cycle plans created yet.
              </p>
            ) : (
              <div className="quiet-scroll mt-4 max-h-[460px] space-y-3 overflow-y-auto">
                {goals.map((g) => {
                  const stepEntries = g.steps.flatMap((s) => [
                    ...collectSavedEntries(s.priorities),
                    ...collectSavedEntries(s.todos),
                  ]);
                  const scopeEntries = Object.values(g.scopePlans ?? {}).flatMap((sp) => [
                    ...collectSavedEntries(sp.priorities),
                    ...collectSavedEntries(sp.todos),
                  ]);
                  const carryovers = [
                    ...g.steps.flatMap((s) => s.carryovers),
                    ...(g.trailingCarryovers ?? []),
                  ];
                  const totalSaved = stepEntries.length + carryovers.length;
                  const doneCount =
                    stepEntries.filter((e) => e.status === 'done').length +
                    carryovers.filter((c) => c.status === 'done').length;
                  const missedCount = stepEntries.filter((e) => e.status === 'missed').length;
                  const pct = totalSaved > 0 ? Math.round((doneCount / totalSaved) * 100) : 0;

                  const notableItems = [
                    ...stepEntries
                      .filter((e) => e.status === 'done' || e.status === 'missed')
                      .slice(0, 8),
                    ...scopeEntries.slice(0, 4),
                  ];

                  return (
                    <article
                      key={g.id}
                      className="rounded-xl border border-cyan-200/14 bg-[#04111b]/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 rounded bg-cyan-400/15 px-1.5 py-0.5 font-semibold capitalize text-cyan-100">
                              {g.cadence === 'phase' && (
                                <HeartPulse className="h-3 w-3 text-rose-300" />
                              )}
                              {g.cadence === 'phase' ? 'Monthly Phases' : g.cadence}
                            </span>
                            <span className="font-mono-tabular">
                              {g.steps.length} {g.unit === 'weeks' ? 'weeks' : 'days'}
                            </span>
                            {g.startDate && g.endDate && (
                              <span>
                                {formatDateKeyLabel(g.startDate)} → {formatDateKeyLabel(g.endDate)}
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1.5 text-sm font-semibold text-slate-100">
                            {g.title}
                          </h3>
                        </div>

                        <div className="text-right font-mono-tabular">
                          <span className="text-sm font-bold text-cyan-200">{pct}%</span>
                          <p className="text-[11px] text-slate-400">
                            {doneCount}/{totalSaved} cleared
                            {missedCount > 0 ? ` · ${missedCount} missed` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-950/80">
                        <div
                          className="bio-progress h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {g.cadence === 'phase' && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {(['menstrual', 'follicular', 'ovulation', 'luteal'] as const).map(
                            (ph) => {
                              const phSteps = g.steps.filter((s) => s.phase === ph);
                              return (
                                <span
                                  key={ph}
                                  className="font-mono-tabular flex items-center gap-1 rounded-md border border-cyan-200/12 bg-slate-950/50 px-2 py-0.5 text-[10px] text-slate-300"
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${PHASE_META[ph].dotClass}`}
                                  />
                                  {PHASE_META[ph].label}: {phSteps.length}d
                                </span>
                              );
                            }
                          )}
                        </div>
                      )}

                      {notableItems.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {notableItems.map((item) => (
                            <span
                              key={item.id}
                              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
                                item.status === 'done'
                                  ? 'border-cyan-300/30 bg-cyan-400/12 text-cyan-100'
                                  : item.status === 'missed'
                                    ? 'border-amber-300/30 bg-amber-400/12 text-amber-200'
                                    : 'border-cyan-200/15 bg-slate-950/50 text-slate-300'
                              }`}
                            >
                              {item.status === 'done' ? (
                                <Check className="h-3 w-3" />
                              ) : item.status === 'missed' ? (
                                <X className="h-3 w-3" />
                              ) : null}
                              <span className="max-w-[170px] truncate">{item.text}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 3: CHECKLIST TABLES HISTORY */}
      {showChecklists && (
        <section className="glass-panel mt-5 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-cyan-300" />
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Checklist Tables History
                </h2>
                <p className="text-xs text-slate-400">
                  Row-by-row completion matrices across your custom tables
                </p>
              </div>
            </div>
            <span className="font-mono-tabular text-xs text-cyan-200">
              {checklistSummary.checked}/{checklistSummary.total} total cells ticked ({checklistSummary.pct}%)
            </span>
          </div>

          {checklistTables.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No checklists created yet. Open the Checklists tab to create one!
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {checklistTables.map((tbl) => {
                const totalCells = tbl.rows.length * tbl.columns.length;
                let checkedCells = 0;
                let latestTickAt = 0;
                for (const r of tbl.rows) {
                  for (const c of tbl.columns) {
                    if (isCellChecked(tbl.checks, r.id, c.id)) {
                      checkedCells += 1;
                      const ts =
                        tbl.checkTimestamps?.[`${r.id}::${c.id}`] ??
                        tbl.checkTimestamps?.[`${r.id}:${c.id}`] ??
                        0;
                      if (ts > latestTickAt) latestTickAt = ts;
                    }
                  }
                }
                const pct =
                  totalCells > 0 ? Math.round((checkedCells / totalCells) * 100) : 0;

                return (
                  <article
                    key={tbl.id}
                    className="rounded-xl border border-cyan-200/14 bg-[#04111b]/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{tbl.title}</h3>
                        <p className="font-mono-tabular mt-0.5 text-[11px] text-slate-400">
                          {tbl.rows.length} rows × {tbl.columns.length} columns
                          {latestTickAt > 0
                            ? ` · Last ticked ${new Date(latestTickAt).toLocaleDateString(
                                undefined,
                                { month: 'short', day: 'numeric' }
                              )}`
                            : ''}
                        </p>
                      </div>
                      <span className="font-mono-tabular rounded-md border border-cyan-300/35 bg-cyan-400/15 px-2 py-0.5 text-xs font-semibold text-cyan-100">
                        {checkedCells}/{totalCells} ({pct}%)
                      </span>
                    </div>

                    <div className="mt-3 overflow-x-auto quiet-scroll">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-cyan-200/10 text-[11px] text-slate-400">
                            <th className="py-1.5 pr-3 font-medium">Item</th>
                            {tbl.columns.map((col) => (
                              <th
                                key={col.id}
                                className="font-mono-tabular px-1.5 py-1.5 text-center font-medium"
                              >
                                {col.label}
                              </th>
                            ))}
                            <th className="font-mono-tabular py-1.5 pl-2 text-right font-medium">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cyan-200/[0.06]">
                          {tbl.rows.map((row) => {
                            const rowChecked = tbl.columns.filter((col) =>
                              isCellChecked(tbl.checks, row.id, col.id)
                            ).length;
                            return (
                              <tr key={row.id}>
                                <td className="max-w-[140px] truncate py-1.5 pr-3 font-medium text-slate-200">
                                  {row.label}
                                </td>
                                {tbl.columns.map((col) => {
                                  const isChecked = isCellChecked(tbl.checks, row.id, col.id);
                                  return (
                                    <td key={col.id} className="px-1.5 py-1.5 text-center">
                                      <span
                                        className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                                          isChecked
                                            ? 'border-cyan-300/65 bg-cyan-400/25 text-cyan-100'
                                            : 'border-cyan-200/15 bg-slate-950/50 text-slate-600'
                                        }`}
                                      >
                                        {isChecked ? <Check className="h-3 w-3" /> : '·'}
                                      </span>
                                    </td>
                                  );
                                })}
                                <td className="font-mono-tabular py-1.5 pl-2 text-right text-[11px] text-amber-200">
                                  {rowChecked}/{tbl.columns.length}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
