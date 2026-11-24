import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
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
  cloudNeedsReconnect?: boolean;
  onClose: () => void;
  onRegisterCloudAccount: (username: string, password?: string) => Promise<{ syncKey?: string }>;
  onLoginCloudAccount: (username: string, password: string) => Promise<void>;
  onLoginWithSyncKey: (username: string, syncKey: string) => Promise<void>;
  onLoginWithPairCode: (username: string, pairCode: string) => Promise<void>;
  onRequestPairCode: () => Promise<{ username: string; pairCode: string; expiresAt: number }>;
  onRotateSyncKey: () => Promise<{ username: string; syncKey: string; updatedAt: number }>;
  onSignOutCloudAccount: () => Promise<void>;
  onRecoverLegacyDevice?: (username: string, accountId: string) => Promise<{ syncKey?: string }>;
  onSyncLocalProfileNow?: () => Promise<{ syncKey?: string }>;
  onSelectLocalProfile: (id: string) => void;
  onDeleteLocalProfile: (id: string) => void;
  onImportCardsBackup: (cards: StudySessionCard[]) => void;
}

type SignInMethod = 'pairCode' | 'syncKey' | 'password';

export function ProfileOnboardingModal({
  isOpen,
  canDismiss,
  profiles,
  activeProfile,
  isCloudSignedIn,
  isSyncing,
  cloudNeedsReconnect = false,
  onClose,
  onRegisterCloudAccount,
  onLoginCloudAccount,
  onLoginWithSyncKey,
  onLoginWithPairCode,
  onRequestPairCode,
  onRotateSyncKey,
  onSignOutCloudAccount,
  onRecoverLegacyDevice,
  onSyncLocalProfileNow,
  onSelectLocalProfile,
  onDeleteLocalProfile,
  onImportCardsBackup,
}: ProfileOnboardingModalProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>(() =>
    profiles.length === 0 ? 'register' : 'login'
  );
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('syncKey');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useOptionalPassword, setUseOptionalPassword] = useState(false);
  const [syncKeyInput, setSyncKeyInput] = useState('');
  const [pairCodeInput, setPairCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  const [issuedSyncKeyBanner, setIssuedSyncKeyBanner] = useState<{
    username: string;
    syncKey: string;
  } | null>(null);
  const [activePairCode, setActivePairCode] = useState<{
    username: string;
    pairCode: string;
    expiresAt: number;
  } | null>(null);
  const [pairSecondsLeft, setPairSecondsLeft] = useState(0);
  const [deviceActionBusy, setDeviceActionBusy] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Safely read optional ?syncUser= / ?pair= query params on mount
  useEffect(() => {
    if (!isOpen) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const urlUser = params.get('syncUser')?.trim();
      const urlPair = params.get('pair')?.replace(/\D/g, '').slice(0, 6);
      if (urlUser) {
        setUsername((prev) => prev || urlUser);
        setAuthTab('login');
      }
      if (urlPair && urlPair.length === 6) {
        setPairCodeInput(urlPair);
        setSignInMethod('pairCode');
        setAuthTab('login');
      }
    } catch {
      // Ignore URL parse errors
    }
  }, [isOpen]);

  // Pre-fill username when cloud profile needs reconnect after full reload
  useEffect(() => {
    if (isOpen && cloudNeedsReconnect && activeProfile?.name && !username) {
      setUsername(activeProfile.name);
      setAuthTab('login');
    }
  }, [isOpen, cloudNeedsReconnect, activeProfile?.name, username]);

  // Countdown for active 6-digit pair code
  useEffect(() => {
    if (!activePairCode) {
      setPairSecondsLeft(0);
      return;
    }
    const tick = () => {
      const rem = Math.max(0, Math.floor((activePairCode.expiresAt - Date.now()) / 1000));
      setPairSecondsLeft(rem);
      if (rem === 0) {
        setActivePairCode(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activePairCode]);

  if (!isOpen) return null;

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      window.setTimeout(() => {
        setCopiedField((cur) => (cur === label ? null : cur));
      }, 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      setError('Please enter a name with at least 2 characters.');
      return;
    }

    if (authTab === 'register') {
      if (useOptionalPassword && password.length < 4) {
        setError('Optional password must be at least 4 characters, or uncheck password.');
        return;
      }
    } else {
      if (signInMethod === 'pairCode' && pairCodeInput.replace(/\D/g, '').length !== 6) {
        setError('Enter the 6-digit device link code from your signed-in device.');
        return;
      }
      if (signInMethod === 'syncKey' && syncKeyInput.trim().length < 8) {
        setError('Enter your personal Sync Key (e.g. FP-XXXX-XXXX-XXXX-XXXX).');
        return;
      }
      if (signInMethod === 'password' && password.length < 4) {
        setError('Password must be at least 4 characters.');
        return;
      }
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (authTab === 'register') {
        const res = await onRegisterCloudAccount(
          cleanUser,
          useOptionalPassword && password ? password : undefined
        );
        setPassword('');
        if (res.syncKey) {
          setIssuedSyncKeyBanner({ username: cleanUser, syncKey: res.syncKey });
          setUsername('');
        } else {
          setUsername('');
          onClose();
        }
      } else {
        if (signInMethod === 'pairCode') {
          await onLoginWithPairCode(cleanUser, pairCodeInput.replace(/\D/g, '').slice(0, 6));
        } else if (signInMethod === 'syncKey') {
          await onLoginWithSyncKey(cleanUser, syncKeyInput.trim());
        } else {
          await onLoginCloudAccount(cleanUser, password);
        }
        setUsername('');
        setPassword('');
        setSyncKeyInput('');
        setPairCodeInput('');
        setIssuedSyncKeyBanner(null);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGeneratePairCode = async () => {
    setError(null);
    setDeviceActionBusy(true);
    try {
      const res = await onRequestPairCode();
      setActivePairCode(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create a device code.');
    } finally {
      setDeviceActionBusy(false);
    }
  };

  const handleRotateSyncKey = async () => {
    setError(null);
    setDeviceActionBusy(true);
    try {
      const res = await onRotateSyncKey();
      setIssuedSyncKeyBanner({ username: res.username, syncKey: res.syncKey });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not rotate Sync Key.');
    } finally {
      setDeviceActionBusy(false);
    }
  };

  const handleRecoverLegacySession = async () => {
    if (!activeProfile || !onRecoverLegacyDevice) return;
    setError(null);
    setDeviceActionBusy(true);
    try {
      const res = await onRecoverLegacyDevice(activeProfile.name, activeProfile.id);
      if (res.syncKey) {
        setIssuedSyncKeyBanner({ username: activeProfile.name, syncKey: res.syncKey });
      }
      setBackupNotice('Account reconnected — you can now generate a 6-Digit Device Code above.');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not auto-reconnect. Use Sync Key or 6-Digit Code from a signed-in device.'
      );
    } finally {
      setDeviceActionBusy(false);
    }
  };

  const handleSyncLocalNow = async () => {
    if (!activeProfile || !onSyncLocalProfileNow) return;
    setError(null);
    setDeviceActionBusy(true);
    try {
      const res = await onSyncLocalProfileNow();
      if (res.syncKey) {
        setIssuedSyncKeyBanner({ username: activeProfile.name, syncKey: res.syncKey });
      }
      setBackupNotice(`"${activeProfile.name}" is now synced to the cloud.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not sync this account to cloud.');
    } finally {
      setDeviceActionBusy(false);
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

  const canSubmit =
    !isSubmitting &&
    username.trim().length >= 2 &&
    (authTab === 'register'
      ? !useOptionalPassword || password.length >= 4
      : signInMethod === 'pairCode'
        ? pairCodeInput.replace(/\D/g, '').length === 6
        : signInMethod === 'syncKey'
          ? syncKeyInput.trim().length >= 8
          : password.length >= 4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040B]/75 p-4 backdrop-blur-md"
    >
      <div className="glass-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-cyan-200/[0.1] bg-[#040814]/65 px-6 py-4">
          <div className="min-w-0">
            <h2
              id="profile-modal-title"
              className="font-display text-lg font-semibold text-slate-100"
            >
              {activeProfile ? 'Your FocusPair Account' : 'Sign In or Create Account'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Passwordless Sync Key &amp; 6-Digit Device Code — access the same account across all your devices.
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account dialog"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-cyan-400/15 hover:text-cyan-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="quiet-scroll flex-1 overflow-y-auto p-6 pt-4">
        {/* Newly Issued Sync Key Banner (Save for any device / browser) */}
        {issuedSyncKeyBanner && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
              Save Your Personal Sync Key ({issuedSyncKeyBanner.username})
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-100/85">
              Keep this key saved in your notes or password manager. Use it with your username to sign in from any phone, tablet, or browser without a password.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300/30 bg-[#040814]/90 px-3 py-2">
              <code className="min-w-0 break-all select-all font-mono text-xs font-semibold tracking-wider text-emerald-200">
                {issuedSyncKeyBanner.syncKey}
              </code>
              <button
                type="button"
                onClick={() => copyText('syncKey', issuedSyncKeyBanner.syncKey)}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-emerald-300/35 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-400/25"
              >
                {copiedField === 'syncKey' ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy Key
                  </>
                )}
              </button>
            </div>
            {canDismiss && (
              <button
                type="button"
                onClick={() => {
                  setIssuedSyncKeyBanner(null);
                  onClose();
                }}
                className="bio-btn-primary mt-3 w-full cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold"
              >
                I Saved My Key — Continue
              </button>
            )}
          </div>
        )}

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
                      ? 'Syncing across devices...'
                      : `${activeProfile.studyCards.length} private cards synced across your devices`
                    : cloudNeedsReconnect
                      ? 'Cached locally on this device · Enter your Sync Key or 6-Digit Code below to resume cloud sync.'
                      : `${activeProfile.studyCards.length} local cards · Create an account below to sync across devices`}
                </p>
              </div>

              {isCloudSignedIn && (
                <button
                  type="button"
                  onClick={async () => {
                    await onSignOutCloudAccount();
                    setActivePairCode(null);
                    setIssuedSyncKeyBanner(null);
                    setAuthTab('login');
                  }}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-200/15 bg-cyan-400/[0.05] px-2.5 py-1.5 text-xs font-medium text-slate-300 whitespace-nowrap hover:bg-rose-500/15 hover:text-rose-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              )}
            </div>

            {/* Cross-device passwordless linking actions when signed in */}
            {isCloudSignedIn && (
              <div className="mt-3 space-y-2 border-t border-cyan-200/[0.08] pt-3">
                <p className="text-[11px] text-slate-300">
                  Syncing <strong className="text-cyan-100">{activeProfile.name}</strong> to another device? Generate a 10-minute 6-Digit Code or view/rotate your personal Sync Key — no password needed.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={deviceActionBusy}
                    onClick={handleGeneratePairCode}
                    className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Get 6-Digit Device Code
                  </button>
                  <button
                    type="button"
                    disabled={deviceActionBusy}
                    onClick={handleRotateSyncKey}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-200/20 bg-cyan-400/[0.05] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-300/35 hover:text-cyan-100 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Generate New Sync Key
                  </button>
                </div>

                {activePairCode && (
                  <div className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-cyan-100">
                        Enter on another device ({Math.floor(pairSecondsLeft / 60)}:
                        {String(pairSecondsLeft % 60).padStart(2, '0')} left)
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText('pairCode', activePairCode.pairCode)}
                        className="flex cursor-pointer items-center gap-1 rounded border border-cyan-300/35 bg-[#040814]/80 px-2 py-0.5 text-[10px] text-cyan-100"
                      >
                        {copiedField === 'pairCode' ? (
                          <>
                            <Check className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-2xl font-bold tracking-[0.25em] text-cyan-200">
                        {activePairCode.pairCode}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Name: <strong className="text-slate-200">{activePairCode.username}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Legacy account reconnect OR 1-click cloud sync for existing local profile */}
            {!isCloudSignedIn && cloudNeedsReconnect && onRecoverLegacyDevice && (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-300/35 bg-amber-400/10 p-3">
                <p className="text-[11px] leading-relaxed text-amber-100">
                  Forgot your password? Reconnect <strong className="text-white">{activeProfile.name}</strong> from this browser to get a Sync Key and 6-Digit Device Code without creating a new account.
                </p>
                <button
                  type="button"
                  disabled={deviceActionBusy}
                  onClick={handleRecoverLegacySession}
                  className="bio-btn-primary flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {deviceActionBusy
                    ? 'Reconnecting...'
                    : 'Recover Session & Get 6-Digit Code'}
                </button>
              </div>
            )}

            {!isCloudSignedIn && !activeProfile.isCloudAccount && onSyncLocalProfileNow && (
              <div className="mt-3 space-y-2 rounded-lg border border-cyan-300/30 bg-cyan-400/[0.08] p-3">
                <p className="text-[11px] leading-relaxed text-cyan-100">
                  Turn your current <strong className="text-white">{activeProfile.name}</strong> profile into a synced cloud account with all your existing data — no password needed.
                </p>
                <button
                  type="button"
                  disabled={deviceActionBusy}
                  onClick={handleSyncLocalNow}
                  className="bio-btn-primary flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  <Cloud className="h-4 w-4" />
                  {deviceActionBusy
                    ? 'Syncing Account...'
                    : `Sync "${activeProfile.name}" to Cloud (No Password)`}
                </button>
              </div>
            )}

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
              Saved profiles on this browser
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

        {/* Sign In / Create Account Form */}
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
            {authTab === 'login' && (
              <div>
                <span className="mb-1.5 block text-[11px] font-medium text-slate-400">
                  Sign in method
                </span>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-cyan-200/12 bg-[#040814]/75 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMethod('syncKey');
                      setError(null);
                    }}
                    className={`cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                      signInMethod === 'syncKey'
                        ? 'bg-cyan-400/20 text-cyan-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sync Key
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMethod('pairCode');
                      setError(null);
                    }}
                    className={`cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                      signInMethod === 'pairCode'
                        ? 'bg-cyan-400/20 text-cyan-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    6-Digit Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMethod('password');
                      setError(null);
                    }}
                    className={`cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                      signInMethod === 'password'
                        ? 'bg-cyan-400/20 text-cyan-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Password
                  </button>
                </div>
              </div>
            )}

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

            {authTab === 'register' ? (
              <div className="space-y-2.5">
                <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/[0.06] px-3 py-2 text-[11px] text-cyan-100/90">
                  No password required — creating your account instantly gives you a private Sync Key and 6-Digit Device Codes to sign in anywhere.
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={useOptionalPassword}
                    onChange={(e) => setUseOptionalPassword(e.target.checked)}
                    className="h-3.5 w-3.5 accent-cyan-400"
                  />
                  Also set an optional password
                </label>

                {useOptionalPassword && (
                  <div className="relative">
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
                )}
              </div>
            ) : signInMethod === 'syncKey' ? (
              <div>
                <label
                  htmlFor="account-synckey-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  Personal Sync Key
                </label>
                <input
                  id="account-synckey-input"
                  type="text"
                  value={syncKeyInput}
                  onChange={(e) => setSyncKeyInput(e.target.value.toUpperCase())}
                  placeholder="FP-XXXX-XXXX-XXXX-XXXX"
                  className="bio-input mt-1 w-full rounded-lg px-3.5 py-2 font-mono text-sm tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the Sync Key issued when you created your account.
                </p>
              </div>
            ) : signInMethod === 'pairCode' ? (
              <div>
                <label
                  htmlFor="account-paircode-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  6-Digit Device Link Code
                </label>
                <input
                  id="account-paircode-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pairCodeInput}
                  onChange={(e) => setPairCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="bio-input mt-1 w-full rounded-lg px-3.5 py-2 font-mono text-base tracking-[0.3em] placeholder:tracking-normal placeholder:text-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Open Account on your already signed-in device and tap &ldquo;Get 6-Digit Device Code&rdquo;.
                </p>
              </div>
            ) : (
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
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="bio-btn-primary flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting
                ? 'Please wait...'
                : authTab === 'register'
                  ? 'Create Passwordless Account & Sync'
                  : 'Sign In & Sync My Data'}
            </button>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
