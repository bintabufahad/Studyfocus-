import { useState } from 'react';
import {
  Bell,
  BellOff,
  BookmarkCheck,
  Coffee,
  Film,
  Flame,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { TimerSettings, WorkspacePanelMode } from '../types';

interface SessionTimerBarProps {
  panelMode: WorkspacePanelMode;
  onChangePanelMode: (mode: WorkspacePanelMode) => void;
  focusRemainingSeconds: number;
  focusTotalSeconds: number;
  isFocusRunning: boolean;
  breakRemainingSeconds: number;
  breakTotalSeconds: number;
  isBreakRunning: boolean;
  elapsedSessionSeconds: number;
  timerSettings: TimerSettings;
  isCheckInRunning: boolean;
  isCheckInStaged: boolean;
  secondsUntilAlert: number;
  activeAlertBanner: {
    kind: 'sprint_end' | 'break_end' | 'reminder' | 'checkin';
    title: string;
    message: string;
  } | null;
  isLoadingCheckIn: boolean;
  onToggleFocus: () => void;
  onResetFocus: () => void;
  onToggleBreak: () => void;
  onResetBreak: () => void;
  onUpdateTimerSettings: (next: TimerSettings) => void;
  onToggleCheckIn: () => void;
  onTriggerAlertNow: () => void;
  onAlertReply: (replyText: string) => void;
  onDismissAlert: () => void;
  onSaveSessionLog: () => void;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function SessionTimerBar({
  panelMode,
  onChangePanelMode,
  focusRemainingSeconds,
  focusTotalSeconds,
  isFocusRunning,
  breakRemainingSeconds,
  breakTotalSeconds,
  isBreakRunning,
  elapsedSessionSeconds,
  timerSettings,
  isCheckInRunning,
  isCheckInStaged,
  secondsUntilAlert,
  activeAlertBanner,
  isLoadingCheckIn,
  onToggleFocus,
  onResetFocus,
  onToggleBreak,
  onResetBreak,
  onUpdateTimerSettings,
  onToggleCheckIn,
  onTriggerAlertNow,
  onAlertReply,
  onDismissAlert,
  onSaveSessionLog,
}: SessionTimerBarProps) {
  const [showCustomize, setShowCustomize] = useState(false);

  const activePct = isBreakRunning
    ? breakTotalSeconds > 0
      ? Math.min(
          100,
          Math.round(((breakTotalSeconds - breakRemainingSeconds) / breakTotalSeconds) * 100)
        )
      : 0
    : focusTotalSeconds > 0
      ? Math.min(
          100,
          Math.round(((focusTotalSeconds - focusRemainingSeconds) / focusTotalSeconds) * 100)
        )
      : 0;

  const isVisualFlashing = timerSettings.visualCuesEnabled && activeAlertBanner !== null;

  return (
    <section
      aria-label="Workspace Mode and Three Timers"
      className={`glass-panel shrink-0 overflow-hidden rounded-xl transition-all duration-300 ${
        isVisualFlashing
          ? 'ring-2 ring-cyan-300/75 shadow-[0_0_28px_rgba(56,189,248,0.28),0_0_18px_rgba(251,191,36,0.2)]'
          : ''
      }`}
    >
      {/* Row 1: Mode Switch + Customize + Save Log */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/[0.08] px-3 py-1.5">
        <div
          role="tablist"
          aria-label="Study Area Mode"
          className="flex items-center rounded-lg border border-cyan-200/15 bg-[#040814]/85 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === 'focus'}
            onClick={() => onChangePanelMode('focus')}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              panelMode === 'focus'
                ? 'bio-btn-primary font-semibold'
                : 'text-slate-400 hover:text-cyan-100'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Focus Plan
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={panelMode === 'video'}
            onClick={() => onChangePanelMode('video')}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              panelMode === 'video'
                ? 'bio-btn-primary font-semibold'
                : 'text-slate-400 hover:text-cyan-100'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Video &amp; Playlist
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {elapsedSessionSeconds >= 10 && (
            <button
              type="button"
              onClick={onSaveSessionLog}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-cyan-200/15 bg-cyan-400/[0.07] px-2 text-[11px] font-medium text-amber-200 hover:border-amber-300/40 hover:bg-cyan-400/15 whitespace-nowrap"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Save Log
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCustomize((v) => !v)}
            title="Customize focus, break, and reminder durations"
            aria-label="Customize timers"
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
              showCustomize
                ? 'bio-glow-chip'
                : 'border-cyan-200/12 bg-cyan-400/[0.04] text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Durations</span>
          </button>
        </div>
      </div>

      {/* Row 2: Three Separate Timers (Focus | Break | Check-in) */}
      <div className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3">
        {/* 1. Focus Timer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
            isFocusRunning
              ? 'border-amber-300/45 bg-gradient-to-r from-amber-400/[0.12] to-cyan-400/[0.05] shadow-[0_0_16px_rgba(251,191,36,0.12)]'
              : 'border-cyan-200/[0.1] bg-[#040814]/70'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Flame
              className={`h-3.5 w-3.5 shrink-0 ${
                isFocusRunning ? 'text-amber-300' : 'text-slate-400'
              }`}
            />
            <span className="text-[11px] font-medium text-slate-300 shrink-0">Focus</span>
            <span className="font-mono-tabular text-sm font-semibold text-slate-100 whitespace-nowrap">
              {formatClock(focusRemainingSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleFocus}
              aria-label={isFocusRunning ? 'Pause focus timer' : 'Start focus timer'}
              className={`flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[11px] font-semibold transition-all whitespace-nowrap ${
                isFocusRunning
                  ? 'border border-amber-300/45 bg-amber-400/20 text-amber-100'
                  : 'bio-btn-primary'
              }`}
            >
              {isFocusRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isFocusRunning ? 'Pause' : 'Start'}
            </button>
            <button
              type="button"
              onClick={onResetFocus}
              title="Reset focus timer"
              aria-label="Reset focus timer"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-cyan-200/12 bg-cyan-400/[0.04] text-slate-400 hover:border-cyan-300/35 hover:text-cyan-100"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 2. Break Timer (Starting Break auto-stops Focus & Check-in) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
            isBreakRunning
              ? 'border-cyan-300/45 bg-cyan-400/[0.12] shadow-[0_0_16px_rgba(34,211,238,0.14)]'
              : 'border-cyan-200/[0.1] bg-[#040814]/70'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Coffee
              className={`h-3.5 w-3.5 shrink-0 ${
                isBreakRunning ? 'text-cyan-300' : 'text-slate-400'
              }`}
            />
            <span className="text-[11px] font-medium text-slate-300 shrink-0">Break</span>
            <span className="font-mono-tabular text-sm font-semibold text-slate-100 whitespace-nowrap">
              {formatClock(breakRemainingSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleBreak}
              aria-label={isBreakRunning ? 'Pause break timer' : 'Start break timer'}
              className={`flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                isBreakRunning
                  ? 'border border-cyan-300/45 bg-cyan-400/20 text-cyan-100'
                  : 'border border-cyan-200/15 bg-cyan-400/[0.07] text-slate-200 hover:border-cyan-300/45 hover:text-cyan-200'
              }`}
            >
              {isBreakRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isBreakRunning ? 'Pause' : 'Start'}
            </button>
            <button
              type="button"
              onClick={onResetBreak}
              title="Reset break timer"
              aria-label="Reset break timer"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-cyan-200/12 bg-cyan-400/[0.04] text-slate-400 hover:border-cyan-300/35 hover:text-cyan-100"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 3. Check-in Timer (Full width on tablet sm..lg, 1/3 column on xl desktop) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-all sm:col-span-2 xl:col-span-1 ${
            isCheckInRunning || isCheckInStaged
              ? 'border-teal-300/40 bg-gradient-to-r from-cyan-400/[0.09] to-teal-400/[0.1] shadow-[0_0_16px_rgba(45,212,191,0.12)]'
              : 'border-cyan-200/[0.1] bg-[#040814]/70'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            {isCheckInRunning || isCheckInStaged ? (
              <Bell className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            ) : (
              <BellOff className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            )}
            <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap shrink-0">
              Check-in
            </span>
            <input
              type="number"
              min={1}
              max={180}
              aria-label="Check-in interval in minutes"
              value={timerSettings.checkInMinutes}
              onChange={(e) =>
                onUpdateTimerSettings({
                  ...timerSettings,
                  checkInMinutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)),
                })
              }
              className="bio-input font-mono-tabular h-6 w-9 shrink-0 rounded px-1 text-center text-[11px]"
            />
            <span className="text-[10px] text-slate-400 shrink-0">m</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isCheckInStaged ? (
              <span className="rounded border border-cyan-300/35 bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100 whitespace-nowrap">
                Armed
              </span>
            ) : isCheckInRunning ? (
              <span
                aria-label="Time left until next AI check-in"
                className="font-mono-tabular rounded border border-cyan-300/35 bg-cyan-400/15 px-1.5 py-0.5 text-xs font-bold text-cyan-100 whitespace-nowrap"
              >
                {formatClock(secondsUntilAlert)}
              </span>
            ) : (
              <span className="px-1 text-[11px] text-slate-500 whitespace-nowrap">Off</span>
            )}

            <button
              type="button"
              onClick={onToggleCheckIn}
              aria-label={isCheckInRunning ? 'Stop check-in timer' : 'Start check-in timer'}
              className={`flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                isCheckInRunning || isCheckInStaged
                  ? 'border border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                  : 'border border-cyan-300/35 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25'
              }`}
            >
              {isCheckInRunning || isCheckInStaged ? (
                <>
                  <Square className="h-2.5 w-2.5 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Start
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onTriggerAlertNow}
              disabled={isLoadingCheckIn}
              title="Ask Sora to check in right now"
              className="h-6 cursor-pointer rounded border border-cyan-200/15 bg-cyan-400/[0.05] px-1.5 text-[10px] font-medium text-slate-300 hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-50 whitespace-nowrap"
            >
              {isLoadingCheckIn ? '...' : 'Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Hairline Progress Bar */}
      <div className="h-0.5 w-full bg-cyan-200/[0.07]">
        <div
          style={{ width: `${activePct}%` }}
          className={`h-full transition-all duration-300 ${
            isBreakRunning
              ? 'bg-gradient-to-r from-cyan-400 to-teal-200'
              : 'bio-progress'
          }`}
        />
      </div>

      {/* Expandable Duration Customizer */}
      <AnimatePresence initial={false}>
        {showCustomize && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-cyan-200/[0.09] bg-[#050918]/85 px-3.5 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[11px] text-slate-400">
                  Focus (m)
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timerSettings.workMinutes}
                    onChange={(e) =>
                      onUpdateTimerSettings({
                        ...timerSettings,
                        workMinutes: Math.max(1, Math.min(180, Number(e.target.value) || 25)),
                      })
                    }
                    className="bio-input font-mono-tabular ml-1.5 w-14 rounded px-2 py-1 text-xs"
                  />
                </label>

                <label className="text-[11px] text-slate-400">
                  Break (m)
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={timerSettings.breakMinutes}
                    onChange={(e) =>
                      onUpdateTimerSettings({
                        ...timerSettings,
                        breakMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 5)),
                      })
                    }
                    className="bio-input font-mono-tabular ml-1.5 w-14 rounded px-2 py-1 text-xs"
                  />
                </label>

                <label className="text-[11px] text-slate-400">
                  Reminder (m)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={timerSettings.reminderMinutesBeforeEnd}
                    onChange={(e) =>
                      onUpdateTimerSettings({
                        ...timerSettings,
                        reminderMinutesBeforeEnd: Math.max(
                          0,
                          Math.min(30, Number(e.target.value) || 0)
                        ),
                      })
                    }
                    className="bio-input font-mono-tabular ml-1.5 w-14 rounded px-2 py-1 text-xs"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={timerSettings.chimeEnabled}
                    onChange={(e) =>
                      onUpdateTimerSettings({
                        ...timerSettings,
                        chimeEnabled: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5 accent-cyan-300"
                  />
                  <span>Chimes</span>
                </label>

                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={timerSettings.visualCuesEnabled}
                    onChange={(e) =>
                      onUpdateTimerSettings({
                        ...timerSettings,
                        visualCuesEnabled: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5 accent-amber-300"
                  />
                  <span>Glow</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Visual Cue / Alert Banner */}
      <AnimatePresence>
        {activeAlertBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`border-t px-3.5 py-2 ${
              activeAlertBanner.kind === 'break_end'
                ? 'border-cyan-300/35 bg-cyan-400/10'
                : 'border-amber-300/35 bg-gradient-to-r from-cyan-400/[0.08] to-amber-400/[0.12]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-xs font-semibold text-transparent">
                  {activeAlertBanner.title}
                </span>
                <span className="mx-1.5 text-slate-500">·</span>
                <span className="text-xs text-slate-100">{activeAlertBanner.message}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeAlertBanner.kind === 'checkin' &&
                  ['On track', 'Need a reset', 'Split task'].map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => onAlertReply(reply)}
                      className="bio-glow-chip cursor-pointer rounded border px-2 py-0.5 text-[11px] font-medium hover:brightness-115"
                    >
                      {reply}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={onDismissAlert}
                  className="cursor-pointer px-1.5 text-[11px] text-slate-400 hover:text-cyan-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
