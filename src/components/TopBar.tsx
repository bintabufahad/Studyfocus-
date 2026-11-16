import type { AppView } from '../types';

interface TopBarProps {
  activeView: AppView;
  activeCardTitle: string | null;
  profileName: string;
  onSelectView: (view: AppView) => void;
  onOpenProfiles: () => void;
  isFocusRunning: boolean;
  sprintPhase: 'work' | 'break';
  onToggleFocus: () => void;
  logsCount: number;
}

export function TopBar({
  activeView,
  activeCardTitle,
  profileName,
  onSelectView,
  onOpenProfiles,
  isFocusRunning,
  sprintPhase,
  onToggleFocus,
  logsCount,
}: TopBarProps) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1440px] shrink-0 items-center justify-between gap-8 border-b border-white/[0.07] px-4 py-2 sm:px-6 lg:px-8">
      {/* Zone 1: Single-element brand wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('hub')}
        className="font-display cursor-pointer text-lg font-semibold tracking-tight text-slate-100 transition-colors hover:text-amber-300 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
      >
        FocusPair
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      <nav aria-label="Primary" className="flex items-center gap-6 sm:gap-8">
        <button
          type="button"
          onClick={() => onSelectView('hub')}
          className={`cursor-pointer text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 ${
            activeView === 'hub'
              ? 'text-amber-300 underline decoration-amber-400/60 underline-offset-8'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          Sessions
        </button>

        {activeCardTitle && (
          <button
            type="button"
            onClick={() => onSelectView('workspace')}
            className={`cursor-pointer max-w-[180px] truncate text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 ${
              activeView === 'workspace'
                ? 'text-amber-300 underline decoration-amber-400/60 underline-offset-8'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {activeCardTitle}
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelectView('history')}
          className={`cursor-pointer text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 ${
            activeView === 'history'
              ? 'text-amber-300 underline decoration-amber-400/60 underline-offset-8'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          History{logsCount > 0 ? ` (${logsCount})` : ''}
        </button>

        <button
          type="button"
          onClick={onOpenProfiles}
          className="cursor-pointer text-sm font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
        >
          Profile: {profileName}
        </button>
      </nav>

      {/* Zone 3: One primary action */}
      <div className="flex items-center shrink-0">
        {activeView === 'workspace' && activeCardTitle ? (
          <button
            type="button"
            onClick={onToggleFocus}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
              isFocusRunning
                ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                : 'bg-amber-400 text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.22)] hover:bg-amber-300'
            }`}
          >
            {isFocusRunning
              ? 'Pause'
              : sprintPhase === 'break'
                ? 'Start Break'
                : 'Start Sprint'}
          </button>
        ) : activeCardTitle ? (
          <button
            type="button"
            onClick={() => onSelectView('workspace')}
            className="cursor-pointer rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.22)] transition-all duration-150 hover:bg-amber-300 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Resume Session
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectView('hub')}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
          >
            Create Card
          </button>
        )}
      </div>
    </header>
  );
}
