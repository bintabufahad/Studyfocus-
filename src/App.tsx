import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompanionStage } from './components/CompanionStage';
import { CoStudyRoomPanel, fallbackCopyText } from './components/CoStudyRoomPanel';
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
  PlaylistItem,
  SessionLog,
  SprintPhase,
  StudySessionCard,
  TaskAction,
  TaskItem,
  TimerSettings,
  UserProfile,
  WorkspacePanelMode,
} from './types';
import {
  createNewProfile,
  createStudyCard,
  DEFAULT_TIMER_SETTINGS,
  fetchCurrentAccount,
  loadActiveProfileId,
  loadAuthToken,
  loadProfiles,
  loadTimerSnapshot,
  loginAccount,
  normalizeStudyCards,
  registerAccount,
  saveActiveProfileId,
  saveAuthToken,
  saveProfiles,
  saveTimerSnapshot,
  syncAccountCards,
} from './utils/profileStorage';
import { playCueSound } from './utils/soundCues';

function makeId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSessionOpeningQuestion(name: string, cardTitle: string, hasTasks: boolean): string {
  if (hasTasks) {
    return `Hey ${name}, welcome back to ${cardTitle}. Tap Talk Live or start your timer whenever you're ready.`;
  }
  return `Hey ${name}! What are we working on in ${cardTitle}? Tap Talk Live to tell me & set check-ins, or add tasks on the right.`;
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

  // Wall-clock anchored Sprint & Break Timer State
  const [sprintPhase, setSprintPhase] = useState<SprintPhase>('work');
  const [isFocusRunning, setIsFocusRunning] = useState(false);
  const [phaseRemainingSeconds, setPhaseRemainingSeconds] = useState(
    () => DEFAULT_TIMER_SETTINGS.workMinutes * 60
  );
  const [elapsedSessionSeconds, setElapsedSessionSeconds] = useState(0);
  const phaseEndAtRef = useRef<number | null>(null);
  const elapsedBaseRef = useRef<number>(0);
  const runningSinceRef = useRef<number | null>(null);
  const reminderFiredRef = useRef<boolean>(false);

  // Wall-clock anchored Automatic Check-In Timer (survives app tab & browser tab switches)
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [secondsUntilAlert, setSecondsUntilAlert] = useState(
    () => DEFAULT_TIMER_SETTINGS.checkInMinutes * 60
  );
  const nextAlertAtRef = useRef<number | null>(null);

  const [activeAlertBanner, setActiveAlertBanner] = useState<{
    kind: 'sprint_end' | 'break_end' | 'reminder' | 'checkin';
    title: string;
    message: string;
  } | null>(null);
  const [isLoadingCheckIn, setIsLoadingCheckIn] = useState(false);

  // Live Voice Transcripts
  const [liveDraftUserText, setLiveDraftUserText] = useState('');
  const [liveDraftAssistantText, setLiveDraftAssistantText] = useState('');
  const liveUserBufRef = useRef('');
  const liveAssistantBufRef = useRef('');
  const sessionStartTimeRef = useRef<number>(Date.now());

  // Always-fresh refs for timers/callbacks so check-ins & visibility resync never read stale state
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
  const alertEnabledRef = useRef(alertEnabled);
  alertEnabledRef.current = alertEnabled;
  const sprintPhaseRef = useRef(sprintPhase);
  sprintPhaseRef.current = sprintPhase;
  const phaseRemainingRef = useRef(phaseRemainingSeconds);
  phaseRemainingRef.current = phaseRemainingSeconds;

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

  // Restore active cloud account on launch & refresh when switching back between browsers
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

  // Debounced auto-sync of cloud account study cards across browsers
  const cloudSyncPayload = activeProfile?.isCloudAccount ? activeProfile.studyCards : null;
  useEffect(() => {
    if (!authToken || !cloudSyncPayload) return;
    if (suppressNextCloudPushRef.current) {
      suppressNextCloudPushRef.current = false;
      return;
    }

    hasUnsyncedCloudRef.current = true;
    const timer = window.setTimeout(async () => {
      setIsSyncingAccount(true);
      const ok = await syncAccountCards(authToken, cloudSyncPayload);
      if (ok) {
        hasUnsyncedCloudRef.current = false;
        lastCloudUpdatedAtRef.current = Date.now();
      }
      setIsSyncingAccount(false);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [authToken, cloudSyncPayload]);

  // Flush pending cloud sync on pagehide & pull updates when returning to browser window
  useEffect(() => {
    const handlePageHide = () => {
      if (authToken && activeProfile?.isCloudAccount && hasUnsyncedCloudRef.current) {
        void syncAccountCards(authToken, activeProfile.studyCards, true);
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
      sprintPhase?: SprintPhase;
      isFocusRunning?: boolean;
      phaseEndAt?: number | null;
      pausedRemainingSeconds?: number;
      elapsedSessionSeconds?: number;
      alertEnabled?: boolean;
      nextAlertAt?: number | null;
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
        sprintPhase: overrides?.sprintPhase ?? sprintPhaseRef.current,
        isFocusRunning: overrides?.isFocusRunning ?? isFocusRunningRef.current,
        phaseEndAt:
          overrides?.phaseEndAt !== undefined ? overrides.phaseEndAt : phaseEndAtRef.current,
        pausedRemainingSeconds:
          overrides?.pausedRemainingSeconds ?? phaseRemainingRef.current,
        elapsedSessionSeconds:
          overrides?.elapsedSessionSeconds ?? elapsedSecondsRef.current,
        alertEnabled: overrides?.alertEnabled ?? alertEnabledRef.current,
        nextAlertAt:
          overrides?.nextAlertAt !== undefined ? overrides.nextAlertAt : nextAlertAtRef.current,
        checkInMinutes:
          overrides?.checkInMinutes ?? timerSettingsRef.current.checkInMinutes,
        updatedAt: Date.now(),
      });
    },
    [activeProfileId]
  );

  const applyCheckInPreference = useCallback(
    (enabled: boolean, intervalMinutes?: number) => {
      const clampedMins =
        typeof intervalMinutes === 'number' && !Number.isNaN(intervalMinutes)
          ? Math.max(1, Math.min(180, Math.round(intervalMinutes)))
          : timerSettingsRef.current.checkInMinutes;

      setAlertEnabled(enabled);
      if (typeof intervalMinutes === 'number' && !Number.isNaN(intervalMinutes)) {
        updateActiveCard((card) => ({
          ...card,
          timerSettings: { ...card.timerSettings, checkInMinutes: clampedMins },
        }));
      }

      const nextTarget = enabled ? Date.now() + clampedMins * 60_000 : null;
      nextAlertAtRef.current = nextTarget;
      setSecondsUntilAlert(clampedMins * 60);
      persistActiveTimerSnapshot({
        alertEnabled: enabled,
        nextAlertAt: nextTarget,
        checkInMinutes: clampedMins,
      });
    },
    [persistActiveTimerSnapshot, updateActiveCard]
  );

  const openStudyCard = useCallback(
    (card: StudySessionCard) => {
      // If returning to the currently active card (e.g. from Sessions or History), keep running timers intact!
      if (activeCardRef.current?.id === card.id) {
        setActiveView('workspace');
        return;
      }

      setActiveCardId(card.id);
      setActiveView('workspace');
      setPanelMode('focus');
      setActiveTaskId(card.tasks.find((t) => !t.completed)?.id ?? null);
      setActiveAlertBanner(null);

      // Restore unexpired running timer snapshot for this card if present
      const snap = loadTimerSnapshot();
      if (snap && snap.cardId === card.id && snap.profileId === activeProfileId) {
        const now = Date.now();
        const restoredPhase = snap.sprintPhase;
        let restoredRunning = snap.isFocusRunning;
        let restoredRem = snap.pausedRemainingSeconds;
        let restoredPhaseEndAt = snap.phaseEndAt;

        if (restoredRunning && restoredPhaseEndAt) {
          const left = Math.ceil((restoredPhaseEndAt - now) / 1000);
          if (left > 0) {
            restoredRem = left;
          } else {
            restoredRunning = false;
            restoredPhaseEndAt = null;
            restoredRem =
              (restoredPhase === 'work'
                ? card.timerSettings.workMinutes
                : card.timerSettings.breakMinutes) * 60;
          }
        }

        const restoredAlertEnabled = snap.alertEnabled;
        const intervalMs = Math.max(1, card.timerSettings.checkInMinutes) * 60_000;
        let restoredNextAlert = snap.nextAlertAt;
        if (restoredAlertEnabled) {
          if (!restoredNextAlert || restoredNextAlert <= now) {
            restoredNextAlert = now + intervalMs;
          }
        } else {
          restoredNextAlert = null;
        }

        setSprintPhase(restoredPhase);
        setIsFocusRunning(restoredRunning);
        setPhaseRemainingSeconds(restoredRem);
        phaseEndAtRef.current = restoredPhaseEndAt;
        const addedWhileRunning =
          restoredRunning && snap.updatedAt
            ? Math.max(0, Math.floor((now - snap.updatedAt) / 1000))
            : 0;
        const nextElapsed = snap.elapsedSessionSeconds + addedWhileRunning;
        setElapsedSessionSeconds(nextElapsed);
        elapsedBaseRef.current = nextElapsed;
        runningSinceRef.current = restoredRunning ? now : null;
        reminderFiredRef.current = false;

        setAlertEnabled(restoredAlertEnabled);
        nextAlertAtRef.current = restoredNextAlert;
        setSecondsUntilAlert(
          restoredNextAlert
            ? Math.max(1, Math.ceil((restoredNextAlert - now) / 1000))
            : card.timerSettings.checkInMinutes * 60
        );
        setPose(restoredRunning ? (restoredPhase === 'break' ? 'coffee' : 'typing') : 'coffee');
        setCompanionCaption(
          restoredRunning
            ? `Welcome back to ${card.title} — your timer kept running.`
            : buildSessionOpeningQuestion(profileNameRef.current, card.title, card.tasks.length > 0)
        );
      } else {
        setSprintPhase('work');
        setIsFocusRunning(false);
        phaseEndAtRef.current = null;
        runningSinceRef.current = null;
        elapsedBaseRef.current = 0;
        reminderFiredRef.current = false;
        setPhaseRemainingSeconds(card.timerSettings.workMinutes * 60);
        setElapsedSessionSeconds(0);
        setPose('speaking');
        sessionStartTimeRef.current = Date.now();

        const nextAlert = alertEnabledRef.current
          ? Date.now() + card.timerSettings.checkInMinutes * 60_000
          : null;
        nextAlertAtRef.current = nextAlert;
        setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

        const opening = buildSessionOpeningQuestion(
          profileNameRef.current,
          card.title,
          card.tasks.length > 0
        );
        setCompanionCaption(opening);
        triggerSimulatedSpeech(2400);
        persistActiveTimerSnapshot({
          cardId: card.id,
          sprintPhase: 'work',
          isFocusRunning: false,
          phaseEndAt: null,
          pausedRemainingSeconds: card.timerSettings.workMinutes * 60,
          elapsedSessionSeconds: 0,
          alertEnabled: alertEnabledRef.current,
          nextAlertAt: nextAlert,
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
    setSprintPhase('work');
    setIsFocusRunning(false);
    phaseEndAtRef.current = null;
    runningSinceRef.current = null;
    elapsedBaseRef.current = 0;
    setPhaseRemainingSeconds(newCard.timerSettings.workMinutes * 60);
    const nextAlert = Date.now() + newCard.timerSettings.checkInMinutes * 60_000;
    nextAlertAtRef.current = nextAlert;
    setSecondsUntilAlert(newCard.timerSettings.checkInMinutes * 60);
    const msg = buildSessionOpeningQuestion(activeProfile.name, newCard.title, false);
    setCompanionCaption(msg);
    triggerSimulatedSpeech(2400);
  }, [activeProfile, openStudyCard, triggerSimulatedSpeech]);

  // Shared Study Room WebSocket & WebRTC
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
    const { token, account } = await registerAccount(username, password, starterCards);
    if (token) setAuthToken(token);
    lastCloudUpdatedAtRef.current = account.updatedAt;
    suppressNextCloudPushRef.current = true;

    const cloudProfile: UserProfile = {
      id: account.id,
      name: account.username,
      createdAt: account.createdAt,
      studyCards: account.studyCards,
      isCloudAccount: true,
    };
    setProfiles((prev) => [
      cloudProfile,
      ...prev.filter((p) => !p.isCloudAccount && p.id !== account.id),
    ]);
    setActiveProfileId(account.id);
    setActiveCardId(null);
    phaseEndAtRef.current = null;
    nextAlertAtRef.current = null;
    saveTimerSnapshot(null);
    setActiveView(initialInviteRef.current ? 'workspace' : 'hub');
    setIsFocusRunning(false);
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
      isCloudAccount: true,
    };
    setProfiles((prev) => [
      cloudProfile,
      ...prev.filter((p) => !p.isCloudAccount && p.id !== account.id),
    ]);
    setActiveProfileId(account.id);
    setActiveCardId(null);
    phaseEndAtRef.current = null;
    nextAlertAtRef.current = null;
    saveTimerSnapshot(null);
    setActiveView(initialInviteRef.current ? 'workspace' : 'hub');
    setIsFocusRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
    setCompanionCaption(`Welcome back, ${account.username} — loaded ${account.studyCards.length} cards.`);
  };

  const handleSignOutCloudAccount = async () => {
    if (authToken && activeProfile?.isCloudAccount) {
      await syncAccountCards(authToken, activeProfile.studyCards);
    }
    setAuthToken(null);
    hasUnsyncedCloudRef.current = false;
    phaseEndAtRef.current = null;
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
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
  };

  const handleSelectProfile = (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    setActiveProfileId(id);
    setActiveCardId(null);
    phaseEndAtRef.current = null;
    nextAlertAtRef.current = null;
    setActiveView('hub');
    setIsFocusRunning(false);
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
    setSprintPhase('work');
    setIsFocusRunning(false);
    phaseEndAtRef.current = null;
    runningSinceRef.current = null;
    elapsedBaseRef.current = 0;
    reminderFiredRef.current = false;
    setPhaseRemainingSeconds(card.timerSettings.workMinutes * 60);
    setElapsedSessionSeconds(0);
    setActiveTaskId(null);
    setActiveAlertBanner(null);
    setPose('speaking');
    sessionStartTimeRef.current = Date.now();

    const nextAlert = alertEnabled
      ? Date.now() + card.timerSettings.checkInMinutes * 60_000
      : null;
    nextAlertAtRef.current = nextAlert;
    setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

    const opening = buildSessionOpeningQuestion(profileName, card.title, false);
    setCompanionCaption(opening);
    triggerSimulatedSpeech(2400);
    persistActiveTimerSnapshot({
      cardId: card.id,
      sprintPhase: 'work',
      isFocusRunning: false,
      phaseEndAt: null,
      pausedRemainingSeconds: card.timerSettings.workMinutes * 60,
      elapsedSessionSeconds: 0,
      alertEnabled,
      nextAlertAt: nextAlert,
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
        applyCheckInPreference(enabled, mins);
      }
    },
    [applyCheckInPreference, applyTaskActions]
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
  }, []);

  const liveVoiceRef = useRef<ReturnType<typeof useLiveVoice> | null>(null);

  const handleLiveReady = useCallback(
    (isReconnect: boolean) => {
      const card = activeCardRef.current;
      const currentTasks = tasksRef.current;
      const settings = timerSettingsRef.current;
      if (!card || !liveVoiceRef.current) return;

      // On seamless mid-session reconnect, don't interrupt or repeat the greeting
      if (isReconnect) return;

      const taskSummary =
        currentTasks.length > 0
          ? currentTasks
              .map((t) => `${t.completed ? '[done] ' : ''}${t.title}`)
              .join(', ')
          : 'no tasks added yet';

      if (isFocusRunningRef.current) {
        liveVoiceRef.current.sendTextPrompt(
          `[Live voice connected for ${profileNameRef.current} on "${card.title}". IMPORTANT: The focus timer is ALREADY running. Do NOT ask what they are planning to do or interrupt their focus. Just quietly say one brief warm sentence that you're studying beside them.]`
        );
      } else if (currentTasks.length > 0) {
        liveVoiceRef.current.sendTextPrompt(
          `[Live voice connected for ${profileNameRef.current} on "${card.title}". Existing tasks: ${taskSummary}. Check-ins: ${
            alertEnabled ? `every ${settings.checkInMinutes} minutes` : 'off'
          }.] Say one brief warm sentence confirming you're live and ready to study together.`
        );
      } else {
        liveVoiceRef.current.sendTextPrompt(
          `[Live voice connected for ${profileNameRef.current} on "${card.title}". Focus timer has NOT started yet. Check-ins are currently ${
            alertEnabled ? `every ${settings.checkInMinutes} minutes` : 'off'
          }.] Ask ${profileNameRef.current} in 1-2 short natural sentences what they want to tackle before starting the timer, and whether they want periodic check-ins (and after how many minutes). Call addTask or setCheckInPreference as soon as they answer.`
        );
      }
    },
    [alertEnabled]
  );

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

  useEffect(() => {
    if (!isFocusRunning || sprintPhase === 'break') return;
    setPose('typing');
    const id = window.setInterval(() => {
      setPose((current) => {
        if (current === 'speaking') return 'typing';
        return Math.random() > 0.72 ? 'coffee' : 'typing';
      });
    }, 24000);
    return () => window.clearInterval(id);
  }, [isFocusRunning, sprintPhase]);

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
            ? `${phaseLogged === 'work' ? 'Work Sprint' : 'Break'} · ${active.title}`
            : `${phaseLogged === 'work' ? 'Work Sprint' : 'Break'} · ${card.title}`,
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
            alertEnabled,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          pose?: CompanionPose;
          taskActions?: TaskAction[];
          checkInAction?: { enabled: boolean; intervalMinutes?: number } | null;
        };

        if (data.taskActions && data.taskActions.length > 0) {
          applyTaskActions(data.taskActions);
        }

        if (data.checkInAction && typeof data.checkInAction.enabled === 'boolean') {
          applyCheckInPreference(
            data.checkInAction.enabled,
            data.checkInAction.intervalMinutes
          );
        }

        const reply = data.reply ?? "Updated your plan—I'm right here with you.";
        setCompanionCaption(reply);
        setActiveAlertBanner(null);

        const isLive = liveVoiceRef.current?.status === 'live';
        if (isLive) {
          liveVoiceRef.current?.sendTextPrompt(
            `[User answered: "${trimmed}". You already responded & updated their list: "${reply}". Keep this context in mind.]`
          );
        } else {
          triggerSimulatedSpeech(2200);
        }

        setPose(data.pose ?? (isFocusRunning ? 'typing' : 'coffee'));
      } catch {
        setPose('coffee');
      }
    },
    [alertEnabled, applyCheckInPreference, applyTaskActions, isFocusRunning, triggerSimulatedSpeech]
  );

  const triggerAutomaticAlert = useCallback(async () => {
    const card = activeCardRef.current;
    if (!card || isLoadingCheckIn) return;

    const currentTasks = tasksRef.current;
    const settings = timerSettingsRef.current;
    const user = profileNameRef.current;
    const timerRunning = isFocusRunningRef.current;

    // Reset next wall-clock alert deadline immediately so it never stalls
    const nextTarget = Date.now() + settings.checkInMinutes * 60_000;
    nextAlertAtRef.current = nextTarget;
    setSecondsUntilAlert(settings.checkInMinutes * 60);
    persistActiveTimerSnapshot({ nextAlertAt: nextTarget });

    // Once the focus timer is running and no tasks were planned beforehand, do NOT disturb by asking what they plan to do
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

    // If Live Voice WebSocket is genuinely OPEN, let Sora speak her check-in natively in Kore's voice
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
            : 'ask what they want to add to their To-Do list before starting the timer.'
        }`
      );

    if (liveSent) {
      const liveBannerMsg = activeTask
        ? `Checking in on "${activeTask.title}" — tell Sora how it's going!`
        : `${settings.checkInMinutes}m check-in — tell Sora what you want to add before starting!`;
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
          : timerRunning
            ? `Checking in quietly, ${user}—steady focus, keep going at your own pace.`
            : `Hey ${user}, want to pick a task for ${card.title} before starting the timer?`);

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
        : timerRunning
          ? `Checking in quietly, ${user}—steady focus, keep going at your own pace.`
          : `Hey ${user}, what task would you like to add before starting your timer?`;
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

  const sprintCompleteHandlerRef = useRef<() => void>(() => {});
  const reminderHandlerRef = useRef<() => void>(() => {});
  const alertTriggerRef = useRef(triggerAutomaticAlert);
  alertTriggerRef.current = triggerAutomaticAlert;

  sprintCompleteHandlerRef.current = () => {
    if (sprintPhaseRef.current === 'work') {
      const completedDuration = timerSettingsRef.current.workMinutes * 60;
      saveLogEntry('work', completedDuration);
      if (timerSettingsRef.current.chimeEnabled) playCueSound('sprint_end');
      const nextBreakSec = timerSettingsRef.current.breakMinutes * 60;
      setSprintPhase('break');
      setPhaseRemainingSeconds(nextBreakSec);
      phaseEndAtRef.current = Date.now() + nextBreakSec * 1000;
      reminderFiredRef.current = false;
      setPose('coffee');
      const msg = `Nice steady work, ${profileNameRef.current}. Enjoy a ${timerSettingsRef.current.breakMinutes}-minute break.`;
      setActiveAlertBanner({
        kind: 'sprint_end',
        title: 'Work Sprint Complete',
        message: msg,
      });
      setCompanionCaption(msg);
      triggerSimulatedSpeech(2400);
    } else {
      if (timerSettingsRef.current.chimeEnabled) playCueSound('break_end');
      const nextWorkSec = timerSettingsRef.current.workMinutes * 60;
      setSprintPhase('work');
      setPhaseRemainingSeconds(nextWorkSec);
      phaseEndAtRef.current = Date.now() + nextWorkSec * 1000;
      reminderFiredRef.current = false;
      setPose('typing');
      const msg = `Break complete — ready to ease back in, ${profileNameRef.current}?`;
      setActiveAlertBanner({
        kind: 'break_end',
        title: 'Break Complete',
        message: msg,
      });
      setCompanionCaption(msg);
      triggerSimulatedSpeech(2200);
    }
  };

  reminderHandlerRef.current = () => {
    if (timerSettingsRef.current.chimeEnabled) playCueSound('reminder');
    const mins = timerSettingsRef.current.reminderMinutesBeforeEnd;
    setActiveAlertBanner({
      kind: 'reminder',
      title: `${mins}m Reminder`,
      message:
        sprintPhaseRef.current === 'work'
          ? `${mins} minute${mins === 1 ? '' : 's'} left in your work sprint.`
          : `${mins} minute${mins === 1 ? '' : 's'} left in your break.`,
    });
  };

  // Unified Wall-Clock Timer Sync (runs smoothly across app tabs & browser tab switches!)
  const syncTimersFromWallClock = useCallback(() => {
    const now = Date.now();

    if (isFocusRunningRef.current && activeCardRef.current) {
      if (!phaseEndAtRef.current) {
        phaseEndAtRef.current = now + phaseRemainingRef.current * 1000;
      }
      if (!runningSinceRef.current) {
        runningSinceRef.current = now;
      }
      const nextElapsed =
        elapsedBaseRef.current + Math.max(0, Math.floor((now - runningSinceRef.current) / 1000));
      setElapsedSessionSeconds(nextElapsed);

      const rem = Math.max(0, Math.ceil((phaseEndAtRef.current - now) / 1000));
      const reminderSec = timerSettingsRef.current.reminderMinutesBeforeEnd * 60;
      const totalSec =
        (sprintPhaseRef.current === 'work'
          ? timerSettingsRef.current.workMinutes
          : timerSettingsRef.current.breakMinutes) * 60;

      if (
        reminderSec > 0 &&
        totalSec > reminderSec &&
        rem > 0 &&
        rem <= reminderSec &&
        !reminderFiredRef.current
      ) {
        reminderFiredRef.current = true;
        reminderHandlerRef.current();
      }

      if (rem <= 0) {
        sprintCompleteHandlerRef.current();
      } else {
        setPhaseRemainingSeconds(rem);
      }
    }

    if (alertEnabledRef.current && activeCardRef.current) {
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

  // Sprint & Break wall-clock interval (active regardless of activeView tab!)
  useEffect(() => {
    if (!isFocusRunning || !activeCardId) return;
    if (!phaseEndAtRef.current) {
      phaseEndAtRef.current = Date.now() + phaseRemainingRef.current * 1000;
    }
    if (!runningSinceRef.current) {
      runningSinceRef.current = Date.now();
    }
    syncTimersFromWallClock();
    const id = window.setInterval(syncTimersFromWallClock, 1000);
    return () => window.clearInterval(id);
  }, [activeCardId, isFocusRunning, sprintPhase, syncTimersFromWallClock]);

  // Automatic Check-In wall-clock interval (active across ALL tabs & never reset on view switches!)
  useEffect(() => {
    if (!alertEnabled || !activeCardId) {
      nextAlertAtRef.current = null;
      return;
    }

    const intervalMs = Math.max(1, timerSettings.checkInMinutes) * 60_000;
    if (!nextAlertAtRef.current) {
      nextAlertAtRef.current = Date.now() + intervalMs;
    }

    syncTimersFromWallClock();
    const id = window.setInterval(syncTimersFromWallClock, 1000);
    return () => window.clearInterval(id);
  }, [activeCardId, alertEnabled, syncTimersFromWallClock, timerSettings.checkInMinutes]);

  // Immediate catch-up whenever returning from another browser tab or minimizing/restoring window
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

  // Playlist handlers scoped to active Study Card
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

  const handleToggleFocus = () => {
    const next = !isFocusRunning;
    const now = Date.now();

    if (next) {
      if (elapsedSessionSeconds === 0) {
        sessionStartTimeRef.current = now;
      }
      const nextPhaseEnd = now + phaseRemainingSeconds * 1000;
      phaseEndAtRef.current = nextPhaseEnd;
      elapsedBaseRef.current = elapsedSessionSeconds;
      runningSinceRef.current = now;
      reminderFiredRef.current = false;

      setCompanionCaption((caption) =>
        caption.includes('What are we working on') ||
        caption.includes('What do you want to work on') ||
        caption.includes("What's our focus first")
          ? "Timer started — I'm studying quietly beside you."
          : caption
      );
      persistActiveTimerSnapshot({
        isFocusRunning: true,
        phaseEndAt: nextPhaseEnd,
        pausedRemainingSeconds: phaseRemainingSeconds,
        elapsedSessionSeconds,
      });
    } else {
      const rem = phaseEndAtRef.current
        ? Math.max(0, Math.ceil((phaseEndAtRef.current - now) / 1000))
        : phaseRemainingSeconds;
      const totalElapsed = runningSinceRef.current
        ? elapsedBaseRef.current + Math.max(0, Math.floor((now - runningSinceRef.current) / 1000))
        : elapsedSessionSeconds;

      phaseEndAtRef.current = null;
      runningSinceRef.current = null;
      elapsedBaseRef.current = totalElapsed;
      setPhaseRemainingSeconds(rem);
      setElapsedSessionSeconds(totalElapsed);
      persistActiveTimerSnapshot({
        isFocusRunning: false,
        phaseEndAt: null,
        pausedRemainingSeconds: rem,
        elapsedSessionSeconds: totalElapsed,
      });
    }

    setIsFocusRunning(next);
    setPose(next ? (sprintPhase === 'break' ? 'coffee' : 'typing') : 'coffee');
  };

  const handleResetTimer = () => {
    const resetSec =
      (sprintPhase === 'work' ? timerSettings.workMinutes : timerSettings.breakMinutes) * 60;
    phaseEndAtRef.current = null;
    runningSinceRef.current = null;
    reminderFiredRef.current = false;
    setIsFocusRunning(false);
    setPhaseRemainingSeconds(resetSec);
    setPose('coffee');
    persistActiveTimerSnapshot({
      isFocusRunning: false,
      phaseEndAt: null,
      pausedRemainingSeconds: resetSec,
    });
  };

  const handleSkipPhase = () => {
    const nextPhase: SprintPhase = sprintPhase === 'work' ? 'break' : 'work';
    const nextSec =
      (nextPhase === 'work' ? timerSettings.workMinutes : timerSettings.breakMinutes) * 60;
    const nextEnd = isFocusRunning ? Date.now() + nextSec * 1000 : null;
    phaseEndAtRef.current = nextEnd;
    reminderFiredRef.current = false;
    setSprintPhase(nextPhase);
    setPhaseRemainingSeconds(nextSec);
    setPose(nextPhase === 'break' ? 'coffee' : isFocusRunning ? 'typing' : 'coffee');
    persistActiveTimerSnapshot({
      sprintPhase: nextPhase,
      phaseEndAt: nextEnd,
      pausedRemainingSeconds: nextSec,
    });
  };

  const handleUpdateTimerSettings = (next: TimerSettings) => {
    const prevWork = timerSettings.workMinutes;
    const prevBreak = timerSettings.breakMinutes;
    const prevAlert = timerSettings.checkInMinutes;

    updateActiveCard((c) => ({ ...c, timerSettings: next }));

    if (!isFocusRunning) {
      if (sprintPhase === 'work' && next.workMinutes !== prevWork) {
        setPhaseRemainingSeconds(next.workMinutes * 60);
      } else if (sprintPhase === 'break' && next.breakMinutes !== prevBreak) {
        setPhaseRemainingSeconds(next.breakMinutes * 60);
      }
    }
    if (next.checkInMinutes !== prevAlert) {
      const nextTarget = alertEnabled ? Date.now() + next.checkInMinutes * 60_000 : null;
      nextAlertAtRef.current = nextTarget;
      setSecondsUntilAlert(next.checkInMinutes * 60);
      persistActiveTimerSnapshot({
        nextAlertAt: nextTarget,
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

  const phaseTotalSeconds =
    (sprintPhase === 'work' ? timerSettings.workMinutes : timerSettings.breakMinutes) * 60;

  return (
    <div className="relative flex min-h-screen flex-col bg-[#090B14] text-slate-100 lg:h-screen lg:overflow-hidden">
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
        sprintPhase={sprintPhase}
        onToggleFocus={handleToggleFocus}
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
        <main className="relative z-10 mx-auto grid w-full max-w-[1440px] flex-1 min-h-0 grid-cols-1 gap-3.5 px-4 py-3 sm:px-6 md:grid-cols-12 lg:px-8">
          {/* Left Column: Realistic Sora Voice + Generous Full-Face Camera / Friend Co-Study */}
          <div className="flex min-h-0 flex-col gap-3 md:col-span-5 lg:col-span-4">
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
              onRecordingSaved={(clip) => saveLogEntry(sprintPhase, clip.durationSeconds, clip)}
            />
          </div>

          {/* Right Column: Slim Timer + Visible Check-in Countdown + Focus Plan / Video & Playlist */}
          <div className="flex min-h-0 flex-col gap-3 md:col-span-7 lg:col-span-8">
            <SessionTimerBar
              panelMode={panelMode}
              onChangePanelMode={setPanelMode}
              sprintPhase={sprintPhase}
              phaseRemainingSeconds={phaseRemainingSeconds}
              phaseTotalSeconds={phaseTotalSeconds}
              elapsedSessionSeconds={elapsedSessionSeconds}
              isFocusRunning={isFocusRunning}
              timerSettings={timerSettings}
              alertEnabled={alertEnabled}
              secondsUntilAlert={secondsUntilAlert}
              activeAlertBanner={activeAlertBanner}
              isLoadingCheckIn={isLoadingCheckIn}
              onToggleFocus={handleToggleFocus}
              onResetTimer={handleResetTimer}
              onSkipPhase={handleSkipPhase}
              onUpdateTimerSettings={handleUpdateTimerSettings}
              onToggleAlertEnabled={() => {
                applyCheckInPreference(!alertEnabled);
              }}
              onTriggerAlertNow={triggerAutomaticAlert}
              onAlertReply={handleAlertReply}
              onDismissAlert={() => setActiveAlertBanner(null)}
              onSaveSessionLog={() => {
                saveLogEntry(sprintPhase, elapsedSessionSeconds);
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
                inSharedRoom={Boolean(roomId)}
                watchTogether={watchTogether}
                remoteVideoState={studyRoom.sharedVideoState}
                onToggleWatchTogether={() => setWatchTogether((w) => !w)}
                onSelectVideo={handleSelectVideo}
                onAddVideo={handleAddVideo}
                onRemoveVideo={handleRemoveVideo}
                onReorderVideo={handleReorderVideo}
                onBroadcastVideoSync={studyRoom.sendVideoSync}
              />
            )}
          </div>
        </main>
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
