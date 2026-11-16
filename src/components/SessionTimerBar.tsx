import { useState } from 'react';
import {
  Bell,
  BellOff,
  BookmarkCheck,
  Film,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { SprintPhase, TimerSettings, WorkspacePanelMode } from '../types';

interface SessionTimerBarProps {
  panelMode: WorkspacePanelMode;
  onChangePanelMode: (mode: WorkspacePanelMode) => void;
  sprintPhase: SprintPhase;
  phaseRemainingSeconds: number;
  phaseTotalSeconds: number;
  elapsedSessionSeconds: number;
  isFocusRunning: boolean;
  timerSettings: TimerSettings;
  alertEnabled: boolean;
  secondsUntilAlert: number;
  activeAlertBanner: {
    kind: 'sprint_end' | 'break_end' | 'reminder' | 'checkin';
    title: string;
    message: string;
  } | null;
  isLoadingCheckIn: boolean;
  onToggleFocus: () => void;
  onResetTimer: () => void;
  onSkipPhase: () => void;
  onUpdateTimerSettings: (next: TimerSettings) => void;
  onToggleAlertEnabled: () => void;
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
  sprintPhase,
  phaseRemainingSeconds,
  phaseTotalSeconds,
  elapsedSessionSeconds,
  isFocusRunning,
  timerSettings,
  alertEnabled,
  secondsUntilAlert,
  activeAlertBanner,
  isLoadingCheckIn,
  onToggleFocus,
  onResetTimer,
  onSkipPhase,
  onUpdateTimerSettings,
  onToggleAlertEnabled,
  onTriggerAlertNow,
  onAlertReply,
  onDismissAlert,
  onSaveSessionLog,
}: SessionTimerBarProps) {
  const [showCustomize, setShowCustomize] = useState(false);

  const progressPct =
    phaseTotalSeconds > 0
      ? Math.min(
          100,
          Math.round(((phaseTotalSeconds - phaseRemainingSeconds) / phaseTotalSeconds) * 100)
        )
      : 0;

  const isVisualFlashing = timerSettings.visualCuesEnabled && activeAlertBanner !== null;

  return (
    <section
      aria-label="Workspace Mode Switcher and Compact Timer"
      className={`glass-panel shrink-0 overflow-hidden rounded-xl transition-all duration-300 ${
        isVisualFlashing
          ? 'ring-2 ring-amber-400/75 shadow-[0_0_24px_rgba(251,191,36,0.24)]'
          : ''
      }`}
    >
      {/* Slim Single-Row Header: Mode Toggle + Compact Timer + Auto Alerts */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-1.5">
        {/* Left: Focus Plan vs Video & Playlist Mode Switch */}
        <div
          role="tablist"
          aria-label="Study Area Mode"
          className="flex items-center rounded-lg border border-white/[0.08] bg-[#090C18] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === 'focus'}
            onClick={() => onChangePanelMode('focus')}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              panelMode === 'focus'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
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
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              panelMode === 'video'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Video &amp; Playlist
          </button>
        </div>

        {/* Middle: Small Slim Sprint / Break Clock */}
        <div className="flex items-center gap-2">
          <p className="font-mono-tabular text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            {formatClock(phaseRemainingSeconds)}
          </p>

          <span
            className={`text-[11px] font-medium whitespace-nowrap ${
              sprintPhase === 'work' ? 'text-amber-300' : 'text-sky-300'
            }`}
          >
            {sprintPhase === 'work' ? 'Work' : 'Break'}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleFocus}
              aria-label={isFocusRunning ? 'Pause timer' : 'Start timer'}
              className={`flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
                isFocusRunning
                  ? 'border border-amber-400/35 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                  : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
              }`}
            >
              {isFocusRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isFocusRunning ? 'Pause' : 'Start'}
            </button>

            <button
              type="button"
              onClick={onSkipPhase}
              title={sprintPhase === 'work' ? 'Switch to Break' : 'Switch to Work Sprint'}
              aria-label="Switch phase"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10"
            >
              <SkipForward className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={onResetTimer}
              title="Reset phase timer"
              aria-label="Reset phase timer"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={() => setShowCustomize((v) => !v)}
              title="Customize sprint, break, and reminder timers"
              aria-label="Customize timers"
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
                showCustomize
                  ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/10'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Right: Built-In User-Demand Automatic Alert Timer */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleAlertEnabled}
            title={alertEnabled ? 'Disable automatic alerts' : 'Enable automatic alerts'}
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
              alertEnabled
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
            }`}
          >
            {alertEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
            <span>Auto</span>
          </button>

          <input
            type="number"
            min={1}
            max={180}
            aria-label="Custom automatic alert minutes"
            value={timerSettings.checkInMinutes}
            onChange={(e) =>
              onUpdateTimerSettings({
                ...timerSettings,
                checkInMinutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)),
              })
            }
            className="font-mono-tabular h-7 w-11 rounded border border-white/10 bg-[#090C18] px-1 text-center text-[11px] text-slate-200 focus:border-amber-400/50 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500">m</span>

          {alertEnabled && (
            <span className="font-mono-tabular hidden text-[11px] text-slate-400 xl:inline">
              {formatClock(secondsUntilAlert)}
            </span>
          )}

          <button
            type="button"
            onClick={onTriggerAlertNow}
            disabled={isLoadingCheckIn}
            className="h-7 cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-medium text-slate-300 transition-colors hover:border-amber-400/35 hover:text-amber-200 disabled:opacity-50 whitespace-nowrap"
          >
            {isLoadingCheckIn ? '...' : 'Alert'}
          </button>
        </div>
      </div>

      {/* Hairline Progress Bar */}
      <div className="h-0.5 w-full bg-white/[0.05]">
        <div
          style={{ width: `${progressPct}%` }}
          className={`h-full transition-all duration-300 ${
            sprintPhase === 'work'
              ? 'bg-gradient-to-r from-amber-500 to-amber-300'
              : 'bg-gradient-to-r from-sky-500 to-sky-300'
          }`}
        />
      </div>

      {/* Expandable Sprint / Break / Reminder Customizer */}
      <AnimatePresence initial={false}>
        {showCustomize && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/[0.07] bg-[#0C1020]/80 px-3.5 py-2"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[11px] text-slate-400">
                  Work (m)
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
                    className="font-mono-tabular ml-1.5 w-14 rounded border border-white/10 bg-[#090C18] px-2 py-1 text-xs text-slate-100 focus:border-amber-400/50 focus:outline-none"
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
                    className="font-mono-tabular ml-1.5 w-14 rounded border border-white/10 bg-[#090C18] px-2 py-1 text-xs text-slate-100 focus:border-amber-400/50 focus:outline-none"
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
                    className="font-mono-tabular ml-1.5 w-14 rounded border border-white/10 bg-[#090C18] px-2 py-1 text-xs text-slate-100 focus:border-amber-400/50 focus:outline-none"
                  />
                </label>

                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span>Auto alert:</span>
                  {[5, 15, 25].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        onUpdateTimerSettings({
                          ...timerSettings,
                          checkInMinutes: mins,
                        })
                      }
                      className={`font-mono-tabular cursor-pointer rounded px-1.5 py-0.5 transition-colors ${
                        timerSettings.checkInMinutes === mins
                          ? 'bg-amber-400/20 text-amber-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
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
                    className="h-3.5 w-3.5 accent-amber-400"
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
                    className="h-3.5 w-3.5 accent-amber-400"
                  />
                  <span>Glow</span>
                </label>

                {elapsedSessionSeconds >= 10 && (
                  <button
                    type="button"
                    onClick={onSaveSessionLog}
                    className="flex cursor-pointer items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200"
                  >
                    <BookmarkCheck className="h-3.5 w-3.5" />
                    Save Log
                  </button>
                )}
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
                ? 'border-sky-400/30 bg-sky-500/10'
                : 'border-amber-400/30 bg-amber-400/10'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-amber-200">
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
                      className="cursor-pointer rounded border border-amber-400/25 bg-[#0A0E1C]/80 px-2 py-0.5 text-[11px] font-medium text-amber-100 hover:bg-amber-400/20"
                    >
                      {reply}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={onDismissAlert}
                  className="cursor-pointer px-1.5 text-[11px] text-slate-400 hover:text-slate-100"
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
