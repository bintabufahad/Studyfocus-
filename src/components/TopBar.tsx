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
    <header className="fp-topbar relative z-20 mx-auto flex w-full shrink-0 items-center justify-between gap-4 px-5 py-2.5 sm:px-8">
      {/* Left: Crisp FocusPair wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('hub')}
        className="font-display cursor-pointer text-base font-semibold tracking-tight text-slate-100 transition-colors hover:text-cyan-200 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
      >
        FocusPair
      </button>

      {/* Right: Concise single-line navigation links + workspace action when inside a session */}
      <div className="flex items-center gap-5 sm:gap-7">
        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => onSelectView('hub')}
            className={`cursor-pointer text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
              activeView === 'hub'
                ? 'text-cyan-300 underline decoration-cyan-300 decoration-2 underline-offset-8 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]'
                : 'text-slate-300/80 hover:text-cyan-100'
            }`}
          >
            Sessions
          </button>

          {activeCardTitle && (
            <button
              type="button"
              onClick={() => onSelectView('workspace')}
              className={`cursor-pointer max-w-[140px] truncate text-sm font-medium transition-colors whitespace-nowrap shrink-0 sm:max-w-[180px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
                activeView === 'workspace'
                  ? 'text-cyan-300 underline decoration-cyan-300 decoration-2 underline-offset-8 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]'
                  : 'text-slate-300/80 hover:text-cyan-100'
              }`}
            >
              {activeCardTitle}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectView('history')}
            className={`cursor-pointer text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
              activeView === 'history'
                ? 'text-cyan-300 underline decoration-cyan-300 decoration-2 underline-offset-8 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]'
                : 'text-slate-300/80 hover:text-cyan-100'
            }`}
          >
            History{logsCount > 0 ? ` (${logsCount})` : ''}
          </button>

          <button
            type="button"
            onClick={onOpenProfiles}
            className="cursor-pointer text-sm font-medium text-amber-200 transition-colors hover:text-amber-100 whitespace-nowrap shrink-0 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
          >
            Account: {profileName}
          </button>
        </nav>

        {activeView === 'workspace' && activeCardTitle ? (
          <button
            type="button"
            onClick={onToggleFocus}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
              isFocusRunning
                ? 'bio-glow-chip border hover:brightness-110'
                : 'bio-btn-primary'
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
            className="bio-btn-primary cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Resume Session
          </button>
        ) : null}
      </div>
    </header>
  );
}
