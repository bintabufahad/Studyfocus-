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
  { dot: string; border: string; glow: string; label: string }
> = {
  amber: {
    dot: 'bg-amber-400',
    border: 'hover:border-amber-400/40',
    glow: 'from-amber-400/12 to-transparent',
    label: 'Amber',
  },
  sky: {
    dot: 'bg-sky-400',
    border: 'hover:border-sky-400/40',
    glow: 'from-sky-400/12 to-transparent',
    label: 'Sky',
  },
  emerald: {
    dot: 'bg-emerald-400',
    border: 'hover:border-emerald-400/40',
    glow: 'from-emerald-400/12 to-transparent',
    label: 'Emerald',
  },
  rose: {
    dot: 'bg-rose-400',
    border: 'hover:border-rose-400/40',
    glow: 'from-rose-400/12 to-transparent',
    label: 'Rose',
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
  const [accent, setAccent] = useState<StudySessionCard['accent']>('amber');
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
    <main className="relative z-10 mx-auto w-full max-w-[1280px] flex-1 overflow-y-auto px-4 py-7 sm:px-6 lg:px-8">
      {/* Create Study Session Hero */}
      <section className="glass-panel rounded-xl p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium text-amber-300">
              Welcome back, {profileName}
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Create a study session
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Keep every subject in its own dedicated card—tasks, video playlists, timers, and progress stay saved inside that session.
            </p>
          </div>

          <form
            onSubmit={handleCreate}
            className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center lg:max-w-lg"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Studying Arabic, Memorizing Quran, Biology..."
              aria-label="Study session name"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#090C18] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
            />

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#090C18] px-2.5 py-2">
                {(Object.keys(ACCENT_STYLES) as StudySessionCard['accent'][]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    title={ACCENT_STYLES[key].label}
                    aria-label={`Color ${ACCENT_STYLES[key].label}`}
                    className={`h-4 w-4 cursor-pointer rounded-full transition-transform ${
                      ACCENT_STYLES[key].dot
                    } ${accent === key ? 'scale-115 ring-2 ring-white/80 ring-offset-2 ring-offset-[#090C18]' : 'opacity-65 hover:opacity-100'}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={!title.trim()}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Create Session
              </button>
            </div>
          </form>
        </div>

        {/* Quick-Start Session Templates + Join Friend */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Quick create:</span>
            {QUICK_SUGGESTIONS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onCreateCard(item.title, item.accent)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-amber-400/35 hover:bg-amber-400/10 hover:text-amber-100"
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
              className="flex items-center gap-1.5"
            >
              <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value)}
                placeholder="Friend room code or link..."
                className="w-48 rounded-lg border border-white/10 bg-[#090C18] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!friendCode.trim()}
                className="cursor-pointer rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
              >
                Join
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Saved Study Session Cards Grid */}
      <section aria-label="Your Study Sessions" className="mt-6">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-200">
            Your Study Cards ({cards.length})
          </h2>
        </div>

        {cards.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center rounded-xl px-6 py-14 text-center">
            <BookOpen className="mb-3 h-7 w-7 text-slate-500" />
            <p className="font-display text-base font-medium text-slate-200">
              No study cards yet
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">
              Create your first card above for Studying Arabic, School, Memorizing Quran, or anything else—each card saves its own tasks, playlists, and focus logs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const style = ACCENT_STYLES[card.accent] ?? ACCENT_STYLES.amber;
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
                  className={`glass-panel group relative flex flex-col justify-between overflow-hidden rounded-xl p-5 transition-colors ${style.border}`}
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
                              className="min-w-0 flex-1 rounded border border-amber-400/50 bg-[#090C18] px-2 py-0.5 text-sm text-slate-100 focus:outline-none"
                            />
                            <button
                              type="submit"
                              aria-label="Save name"
                              className="cursor-pointer text-amber-300"
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
                          className="cursor-pointer rounded p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCard(card.id)}
                          aria-label={`Delete ${card.title}`}
                          className="cursor-pointer rounded p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono-tabular">
                        {doneCount}/{card.tasks.length} tasks
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 font-mono-tabular">
                        <Film className="h-3 w-3" />
                        {card.playlist.length} videos
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{focusMins}m studied</span>
                    </div>
                  </div>

                  <div className="relative mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3.5">
                    <span className="text-[11px] text-slate-500">
                      {new Date(card.lastOpenedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpenCard(card.id)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-amber-400 hover:text-slate-950"
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
