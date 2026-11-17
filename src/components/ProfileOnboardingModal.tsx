import { useRef, useState } from 'react';
import {
  Cloud,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { StudySessionCard, UserProfile } from '../types';

interface ProfileOnboardingModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  isCloudSignedIn: boolean;
  isSyncing: boolean;
  onClose: () => void;
  onRegisterCloudAccount: (username: string, password: string) => Promise<void>;
  onLoginCloudAccount: (username: string, password: string) => Promise<void>;
  onSignOutCloudAccount: () => Promise<void>;
  onSelectLocalProfile: (id: string) => void;
  onDeleteLocalProfile: (id: string) => void;
  onImportCardsBackup: (cards: StudySessionCard[]) => void;
}

export function ProfileOnboardingModal({
  isOpen,
  canDismiss,
  profiles,
  activeProfile,
  isCloudSignedIn,
  isSyncing,
  onClose,
  onRegisterCloudAccount,
  onLoginCloudAccount,
  onSignOutCloudAccount,
  onSelectLocalProfile,
  onDeleteLocalProfile,
  onImportCardsBackup,
}: ProfileOnboardingModalProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>(() =>
    profiles.length === 0 ? 'register' : 'login'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      setError('Please enter a name with at least 2 characters.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (authTab === 'register') {
        await onRegisterCloudAccount(cleanUser, password);
      } else {
        await onLoginCloudAccount(cleanUser, password);
      }
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportBackup = () => {
    if (!activeProfile) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      name: activeProfile.name,
      studyCards: activeProfile.studyCards,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focuspair-${activeProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNotice('Backup file downloaded.');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { studyCards?: StudySessionCard[] };
      if (!Array.isArray(parsed.studyCards)) {
        setError('Invalid FocusPair backup file.');
        return;
      }
      onImportCardsBackup(parsed.studyCards);
      setBackupNotice(`Imported ${parsed.studyCards.length} study cards.`);
      setError(null);
    } catch {
      setError('Could not read that backup file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040B]/75 p-4 backdrop-blur-md"
    >
      <div className="glass-panel max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-cyan-200/[0.1] pb-3.5">
          <div>
            <h2
              id="profile-modal-title"
              className="font-display text-lg font-semibold text-slate-100"
            >
              {activeProfile ? 'Your FocusPair Account' : 'Sign In or Create Account'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Username &amp; password only — syncs your private cards across browsers with no email needed.
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account dialog"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-cyan-400/15 hover:text-cyan-100 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Active Signed-In Account Summary */}
        {activeProfile && (
          <div className="mt-4 rounded-lg border border-cyan-200/[0.12] bg-[#040814]/80 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Cloud
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isCloudSignedIn ? 'text-cyan-300' : 'text-amber-300'
                    }`}
                  />
                  <span className="truncate text-sm font-semibold text-slate-100">
                    {activeProfile.name}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {isCloudSignedIn
                    ? isSyncing
                      ? 'Syncing cards across browsers...'
                      : `${activeProfile.studyCards.length} private cards synced across your browsers`
                    : `${activeProfile.studyCards.length} local cards · Create an account below to sync across browsers`}
                </p>
              </div>

              {isCloudSignedIn && (
                <button
                  type="button"
                  onClick={async () => {
                    await onSignOutCloudAccount();
                    setAuthTab('login');
                  }}
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-200/15 bg-cyan-400/[0.05] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-rose-500/15 hover:text-rose-200 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              )}
            </div>

            {/* Backup Export / Import row */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cyan-200/[0.08] pt-2.5">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex cursor-pointer items-center gap-1 rounded border border-cyan-200/15 bg-cyan-400/[0.05] px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-300/35 hover:text-cyan-100"
              >
                <Download className="h-3 w-3" />
                Export Backup
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer items-center gap-1 rounded border border-cyan-200/15 bg-cyan-400/[0.05] px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-300/35 hover:text-cyan-100"
              >
                <Upload className="h-3 w-3" />
                Import Backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              {backupNotice && (
                <span className="text-[11px] text-cyan-300">{backupNotice}</span>
              )}
            </div>
          </div>
        )}

        {/* Legacy local profiles switcher (if any local guest profiles exist) */}
        {!isCloudSignedIn && profiles.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-400">
              Browser-only profiles on this device
            </p>
            <div className="quiet-scroll max-h-28 space-y-1.5 overflow-y-auto">
              {profiles.map((p) => {
                const isActive = p.id === activeProfile?.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 ${
                      isActive
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/[0.08] bg-cyan-400/[0.03] hover:bg-cyan-400/[0.07]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLocalProfile(p.id);
                        onClose();
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="block truncate text-xs font-medium text-slate-100">
                        {p.name}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        {p.studyCards.length} cards
                      </span>
                    </button>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteLocalProfile(p.id)}
                        aria-label={`Delete ${p.name}`}
                        className="cursor-pointer p-1 text-slate-500 hover:text-rose-300"
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

        {/* Username + Password Sign In / Create Account Form */}
        <div className="mt-5 border-t border-cyan-200/[0.1] pt-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-cyan-200/15 bg-[#040814]/85 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setError(null);
              }}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${
                authTab === 'login'
                  ? 'bio-btn-primary font-semibold'
                  : 'text-slate-400 hover:text-cyan-100'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setError(null);
              }}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${
                authTab === 'register'
                  ? 'bio-btn-primary font-semibold'
                  : 'text-slate-400 hover:text-cyan-100'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-3.5 space-y-3">
            <div>
              <label
                htmlFor="account-username-input"
                className="block text-xs font-medium text-slate-300"
              >
                Your Name / Username
              </label>
              <input
                id="account-username-input"
                type="text"
                autoFocus={!activeProfile}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Ayesha"
                className="bio-input mt-1 w-full rounded-lg px-3.5 py-2 text-sm placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="account-password-input"
                className="block text-xs font-medium text-slate-300"
              >
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="account-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 4 characters"
                  className="bio-input w-full rounded-lg px-3.5 py-2 pr-9 text-sm placeholder:text-slate-500"
                />
                <KeyRound className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {authTab === 'register'
                  ? !isCloudSignedIn && activeProfile && activeProfile.studyCards.length > 0
                    ? `Your ${activeProfile.studyCards.length} current local cards will automatically sync to this new account.`
                    : 'Your cards stay completely private to your name and password.'
                  : 'Use the exact same name & password in any browser to load your cards.'}
              </p>
            </div>

            {error && (
              <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || password.length < 4}
              className="bio-btn-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting
                ? 'Please wait...'
                : authTab === 'register'
                  ? 'Create Account & Sync'
                  : 'Sign In & Load My Cards'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
