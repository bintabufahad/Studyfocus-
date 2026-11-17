import { useMemo, useState } from 'react';
import { Check, Download, Flame, Trash2, Trophy } from 'lucide-react';
import type { StudySessionCard } from '../types';
import { computeProductivityStats } from '../utils/profileStorage';

interface HistoryDashboardViewProps {
  profileName: string;
  cards: StudySessionCard[];
  hasActiveCard: boolean;
  onDeleteLog: (cardId: string | undefined, logId: string) => void;
  onBackToHub: () => void;
  onBackToWorkspace: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function HistoryDashboardView({
  profileName,
  cards,
  hasActiveCard,
  onDeleteLog,
  onBackToHub,
  onBackToWorkspace,
}: HistoryDashboardViewProps) {
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);

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

  const completedTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.completed)
        .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt)),
    [allTasks]
  );

  const maxMinutes = Math.max(
    30,
    ...stats.dailySeries.map((d) => d.focusMinutes)
  );
  const hoveredDay = stats.dailySeries.find((d) => d.dateKey === hoveredDayKey);

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1320px] flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-200/[0.09] pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            {profileName}&apos;s History &amp; Streaks
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Progress across all {cards.length} study {cards.length === 1 ? 'card' : 'cards'}, completed tasks, and accountability clips.
          </p>
        </div>

        <button
          type="button"
          onClick={hasActiveCard ? onBackToWorkspace : onBackToHub}
          className="bio-btn-primary cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap"
        >
          {hasActiveCard ? 'Back to Session' : 'Study Sessions'}
        </button>
      </div>

      {/* KPI Strip */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass-panel rounded-xl px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Current Streak</span>
            <Flame className="h-4 w-4 text-amber-300" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-100">
            {stats.currentStreakDays}{' '}
            <span className="text-sm font-normal text-slate-400">
              {stats.currentStreakDays === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Longest Streak</span>
            <Trophy className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-100">
            {stats.longestStreakDays}{' '}
            <span className="text-sm font-normal text-slate-400">
              {stats.longestStreakDays === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <p className="text-xs text-slate-400">Total Focus Time</p>
          <p className="font-mono-tabular mt-2 bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-2xl font-semibold text-transparent">
            {stats.totalFocusMinutes >= 60
              ? `${(stats.totalFocusMinutes / 60).toFixed(1)} hrs`
              : `${stats.totalFocusMinutes} min`}
          </p>
        </div>

        <div className="glass-panel rounded-xl px-5 py-4">
          <p className="text-xs text-slate-400">Completed Tasks</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-cyan-300">
            {stats.totalCompletedTasks}
          </p>
        </div>
      </div>

      {/* 14-Day Activity Chart */}
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
                ? `${hoveredDay.label} · ${hoveredDay.focusMinutes} min focused · ${hoveredDay.completedTasks} tasks done`
                : 'Hover any day to inspect focus minutes and completed tasks'}
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

      {/* Two-Column Breakdown: Completed Tasks & Session Logs */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Completed Tasks History */}
        <section className="glass-panel rounded-xl p-5 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Completed Task History
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Tasks checked off across your study cards
          </p>

          {completedTasks.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">
              No completed tasks yet. Check off your first task inside a study card!
            </p>
          ) : (
            <ul className="quiet-scroll mt-4 max-h-[340px] divide-y divide-cyan-200/[0.07] overflow-y-auto">
              {completedTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 py-2.5">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-cyan-300 to-amber-300 text-slate-950 shrink-0">
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

        {/* Session Logs & Video Recordings */}
        <section className="glass-panel rounded-xl p-5 lg:col-span-7">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Focus Sessions &amp; Video Logs
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Completed sprints and self-view recordings
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

                    <div className="flex items-center gap-2 shrink-0">
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
    </main>
  );
}
