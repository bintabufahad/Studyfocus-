import type {
  ActiveTimerSnapshot,
  SessionLog,
  StudySessionCard,
  TaskItem,
  TimerSettings,
  UserProfile,
} from '../types';

const PROFILES_KEY = 'focuspair.profiles.v2';
const ACTIVE_PROFILE_KEY = 'focuspair.activeProfileId.v2';
const AUTH_TOKEN_KEY = 'focuspair.authToken.v1';
const TIMER_SNAPSHOT_KEY = 'focuspair.activeTimer.v1';

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
    videoTrimIntroSeconds: 0,
    videoTrimOutroSeconds: 0,
    timerSettings: { ...timerSettings },
    sessionLogs: [],
  };
}

export function createNewProfile(name: string, id?: string, isCloudAccount = false): UserProfile {
  return {
    id: id ?? `prof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Guest',
    createdAt: Date.now(),
    studyCards: [],
    isCloudAccount,
  };
}

export function normalizeStudyCards(rawCards: unknown[]): StudySessionCard[] {
  if (!Array.isArray(rawCards)) return [];
  return rawCards
    .filter((c): c is StudySessionCard => Boolean(c && typeof c === 'object' && 'id' in c))
    .map((c) => ({
      ...c,
      title: typeof c.title === 'string' && c.title.trim() ? c.title : 'Untitled Study Session',
      accent: c.accent ?? 'amber',
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      lastOpenedAt: typeof c.lastOpenedAt === 'number' ? c.lastOpenedAt : Date.now(),
      tasks: Array.isArray(c.tasks) ? c.tasks : [],
      playlist: Array.isArray(c.playlist)
        ? c.playlist.filter((v) => v.sourceType !== 'local')
        : [],
      activeVideoId: c.activeVideoId ?? null,
      videoTrimIntroSeconds:
        typeof c.videoTrimIntroSeconds === 'number' && c.videoTrimIntroSeconds >= 0
          ? c.videoTrimIntroSeconds
          : 0,
      videoTrimOutroSeconds:
        typeof c.videoTrimOutroSeconds === 'number' && c.videoTrimOutroSeconds >= 0
          ? c.videoTrimOutroSeconds
          : 0,
      timerSettings: { ...DEFAULT_TIMER_SETTINGS, ...(c.timerSettings ?? {}) },
      sessionLogs: Array.isArray(c.sessionLogs)
        ? c.sessionLogs.map((l) => ({ ...l, videoUrl: undefined }))
        : [],
    }));
}

export function sanitizeStudyCardsForSync(cards: StudySessionCard[]): StudySessionCard[] {
  return cards.map((c) => ({
    ...c,
    playlist: c.playlist.filter((v) => v.sourceType !== 'local'),
    sessionLogs: c.sessionLogs.map(({ videoUrl: _omit, ...rest }) => rest),
  }));
}

function migrateProfile(raw: UserProfile): UserProfile {
  const cards = normalizeStudyCards(raw.studyCards);

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
    isCloudAccount: Boolean(raw.isCloudAccount),
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
      isCloudAccount: Boolean(p.isCloudAccount),
      studyCards: sanitizeStudyCardsForSync(p.studyCards),
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

export function loadAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore
  }
}

export interface ServerAccountResponse {
  token?: string;
  account: {
    id: string;
    username: string;
    createdAt: number;
    updatedAt: number;
    studyCards: StudySessionCard[];
  };
}

export async function registerAccount(
  username: string,
  password: string,
  studyCards: StudySessionCard[] = []
): Promise<ServerAccountResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      studyCards: sanitizeStudyCardsForSync(studyCards),
    }),
  });
  const data = (await res.json()) as ServerAccountResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not create account.');
  }
  return {
    token: data.token,
    account: {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
    },
  };
}

export async function loginAccount(
  username: string,
  password: string
): Promise<ServerAccountResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as ServerAccountResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Sign in failed.');
  }
  return {
    token: data.token,
    account: {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
    },
  };
}

export async function fetchCurrentAccount(token: string): Promise<ServerAccountResponse['account'] | null> {
  try {
    const res = await fetch('/api/account/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { account: ServerAccountResponse['account'] };
    return {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
    };
  } catch {
    return null;
  }
}

export async function syncAccountCards(
  token: string,
  cards: StudySessionCard[],
  keepalive = false
): Promise<boolean> {
  try {
    const res = await fetch('/api/account/sync', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      keepalive,
      body: JSON.stringify({
        studyCards: sanitizeStudyCardsForSync(cards),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function loadTimerSnapshot(): ActiveTimerSnapshot | null {
  try {
    const raw = localStorage.getItem(TIMER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTimerSnapshot;
    if (
      !parsed ||
      typeof parsed.cardId !== 'string' ||
      typeof parsed.focusRemainingSeconds !== 'number' ||
      typeof parsed.breakRemainingSeconds !== 'number' ||
      typeof parsed.checkInRemainingSeconds !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveTimerSnapshot(snapshot: ActiveTimerSnapshot | null): void {
  try {
    if (!snapshot) {
      localStorage.removeItem(TIMER_SNAPSHOT_KEY);
      return;
    }
    localStorage.setItem(TIMER_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
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
