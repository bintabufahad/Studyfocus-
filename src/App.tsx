import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompanionStage } from './components/CompanionStage';
import { CoStudyRoomPanel, fallbackCopyText } from './components/CoStudyRoomPanel';
import { DailyGoalFloatingWidget } from './components/DailyGoalFloatingWidget';
import { GoalsView } from './components/GoalsView';
import { HistoryDashboardView } from './components/HistoryDashboardView';
import { ParticleBackground } from './components/ParticleBackground';
import { ProfileOnboardingModal } from './components/ProfileOnboardingModal';
import { SessionTimerBar } from './components/SessionTimerBar';
import { StudySessionsHub } from './components/StudySessionsHub';
import { TodoPanel } from './components/TodoPanel';
import { TopBar } from './components/TopBar';
import { VideoPlaylistPanel } from './components/VideoPlaylistPanel';
import { useLiveVoice, type LiveToolAction } from './hooks/useLiveVoice';
import { useStudyRoom } from './hooks/useStudyRoom';
import type {
  AppView,
  CompanionPose,
  DailyPlanRecord,
  GamificationStats,
  GoalPlan,
  PlaylistItem,
  SessionLog,
  SprintPhase,
  StudySessionCard,
  TaskAction,
  TaskItem,
  TimerControlAction,
  TimerSettings,
  UserProfile,
  WorkspacePanelMode,
} from './types';
import {
  createDefaultDailyPlan,
  createNewProfile,
  createStudyCard,
  DEFAULT_GAMIFICATION_STATS,
  DEFAULT_TIMER_SETTINGS,
  fetchCurrentAccount,
  loadActiveProfileId,
  loadAuthToken,
  loadProfiles,
  loadTimerSnapshot,
  loginAccount,
  normalizeStudyCards,
  registerAccount,
  rolloverExpiredDailyPlan,
  saveActiveProfileId,
  saveAuthToken,
  saveProfiles,
  saveTimerSnapshot,
  syncAccountCards,
  toLocalDateKey,
} from './utils/profileStorage';
import { applyGoalCompletionReward } from './utils/goalRewards';
import { playCueSound } from './utils/soundCues';

function makeId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSessionOpeningQuestion(name: string, cardTitle: string, hasTasks: boolean): string {
  if (hasTasks) {
    return `Hey ${name}, welcome back to ${cardTitle}. Tap Talk Live or start a timer whenever you're ready.`;
  }
  return `Hey ${name}! What are we working on in ${cardTitle}? Tap Talk Live to tell me, or add tasks on the right.`;
}

function parseInitialRoomInvite(): { roomId: string; title: string } | null {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?'))
      : '';
    const hashParams = new URLSearchParams(hashQuery);
    const room = (searchParams.get('room') ?? hashParams.get('room') ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 64);
    if (!room) return null;
    const title =
      (searchParams.get('title') ?? hashParams.get('title') ?? '').trim() ||
      'Co-Study Session';
    return { roomId: room, title };
  } catch {
    return null;
  }
}

function parseRoomInviteInput(raw: string): { roomId: string; title?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('room=')) {
    try {
      const url = new URL(trimmed, window.location.origin);
      const room = url.searchParams.get('room')?.trim().toLowerCase().slice(0, 64);
      const title = url.searchParams.get('title')?.trim() || undefined;
      if (room) return { roomId: room, title };
    } catch {
      const match = trimmed.match(/[?&#]room=([^&#]+)/i);
      if (match?.[1]) {
        return { roomId: decodeURIComponent(match[1]).trim().toLowerCase().slice(0, 64) };
      }
    }
  }

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64);
  return normalized ? { roomId: normalized } : null;
}

type StagedVoiceStart = {
  timer: 'focus' | 'break' | 'checkin';
  minutes?: number;
};

export default function App() {
  const initialInviteRef = useRef(parseInitialRoomInvite());
  const [clientId] = useState(() => makeId('peer'));

  const [profiles, setProfiles] = useState<UserProfile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const loaded = loadProfiles();
    if (loaded.length === 0) return null;
    const savedId = loadActiveProfileId();
    if (savedId && loaded.some((p) => p.id === savedId)) return savedId;
    return loaded[0].id;
  });
  const [authToken, setAuthToken] = useState<string | null>(() => loadAuthToken());
  const [isSyncingAccount, setIsSyncingAccount] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(
    () => loadProfiles().length === 0 && !loadAuthToken()
  );

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const profileName = activeProfile?.name ?? 'Guest';
  const studyCards = activeProfile?.studyCards ?? [];
  const goals = activeProfile?.goals ?? [];
  const activeDailyPlan = useMemo(
    () => activeProfile?.activeDailyPlan ?? createDefaultDailyPlan(),
    [activeProfile?.activeDailyPlan]
  );
  const dailyHistory = useMemo(
    () => activeProfile?.dailyHistory ?? [],
    [activeProfile?.dailyHistory]
  );
  const gamification = activeProfile?.gamification ?? DEFAULT_GAMIFICATION_STATS;

  const [activeView, setActiveView] = useState<AppView>('hub');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<WorkspacePanelMode>('focus');

  const [roomId, setRoomId] = useState<string | null>(
    () => initialInviteRef.current?.roomId ?? null
  );
  const [publicBaseUrl, setPublicBaseUrl] = useState<string | null>(null);
  const [watchTogether, setWatchTogether] = useState(true);

  const activeCard = useMemo(
    () => studyCards.find((c) => c.id === activeCardId) ?? null,
    [activeCardId, studyCards]
  );

  const shareUrl = useMemo(() => {
    if (!roomId) return null;
    const base = publicBaseUrl ?? window.location.origin;
    return `${base}/?room=${encodeURIComponent(roomId)}&title=${encodeURIComponent(
      activeCard?.title ?? 'Co-Study Session'
    )}`;
  }, [activeCard?.title, publicBaseUrl, roomId]);

  const timerSettings = activeCard?.timerSettings ?? DEFAULT_TIMER_SETTINGS;
  const tasks = activeCard?.tasks ?? [];
  const playlist = activeCard?.playlist ?? [];

  const totalLogsCount = useMemo(
    () => studyCards.reduce((sum, c) => sum + c.sessionLogs.length, 0),
    [studyCards]
  );

  const [pose, setPose] = useState<CompanionPose>('coffee');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [breakingDownTaskId, setBreakingDownTaskId] = useState<string | null>(null);

  const [companionCaption, setCompanionCaption] = useState<string>(
    `Hey ${activeProfile?.name ?? 'there'} — ready whenever you open a study card.`
  );
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState(false);
  const speechSimTimerRef = useRef<number | null>(null);

  // 1. Focus Timer State (wall-clock anchored)
  const [isFocusRunning, setIsFocusRunning] = useState(false);
  const [focusRemainingSeconds, setFocusRemainingSeconds] = useState(
    () => DEFAULT_TIMER_SETTINGS.workMinutes * 60
  );
  const focusEndAtRef = useRef<number | null>(null);
  const focusReminderFiredRef = useRef<boolean>(false);

  // 2. Break Timer State (wall-clock anchored; starting Break auto-stops Focus & Check-in)
  const [isBreakRunning, setIsBreakRunning] = useState(false);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(
    () => DEFAULT_TIMER_SETTINGS.breakMinutes * 60
  );
  const breakEndAtRef = useRef<number | null>(null);
  const breakReminderFiredRef = useRef<boolean>(false);

  // 3. Check-In Timer State (OFF by default until user explicitly grants permission / starts)
  const [isCheckInRunning, setIsCheckInRunning] = useState(false);
  const [isCheckInStaged, setIsCheckInStaged] = useState(false);
  const [secondsUntilAlert, setSecondsUntilAlert] = useState(
    () => DEFAULT_TIMER_SETTINGS.checkInMinutes * 60
  );
  const nextAlertAtRef = useRef<number | null>(null);

  // Cumulative focus session elapsed tracker
  const [elapsedSessionSeconds, setElapsedSessionSeconds] = useState(0);
  const elapsedBaseRef = useRef<number>(0);
  const runningSinceRef = useRef<number | null>(null);

  const [activeAlertBanner, setActiveAlertBanner] = useState<{
    kind: 'sprint_end' | 'break_end' | 'reminder' | 'checkin';
    title: string;
    message: string;
  } | null>(null);
  const [isLoadingCheckIn, setIsLoadingCheckIn] = useState(false);

  // Live Voice Transcripts + Speak-Before-Timer-Starts Queue
  const [liveDraftUserText, setLiveDraftUserText] = useState('');
  const [liveDraftAssistantText, setLiveDraftAssistantText] = useState('');
  const liveUserBufRef = useRef('');
  const liveAssistantBufRef = useRef('');
  const sessionStartTimeRef = useRef<number>(Date.now());
  const stagedVoiceStartsRef = useRef<StagedVoiceStart[]>([]);
  const stagedSafetyTimerRef = useRef<number | null>(null);
  const turnCompleteAwaitingAudioRef = useRef(false);

  // Always-fresh refs for timers & callbacks
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const activeCardRef = useRef(activeCard);
  activeCardRef.current = activeCard;
  const activeTaskIdRef = useRef(activeTaskId);
  activeTaskIdRef.current = activeTaskId;
  const elapsedSecondsRef = useRef(elapsedSessionSeconds);
  elapsedSecondsRef.current = elapsedSessionSeconds;
  const timerSettingsRef = useRef(timerSettings);
  timerSettingsRef.current = timerSettings;
  const profileNameRef = useRef(profileName);
  profileNameRef.current = profileName;
  const isFocusRunningRef = useRef(isFocusRunning);
  isFocusRunningRef.current = isFocusRunning;
  const focusRemainingRef = useRef(focusRemainingSeconds);
  focusRemainingRef.current = focusRemainingSeconds;
  const isBreakRunningRef = useRef(isBreakRunning);
  isBreakRunningRef.current = isBreakRunning;
  const breakRemainingRef = useRef(breakRemainingSeconds);
  breakRemainingRef.current = breakRemainingSeconds;
  const isCheckInRunningRef = useRef(isCheckInRunning);
  isCheckInRunningRef.current = isCheckInRunning;
  const secondsUntilAlertRef = useRef(secondsUntilAlert);
  secondsUntilAlertRef.current = secondsUntilAlert;

  const suppressNextCloudPushRef = useRef(false);
  const hasUnsyncedCloudRef = useRef(false);
  const lastCloudUpdatedAtRef = useRef<number>(0);

  const triggerSimulatedSpeech = useCallback((durationMs = 2400) => {
    if (speechSimTimerRef.current) {
      window.clearTimeout(speechSimTimerRef.current);
    }
    setIsSimulatingSpeech(true);
    speechSimTimerRef.current = window.setTimeout(() => {
      setIsSimulatingSpeech(false);
    }, durationMs);
  }, []);

  useEffect(() => {
    saveProfiles(profiles);
  }, [profiles]);

  useEffect(() => {
    saveActiveProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    saveAuthToken(authToken);
  }, [authToken]);

  const pullCloudAccount = useCallback(
    async (token: string, forceReplace = false) => {
      const account = await fetchCurrentAccount(token);
      if (!account) {
        if (forceReplace) {
          setAuthToken(null);
          setIsProfileModalOpen(true);
        }
        return;
      }

      if (!forceReplace && hasUnsyncedCloudRef.current) return;
      if (!forceReplace && account.updatedAt <= lastCloudUpdatedAtRef.current) return;

      lastCloudUpdatedAtRef.current = account.updatedAt;
      suppressNextCloudPushRef.current = true;

      setProfiles((prev) => {
        const localGuests = prev.filter((p) => !p.isCloudAccount && p.id !== account.id);
        const cloudProfile: UserProfile = {
          id: account.id,
          name: account.username,
          createdAt: account.createdAt,
          studyCards: account.studyCards,
          goals: account.goals ?? [],
          activeDailyPlan: account.activeDailyPlan ?? createDefaultDailyPlan(),
          dailyHistory: account.dailyHistory ?? [],
          gamification: account.gamification ?? DEFAULT_GAMIFICATION_STATS,
          isCloudAccount: true,
        };
        return [cloudProfile, ...localGuests];
      });
      setActiveProfileId(account.id);
      if (forceReplace) {
        setIsProfileModalOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!authToken) return;
    void pullCloudAccount(authToken, true);
  }, [authToken, pullCloudAccount]);

  const cloudSyncCards = activeProfile?.isCloudAccount ? activeProfile.studyCards : null;
  const cloudSyncGoals = activeProfile?.isCloudAccount ? activeProfile.goals ?? [] : null;
  const cloudSyncDaily = activeProfile?.isCloudAccount ? activeProfile.activeDailyPlan : null;
  const cloudSyncDailyHistory = activeProfile?.isCloudAccount
    ? activeProfile.dailyHistory ?? []
    : null;
  const cloudSyncGamification = activeProfile?.isCloudAccount
    ? activeProfile.gamification ?? DEFAULT_GAMIFICATION_STATS
    : null;
  useEffect(() => {
    if (!authToken || !cloudSyncCards) return;
    if (suppressNextCloudPushRef.current) {
      suppressNextCloudPushRef.current = false;
      return;
    }

    hasUnsyncedCloudRef.current = true;
    const timer = window.setTimeout(async () => {
      setIsSyncingAccount(true);
      const ok = await syncAccountCards(
        authToken,
        cloudSyncCards,
        false,
        cloudSyncGoals ?? undefined,
        cloudSyncGamification ?? undefined,
        cloudSyncDaily ?? undefined,
        cloudSyncDailyHistory ?? undefined
      );
      if (ok) {
        hasUnsyncedCloudRef.current = false;
        lastCloudUpdatedAtRef.current = Date.now();
      }
      setIsSyncingAccount(false);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    authToken,
    cloudSyncCards,
    cloudSyncDaily,
    cloudSyncDailyHistory,
    cloudSyncGamification,
    cloudSyncGoals,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      if (authToken && activeProfile?.isCloudAccount && hasUnsyncedCloudRef.current) {
        void syncAccountCards(
          authToken,
          activeProfile.studyCards,
          true,
          activeProfile.goals ?? [],
          activeProfile.gamification ?? DEFAULT_GAMIFICATION_STATS,
          activeProfile.activeDailyPlan,
          activeProfile.dailyHistory ?? []
        );
      }
    };
    const handleFocusRefresh = () => {
      if (authToken && !document.hidden) {
        void pullCloudAccount(authToken, false);
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('focus', handleFocusRefresh);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('focus', handleFocusRefresh);
    };
  }, [activeProfile, authToken, pullCloudAccount]);

  // Automatic Midnight / Day-Change Rollover for Daily Goals
  useEffect(() => {
    const checkDayRollover = () => {
      const todayKey = toLocalDateKey(Date.now());
      setProfiles((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          if (p.activeDailyPlan && p.activeDailyPlan.dateKey === todayKey) return p;
          const rolled = rolloverExpiredDailyPlan(p.activeDailyPlan, p.dailyHistory, todayKey);
          if (!rolled.didRollover && p.activeDailyPlan) return p;
          changed = true;
          return {
            ...p,
            activeDailyPlan: rolled.activeDailyPlan,
            dailyHistory: rolled.dailyHistory,
          };
        });
        return changed ? next : prev;
      });
    };

    checkDayRollover();
    const id = window.setInterval(checkDayRollover, 60_000);
    window.addEventListener('focus', checkDayRollover);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', checkDayRollover);
    };
  }, []);

  useEffect(() => {
    fetch('/api/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { appUrl?: string | null } | null) => {
        if (data?.appUrl) {
          setPublicBaseUrl(data.appUrl);
        }
      })
      .catch(() => {
        // Fallback to window.location.origin
      });
  }, []);

  const updateActiveProfile = useCallback(
    (updater: (profile: UserProfile) => UserProfile) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === activeProfileId ? updater(p) : p))
      );
    },
    [activeProfileId]
  );

  const updateActiveCard = useCallback(
    (updater: (card: StudySessionCard) => StudySessionCard) => {
      if (!activeCardId) return;
      updateActiveProfile((profile) => ({
        ...profile,
        studyCards: profile.studyCards.map((c) =>
          c.id === activeCardId ? updater(c) : c
        ),
      }));
    },
    [activeCardId, updateActiveProfile]
  );

  const persistActiveTimerSnapshot = useCallback(
    (overrides?: {
      cardId?: string | null;
      isFocusRunning?: boolean;
      focusEndAt?: number | null;
      focusRemainingSeconds?: number;
      isBreakRunning?: boolean;
      breakEndAt?: number | null;
      breakRemainingSeconds?: number;
      isCheckInRunning?: boolean;
      checkInEndAt?: number | null;
      checkInRemainingSeconds?: number;
      elapsedSessionSeconds?: number;
      checkInMinutes?: number;
    }) => {
      const targetCardId =
        overrides?.cardId !== undefined ? overrides.cardId : activeCardRef.current?.id ?? null;
      if (!activeProfileId || !targetCardId) {
        saveTimerSnapshot(null);
        return;
      }
      saveTimerSnapshot({
        profileId: activeProfileId,
        cardId: targetCardId,
        isFocusRunning: overrides?.isFocusRunning ?? isFocusRunningRef.current,
        focusEndAt:
          overrides?.focusEndAt !== undefined ? overrides.focusEndAt : focusEndAtRef.current,
        focusRemainingSeconds:
          overrides?.focusRemainingSeconds ?? focusRemainingRef.current,
        isBreakRunning: overrides?.isBreakRunning ?? isBreakRunningRef.current,
        breakEndAt:
          overrides?.breakEndAt !== undefined ? overrides.breakEndAt : breakEndAtRef.current,
        breakRemainingSeconds:
          overrides?.breakRemainingSeconds ?? breakRemainingRef.current,
        isCheckInRunning: overrides?.isCheckInRunning ?? isCheckInRunningRef.current,
        checkInEndAt:
          overrides?.checkInEndAt !== undefined ? overrides.checkInEndAt : nextAlertAtRef.current,
        checkInRemainingSeconds:
          overrides?.checkInRemainingSeconds ?? secondsUntilAlertRef.current,
        elapsedSessionSeconds:
          overrides?.elapsedSessionSeconds ?? elapsedSecondsRef.current,
        checkInMinutes:
          overrides?.checkInMinutes ?? timerSettingsRef.current.checkInMinutes,
        updatedAt: Date.now(),
      });
    },
    [activeProfileId]
  );

  // Unified Three-Timer Control (Enforces: Starting Break stops Focus + Check-in; Starting Focus stops Break)
  const executeTimerAction = useCallback(
    (act: TimerControlAction) => {
      const now = Date.now();
      const clampedMins =
        typeof act.minutes === 'number' && Number.isFinite(act.minutes) && act.minutes > 0
          ? Math.max(1, Math.min(180, Math.round(act.minutes)))
          : undefined;

      if (act.timer === 'focus') {
        const targetMins = clampedMins ?? timerSettingsRef.current.workMinutes;
        if (clampedMins !== undefined) {
          updateActiveCard((c) => ({
            ...c,
            timerSettings: { ...c.timerSettings, workMinutes: clampedMins },
          }));
        }

        if (act.action === 'start') {
          // Stop Break if running
          if (isBreakRunningRef.current) {
            const breakRem = breakEndAtRef.current
              ? Math.max(0, Math.ceil((breakEndAtRef.current - now) / 1000))
              : breakRemainingRef.current;
            breakEndAtRef.current = null;
            setIsBreakRunning(false);
            setBreakRemainingSeconds(breakRem);
          }

          if (elapsedSecondsRef.current === 0) {
            sessionStartTimeRef.current = now;
          }
          const startSec =
            clampedMins !== undefined
              ? targetMins * 60
              : focusRemainingRef.current > 0
                ? focusRemainingRef.current
                : targetMins * 60;
          const endAt = now + startSec * 1000;
          focusEndAtRef.current = endAt;
          elapsedBaseRef.current = elapsedSecondsRef.current;
          runningSinceRef.current = now;
          focusReminderFiredRef.current = false;
          setFocusRemainingSeconds(startSec);
          setIsFocusRunning(true);
          setPose('typing');
          setCompanionCaption((caption) =>
            caption.includes('What are we working on')
              ? "Focus started — I'm studying quietly beside you."
              : caption
          );
          persistActiveTimerSnapshot({
            isFocusRunning: true,
            focusEndAt: endAt,
            focusRemainingSeconds: startSec,
            isBreakRunning: false,
            breakEndAt: null,
          });
        } else if (act.action === 'pause' || act.action === 'stop') {
          const rem = focusEndAtRef.current
            ? Math.max(0, Math.ceil((focusEndAtRef.current - now) / 1000))
            : focusRemainingRef.current;
          const totalElapsed = runningSinceRef.current
            ? elapsedBaseRef.current + Math.max(0, Math.floor((now - runningSinceRef.current) / 1000))
            : elapsedSecondsRef.current;
          focusEndAtRef.current = null;
          runningSinceRef.current = null;
          elapsedBaseRef.current = totalElapsed;
          setIsFocusRunning(false);
          setFocusRemainingSeconds(act.action === 'stop' ? targetMins * 60 : rem);
          setElapsedSessionSeconds(totalElapsed);
          setPose('coffee');
          persistActiveTimerSnapshot({
            isFocusRunning: false,
            focusEndAt: null,
            focusRemainingSeconds: act.action === 'stop' ? targetMins * 60 : rem,
            elapsedSessionSeconds: totalElapsed,
          });
        } else if (act.action === 'reset') {
          const resetSec = targetMins * 60;
          focusEndAtRef.current = null;
          runningSinceRef.current = null;
          focusReminderFiredRef.current = false;
          setIsFocusRunning(false);
          setFocusRemainingSeconds(resetSec);
          setPose('coffee');
          persistActiveTimerSnapshot({
            isFocusRunning: false,
            focusEndAt: null,
            focusRemainingSeconds: resetSec,
          });
        }
        return;
      }

      if (act.timer === 'break') {
        const targetMins = clampedMins ?? timerSettingsRef.current.breakMinutes;
        if (clampedMins !== undefined) {
          updateActiveCard((c) => ({
            ...c,
            timerSettings: { ...c.timerSettings, breakMinutes: clampedMins },
          }));
        }

        if (act.action === 'start') {
          // Rule: Starting Break automatically stops Focus AND Check-in
          const focusRem = focusEndAtRef.current
            ? Math.max(0, Math.ceil((focusEndAtRef.current - now) / 1000))
            : focusRemainingRef.current;
          const totalElapsed = runningSinceRef.current
            ? elapsedBaseRef.current + Math.max(0, Math.floor((now - runningSinceRef.current) / 1000))
            : elapsedSecondsRef.current;

          focusEndAtRef.current = null;
          runningSinceRef.current = null;
          elapsedBaseRef.current = totalElapsed;
          setIsFocusRunning(false);
          setFocusRemainingSeconds(focusRem);
          setElapsedSessionSeconds(totalElapsed);

          // Also stop Check-in timer cleanly
          stagedVoiceStartsRef.current = stagedVoiceStartsRef.current.filter(
            (s) => s.timer !== 'checkin'
          );
          setIsCheckInStaged(false);
          nextAlertAtRef.current = null;
          setIsCheckInRunning(false);

          const startSec =
            clampedMins !== undefined
              ? targetMins * 60
              : breakRemainingRef.current > 0
                ? breakRemainingRef.current
                : targetMins * 60;
          const endAt = now + startSec * 1000;
          breakEndAtRef.current = endAt;
          breakReminderFiredRef.current = false;
          setBreakRemainingSeconds(startSec);
          setIsBreakRunning(true);
          setPose('coffee');
          persistActiveTimerSnapshot({
            isFocusRunning: false,
            focusEndAt: null,
            focusRemainingSeconds: focusRem,
            isBreakRunning: true,
            breakEndAt: endAt,
            breakRemainingSeconds: startSec,
            isCheckInRunning: false,
            checkInEndAt: null,
            elapsedSessionSeconds: totalElapsed,
          });
        } else if (act.action === 'pause' || act.action === 'stop') {
          const rem = breakEndAtRef.current
            ? Math.max(0, Math.ceil((breakEndAtRef.current - now) / 1000))
            : breakRemainingRef.current;
          breakEndAtRef.current = null;
          setIsBreakRunning(false);
          setBreakRemainingSeconds(act.action === 'stop' ? targetMins * 60 : rem);
          persistActiveTimerSnapshot({
            isBreakRunning: false,
            breakEndAt: null,
            breakRemainingSeconds: act.action === 'stop' ? targetMins * 60 : rem,
          });
        } else if (act.action === 'reset') {
          const resetSec = targetMins * 60;
          breakEndAtRef.current = null;
          breakReminderFiredRef.current = false;
          setIsBreakRunning(false);
          setBreakRemainingSeconds(resetSec);
          persistActiveTimerSnapshot({
            isBreakRunning: false,
            breakEndAt: null,
            breakRemainingSeconds: resetSec,
          });
        }
        return;
      }

      if (act.timer === 'checkin') {
        const targetMins = clampedMins ?? timerSettingsRef.current.checkInMinutes;
        if (clampedMins !== undefined) {
          updateActiveCard((c) => ({
            ...c,
            timerSettings: { ...c.timerSettings, checkInMinutes: clampedMins },
          }));
        }

        if (act.action === 'start') {
          // If Break is currently running and user explicitly starts Check-in, keep behavior crisp
          const nextTarget = now + targetMins * 60_000;
          nextAlertAtRef.current = nextTarget;
          setSecondsUntilAlert(targetMins * 60);
          setIsCheckInRunning(true);
          setIsCheckInStaged(false);
          persistActiveTimerSnapshot({
            isCheckInRunning: true,
            checkInEndAt: nextTarget,
            checkInRemainingSeconds: targetMins * 60,
            checkInMinutes: targetMins,
          });
        } else {
          // pause / stop / reset -> stop check-in cleanly
          stagedVoiceStartsRef.current = stagedVoiceStartsRef.current.filter(
            (s) => s.timer !== 'checkin'
          );
          setIsCheckInStaged(false);
          nextAlertAtRef.current = null;
          setIsCheckInRunning(false);
          setSecondsUntilAlert(targetMins * 60);
          persistActiveTimerSnapshot({
            isCheckInRunning: false,
            checkInEndAt: null,
            checkInRemainingSeconds: targetMins * 60,
            checkInMinutes: targetMins,
          });
        }
      }
    },
    [persistActiveTimerSnapshot, updateActiveCard]
  );

  const flushStagedVoiceStarts = useCallback(() => {
    if (stagedSafetyTimerRef.current) {
      window.clearTimeout(stagedSafetyTimerRef.current);
      stagedSafetyTimerRef.current = null;
    }
    const pending = stagedVoiceStartsRef.current;
    if (pending.length === 0) return;
    stagedVoiceStartsRef.current = [];
    setIsCheckInStaged(false);
    for (const item of pending) {
      executeTimerAction({ timer: item.timer, action: 'start', minutes: item.minutes });
    }
  }, [executeTimerAction]);

  // Stage a voice-initiated timer start so Sora finishes speaking ("Now your check-in starts") BEFORE the clock starts ticking
  const stageVoiceTimerStart = useCallback(
    (timer: 'focus' | 'break' | 'checkin', minutes?: number) => {
      const clampedMins =
        typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
          ? Math.max(1, Math.min(180, Math.round(minutes)))
          : undefined;

      // Update displayed duration immediately while waiting for Sora's sentence to finish
      if (clampedMins !== undefined) {
        updateActiveCard((c) => ({
          ...c,
          timerSettings: {
            ...c.timerSettings,
            ...(timer === 'focus'
              ? { workMinutes: clampedMins }
              : timer === 'break'
                ? { breakMinutes: clampedMins }
                : { checkInMinutes: clampedMins }),
          },
        }));
        if (timer === 'focus') setFocusRemainingSeconds(clampedMins * 60);
        if (timer === 'break') setBreakRemainingSeconds(clampedMins * 60);
        if (timer === 'checkin') setSecondsUntilAlert(clampedMins * 60);
      }

      // Immediately stop conflicting timers when Break is requested
      if (timer === 'break') {
        executeTimerAction({ timer: 'focus', action: 'pause' });
        executeTimerAction({ timer: 'checkin', action: 'stop' });
      } else if (timer === 'focus') {
        executeTimerAction({ timer: 'break', action: 'pause' });
      }

      if (timer === 'checkin') {
        setIsCheckInStaged(true);
      }

      // Replace any previous staged start for the same timer
      stagedVoiceStartsRef.current = [
        ...stagedVoiceStartsRef.current.filter((s) => s.timer !== timer),
        { timer, minutes: clampedMins },
      ];

      if (stagedSafetyTimerRef.current) {
        window.clearTimeout(stagedSafetyTimerRef.current);
      }
      stagedSafetyTimerRef.current = window.setTimeout(() => {
        flushStagedVoiceStarts();
      }, 3600);
    },
    [executeTimerAction, flushStagedVoiceStarts, updateActiveCard]
  );

  const openStudyCard = useCallback(
    (card: StudySessionCard) => {
      if (activeCardRef.current?.id === card.id) {
        setActiveView('workspace');
        return;
      }

      setActiveCardId(card.id);
      setActiveView('workspace');
      setPanelMode('focus');
      setActiveTaskId(card.tasks.find((t) => !t.completed)?.id ?? null);
      setActiveAlertBanner(null);
      stagedVoiceStartsRef.current = [];
      setIsCheckInStaged(false);

      const snap = loadTimerSnapshot();
      if (snap && snap.cardId === card.id && snap.profileId === activeProfileId) {
        const now = Date.now();

        let restFocusRun = snap.isFocusRunning;
        let restFocusRem = snap.focusRemainingSeconds;
        let restFocusEnd = snap.focusEndAt;
        if (restFocusRun && restFocusEnd) {
          const left = Math.ceil((restFocusEnd - now) / 1000);
          if (left > 0) restFocusRem = left;
          else {
            restFocusRun = false;
            restFocusEnd = null;
            restFocusRem = card.timerSettings.workMinutes * 60;
          }
        }

        let restBreakRun = snap.isBreakRunning;
        let restBreakRem = snap.breakRemainingSeconds;
        let restBreakEnd = snap.breakEndAt;
        if (restBreakRun && restBreakEnd) {
          const left = Math.ceil((restBreakEnd - now) / 1000);
          if (left > 0) restBreakRem = left;
          else {
            restBreakRun = false;
            restBreakEnd = null;
            restBreakRem = card.timerSettings.breakMinutes * 60;
          }
        }

        const restCheckInRun = Boolean(snap.isCheckInRunning) && !restBreakRun;
        let restCheckInEnd = snap.checkInEndAt;
        const intervalMs = Math.max(1, card.timerSettings.checkInMinutes) * 60_000;
        if (restCheckInRun) {
          if (!restCheckInEnd || restCheckInEnd <= now) {
            restCheckInEnd = now + intervalMs;
          }
        } else {
          restCheckInEnd = null;
        }

        setIsFocusRunning(restFocusRun);
        setFocusRemainingSeconds(restFocusRem);
        focusEndAtRef.current = restFocusEnd;

        setIsBreakRunning(restBreakRun);
        setBreakRemainingSeconds(restBreakRem);
        breakEndAtRef.current = restBreakEnd;

        setIsCheckInRunning(restCheckInRun);
        nextAlertAtRef.current = restCheckInEnd;
        setSecondsUntilAlert(
          restCheckInEnd
            ? Math.max(1, Math.ceil((restCheckInEnd - now) / 1000))
            : card.timerSettings.checkInMinutes * 60
        );

        const added =
          restFocusRun && snap.updatedAt
            ? Math.max(0, Math.floor((now - snap.updatedAt) / 1000))
            : 0;
        const nextElapsed = snap.elapsedSessionSeconds + added;
        setElapsedSessionSeconds(nextElapsed);
        elapsedBaseRef.current = nextElapsed;
        runningSinceRef.current = restFocusRun ? now : null;
        focusReminderFiredRef.current = false;
        breakReminderFiredRef.current = false;

        setPose(restFocusRun ? 'typing' : 'coffee');
        setCompanionCaption(
          restFocusRun || restBreakRun
            ? `Welcome back to ${card.title} — your timer kept running.`
            : buildSessionOpeningQuestion(profileNameRef.current, card.title, card.tasks.length > 0)
        );
      } else {
        // Fresh card open: ALL three timers start OFF (Check-in NEVER auto-starts without permission!)
        setIsFocusRunning(false);
        focusEndAtRef.current = null;
        setFocusRemainingSeconds(card.timerSettings.workMinutes * 60);

        setIsBreakRunning(false);
        breakEndAtRef.current = null;
        setBreakRemainingSeconds(card.timerSettings.breakMinutes * 60);

        setIsCheckInRunning(false);
        nextAlertAtRef.current = null;
        setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

        runningSinceRef.current = null;
        elapsedBaseRef.current = 0;
        focusReminderFiredRef.current = false;
        breakReminderFiredRef.current = false;
        setElapsedSessionSeconds(0);
        setPose('speaking');
        sessionStartTimeRef.current = Date.now();

        const opening = buildSessionOpeningQuestion(
          profileNameRef.current,
          card.title,
          card.tasks.length > 0
        );
        setCompanionCaption(opening);
        triggerSimulatedSpeech(2400);
        persistActiveTimerSnapshot({
          cardId: card.id,
          isFocusRunning: false,
          focusEndAt: null,
          focusRemainingSeconds: card.timerSettings.workMinutes * 60,
          isBreakRunning: false,
          breakEndAt: null,
          breakRemainingSeconds: card.timerSettings.breakMinutes * 60,
          isCheckInRunning: false,
          checkInEndAt: null,
          checkInRemainingSeconds: card.timerSettings.checkInMinutes * 60,
          elapsedSessionSeconds: 0,
          checkInMinutes: card.timerSettings.checkInMinutes,
        });
      }

      updateActiveProfile((profile) => ({
        ...profile,
        studyCards: profile.studyCards.map((c) =>
          c.id === card.id ? { ...c, lastOpenedAt: Date.now() } : c
        ),
      }));
    },
    [activeProfileId, persistActiveTimerSnapshot, triggerSimulatedSpeech, updateActiveProfile]
  );

  // Auto-open a private Study Card when arriving via a friend's shared ?room=... invite link
  useEffect(() => {
    const invite = initialInviteRef.current;
    if (!invite || !activeProfile) return;
    initialInviteRef.current = null;

    const existing = activeProfile.studyCards.find(
      (c) => c.title.toLowerCase() === invite.title.toLowerCase()
    );
    if (existing) {
      openStudyCard(existing);
      return;
    }

    const newCard = createStudyCard(invite.title, 'amber');
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeProfile.id
          ? { ...p, studyCards: [newCard, ...p.studyCards] }
          : p
      )
    );
    setActiveCardId(newCard.id);
    setActiveView('workspace');
    setPanelMode('focus');
    setIsFocusRunning(false);
    setIsBreakRunning(false);
    setIsCheckInRunning(false);
    focusEndAtRef.current = null;
    breakEndAtRef.current = null;
    nextAlertAtRef.current = null;
    runningSinceRef.current = null;
    elapsedBaseRef.current = 0;
    setFocusRemainingSeconds(newCard.timerSettings.workMinutes * 60);
    setBreakRemainingSeconds(newCard.timerSettings.breakMinutes * 60);
    setSecondsUntilAlert(newCard.timerSettings.checkInMinutes * 60);
    const msg = buildSessionOpeningQuestion(activeProfile.name, newCard.title, false);
    setCompanionCaption(msg);
    triggerSimulatedSpeech(2400);
  }, [activeProfile, openStudyCard, triggerSimulatedSpeech]);

  const studyRoom = useStudyRoom({
    roomId,
    clientId,
    userName: profileName,
    initialMode: panelMode,
    initialFocusing: isFocusRunning,
    onRemoteVideoSync: (state) => {
      if (watchTogether && state.updatedBy !== clientId) {
        setPanelMode('video');
      }
    },
  });

  const { sendPresence } = studyRoom;
  useEffect(() => {
    if (!roomId) return;
    sendPresence(panelMode, isFocusRunning);
  }, [isFocusRunning, panelMode, roomId, sendPresence]);

  const handleRegisterCloudAccount = async (username: string, password: string) => {
    const starterCards =
      activeProfile && !activeProfile.isCloudAccount ? activeProfile.studyCards : [];
    const starterGoals =
      activeProfile && !activeProfile.isCloudAccount ? activeProfile.goals ?? [] : [];
    const starterGamification =
      activeProfile && !activeProfile.isCloudAccount
        ? activeProfile.gamification ?? DEFAULT_GAMIFICATION_STATS
        : DEFAULT_GAMIFICATION_STATS;
    const starterDailyPlan =
      activeProfile && !activeProfile.isCloudAccount
        ? activeProfile.activeDailyPlan
        : createDefaultDailyPlan();
    const starterDailyHistory =
      activeProfile && !activeProfile.isCloudAccount ? activeProfile.dailyHistory ?? [] : [];

    const { token, account } = await registerAccount(
      username,
      password,
      starterCards,
      starterGoals,
      starterGamification,
      starterDailyPlan,
      starterDailyHistory
    );
    if (token) setAuthToken(token);
    lastCloudUpdatedAtRef.current = account.updatedAt;
    suppressNextCloudPushRef.current = true;

    const cloudProfile: UserProfile = {
      id: account.id,
      name: account.username,
      createdAt: account.createdAt,
      studyCards: account.studyCards,
      goals: account.goals ?? [],
      activeDailyPlan: account.activeDailyPlan ?? createDefaultDailyPlan(),
      dailyHistory: account.dailyHistory ?? [],
      gamification: account.gamification ?? DEFAULT_GAMIFICATION_STATS,
      isCloudAccount: true,
    };
    setProfiles((prev) => [
      cloudProfile,
      ...prev.filter((p) => !p.isCloudAccount && p.id !== account.id),
    ]);
    setActiveProfileId(account.id);
    setActiveCardId(null);
    focusEndAtRef.current = null;
    breakEndAtRef.current = null;
    nextAlertAtRef.current = null;
    saveTimerSnapshot(null);
    setActiveView(initialInviteRef.current ? 'workspace' : 'hub');
    setIsFocusRunning(false);
    setIsBreakRunning(false);
    setIsCheckInRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
    setCompanionCaption(`Hey ${account.username} — your account is ready and synced.`);
  };

  const handleLoginCloudAccount = async (username: string, password: string) => {
    const { token, account } = await loginAccount(username, password);
    if (token) setAuthToken(token);
    lastCloudUpdatedAtRef.current = account.updatedAt;
    suppressNextCloudPushRef.current = true;

    const cloudProfile: UserProfile = {
      id: account.id,
      name: account.username,
      createdAt: account.createdAt,
      studyCards: account.studyCards,
      goals: account.goals ?? [],
      activeDailyPlan: account.activeDailyPlan ?? createDefaultDailyPlan(),
      dailyHistory: account.dailyHistory ?? [],
      gamification: account.gamification ?? DEFAULT_GAMIFICATION_STATS,
      isCloudAccount: true,
    };
    setProfiles((prev) => [
      cloudProfile,
      ...prev.filter((p) => !p.isCloudAccount && p.id !== account.id),
    ]);
    setActiveProfileId(account.id);
    setActiveCardId(null);
    focusEndAtRef.current = null;
    breakEndAtRef.current = null;
    nextAlertAtRef.current = null;
    saveTimerSnapshot(null);
    setActiveView(initialInviteRef.current ? 'workspace' : 'hub');
    setIsFocusRunning(false);
    setIsBreakRunning(false);
    setIsCheckInRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
    setCompanionCaption(`Welcome back, ${account.username} — loaded ${account.studyCards.length} cards.`);
  };

  const handleSignOutCloudAccount = async () => {
    if (authToken && activeProfile?.isCloudAccount) {
      await syncAccountCards(
        authToken,
        activeProfile.studyCards,
        false,
        activeProfile.goals ?? [],
        activeProfile.gamification ?? DEFAULT_GAMIFICATION_STATS,
        activeProfile.activeDailyPlan,
        activeProfile.dailyHistory ?? []
      );
    }
    setAuthToken(null);
    hasUnsyncedCloudRef.current = false;
    focusEndAtRef.current = null;
    breakEndAtRef.current = null;
    nextAlertAtRef.current = null;
    saveTimerSnapshot(null);

    setProfiles((prev) => {
      const localOnly = prev.filter((p) => !p.isCloudAccount);
      setActiveProfileId(localOnly[0]?.id ?? null);
      return localOnly;
    });
    setActiveCardId(null);
    setActiveView('hub');
    setIsFocusRunning(false);
    setIsBreakRunning(false);
    setIsCheckInRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
  };

  const handleSelectProfile = (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    setActiveProfileId(id);
    setActiveCardId(null);
    focusEndAtRef.current = null;
    breakEndAtRef.current = null;
    nextAlertAtRef.current = null;
    setActiveView('hub');
    setIsFocusRunning(false);
    setIsBreakRunning(false);
    setIsCheckInRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
    setCompanionCaption(`Hey ${target.name} — ready whenever you open a study card.`);
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (id === activeProfileId && remaining.length > 0) {
        setActiveProfileId(remaining[0].id);
        setActiveCardId(null);
        setActiveView('hub');
      }
      return remaining;
    });
  };

  const handleImportCardsBackup = (rawCards: StudySessionCard[]) => {
    const imported = normalizeStudyCards(rawCards);
    if (imported.length === 0) return;

    if (!activeProfile) {
      const fallback = createNewProfile('My Study Space');
      fallback.studyCards = imported;
      setProfiles([fallback]);
      setActiveProfileId(fallback.id);
      return;
    }

    updateActiveProfile((profile) => {
      const existingIds = new Set(profile.studyCards.map((c) => c.id));
      const newOnes = imported.filter((c) => !existingIds.has(c.id));
      return {
        ...profile,
        studyCards: [...newOnes, ...profile.studyCards],
      };
    });
  };

  const handleCreateCard = (title: string, accent: StudySessionCard['accent']) => {
    const card = createStudyCard(title, accent);
    updateActiveProfile((profile) => ({
      ...profile,
      studyCards: [card, ...profile.studyCards],
    }));
    setActiveCardId(card.id);
    setActiveView('workspace');
    setPanelMode('focus');

    // All three timers start OFF cleanly until user starts or grants permission
    setIsFocusRunning(false);
    focusEndAtRef.current = null;
    setFocusRemainingSeconds(card.timerSettings.workMinutes * 60);

    setIsBreakRunning(false);
    breakEndAtRef.current = null;
    setBreakRemainingSeconds(card.timerSettings.breakMinutes * 60);

    setIsCheckInRunning(false);
    setIsCheckInStaged(false);
    nextAlertAtRef.current = null;
    setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

    runningSinceRef.current = null;
    elapsedBaseRef.current = 0;
    focusReminderFiredRef.current = false;
    breakReminderFiredRef.current = false;
    setElapsedSessionSeconds(0);
    setActiveTaskId(null);
    setActiveAlertBanner(null);
    setPose('speaking');
    sessionStartTimeRef.current = Date.now();

    const opening = buildSessionOpeningQuestion(profileName, card.title, false);
    setCompanionCaption(opening);
    triggerSimulatedSpeech(2400);
    persistActiveTimerSnapshot({
      cardId: card.id,
      isFocusRunning: false,
      focusEndAt: null,
      focusRemainingSeconds: card.timerSettings.workMinutes * 60,
      isBreakRunning: false,
      breakEndAt: null,
      breakRemainingSeconds: card.timerSettings.breakMinutes * 60,
      isCheckInRunning: false,
      checkInEndAt: null,
      checkInRemainingSeconds: card.timerSettings.checkInMinutes * 60,
      elapsedSessionSeconds: 0,
      checkInMinutes: card.timerSettings.checkInMinutes,
    });
  };

  const handleRenameCard = (cardId: string, nextTitle: string) => {
    updateActiveProfile((profile) => ({
      ...profile,
      studyCards: profile.studyCards.map((c) =>
        c.id === cardId ? { ...c, title: nextTitle } : c
      ),
    }));
  };

  const handleDeleteCard = (cardId: string) => {
    updateActiveProfile((profile) => ({
      ...profile,
      studyCards: profile.studyCards.filter((c) => c.id !== cardId),
    }));
    if (activeCardId === cardId) {
      setActiveCardId(null);
      setActiveView('hub');
      setIsFocusRunning(false);
      setIsBreakRunning(false);
      setIsCheckInRunning(false);
    }
  };

  const applyTaskActions = useCallback(
    (actions: TaskAction[]) => {
      if (!actions || actions.length === 0) return;

      updateActiveCard((card) => {
        let next = [...card.tasks];

        for (const act of actions) {
          if (act.action === 'add_task' && act.title) {
            const newTask: TaskItem = {
              id: makeId('task'),
              title: act.title,
              completed: false,
              estimatedMinutes: act.estimatedMinutes,
              collapsed: false,
              createdAt: Date.now(),
              subtasks: (act.subtasks ?? []).map((st) => ({
                id: makeId('sub'),
                title: st,
                completed: false,
              })),
            };
            next = [...next, newTask];
            setActiveTaskId((cur) => cur ?? newTask.id);
          } else if (act.action === 'edit_task') {
            const targetIdx = next.findIndex(
              (t) =>
                (act.taskId && t.id === act.taskId) ||
                (act.title && t.title.toLowerCase().includes(act.title.toLowerCase()))
            );
            if (targetIdx !== -1) {
              const target = next[targetIdx];
              next[targetIdx] = {
                ...target,
                title: act.newTitle?.trim() ? act.newTitle.trim() : target.title,
                estimatedMinutes:
                  typeof act.estimatedMinutes === 'number'
                    ? act.estimatedMinutes
                    : target.estimatedMinutes,
              };
            }
          } else if (act.action === 'delete_task') {
            const targetIdx = next.findIndex(
              (t) =>
                (act.taskId && t.id === act.taskId) ||
                (act.title && t.title.toLowerCase().includes(act.title.toLowerCase()))
            );
            if (targetIdx !== -1) {
              const removedId = next[targetIdx].id;
              next = next.filter((_, i) => i !== targetIdx);
              if (activeTaskIdRef.current === removedId) {
                setActiveTaskId(next.find((t) => !t.completed)?.id ?? null);
              }
            }
          } else if (act.action === 'add_subtasks' && act.subtasks?.length) {
            const targetIdx = next.findIndex(
              (t) =>
                (act.taskId && t.id === act.taskId) ||
                (act.title && t.title.toLowerCase().includes(act.title.toLowerCase()))
            );
            if (targetIdx !== -1) {
              const target = next[targetIdx];
              const existingLower = new Set(target.subtasks.map((s) => s.title.toLowerCase()));
              const added = act.subtasks
                .filter((st) => !existingLower.has(st.toLowerCase()))
                .map((st) => ({ id: makeId('sub'), title: st, completed: false }));
              next[targetIdx] = {
                ...target,
                collapsed: false,
                subtasks: [...target.subtasks, ...added],
              };
            }
          } else if (act.action === 'toggle_task') {
            const targetIdx = next.findIndex(
              (t) =>
                (act.taskId && t.id === act.taskId) ||
                (act.title && t.title.toLowerCase().includes(act.title.toLowerCase()))
            );
            if (targetIdx !== -1) {
              const target = next[targetIdx];
              const nextCompleted = !target.completed;
              next[targetIdx] = {
                ...target,
                completed: nextCompleted,
                completedAt: nextCompleted ? Date.now() : undefined,
              };
            }
          } else if (act.action === 'set_focus') {
            const target = next.find(
              (t) =>
                (act.taskId && t.id === act.taskId) ||
                (act.title && t.title.toLowerCase().includes(act.title.toLowerCase()))
            );
            if (target) {
              setActiveTaskId(target.id);
            }
          }
        }

        return { ...card, tasks: next };
      });
    },
    [updateActiveCard]
  );

  const handleLiveToolAction = useCallback(
    (tool: LiveToolAction) => {
      if (tool.name === 'addTask') {
        const title = typeof tool.args.title === 'string' ? tool.args.title : '';
        const estimatedMinutes =
          typeof tool.args.estimatedMinutes === 'number'
            ? tool.args.estimatedMinutes
            : undefined;
        const subtasks = Array.isArray(tool.args.subtasks)
          ? tool.args.subtasks.filter((s): s is string => typeof s === 'string')
          : [];
        if (title) {
          applyTaskActions([{ action: 'add_task', title, estimatedMinutes, subtasks }]);
        }
      } else if (tool.name === 'editTask') {
        const match =
          typeof tool.args.taskTitleMatch === 'string' ? tool.args.taskTitleMatch : '';
        const newTitle = typeof tool.args.newTitle === 'string' ? tool.args.newTitle : undefined;
        const estimatedMinutes =
          typeof tool.args.estimatedMinutes === 'number'
            ? tool.args.estimatedMinutes
            : undefined;
        if (match && (newTitle || estimatedMinutes !== undefined)) {
          applyTaskActions([
            { action: 'edit_task', title: match, newTitle, estimatedMinutes },
          ]);
        }
      } else if (tool.name === 'deleteTask') {
        const match =
          typeof tool.args.taskTitleMatch === 'string' ? tool.args.taskTitleMatch : '';
        if (match) {
          applyTaskActions([{ action: 'delete_task', title: match }]);
        }
      } else if (tool.name === 'completeTask') {
        const match = typeof tool.args.titleMatch === 'string' ? tool.args.titleMatch : '';
        if (match) {
          applyTaskActions([{ action: 'toggle_task', title: match }]);
        }
      } else if (tool.name === 'addSubtasks') {
        const match =
          typeof tool.args.taskTitleMatch === 'string' ? tool.args.taskTitleMatch : '';
        const subtasks = Array.isArray(tool.args.subtasks)
          ? tool.args.subtasks.filter((s): s is string => typeof s === 'string')
          : [];
        if (match && subtasks.length > 0) {
          applyTaskActions([{ action: 'add_subtasks', title: match, subtasks }]);
        }
      } else if (tool.name === 'setCheckInPreference') {
        const enabled =
          typeof tool.args.enabled === 'boolean' ? tool.args.enabled : true;
        const mins =
          typeof tool.args.intervalMinutes === 'number'
            ? tool.args.intervalMinutes
            : undefined;
        if (enabled) {
          // Speak confirmation BEFORE starting the check-in countdown
          stageVoiceTimerStart('checkin', mins);
        } else {
          executeTimerAction({ timer: 'checkin', action: 'stop', minutes: mins });
        }
      } else if (tool.name === 'controlTimer') {
        const rawTimer = typeof tool.args.timer === 'string' ? tool.args.timer.toLowerCase() : '';
        const rawAction =
          typeof tool.args.action === 'string' ? tool.args.action.toLowerCase() : '';
        const mins =
          typeof tool.args.minutes === 'number' ? tool.args.minutes : undefined;

        const timer =
          rawTimer === 'break' || rawTimer === 'checkin' || rawTimer === 'focus'
            ? rawTimer
            : null;
        const action =
          rawAction === 'start' ||
          rawAction === 'pause' ||
          rawAction === 'stop' ||
          rawAction === 'reset'
            ? rawAction
            : null;

        if (timer && action) {
          if (action === 'start') {
            // Speak confirmation BEFORE starting timer so user gets 100% of their minutes
            stageVoiceTimerStart(timer, mins);
          } else {
            executeTimerAction({ timer, action, minutes: mins });
          }
        }
      }
    },
    [applyTaskActions, executeTimerAction, stageVoiceTimerStart]
  );

  const commitLiveTranscripts = useCallback(() => {
    const assistantTxt = liveAssistantBufRef.current.trim();
    liveUserBufRef.current = '';
    liveAssistantBufRef.current = '';
    setLiveDraftUserText('');
    setLiveDraftAssistantText('');
    if (assistantTxt) {
      setCompanionCaption(assistantTxt);
    }

    if (stagedVoiceStartsRef.current.length > 0) {
      if (liveVoiceRef.current?.isAssistantSpeaking) {
        turnCompleteAwaitingAudioRef.current = true;
      } else {
        turnCompleteAwaitingAudioRef.current = false;
        flushStagedVoiceStarts();
      }
    }
  }, [flushStagedVoiceStarts]);

  const liveVoiceRef = useRef<ReturnType<typeof useLiveVoice> | null>(null);

  const handleLiveReady = useCallback((isReconnect: boolean) => {
    const card = activeCardRef.current;
    const currentTasks = tasksRef.current;
    const settings = timerSettingsRef.current;
    if (!card || !liveVoiceRef.current) return;

    const taskSummary =
      currentTasks.length > 0
        ? currentTasks
            .map((t) => `${t.completed ? '[done] ' : ''}${t.title}`)
            .join(', ')
        : 'no tasks added yet';

    const timersSummary = `Focus: ${
      isFocusRunningRef.current ? 'running' : 'off'
    } (${settings.workMinutes}m), Break: ${
      isBreakRunningRef.current ? 'running' : 'off'
    } (${settings.breakMinutes}m), Check-in: ${
      isCheckInRunningRef.current ? `running every ${settings.checkInMinutes}m` : 'OFF'
    }`;

    if (isReconnect) {
      // Silently restore conversation & timer context after seamless session rotation
      liveVoiceRef.current.sendContextUpdate(
        `[Context sync for ${profileNameRef.current} on "${card.title}". Tasks: ${taskSummary}. Timers: ${timersSummary}. Continue naturally without repeating greetings.]`
      );
      return;
    }

    if (isFocusRunningRef.current) {
      liveVoiceRef.current.sendTextPrompt(
        `[Live voice connected for ${profileNameRef.current} on "${card.title}". IMPORTANT: Focus timer is ALREADY running. Do NOT ask what they are planning to do or start check-in without permission. Just say one brief warm sentence that you're studying beside them.]`
      );
    } else if (currentTasks.length > 0) {
      liveVoiceRef.current.sendTextPrompt(
        `[Live voice connected for ${profileNameRef.current} on "${card.title}". Existing tasks: ${taskSummary}. Timers: ${timersSummary}. Do NOT start check-ins without asking permission.] Say one brief warm sentence confirming you're live and ready.`
      );
    } else {
      liveVoiceRef.current.sendTextPrompt(
        `[Live voice connected for ${profileNameRef.current} on "${card.title}". Timers: ${timersSummary}. Check-ins are OFF until the user explicitly asks or agrees.] Ask ${profileNameRef.current} in 1-2 short natural sentences what they want to work on before starting, and whether they'd like periodic check-ins (and after how many minutes). Wait for their permission before starting check-in.`
      );
    }
  }, []);

  const liveVoice = useLiveVoice({
    userName: profileName,
    cardTitle: activeCard?.title ?? 'Study Session',
    onReady: handleLiveReady,
    onInputTranscript: (chunk) => {
      liveUserBufRef.current += chunk;
      setLiveDraftUserText(liveUserBufRef.current);
    },
    onOutputTranscript: (chunk) => {
      liveAssistantBufRef.current += chunk;
      setLiveDraftAssistantText(liveAssistantBufRef.current);
    },
    onToolAction: handleLiveToolAction,
    onTurnComplete: commitLiveTranscripts,
  });
  liveVoiceRef.current = liveVoice;

  // Flush staged voice timer starts the exact moment Sora's spoken confirmation audio finishes playing
  useEffect(() => {
    if (
      !liveVoice.isAssistantSpeaking &&
      turnCompleteAwaitingAudioRef.current &&
      stagedVoiceStartsRef.current.length > 0
    ) {
      turnCompleteAwaitingAudioRef.current = false;
      flushStagedVoiceStarts();
    }
  }, [flushStagedVoiceStarts, liveVoice.isAssistantSpeaking]);

  useEffect(() => {
    if (!isFocusRunning || isBreakRunning) return;
    setPose('typing');
    const id = window.setInterval(() => {
      setPose((current) => {
        if (current === 'speaking') return 'typing';
        return Math.random() > 0.72 ? 'coffee' : 'typing';
      });
    }, 24000);
    return () => window.clearInterval(id);
  }, [isBreakRunning, isFocusRunning]);

  const saveLogEntry = useCallback(
    (
      phaseLogged: SprintPhase,
      durationSec: number,
      clip?: { blobUrl: string; durationSeconds: number; recordedAt: number }
    ) => {
      const card = activeCardRef.current;
      if (!card) return;
      const completed = card.tasks.filter((t) => t.completed);
      const active = card.tasks.find((t) => t.id === activeTaskIdRef.current);

      const entry: SessionLog = {
        id: makeId('log'),
        sessionCardId: card.id,
        sessionCardTitle: card.title,
        startedAt: clip
          ? clip.recordedAt - clip.durationSeconds * 1000
          : sessionStartTimeRef.current,
        endedAt: clip ? clip.recordedAt : Date.now(),
        durationSeconds: clip ? clip.durationSeconds : Math.max(1, durationSec),
        phase: phaseLogged,
        completedTasksCount: completed.length,
        completedTaskTitles: completed.map((t) => t.title),
        note: clip
          ? active
            ? `Accountability clip · ${active.title}`
            : `Self-view accountability clip · ${card.title}`
          : active
            ? `${phaseLogged === 'work' ? 'Focus Sprint' : 'Break'} · ${active.title}`
            : `${phaseLogged === 'work' ? 'Focus Sprint' : 'Break'} · ${card.title}`,
        hasVideo: Boolean(clip),
        videoUrl: clip?.blobUrl,
      };

      updateActiveCard((c) => ({
        ...c,
        sessionLogs: [entry, ...c.sessionLogs],
      }));
    },
    [updateActiveCard]
  );

  const handleReplyToSora = useCallback(
    async (replyText: string) => {
      const trimmed = replyText.trim();
      if (!trimmed) return;
      setPose('speaking');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', text: trimmed }],
            tasks: tasksRef.current,
            activeTaskId: activeTaskIdRef.current,
            sessionElapsedSeconds: elapsedSecondsRef.current,
            userName: profileNameRef.current,
            cardTitle: activeCardRef.current?.title ?? 'Study Session',
            checkInMinutes: timerSettingsRef.current.checkInMinutes,
            alertEnabled: isCheckInRunningRef.current,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          pose?: CompanionPose;
          taskActions?: TaskAction[];
          timerActions?: TimerControlAction[];
          checkInAction?: { enabled: boolean; intervalMinutes?: number } | null;
        };

        if (data.taskActions && data.taskActions.length > 0) {
          applyTaskActions(data.taskActions);
        }

        if (data.timerActions && data.timerActions.length > 0) {
          for (const tAct of data.timerActions) {
            executeTimerAction(tAct);
          }
        }

        if (data.checkInAction && typeof data.checkInAction.enabled === 'boolean') {
          executeTimerAction({
            timer: 'checkin',
            action: data.checkInAction.enabled ? 'start' : 'stop',
            minutes: data.checkInAction.intervalMinutes,
          });
        }

        const reply = data.reply ?? "Updated your plan—I'm right here with you.";
        setCompanionCaption(reply);
        setActiveAlertBanner(null);

        const isLive = liveVoiceRef.current?.status === 'live';
        if (isLive) {
          liveVoiceRef.current?.sendContextUpdate(
            `[User answered: "${trimmed}". Replied & updated list: "${reply}".]`
          );
        } else {
          triggerSimulatedSpeech(2200);
        }

        setPose(data.pose ?? (isFocusRunningRef.current ? 'typing' : 'coffee'));
      } catch {
        setPose('coffee');
      }
    },
    [applyTaskActions, executeTimerAction, triggerSimulatedSpeech]
  );

  const triggerAutomaticAlert = useCallback(async () => {
    const card = activeCardRef.current;
    if (!card || isLoadingCheckIn) return;

    const currentTasks = tasksRef.current;
    const settings = timerSettingsRef.current;
    const user = profileNameRef.current;
    const timerRunning = isFocusRunningRef.current;

    if (isCheckInRunningRef.current) {
      const nextTarget = Date.now() + settings.checkInMinutes * 60_000;
      nextAlertAtRef.current = nextTarget;
      setSecondsUntilAlert(settings.checkInMinutes * 60);
      persistActiveTimerSnapshot({
        checkInEndAt: nextTarget,
        checkInRemainingSeconds: settings.checkInMinutes * 60,
      });
    }

    if (timerRunning && currentTasks.length === 0) {
      return;
    }

    setIsLoadingCheckIn(true);
    setPose('speaking');

    if (settings.chimeEnabled) {
      playCueSound('checkin');
    }

    const activeTask =
      currentTasks.find((t) => t.id === activeTaskIdRef.current) ??
      currentTasks.find((t) => !t.completed);
    const completedCount = currentTasks.filter((t) => t.completed).length;

    const liveSent =
      liveVoiceRef.current?.status === 'live' &&
      liveVoiceRef.current.sendTextPrompt(
        `[Scheduled ${settings.checkInMinutes}-minute check-in for ${user} on "${card.title}". Focus timer running: ${
          timerRunning ? 'YES (NEVER ask what they are planning to do)' : 'NO'
        }. Elapsed: ${Math.floor(
          elapsedSecondsRef.current / 60
        )} mins. Completed: ${completedCount}/${currentTasks.length}. Current focus task: ${
          activeTask ? `"${activeTask.title}"` : 'none selected'
        }.] Speak aloud directly to ${user}: ${
          activeTask
            ? `warmly ask how progress is going on "${activeTask.title}" and whether you should check it off or split it.`
            : 'ask gently how their session is going.'
        }`
      );

    if (liveSent) {
      const liveBannerMsg = activeTask
        ? `Checking in on "${activeTask.title}" — tell Sora how it's going!`
        : `${settings.checkInMinutes}m check-in — tell Sora how your study is going!`;
      setActiveAlertBanner({
        kind: 'checkin',
        title: `${settings.checkInMinutes}m Check-In`,
        message: liveBannerMsg,
      });
      setIsLoadingCheckIn(false);
      return;
    }

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: currentTasks,
          activeTaskId: activeTaskIdRef.current,
          elapsedMinutes: Math.floor(elapsedSecondsRef.current / 60),
          intervalMinutes: settings.checkInMinutes,
          userName: user,
          cardTitle: card.title,
          isFocusRunning: timerRunning,
        }),
      });
      const data = (await res.json()) as { message?: string; pose?: CompanionPose };
      const alertText =
        data.message ??
        (activeTask
          ? `Hey ${user}, ${settings.checkInMinutes} minutes are up—how is "${activeTask.title}" going? Did you finish it or want to adjust your list?`
          : `Checking in quietly, ${user}—steady focus, keep going at your own pace.`);

      setActiveAlertBanner({
        kind: 'checkin',
        title: `${settings.checkInMinutes}m Check-In`,
        message: alertText,
      });
      setCompanionCaption(alertText);
      setPose(data.pose ?? 'speaking');
      triggerSimulatedSpeech(2600);
    } catch {
      const fallback = activeTask
        ? `Hey ${user}, ${settings.checkInMinutes}-minute check-in—how did "${activeTask.title}" go? Should I mark it done?`
        : `Checking in quietly, ${user}—steady focus, keep going at your own pace.`;
      setActiveAlertBanner({
        kind: 'checkin',
        title: `${settings.checkInMinutes}m Check-In`,
        message: fallback,
      });
      setCompanionCaption(fallback);
      triggerSimulatedSpeech(2400);
    } finally {
      setIsLoadingCheckIn(false);
    }
  }, [isLoadingCheckIn, persistActiveTimerSnapshot, triggerSimulatedSpeech]);

  const focusCompleteHandlerRef = useRef<() => void>(() => {});
  const breakCompleteHandlerRef = useRef<() => void>(() => {});
  const reminderHandlerRef = useRef<(phase: SprintPhase) => void>(() => {});
  const alertTriggerRef = useRef(triggerAutomaticAlert);
  alertTriggerRef.current = triggerAutomaticAlert;

  focusCompleteHandlerRef.current = () => {
    const completedDuration = timerSettingsRef.current.workMinutes * 60;
    saveLogEntry('work', completedDuration);
    if (timerSettingsRef.current.chimeEnabled) playCueSound('sprint_end');

    // Automatically transition to Break and stop Focus + Check-in per rule
    executeTimerAction({ timer: 'break', action: 'start' });
    const msg = `Nice steady work, ${profileNameRef.current}. Enjoy a ${timerSettingsRef.current.breakMinutes}-minute break (check-in paused).`;
    setActiveAlertBanner({
      kind: 'sprint_end',
      title: 'Focus Sprint Complete',
      message: msg,
    });
    setCompanionCaption(msg);
    triggerSimulatedSpeech(2400);
  };

  breakCompleteHandlerRef.current = () => {
    if (timerSettingsRef.current.chimeEnabled) playCueSound('break_end');
    breakEndAtRef.current = null;
    setIsBreakRunning(false);
    setBreakRemainingSeconds(timerSettingsRef.current.breakMinutes * 60);
    persistActiveTimerSnapshot({
      isBreakRunning: false,
      breakEndAt: null,
      breakRemainingSeconds: timerSettingsRef.current.breakMinutes * 60,
    });

    const msg = `Break complete — ready to start Focus again, ${profileNameRef.current}?`;
    setActiveAlertBanner({
      kind: 'break_end',
      title: 'Break Complete',
      message: msg,
    });
    setCompanionCaption(msg);
    triggerSimulatedSpeech(2200);
  };

  reminderHandlerRef.current = (phase: SprintPhase) => {
    if (timerSettingsRef.current.chimeEnabled) playCueSound('reminder');
    const mins = timerSettingsRef.current.reminderMinutesBeforeEnd;
    setActiveAlertBanner({
      kind: 'reminder',
      title: `${mins}m Reminder`,
      message:
        phase === 'work'
          ? `${mins} minute${mins === 1 ? '' : 's'} left in your focus sprint.`
          : `${mins} minute${mins === 1 ? '' : 's'} left in your break.`,
    });
  };

  // Unified Wall-Clock Sync for ALL 3 Independent Timers
  const syncTimersFromWallClock = useCallback(() => {
    const now = Date.now();

    if (isFocusRunningRef.current && activeCardRef.current) {
      if (!focusEndAtRef.current) {
        focusEndAtRef.current = now + focusRemainingRef.current * 1000;
      }
      if (!runningSinceRef.current) {
        runningSinceRef.current = now;
      }
      const nextElapsed =
        elapsedBaseRef.current + Math.max(0, Math.floor((now - runningSinceRef.current) / 1000));
      setElapsedSessionSeconds(nextElapsed);

      const rem = Math.max(0, Math.ceil((focusEndAtRef.current - now) / 1000));
      const reminderSec = timerSettingsRef.current.reminderMinutesBeforeEnd * 60;
      const totalSec = timerSettingsRef.current.workMinutes * 60;

      if (
        reminderSec > 0 &&
        totalSec > reminderSec &&
        rem > 0 &&
        rem <= reminderSec &&
        !focusReminderFiredRef.current
      ) {
        focusReminderFiredRef.current = true;
        reminderHandlerRef.current('work');
      }

      if (rem <= 0) {
        focusCompleteHandlerRef.current();
      } else {
        setFocusRemainingSeconds(rem);
      }
    }

    if (isBreakRunningRef.current && activeCardRef.current) {
      if (!breakEndAtRef.current) {
        breakEndAtRef.current = now + breakRemainingRef.current * 1000;
      }
      const rem = Math.max(0, Math.ceil((breakEndAtRef.current - now) / 1000));
      const reminderSec = timerSettingsRef.current.reminderMinutesBeforeEnd * 60;
      const totalSec = timerSettingsRef.current.breakMinutes * 60;

      if (
        reminderSec > 0 &&
        totalSec > reminderSec &&
        rem > 0 &&
        rem <= reminderSec &&
        !breakReminderFiredRef.current
      ) {
        breakReminderFiredRef.current = true;
        reminderHandlerRef.current('break');
      }

      if (rem <= 0) {
        breakCompleteHandlerRef.current();
      } else {
        setBreakRemainingSeconds(rem);
      }
    }

    if (isCheckInRunningRef.current && activeCardRef.current) {
      const intervalMs = Math.max(1, timerSettingsRef.current.checkInMinutes) * 60_000;
      if (!nextAlertAtRef.current) {
        nextAlertAtRef.current = now + intervalMs;
      }
      const remainingMs = nextAlertAtRef.current - now;
      if (remainingMs <= 0) {
        nextAlertAtRef.current = now + intervalMs;
        setSecondsUntilAlert(Math.round(intervalMs / 1000));
        alertTriggerRef.current();
      } else {
        setSecondsUntilAlert(Math.ceil(remainingMs / 1000));
      }
    }
  }, []);

  useEffect(() => {
    if (!activeCardId || (!isFocusRunning && !isBreakRunning && !isCheckInRunning)) return;
    syncTimersFromWallClock();
    const id = window.setInterval(syncTimersFromWallClock, 1000);
    return () => window.clearInterval(id);
  }, [activeCardId, isBreakRunning, isCheckInRunning, isFocusRunning, syncTimersFromWallClock]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        syncTimersFromWallClock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [syncTimersFromWallClock]);

  // Task handlers scoped to active Study Card
  const handleAddTask = (title: string) => {
    const item: TaskItem = {
      id: makeId('task'),
      title,
      completed: false,
      collapsed: false,
      subtasks: [],
      createdAt: Date.now(),
    };
    updateActiveCard((c) => ({ ...c, tasks: [...c.tasks, item] }));
    setActiveTaskId((cur) => cur ?? item.id);
  };

  const handleEditTask = (taskId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, title: trimmed } : t)),
    }));
  };

  const handleToggleTask = (taskId: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const nextCompleted = !t.completed;
        return {
          ...t,
          completed: nextCompleted,
          completedAt: nextCompleted ? Date.now() : undefined,
        };
      }),
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.filter((t) => t.id !== taskId),
    }));
    if (activeTaskId === taskId) setActiveTaskId(null);
  };

  const handleToggleCollapse = (taskId: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) =>
        t.id === taskId ? { ...t, collapsed: !t.collapsed } : t
      ),
    }));
  };

  const handleReorderTask = (fromIndex: number, toIndex: number) => {
    updateActiveCard((c) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= c.tasks.length ||
        toIndex >= c.tasks.length
      ) {
        return c;
      }
      const copy = [...c.tasks];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return { ...c, tasks: copy };
    });
  };

  const handleAddSubtask = (taskId: string, title: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              collapsed: false,
              subtasks: [...t.subtasks, { id: makeId('sub'), title, completed: false }],
            }
          : t
      ),
    }));
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: t.subtasks.map((s) =>
                s.id === subtaskId ? { ...s, completed: !s.completed } : s
              ),
            }
          : t
      ),
    }));
  };

  const handleDeleteSubtask = (taskId: string, subtaskId: string) => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }
          : t
      ),
    }));
  };

  const handleBreakDownTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || breakingDownTaskId) return;

    setBreakingDownTaskId(taskId);
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, collapsed: false } : t)),
    }));

    try {
      const res = await fetch('/api/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: task.title,
          existingSubtasks: task.subtasks.map((s) => s.title),
        }),
      });
      const data = (await res.json()) as {
        subtasks?: string[];
        encouragement?: string;
      };

      if (data.subtasks && data.subtasks.length > 0) {
        applyTaskActions([{ action: 'add_subtasks', taskId, subtasks: data.subtasks }]);
      }

      if (data.encouragement) {
        setCompanionCaption(data.encouragement);
        triggerSimulatedSpeech(2200);
      }
    } catch {
      // Quiet fallback
    } finally {
      setBreakingDownTaskId(null);
    }
  };

  const handleClearCompleted = () => {
    updateActiveCard((c) => ({
      ...c,
      tasks: c.tasks.filter((t) => !t.completed),
    }));
  };

  // Playlist & Trim handlers scoped to active Study Card
  const handleAddVideo = (item: Omit<PlaylistItem, 'id' | 'addedAt'>) => {
    const nextItem: PlaylistItem = {
      ...item,
      id: makeId('vid'),
      addedAt: Date.now(),
    };
    updateActiveCard((c) => ({
      ...c,
      playlist: [...c.playlist, nextItem],
      activeVideoId: nextItem.id,
    }));
  };

  const handleAddPlaylistBatch = (items: Array<Omit<PlaylistItem, 'id' | 'addedAt'>>) => {
    if (items.length === 0) return;
    const baseTime = Date.now();
    const created: PlaylistItem[] = items.map((item, idx) => ({
      ...item,
      id: `${makeId('vid')}-${idx}`,
      addedAt: baseTime + idx,
    }));
    updateActiveCard((c) => ({
      ...c,
      playlist: [...c.playlist, ...created],
      activeVideoId: created[0].id,
    }));
  };

  const handleUpdateTrimSettings = (introSec: number, outroSec: number) => {
    updateActiveCard((c) => ({
      ...c,
      videoTrimIntroSeconds: Math.max(0, Math.round(introSec)),
      videoTrimOutroSeconds: Math.max(0, Math.round(outroSec)),
    }));
  };

  const handleSelectVideo = (videoId: string) => {
    updateActiveCard((c) => ({ ...c, activeVideoId: videoId }));
  };

  const handleRemoveVideo = (videoId: string) => {
    updateActiveCard((c) => {
      const next = c.playlist.filter((v) => v.id !== videoId);
      return {
        ...c,
        playlist: next,
        activeVideoId:
          c.activeVideoId === videoId ? (next[0]?.id ?? null) : c.activeVideoId,
      };
    });
  };

  const handleReorderVideo = (fromIndex: number, toIndex: number) => {
    updateActiveCard((c) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= c.playlist.length ||
        toIndex >= c.playlist.length
      ) {
        return c;
      }
      const copy = [...c.playlist];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return { ...c, playlist: copy };
    });
  };

  const handleUpdateTimerSettings = (next: TimerSettings) => {
    const prevWork = timerSettings.workMinutes;
    const prevBreak = timerSettings.breakMinutes;
    const prevAlert = timerSettings.checkInMinutes;

    updateActiveCard((c) => ({ ...c, timerSettings: next }));

    if (!isFocusRunning && next.workMinutes !== prevWork) {
      setFocusRemainingSeconds(next.workMinutes * 60);
    }
    if (!isBreakRunning && next.breakMinutes !== prevBreak) {
      setBreakRemainingSeconds(next.breakMinutes * 60);
    }
    if (next.checkInMinutes !== prevAlert) {
      const nextTarget = isCheckInRunning
        ? Date.now() + next.checkInMinutes * 60_000
        : null;
      nextAlertAtRef.current = nextTarget;
      setSecondsUntilAlert(next.checkInMinutes * 60);
      persistActiveTimerSnapshot({
        checkInEndAt: nextTarget,
        checkInRemainingSeconds: next.checkInMinutes * 60,
        checkInMinutes: next.checkInMinutes,
      });
    }
  };

  const handleAlertReply = (replyText: string) => {
    setActiveAlertBanner(null);
    if (replyText.toLowerCase().includes('split')) {
      const target =
        tasks.find((t) => t.id === activeTaskId) ?? tasks.find((t) => !t.completed);
      if (target) {
        handleBreakDownTask(target.id);
        return;
      }
    }
    handleReplyToSora(replyText);
  };

  const handleCreateAndCopyInvite = async (): Promise<{ url: string; copied: boolean }> => {
    const nextRoomId =
      roomId ?? `fp${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-2)}`;
    if (!roomId) {
      setRoomId(nextRoomId);
    }
    try {
      const nextQuery = `?room=${encodeURIComponent(nextRoomId)}`;
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery}`);
    } catch {
      // Ignore history errors in sandboxed iframes
    }

    const base = publicBaseUrl ?? window.location.origin;
    const url = `${base}/?room=${encodeURIComponent(nextRoomId)}&title=${encodeURIComponent(
      activeCard?.title ?? 'Co-Study Session'
    )}`;

    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = fallbackCopyText(url);
    }
    return { url, copied };
  };

  const handleJoinRoomInput = (codeOrUrl: string) => {
    const parsed = parseRoomInviteInput(codeOrUrl);
    if (!parsed) return;

    setRoomId(parsed.roomId);
    try {
      const nextQuery = `?room=${encodeURIComponent(parsed.roomId)}`;
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery}`);
    } catch {
      // Ignore history errors
    }

    if (!activeCard) {
      const targetTitle = parsed.title || 'Co-Study Session';
      const existing = studyCards.find(
        (c) => c.title.toLowerCase() === targetTitle.toLowerCase()
      );
      if (existing) {
        openStudyCard(existing);
      } else {
        handleCreateCard(targetTitle, 'amber');
      }
    }

    setCompanionCaption(
      `Joined room ${parsed.roomId.toUpperCase()}! Your Focus Plan stays private to you.`
    );
  };

  const handleLeaveRoom = () => {
    setRoomId(null);
    if (window.location.search.includes('room=')) {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // Ignore history errors
      }
    }
  };

  const handleDeleteLog = (cardId: string | undefined, logId: string) => {
    updateActiveProfile((profile) => ({
      ...profile,
      studyCards: profile.studyCards.map((c) =>
        !cardId || c.id === cardId
          ? { ...c, sessionLogs: c.sessionLogs.filter((l) => l.id !== logId) }
          : c
      ),
    }));
  };

  const handleUpdateGoals = useCallback(
    (updater: (prev: GoalPlan[]) => GoalPlan[]) => {
      updateActiveProfile((profile) => ({
        ...profile,
        goals: updater(profile.goals ?? []),
      }));
    },
    [updateActiveProfile]
  );

  const handleUpdateDailyPlan = useCallback(
    (updater: (prev: DailyPlanRecord) => DailyPlanRecord) => {
      updateActiveProfile((profile) => ({
        ...profile,
        activeDailyPlan: updater(profile.activeDailyPlan ?? createDefaultDailyPlan()),
      }));
    },
    [updateActiveProfile]
  );

  const handleUpdateDailyHistory = useCallback(
    (updater: (prev: DailyPlanRecord[]) => DailyPlanRecord[]) => {
      updateActiveProfile((profile) => ({
        ...profile,
        dailyHistory: updater(profile.dailyHistory ?? []),
      }));
    },
    [updateActiveProfile]
  );

  const handleUpdateGamification = useCallback(
    (updater: (prev: GamificationStats) => GamificationStats) => {
      updateActiveProfile((profile) => ({
        ...profile,
        gamification: updater(profile.gamification ?? DEFAULT_GAMIFICATION_STATS),
      }));
    },
    [updateActiveProfile]
  );

  const unfinishedImportCount = useMemo(() => {
    if (activeDailyPlan.dismissedImportBanner) return 0;
    let count = 0;
    for (const day of dailyHistory) {
      count += day.priorities.filter(
        (p) => p.text.trim() && (p.status === 'pending' || p.status === 'missed')
      ).length;
      count += day.todos.filter(
        (t) => t.text.trim() && (t.status === 'pending' || t.status === 'missed')
      ).length;
    }
    return count;
  }, [activeDailyPlan.dismissedImportBanner, dailyHistory]);

  const handleWidgetTickDailyEntry = useCallback(
    (kind: 'priority' | 'todo', entryId: string) => {
      const list = kind === 'priority' ? activeDailyPlan.priorities : activeDailyPlan.todos;
      const target = list.find((e) => e.id === entryId);
      if (!target || !target.text.trim()) return;
      const wasDone = target.status === 'done';

      handleUpdateDailyPlan((prev) => {
        const listKey = kind === 'priority' ? 'priorities' : 'todos';
        return {
          ...prev,
          updatedAt: Date.now(),
          [listKey]: prev[listKey].map((item) =>
            item.id === entryId
              ? {
                  ...item,
                  status: wasDone ? 'pending' : 'done',
                  completedAt: wasDone ? undefined : Date.now(),
                  missedAt: undefined,
                }
              : item
          ),
        };
      });

      if (!wasDone) {
        handleUpdateGamification((prev) => {
          const res = applyGoalCompletionReward(prev, kind === 'priority' ? 55 : 35, false);
          playCueSound(res.leveledUpTo ? 'goal_levelup' : 'goal_tick');
          return res.nextStats;
        });
      }
    },
    [activeDailyPlan.priorities, activeDailyPlan.todos, handleUpdateDailyPlan, handleUpdateGamification]
  );

  const handleWidgetMissDailyEntry = useCallback(
    (kind: 'priority' | 'todo', entryId: string) => {
      handleUpdateDailyPlan((prev) => {
        const listKey = kind === 'priority' ? 'priorities' : 'todos';
        return {
          ...prev,
          updatedAt: Date.now(),
          [listKey]: prev[listKey].map((item) =>
            item.id === entryId ? { ...item, status: 'missed', missedAt: Date.now() } : item
          ),
        };
      });
      playCueSound('goal_carryover');
    },
    [handleUpdateDailyPlan]
  );

  const activeSprintPhase: SprintPhase = isBreakRunning ? 'break' : 'work';

  return (
    <div className="relative flex min-h-screen flex-col bg-transparent text-slate-100 lg:h-screen lg:overflow-hidden">
      <ParticleBackground />

      <TopBar
        activeView={activeView}
        activeCardTitle={activeCard?.title ?? null}
        profileName={profileName}
        onSelectView={(view) => {
          if (view === 'workspace' && !activeCard) {
            setActiveView('hub');
            return;
          }
          setActiveView(view);
        }}
        onOpenProfiles={() => setIsProfileModalOpen(true)}
        isFocusRunning={isFocusRunning}
        sprintPhase={activeSprintPhase}
        onToggleFocus={() =>
          executeTimerAction({
            timer: 'focus',
            action: isFocusRunning ? 'pause' : 'start',
          })
        }
        logsCount={totalLogsCount}
      />

      {activeView === 'hub' ? (
        <StudySessionsHub
          profileName={profileName}
          cards={studyCards}
          onCreateCard={handleCreateCard}
          onOpenCard={(cardId) => {
            const target = studyCards.find((c) => c.id === cardId);
            if (target) openStudyCard(target);
          }}
          onRenameCard={handleRenameCard}
          onDeleteCard={handleDeleteCard}
          onJoinFriendRoom={handleJoinRoomInput}
        />
      ) : activeView === 'workspace' && activeCard ? (
        <main className="relative z-10 mx-auto grid w-full max-w-[1440px] flex-1 min-h-0 grid-cols-1 gap-3.5 px-4 py-3 sm:px-6 lg:grid-cols-12 lg:px-8">
          {/* Left Column: Realistic Sora Voice + Generous Full-Face Camera / Friend Co-Study */}
          <div className="flex min-h-0 flex-col gap-3 lg:col-span-5 xl:col-span-4">
            <CompanionStage
              pose={pose}
              caption={companionCaption}
              isSimulatingSpeech={isSimulatingSpeech}
              liveStatus={liveVoice.status}
              liveMuted={liveVoice.isMuted}
              isAssistantSpeaking={liveVoice.isAssistantSpeaking}
              audioLevel={liveVoice.audioLevel}
              outputLevel={liveVoice.outputLevel}
              liveError={liveVoice.errorMessage}
              liveDraftUserText={liveDraftUserText}
              liveDraftAssistantText={liveDraftAssistantText}
              onStartVoice={liveVoice.startVoice}
              onStopVoice={liveVoice.stopVoice}
              onReconnectVoice={liveVoice.reconnectLive}
              onToggleLiveMute={liveVoice.toggleMute}
            />

            <CoStudyRoomPanel
              roomId={roomId}
              shareUrl={shareUrl}
              roomStatus={studyRoom.status}
              remoteParticipants={studyRoom.remoteParticipants}
              remoteStream={studyRoom.remoteStream}
              onCreateAndCopyInvite={handleCreateAndCopyInvite}
              onJoinRoomInput={handleJoinRoomInput}
              onLeaveRoom={handleLeaveRoom}
              onCameraStreamChange={studyRoom.attachLocalCamera}
              onRecordingSaved={(clip) =>
                saveLogEntry(activeSprintPhase, clip.durationSeconds, clip)
              }
            />
          </div>

          {/* Right Column: Mode Switch + 3 Separate Timers (Focus | Break | Check-in) + Workspace */}
          <div className="flex min-h-0 flex-col gap-3 lg:col-span-7 xl:col-span-8">
            <SessionTimerBar
              panelMode={panelMode}
              onChangePanelMode={setPanelMode}
              focusRemainingSeconds={focusRemainingSeconds}
              focusTotalSeconds={timerSettings.workMinutes * 60}
              isFocusRunning={isFocusRunning}
              breakRemainingSeconds={breakRemainingSeconds}
              breakTotalSeconds={timerSettings.breakMinutes * 60}
              isBreakRunning={isBreakRunning}
              elapsedSessionSeconds={elapsedSessionSeconds}
              timerSettings={timerSettings}
              isCheckInRunning={isCheckInRunning}
              isCheckInStaged={isCheckInStaged}
              secondsUntilAlert={secondsUntilAlert}
              activeAlertBanner={activeAlertBanner}
              isLoadingCheckIn={isLoadingCheckIn}
              onToggleFocus={() =>
                executeTimerAction({
                  timer: 'focus',
                  action: isFocusRunning ? 'pause' : 'start',
                })
              }
              onResetFocus={() => executeTimerAction({ timer: 'focus', action: 'reset' })}
              onToggleBreak={() =>
                executeTimerAction({
                  timer: 'break',
                  action: isBreakRunning ? 'pause' : 'start',
                })
              }
              onResetBreak={() => executeTimerAction({ timer: 'break', action: 'reset' })}
              onUpdateTimerSettings={handleUpdateTimerSettings}
              onToggleCheckIn={() =>
                executeTimerAction({
                  timer: 'checkin',
                  action: isCheckInRunning || isCheckInStaged ? 'stop' : 'start',
                })
              }
              onTriggerAlertNow={triggerAutomaticAlert}
              onAlertReply={handleAlertReply}
              onDismissAlert={() => setActiveAlertBanner(null)}
              onSaveSessionLog={() => {
                saveLogEntry(activeSprintPhase, elapsedSessionSeconds);
                setCompanionCaption(`Saved ${activeCard.title} progress to History, ${profileName}.`);
                triggerSimulatedSpeech(1800);
              }}
            />

            {panelMode === 'focus' ? (
              <TodoPanel
                tasks={tasks}
                activeTaskId={activeTaskId}
                breakingDownTaskId={breakingDownTaskId}
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
                onToggleTask={handleToggleTask}
                onDeleteTask={handleDeleteTask}
                onToggleCollapse={handleToggleCollapse}
                onSelectFocusTask={(id) =>
                  setActiveTaskId((cur) => (cur === id ? null : id))
                }
                onReorderTask={handleReorderTask}
                onAddSubtask={handleAddSubtask}
                onToggleSubtask={handleToggleSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onBreakDownTask={handleBreakDownTask}
                onClearCompleted={handleClearCompleted}
              />
            ) : (
              <VideoPlaylistPanel
                playlist={playlist}
                activeVideoId={activeCard.activeVideoId}
                trimIntroSeconds={activeCard.videoTrimIntroSeconds ?? 0}
                trimOutroSeconds={activeCard.videoTrimOutroSeconds ?? 0}
                inSharedRoom={Boolean(roomId)}
                watchTogether={watchTogether}
                remoteVideoState={studyRoom.sharedVideoState}
                onToggleWatchTogether={() => setWatchTogether((w) => !w)}
                onSelectVideo={handleSelectVideo}
                onAddVideo={handleAddVideo}
                onAddPlaylistBatch={handleAddPlaylistBatch}
                onUpdateTrimSettings={handleUpdateTrimSettings}
                onRemoveVideo={handleRemoveVideo}
                onReorderVideo={handleReorderVideo}
                onBroadcastVideoSync={studyRoom.sendVideoSync}
              />
            )}
          </div>
        </main>
      ) : activeView === 'goals' ? (
        <GoalsView
          profileName={profileName}
          goals={goals}
          activeDailyPlan={activeDailyPlan}
          dailyHistory={dailyHistory}
          gamification={gamification}
          onUpdateGoals={handleUpdateGoals}
          onUpdateDailyPlan={handleUpdateDailyPlan}
          onUpdateDailyHistory={handleUpdateDailyHistory}
          onUpdateGamification={handleUpdateGamification}
        />
      ) : (
        <HistoryDashboardView
          profileName={profileName}
          cards={studyCards}
          hasActiveCard={Boolean(activeCard)}
          onDeleteLog={handleDeleteLog}
          onBackToHub={() => setActiveView('hub')}
          onBackToWorkspace={() => setActiveView(activeCard ? 'workspace' : 'hub')}
        />
      )}

      {(activeView === 'hub' || activeView === 'history') && (
        <DailyGoalFloatingWidget
          activeDailyPlan={activeDailyPlan}
          unfinishedImportCount={unfinishedImportCount}
          onTickEntry={handleWidgetTickDailyEntry}
          onMissEntry={handleWidgetMissDailyEntry}
          onOpenGoalsTab={() => setActiveView('goals')}
        />
      )}

      <ProfileOnboardingModal
        isOpen={isProfileModalOpen}
        canDismiss={Boolean(activeProfile)}
        profiles={profiles}
        activeProfile={activeProfile}
        isCloudSignedIn={Boolean(authToken && activeProfile?.isCloudAccount)}
        isSyncing={isSyncingAccount}
        onClose={() => setIsProfileModalOpen(false)}
        onRegisterCloudAccount={handleRegisterCloudAccount}
        onLoginCloudAccount={handleLoginCloudAccount}
        onSignOutCloudAccount={handleSignOutCloudAccount}
        onSelectLocalProfile={handleSelectProfile}
        onDeleteLocalProfile={handleDeleteProfile}
        onImportCardsBackup={handleImportCardsBackup}
      />
    </div>
  );
}
