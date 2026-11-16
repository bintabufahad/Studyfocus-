import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompanionStage, type SoraPromptMode } from './components/CompanionStage';
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
  loadActiveProfileId,
  loadProfiles,
  saveActiveProfileId,
  saveProfiles,
} from './utils/profileStorage';
import { playCueSound } from './utils/soundCues';

function makeId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSessionOpeningQuestion(name: string, cardTitle: string, hasTasks: boolean): string {
  if (hasTasks) {
    return `Hey ${name}, welcome back to ${cardTitle}. What's our focus first, and want me to check in every ${DEFAULT_TIMER_SETTINGS.checkInMinutes} mins or a different interval?`;
  }
  return `Hey ${name}! What do you want to work on in ${cardTitle} today? Also, do you want me to check in on you—and after how many minutes?`;
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
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(
    () => loadProfiles().length === 0
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
  const [soraPromptMode, setSoraPromptMode] = useState<SoraPromptMode>('idle');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState(false);
  const speechSimTimerRef = useRef<number | null>(null);

  // Sprint & Break Timer State
  const [sprintPhase, setSprintPhase] = useState<SprintPhase>('work');
  const [isFocusRunning, setIsFocusRunning] = useState(false);
  const [phaseRemainingSeconds, setPhaseRemainingSeconds] = useState(
    () => DEFAULT_TIMER_SETTINGS.workMinutes * 60
  );
  const [elapsedSessionSeconds, setElapsedSessionSeconds] = useState(0);

  // User-Demand Built-In Automatic Alert Timer (wall-clock anchored so edits never reset it)
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

  // Always-fresh refs for timers/callbacks so check-ins never read stale state
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

      if (enabled) {
        nextAlertAtRef.current = Date.now() + clampedMins * 60_000;
        setSecondsUntilAlert(clampedMins * 60);
      } else {
        nextAlertAtRef.current = null;
        setSecondsUntilAlert(clampedMins * 60);
      }
    },
    [updateActiveCard]
  );

  const openStudyCard = useCallback(
    (card: StudySessionCard) => {
      setActiveCardId(card.id);
      setActiveView('workspace');
      setPanelMode('focus');
      setSprintPhase('work');
      setIsFocusRunning(false);
      setPhaseRemainingSeconds(card.timerSettings.workMinutes * 60);
      setElapsedSessionSeconds(0);
      setActiveTaskId(card.tasks.find((t) => !t.completed)?.id ?? null);
      setActiveAlertBanner(null);
      setPose('speaking');
      sessionStartTimeRef.current = Date.now();

      nextAlertAtRef.current = alertEnabled
        ? Date.now() + card.timerSettings.checkInMinutes * 60_000
        : null;
      setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

      const opening = buildSessionOpeningQuestion(
        profileNameRef.current,
        card.title,
        card.tasks.length > 0
      );
      setCompanionCaption(opening);
      setSoraPromptMode('onboarding');
      triggerSimulatedSpeech(2400);

      updateActiveProfile((profile) => ({
        ...profile,
        studyCards: profile.studyCards.map((c) =>
          c.id === card.id ? { ...c, lastOpenedAt: Date.now() } : c
        ),
      }));
    },
    [alertEnabled, triggerSimulatedSpeech, updateActiveProfile]
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
    setPhaseRemainingSeconds(newCard.timerSettings.workMinutes * 60);
    nextAlertAtRef.current = Date.now() + newCard.timerSettings.checkInMinutes * 60_000;
    setSecondsUntilAlert(newCard.timerSettings.checkInMinutes * 60);
    const msg = buildSessionOpeningQuestion(activeProfile.name, newCard.title, false);
    setCompanionCaption(msg);
    setSoraPromptMode('onboarding');
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

  const handleCreateProfile = (name: string) => {
    const profile = createNewProfile(name);
    setProfiles((prev) => [...prev, profile]);
    setActiveProfileId(profile.id);
    setActiveCardId(null);
    setActiveView(initialInviteRef.current ? 'workspace' : 'hub');
    setIsFocusRunning(false);
    setElapsedSessionSeconds(0);
    setActiveAlertBanner(null);
    setCompanionCaption(`Hey ${profile.name} — ready whenever you open a study card.`);
  };

  const handleSelectProfile = (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    setActiveProfileId(id);
    setActiveCardId(null);
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
    setPhaseRemainingSeconds(card.timerSettings.workMinutes * 60);
    setElapsedSessionSeconds(0);
    setActiveTaskId(null);
    setActiveAlertBanner(null);
    setPose('speaking');
    sessionStartTimeRef.current = Date.now();

    nextAlertAtRef.current = alertEnabled
      ? Date.now() + card.timerSettings.checkInMinutes * 60_000
      : null;
    setSecondsUntilAlert(card.timerSettings.checkInMinutes * 60);

    const opening = buildSessionOpeningQuestion(profileName, card.title, false);
    setCompanionCaption(opening);
    setSoraPromptMode('onboarding');
    triggerSimulatedSpeech(2400);
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
        setSoraPromptMode('idle');
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
      setIsSendingReply(true);
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
        setSoraPromptMode('idle');
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
      } finally {
        setIsSendingReply(false);
      }
    },
    [alertEnabled, applyCheckInPreference, applyTaskActions, isFocusRunning, triggerSimulatedSpeech]
  );

  const handleQuickCheckInChoice = useCallback(
    (minutes: number | null) => {
      if (minutes === null) {
        applyCheckInPreference(false);
        const msg = `No problem, ${profileNameRef.current}—I'll stay quietly beside you without auto check-ins. Type or say what you want on your To-Do list anytime.`;
        setCompanionCaption(msg);
        setSoraPromptMode('idle');
        triggerSimulatedSpeech(2200);
      } else {
        applyCheckInPreference(true, minutes);
        const msg =
          tasksRef.current.length === 0
            ? `Got it—I'll check in every ${minutes} minutes! What's the main thing you want to work on first?`
            : `Got it—I'll check in on your progress every ${minutes} minutes!`;
        setCompanionCaption(msg);
        setSoraPromptMode('idle');
        triggerSimulatedSpeech(2200);
      }
    },
    [applyCheckInPreference, triggerSimulatedSpeech]
  );

  const triggerAutomaticAlert = useCallback(async () => {
    const card = activeCardRef.current;
    if (!card || isLoadingCheckIn) return;

    const currentTasks = tasksRef.current;
    const settings = timerSettingsRef.current;
    const user = profileNameRef.current;
    const timerRunning = isFocusRunningRef.current;

    // Reset next wall-clock alert deadline immediately so it never stalls
    nextAlertAtRef.current = Date.now() + settings.checkInMinutes * 60_000;
    setSecondsUntilAlert(settings.checkInMinutes * 60);

    // Once the focus timer is running and no tasks were planned beforehand, do NOT disturb by asking what they plan to do
    if (timerRunning && currentTasks.length === 0) {
      return;
    }

    setIsLoadingCheckIn(true);
    setPose('speaking');
    setSoraPromptMode('checkin');

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
  }, [isLoadingCheckIn, triggerSimulatedSpeech]);

  const sprintCompleteHandlerRef = useRef<() => void>(() => {});
  const reminderHandlerRef = useRef<() => void>(() => {});
  const alertTriggerRef = useRef(triggerAutomaticAlert);
  alertTriggerRef.current = triggerAutomaticAlert;

  sprintCompleteHandlerRef.current = () => {
    if (sprintPhase === 'work') {
      const completedDuration = timerSettings.workMinutes * 60;
      saveLogEntry('work', completedDuration);
      if (timerSettings.chimeEnabled) playCueSound('sprint_end');
      setSprintPhase('break');
      setPhaseRemainingSeconds(timerSettings.breakMinutes * 60);
      setPose('coffee');
      const msg = `Nice steady work, ${profileName}. Enjoy a ${timerSettings.breakMinutes}-minute break.`;
      setActiveAlertBanner({
        kind: 'sprint_end',
        title: 'Work Sprint Complete',
        message: msg,
      });
      setCompanionCaption(msg);
      triggerSimulatedSpeech(2400);
    } else {
      if (timerSettings.chimeEnabled) playCueSound('break_end');
      setSprintPhase('work');
      setPhaseRemainingSeconds(timerSettings.workMinutes * 60);
      setPose('typing');
      const msg = `Break complete — ready to ease back in, ${profileName}?`;
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
    if (timerSettings.chimeEnabled) playCueSound('reminder');
    const mins = timerSettings.reminderMinutesBeforeEnd;
    setActiveAlertBanner({
      kind: 'reminder',
      title: `${mins}m Reminder`,
      message:
        sprintPhase === 'work'
          ? `${mins} minute${mins === 1 ? '' : 's'} left in your work sprint.`
          : `${mins} minute${mins === 1 ? '' : 's'} left in your break.`,
    });
  };

  // Sprint & Break countdown interval (only primitive dependencies!)
  useEffect(() => {
    if (!isFocusRunning || activeView !== 'workspace' || !activeCardId) return;
    const id = window.setInterval(() => {
      setElapsedSessionSeconds((prev) => prev + 1);
      setPhaseRemainingSeconds((prev) => {
        const next = prev - 1;
        const reminderSec = timerSettingsRef.current.reminderMinutesBeforeEnd * 60;
        const totalSec =
          (sprintPhase === 'work'
            ? timerSettingsRef.current.workMinutes
            : timerSettingsRef.current.breakMinutes) * 60;
        if (reminderSec > 0 && totalSec > reminderSec && next === reminderSec) {
          reminderHandlerRef.current();
        }
        if (next <= 0) {
          sprintCompleteHandlerRef.current();
          return sprintPhase === 'work'
            ? timerSettingsRef.current.breakMinutes * 60
            : timerSettingsRef.current.workMinutes * 60;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeCardId, activeView, isFocusRunning, sprintPhase]);

  // Rock-solid Wall-Clock Automatic Check-In Interval (never resets on task/playlist edits!)
  useEffect(() => {
    if (!alertEnabled || activeView !== 'workspace' || !activeCardId) {
      nextAlertAtRef.current = null;
      return;
    }

    const intervalMs = Math.max(1, timerSettings.checkInMinutes) * 60_000;
    if (!nextAlertAtRef.current) {
      nextAlertAtRef.current = Date.now() + intervalMs;
    }

    const tick = () => {
      const target = nextAlertAtRef.current;
      if (!target) return;
      const remainingMs = target - Date.now();
      if (remainingMs <= 0) {
        nextAlertAtRef.current = Date.now() + intervalMs;
        setSecondsUntilAlert(Math.round(intervalMs / 1000));
        alertTriggerRef.current();
      } else {
        setSecondsUntilAlert(Math.ceil(remainingMs / 1000));
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeCardId, activeView, alertEnabled, timerSettings.checkInMinutes]);

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
    if (soraPromptMode === 'onboarding') {
      setSoraPromptMode('idle');
    }
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
    setIsFocusRunning((prev) => {
      const next = !prev;
      if (next) {
        if (elapsedSessionSeconds === 0) {
          sessionStartTimeRef.current = Date.now();
        }
        setSoraPromptMode((cur) => (cur === 'onboarding' ? 'idle' : cur));
        setCompanionCaption((caption) =>
          caption.includes('What do you want to work on') ||
          caption.includes("What's our focus first")
            ? "Timer started — I'm studying quietly beside you."
            : caption
        );
      }
      setPose(next ? (sprintPhase === 'break' ? 'coffee' : 'typing') : 'coffee');
      return next;
    });
  };

  const handleResetTimer = () => {
    setIsFocusRunning(false);
    setPhaseRemainingSeconds(
      (sprintPhase === 'work' ? timerSettings.workMinutes : timerSettings.breakMinutes) * 60
    );
    setPose('coffee');
  };

  const handleSkipPhase = () => {
    const nextPhase: SprintPhase = sprintPhase === 'work' ? 'break' : 'work';
    setSprintPhase(nextPhase);
    setPhaseRemainingSeconds(
      (nextPhase === 'work' ? timerSettings.workMinutes : timerSettings.breakMinutes) * 60
    );
    setPose(nextPhase === 'break' ? 'coffee' : isFocusRunning ? 'typing' : 'coffee');
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
      nextAlertAtRef.current = alertEnabled
        ? Date.now() + next.checkInMinutes * 60_000
        : null;
      setSecondsUntilAlert(next.checkInMinutes * 60);
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
    <div className="relative flex min-h-screen flex-col bg-[#090B14] text-slate-100 md:h-screen md:overflow-hidden">
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
          {/* Left 1/3 Column: Realistic Sora + Inline Answer Bar on Top, Self-View / Friend Co-Study Below */}
          <div className="flex min-h-0 flex-col gap-3 md:col-span-4">
            <CompanionStage
              pose={pose}
              caption={companionCaption}
              promptMode={soraPromptMode}
              isSimulatingSpeech={isSimulatingSpeech}
              isSendingReply={isSendingReply}
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
              onReplyToSora={handleReplyToSora}
              onQuickCheckInChoice={handleQuickCheckInChoice}
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

          {/* Right 2/3 Column: Slim Timer + Mode Switcher on Top, Focus Plan OR Full-Width Video & Playlist Below */}
          <div className="flex min-h-0 flex-col gap-3 md:col-span-8">
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
        canDismiss={profiles.length > 0}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onClose={() => setIsProfileModalOpen(false)}
        onCreateProfile={handleCreateProfile}
        onSelectProfile={handleSelectProfile}
        onDeleteProfile={handleDeleteProfile}
      />
    </div>
  );
}
