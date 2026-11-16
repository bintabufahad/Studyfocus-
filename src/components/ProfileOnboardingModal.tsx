import { useState } from 'react';
import { Trash2, UserPlus, X } from 'lucide-react';
import type { UserProfile } from '../types';

interface ProfileOnboardingModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  profiles: UserProfile[];
  activeProfileId: string | null;
  onClose: () => void;
  onCreateProfile: (name: string) => void;
  onSelectProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
}

export function ProfileOnboardingModal({
  isOpen,
  canDismiss,
  profiles,
  activeProfileId,
  onClose,
  onCreateProfile,
  onSelectProfile,
  onDeleteProfile,
}: ProfileOnboardingModalProps) {
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreateProfile(trimmed);
    setName('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="glass-panel w-full max-w-md rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-3.5">
          <div>
            <h2
              id="profile-modal-title"
              className="font-display text-lg font-semibold text-slate-100"
            >
              {profiles.length === 0 ? 'Welcome to FocusPair' : 'Focus Profiles'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Saved locally in your browser per profile
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile dialog"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Existing Profiles List */}
        {profiles.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-400">
              Switch Profile
            </p>
            <div className="quiet-scroll max-h-36 space-y-1.5 overflow-y-auto">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                const cardCount = p.studyCards.length;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      isActive
                        ? 'border-amber-400/40 bg-amber-400/10'
                        : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProfile(p.id);
                        onClose();
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="block truncate text-sm font-medium text-slate-100">
                        {p.name}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-slate-400">
                        {cardCount} study {cardCount === 1 ? 'card' : 'cards'}
                      </span>
                    </button>

                    {profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProfile(p.id)}
                        aria-label={`Delete ${p.name}`}
                        className="cursor-pointer p-1.5 text-slate-500 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create New Profile Form (Name Only) */}
        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${profiles.length > 0 ? 'mt-5 border-t border-white/[0.08] pt-4' : 'mt-5'}`}
        >
          <div>
            <label
              htmlFor="profile-name-input"
              className="block text-sm font-medium text-slate-200"
            >
              {profiles.length === 0 ? "What's your name?" : 'Create another profile'}
            </label>
            <input
              id="profile-name-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B0E1A] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <UserPlus className="h-4 w-4" />
            {profiles.length === 0 ? 'Start Focusing with Sora' : 'Create & Switch Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
