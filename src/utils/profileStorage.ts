import type {
  SessionLog,
  StudySessionCard,
  TaskItem,
  TimerSettings,
  UserProfile,
} from '../types';

const PROFILES_KEY = 'focuspair.profiles.v2';
const ACTIVE_PROFILE_KEY = 'focuspair.activeProfileId.v2';

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  checkInMinutes: 25,
  reminderMinutesBeforeEnd: 2,
  chimeEnabled: true,
  visualCuesEnabled: true,
};

export function createStudyCard(
  title: string,
  accent: StudySessionCard['accent'] = 'amber',
  timerSettings: TimerSettings = DEFAULT_TIMER_SETTINGS
): StudySessionCard {
  const now = Date.now();
  return {
    id: `card-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim() || 'Untitled Study Session',
    accent,
    createdAt: now,
    lastOpenedAt: now,
    tasks: [],
    playlist: [],
    activeVideoId: null,
    timerSettings: { ...timerSettings },
    sessionLogs: [],
  };
}

export function createNewProfile(name: string): UserProfile {
  return {
    id: `prof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Guest',
    createdAt: Date.now(),
    studyCards: [],
  };
}

function migrateProfile(raw: UserProfile): UserProfile {
  const cards: StudySessionCard[] = Array.isArray(raw.studyCards)
    ? raw.studyCards.map((c) => ({
        ...c,
        accent: c.accent ?? 'amber',
        tasks: Array.isArray(c.tasks) ? c.tasks : [],
        playlist: Array.isArray(c.playlist)
          ? c.playlist.filter((v) => v.sourceType !== 'local')
          : [],
        activeVideoId: c.activeVideoId ?? null,
        timerSettings: { ...DEFAULT_TIMER_SETTINGS, ...(c.timerSettings ?? {}) },
        sessionLogs: Array.isArray(c.sessionLogs)
          ? c.sessionLogs.map((l) => ({ ...l, videoUrl: undefined }))
          : [],
      }))
    : [];

  // Migrate legacy v2 profile tasks/logs into a starter card if any existed
  if (
    cards.length === 0 &&
    ((raw.tasks && raw.tasks.length > 0) || (raw.sessionLogs && raw.sessionLogs.length > 0))
  ) {
    const migratedCard = createStudyCard(
      'General Study',
      'amber',
      raw.timerSettings ?? DEFAULT_TIMER_SETTINGS
    );
    migratedCard.tasks = raw.tasks ?? [];
    migratedCard.sessionLogs = (raw.sessionLogs ?? []).map((l) => ({
      ...l,
      videoUrl: undefined,
    }));
    cards.push(migratedCard);
  }

  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt ?? Date.now(),
    studyCards: cards,
  };
}

export function loadProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateProfile);
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: UserProfile[]): void {
  try {
    const serializable = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      studyCards: p.studyCards.map((c) => ({
        ...c,
        // Local blob URLs cannot persist across page reloads
        playlist: c.playlist.filter((v) => v.sourceType !== 'local'),
        sessionLogs: c.sessionLogs.map(({ videoUrl: _omit, ...rest }) => rest),
      })),
    }));
    localStorage.setItem(PROFILES_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveProfileId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  } catch {
    // Ignore
  }
}

export interface DailyMetric {
  dateKey: string;
  label: string;
  shortLabel: string;
  focusMinutes: number;
  completedTasks: number;
  sessionsCount: number;
}

export function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeProductivityStats(
  tasks: TaskItem[],
  logs: SessionLog[]
): {
  currentStreakDays: number;
  longestStreakDays: number;
  totalFocusMinutes: number;
  totalCompletedTasks: number;
  dailySeries: DailyMetric[];
} {
  const dailyMap = new Map<
    string,
    { focusSeconds: number; completedTasks: number; sessionsCount: number }
  >();

  for (const log of logs) {
    const key = toLocalDateKey(log.endedAt);
    const cur = dailyMap.get(key) ?? {
      focusSeconds: 0,
      completedTasks: 0,
      sessionsCount: 0,
    };
    if (log.phase === 'work' || !log.phase) {
      cur.focusSeconds += log.durationSeconds;
    }
    cur.sessionsCount += 1;
    dailyMap.set(key, cur);
  }

  for (const task of tasks) {
    if (task.completed) {
      const key = toLocalDateKey(task.completedAt ?? task.createdAt);
      const cur = dailyMap.get(key) ?? {
        focusSeconds: 0,
        completedTasks: 0,
        sessionsCount: 0,
      };
      cur.completedTasks += 1;
      dailyMap.set(key, cur);
    }
  }

  const dailySeries: DailyMetric[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDateKey(d.getTime());
    const entry = dailyMap.get(key);
    dailySeries.push({
      dateKey: key,
      label: d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      shortLabel: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      focusMinutes: entry ? Math.round(entry.focusSeconds / 60) : 0,
      completedTasks: entry ? entry.completedTasks : 0,
      sessionsCount: entry ? entry.sessionsCount : 0,
    });
  }

  const activeDates = Array.from(dailyMap.entries())
    .filter(([, val]) => val.sessionsCount > 0 || val.completedTasks > 0)
    .map(([key]) => key)
    .sort();

  const activeSet = new Set(activeDates);

  let currentStreakDays = 0;
  const cursor = new Date(today);
  const todayKey = toLocalDateKey(cursor.getTime());
  if (!activeSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeSet.has(toLocalDateKey(cursor.getTime()))) {
    currentStreakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let longestStreakDays = 0;
  if (activeDates.length > 0) {
    let run = 1;
    longestStreakDays = 1;
    for (let i = 1; i < activeDates.length; i++) {
      const prev = new Date(activeDates[i - 1] + 'T00:00:00');
      const curr = new Date(activeDates[i] + 'T00:00:00');
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        run += 1;
        longestStreakDays = Math.max(longestStreakDays, run);
      } else {
        run = 1;
      }
    }
  }

  const totalFocusMinutes = Math.round(
    logs.reduce((acc, l) => acc + (l.phase === 'work' || !l.phase ? l.durationSeconds : 0), 0) /
      60
  );
  const totalCompletedTasks = tasks.filter((t) => t.completed).length;

  return {
    currentStreakDays,
    longestStreakDays,
    totalFocusMinutes,
    totalCompletedTasks,
    dailySeries,
  };
}
