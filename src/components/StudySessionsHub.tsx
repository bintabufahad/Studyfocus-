import { useState } from 'react';
import { ArrowRight, BookOpen, Check, Edit3, Film, Plus, Trash2, Users } from 'lucide-react';
import type { StudySessionCard } from '../types';

interface StudySessionsHubProps {
  profileName: string;
  cards: StudySessionCard[];
  onCreateCard: (title: string, accent: StudySessionCard['accent']) => void;
  onOpenCard: (cardId: string) => void;
  onRenameCard: (cardId: string, nextTitle: string) => void;
  onDeleteCard: (cardId: string) => void;
  onJoinFriendRoom?: (codeOrUrl: string) => void;
}

const ACCENT_STYLES: Record<
  StudySessionCard['accent'],
  { swatch: string; dot: string; border: string; glow: string; label: string }
> = {
  rose: {
    swatch: 'bg-slate-300/85 shadow-[0_0_8px_rgba(226,232,240,0.55)]',
    dot: 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.75)]',
    border: 'hover:border-sky-300/45 hover:shadow-[0_0_28px_rgba(125,211,252,0.14)]',
    glow: 'from-sky-400/12 via-amber-300/5 to-transparent',
    label: 'Starlight',
  },
  emerald: {
    swatch: 'bg-emerald-100/90 shadow-[0_0_8px_rgba(167,243,208,0.65)]',
    dot: 'bg-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.75)]',
    border: 'hover:border-teal-300/45 hover:shadow-[0_0_28px_rgba(45,212,191,0.14)]',
    glow: 'from-teal-400/14 to-transparent',
    label: 'Seafoam',
  },
  amber: {
    swatch: 'bg-amber-200/95 shadow-[0_0_8px_rgba(253,230,138,0.65)]',
    dot: 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.75)]',
    border: 'hover:border-amber-300/45 hover:shadow-[0_0_28px_rgba(251,191,36,0.14)]',
    glow: 'from-amber-400/14 via-cyan-400/5 to-transparent',
    label: 'Gold',
  },
  sky: {
    swatch: 'bg-cyan-200/95 shadow-[0_0_8px_rgba(165,243,252,0.7)]',
    dot: 'bg-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.75)]',
    border: 'hover:border-cyan-300/45 hover:shadow-[0_0_28px_rgba(56,189,248,0.16)]',
    glow: 'from-cyan-400/14 to-transparent',
    label: 'Cyan',
  },
};

const QUICK_SUGGESTIONS: Array<{ title: string; accent: StudySessionCard['accent'] }> = [
  { title: 'Studying Arabic', accent: 'emerald' },
  { title: 'Memorizing Quran', accent: 'amber' },
  { title: 'School Work', accent: 'sky' },
  { title: 'Deep Reading', accent: 'rose' },
];

export function StudySessionsHub({
  profileName,
  cards,
  onCreateCard,
  onOpenCard,
  onRenameCard,
  onDeleteCard,
  onJoinFriendRoom,
}: StudySessionsHubProps) {
  const [title, setTitle] = useState('');
  const [accent, setAccent] = useState<StudySessionCard['accent']>('sky');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [friendCode, setFriendCode] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreateCard(trimmed, accent);
    setTitle('');
  };

  const commitRename = (cardId: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      onRenameCard(cardId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <main
      className={`relative z-10 mx-auto flex w-full max-w-[1160px] flex-1 flex-col overflow-y-auto px-4 py-7 sm:px-6 lg:px-8 ${
        cards.length === 0 ? 'justify-center' : ''
      }`}
    >
      {/* Create Study Session Hero */}
      <section className="glass-panel rounded-2xl p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium text-cyan-200/85">
              Welcome back, {profileName}
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-slate-100 sm:text-[28px]">
              Create a study session
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-200/75">
              Keep every subject in its own dedicated card—tasks, video playlists, timers, and progress stay saved inside that session.
            </p>
          </div>

          <form
            onSubmit={handleCreate}
            className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center lg:max-w-[490px]"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Studying Arabic, Memorizing Quran, Biology..."
              aria-label="Study session name"
              className="bio-input min-w-0 flex-1 rounded-lg px-3.5 py-2.5 text-sm placeholder:text-slate-400/75"
            />

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="fp-dot-picker flex items-center gap-1.5 rounded-full px-2.5 py-1.5">
                {(Object.keys(ACCENT_STYLES) as StudySessionCard['accent'][]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    title={ACCENT_STYLES[key].label}
                    aria-label={`Color ${ACCENT_STYLES[key].label}`}
                    className={`h-4 w-4 cursor-pointer rounded-full transition-transform ${
                      ACCENT_STYLES[key].swatch
                    } ${accent === key ? 'scale-115 ring-2 ring-white/90 ring-offset-1 ring-offset-slate-900' : 'opacity-70 hover:opacity-100'}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={!title.trim()}
                className="bio-btn-primary flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Create Session
              </button>
            </div>
          </form>
        </div>

        {/* Quick-Start Session Templates + Join Friend */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/[0.1] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300/75">Quick create:</span>
            {QUICK_SUGGESTIONS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onCreateCard(item.title, item.accent)}
                className="fp-quick-chip flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
              >
                <span className={`h-2 w-2 rounded-full ${ACCENT_STYLES[item.accent].dot}`} />
                {item.title}
              </button>
            ))}
          </div>

          {onJoinFriendRoom && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!friendCode.trim()) return;
                onJoinFriendRoom(friendCode.trim());
                setFriendCode('');
              }}
              className="flex items-center gap-2"
            >
              <Users className="h-3.5 w-3.5 text-cyan-200/80 shrink-0" />
              <input
                type="text"
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value)}
                placeholder="Friend room code or link..."
                className="bio-input w-48 rounded-lg px-2.5 py-1.5 text-xs placeholder:text-slate-400/75"
              />
              <button
                type="submit"
                disabled={!friendCode.trim()}
                className="cursor-pointer rounded-lg border border-amber-300/35 bg-amber-300/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition-all hover:border-amber-200/60 hover:bg-amber-300/25 disabled:opacity-50"
              >
                Join
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Saved Study Session Cards Grid */}
      <section aria-label="Your Study Sessions" className="mt-7">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wide text-slate-100">
            Your Study Cards ({cards.length})
          </h2>
        </div>

        {cards.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
            <BookOpen className="mb-3.5 h-8 w-8 text-cyan-300 drop-shadow-[0_0_12px_rgba(103,232,249,0.75)]" />
            <p className="font-display text-base font-semibold text-slate-100">
              No study cards yet
            </p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-200/70">
              Create your first card above for Studying Arabic, School, Memorizing Quran, or anything else—each card saves its own tasks, playlists, and focus logs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const style = ACCENT_STYLES[card.accent] ?? ACCENT_STYLES.sky;
              const doneCount = card.tasks.filter((t) => t.completed).length;
              const focusMins = Math.round(
                card.sessionLogs.reduce(
                  (acc, l) => acc + (l.phase === 'work' || !l.phase ? l.durationSeconds : 0),
                  0
                ) / 60
              );

              return (
                <article
                  key={card.id}
                  className={`glass-panel group relative flex flex-col justify-between overflow-hidden rounded-xl p-5 transition-all ${style.border}`}
                >
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${style.glow}`}
                  />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dot}`} />
                        {editingId === card.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename(card.id);
                            }}
                            className="flex flex-1 items-center gap-1.5"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => commitRename(card.id)}
                              className="bio-input min-w-0 flex-1 rounded px-2 py-0.5 text-sm"
                            />
                            <button
                              type="submit"
                              aria-label="Save name"
                              className="cursor-pointer text-cyan-300"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          </form>
                        ) : (
                          <h3 className="font-display truncate text-base font-semibold text-slate-100">
                            {card.title}
                          </h3>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(card.id);
                            setEditingTitle(card.title);
                          }}
                          aria-label={`Rename ${card.title}`}
                          className="cursor-pointer rounded p-1.5 text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-200"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCard(card.id)}
                          aria-label={`Delete ${card.title}`}
                          className="cursor-pointer rounded p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
                      <span className="font-mono-tabular">
                        {doneCount}/{card.tasks.length} tasks
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 font-mono-tabular">
                        <Film className="h-3 w-3 text-cyan-300/85" />
                        {card.playlist.length} videos
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{focusMins}m studied</span>
                    </div>
                  </div>

                  <div className="relative mt-5 flex items-center justify-between border-t border-cyan-200/[0.08] pt-3.5">
                    <span className="text-[11px] text-slate-400">
                      {new Date(card.lastOpenedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpenCard(card.id)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/15 bg-cyan-400/[0.08] px-3.5 py-1.5 text-xs font-medium text-cyan-100 transition-all group-hover:border-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-300 group-hover:to-amber-300 group-hover:font-semibold group-hover:text-slate-950"
                    >
                      Open Session
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
