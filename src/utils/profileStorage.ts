import type {
  ActiveTimerSnapshot,
  ChecklistColumn,
  ChecklistRow,
  ChecklistTableRecord,
  CycleDayLog,
  CycleFlowLevel,
  DailyPlanRecord,
  DayLogEntry,
  DayLogStroke,
  GamificationStats,
  GoalCadence,
  GoalPhaseKind,
  GoalPlan,
  GoalScopePlan,
  GoalStep,
  GoalTaskEntry,
  GoalUnit,
  PhaseConfig,
  PriorityDeadline,
  SalahName,
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

export const DEFAULT_GAMIFICATION_STATS: GamificationStats = {
  xp: 0,
  combo: 0,
  bestCombo: 0,
  shields: 1,
  rescuesCompleted: 0,
  totalStepsCompleted: 0,
  unlockedBadges: [],
};

export function createNewProfile(name: string, id?: string, isCloudAccount = false): UserProfile {
  return {
    id: id ?? `prof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Guest',
    createdAt: Date.now(),
    studyCards: [],
    goals: [],
    checklistTables: [],
    activeDayLog: createDefaultDayLog(),
    dayLogHistory: [],
    cycleLogs: {},
    gamification: { ...DEFAULT_GAMIFICATION_STATS },
    isCloudAccount,
  };
}

export function normalizeGamification(raw: unknown): GamificationStats {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GAMIFICATION_STATS };
  }
  const r = raw as Partial<GamificationStats>;
  return {
    xp: typeof r.xp === 'number' && r.xp >= 0 ? r.xp : 0,
    combo: typeof r.combo === 'number' && r.combo >= 0 ? r.combo : 0,
    bestCombo: typeof r.bestCombo === 'number' && r.bestCombo >= 0 ? r.bestCombo : 0,
    shields: typeof r.shields === 'number' && r.shields >= 0 ? r.shields : 0,
    rescuesCompleted:
      typeof r.rescuesCompleted === 'number' && r.rescuesCompleted >= 0
        ? r.rescuesCompleted
        : 0,
    totalStepsCompleted:
      typeof r.totalStepsCompleted === 'number' && r.totalStepsCompleted >= 0
        ? r.totalStepsCompleted
        : 0,
    unlockedBadges: Array.isArray(r.unlockedBadges)
      ? r.unlockedBadges.filter((b): b is string => typeof b === 'string')
      : [],
  };
}

function makeEntryId(prefix = 't'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultStepEntries(): {
  priorities: GoalTaskEntry[];
  todos: GoalTaskEntry[];
} {
  return {
    priorities: [{ id: makeEntryId('pri'), kind: 'priority', text: '', status: 'empty' }],
    todos: [
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
    ],
  };
}

export function createDefaultDailyEntries(): {
  priorities: GoalTaskEntry[];
  todos: GoalTaskEntry[];
} {
  return {
    priorities: [
      { id: makeEntryId('pri'), kind: 'priority', text: '', status: 'empty' },
      { id: makeEntryId('pri'), kind: 'priority', text: '', status: 'empty' },
      { id: makeEntryId('pri'), kind: 'priority', text: '', status: 'empty' },
    ],
    todos: [
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
      { id: makeEntryId('todo'), kind: 'todo', text: '', status: 'empty' },
    ],
  };
}

export function createDefaultDailyPlan(dateKey = toLocalDateKey(Date.now())): DailyPlanRecord {
  const { priorities, todos } = createDefaultDailyEntries();
  const now = Date.now();
  return {
    dateKey,
    priorities,
    todos,
    dismissedImportBanner: false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeTaskEntries(
  rawList: unknown,
  kind: 'priority' | 'todo',
  minDefaultSlots = 0
): GoalTaskEntry[] {
  const validSalahs: SalahName[] = ['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha'];
  const items: GoalTaskEntry[] = Array.isArray(rawList)
    ? rawList
        .filter((item): item is GoalTaskEntry => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const text = typeof item.text === 'string' ? item.text : '';
          const status =
            item.status === 'done' || item.status === 'missed' || item.status === 'pending'
              ? item.status
              : text.trim()
                ? 'pending'
                : 'empty';
          let deadline: PriorityDeadline | undefined;
          if (kind === 'priority' && item.deadline && typeof item.deadline === 'object') {
            const d = item.deadline as Partial<PriorityDeadline>;
            const mode =
              d.mode === 'clock' || d.mode === 'hours' || d.mode === 'salah'
                ? d.mode
                : 'none';
            deadline = {
              mode,
              clockTime: typeof d.clockTime === 'string' ? d.clockTime : undefined,
              durationHours:
                typeof d.durationHours === 'number' && d.durationHours > 0
                  ? d.durationHours
                  : undefined,
              dueTimestamp:
                typeof d.dueTimestamp === 'number' ? d.dueTimestamp : undefined,
              salah:
                d.salah && validSalahs.includes(d.salah as SalahName)
                  ? (d.salah as SalahName)
                  : undefined,
            };
          }
          return {
            id: typeof item.id === 'string' ? item.id : makeEntryId(kind === 'priority' ? 'pri' : 'todo'),
            kind,
            text,
            status,
            ...(deadline ? { deadline } : {}),
            completedAt: typeof item.completedAt === 'number' ? item.completedAt : undefined,
            missedAt: typeof item.missedAt === 'number' ? item.missedAt : undefined,
          };
        })
    : [];

  while (items.length < minDefaultSlots) {
    items.push({
      id: makeEntryId(kind === 'priority' ? 'pri' : 'todo'),
      kind,
      text: '',
      status: 'empty',
    });
  }
  return items;
}

export function normalizeDailyPlan(raw: unknown, fallbackDateKey?: string): DailyPlanRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<DailyPlanRecord>;
  const dateKey =
    typeof r.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dateKey)
      ? r.dateKey
      : fallbackDateKey ?? toLocalDateKey(Date.now());
  return {
    dateKey,
    priorities: normalizeTaskEntries(r.priorities, 'priority', 3),
    todos: normalizeTaskEntries(r.todos, 'todo', 5),
    dismissedImportBanner: Boolean(r.dismissedImportBanner),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

export function normalizeDailyHistory(raw: unknown): DailyPlanRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeDailyPlan(item))
    .filter((item): item is DailyPlanRecord => Boolean(item))
    .slice(0, 60);
}

export function rolloverExpiredDailyPlan(
  activeDailyPlan: DailyPlanRecord | undefined,
  dailyHistory: DailyPlanRecord[] | undefined,
  todayKey = toLocalDateKey(Date.now())
): {
  activeDailyPlan: DailyPlanRecord;
  dailyHistory: DailyPlanRecord[];
  didRollover: boolean;
} {
  const existingHistory = Array.isArray(dailyHistory) ? [...dailyHistory] : [];
  if (!activeDailyPlan) {
    return {
      activeDailyPlan: createDefaultDailyPlan(todayKey),
      dailyHistory: existingHistory,
      didRollover: false,
    };
  }
  if (activeDailyPlan.dateKey === todayKey) {
    return {
      activeDailyPlan,
      dailyHistory: existingHistory,
      didRollover: false,
    };
  }

  // Archive previous day's saved entries if any exist
  const hasSavedTasks =
    activeDailyPlan.priorities.some((p) => p.text.trim()) ||
    activeDailyPlan.todos.some((t) => t.text.trim());

  let nextHistory = existingHistory;
  if (hasSavedTasks) {
    const alreadyArchived = existingHistory.some((h) => h.dateKey === activeDailyPlan.dateKey);
    if (!alreadyArchived) {
      const archived: DailyPlanRecord = {
        ...activeDailyPlan,
        priorities: activeDailyPlan.priorities.filter((p) => p.text.trim()),
        todos: activeDailyPlan.todos.filter((t) => t.text.trim()),
      };
      nextHistory = [archived, ...existingHistory]
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        .slice(0, 60);
    }
  }

  return {
    activeDailyPlan: createDefaultDailyPlan(todayKey),
    dailyHistory: nextHistory,
    didRollover: true,
  };
}

export function normalizeGoals(rawGoals: unknown): GoalPlan[] {
  if (!Array.isArray(rawGoals)) return [];
  return rawGoals
    .filter((g): g is GoalPlan => Boolean(g && typeof g === 'object' && 'id' in g))
    .map((g) => {
      const steps: GoalStep[] = Array.isArray(g.steps)
        ? g.steps.map((s, idx) => {
            const legacyText = typeof s.taskText === 'string' ? s.taskText : '';
            const legacyStatus =
              s.status === 'done' || s.status === 'missed' || s.status === 'pending'
                ? s.status
                : legacyText.trim()
                  ? 'pending'
                  : 'empty';

            let priorities = Array.isArray(s.priorities)
              ? normalizeTaskEntries(s.priorities, 'priority', 1)
              : createDefaultStepEntries().priorities;
            const todos = Array.isArray(s.todos)
              ? normalizeTaskEntries(s.todos, 'todo', 3)
              : createDefaultStepEntries().todos;

            // Graceful migration if an older step only had taskText
            if (!Array.isArray(s.priorities) && legacyText.trim()) {
              priorities = [
                {
                  id: makeEntryId('pri'),
                  kind: 'priority',
                  text: legacyText.trim(),
                  status: legacyStatus === 'empty' ? 'pending' : legacyStatus,
                  completedAt: s.completedAt,
                  missedAt: s.missedAt,
                },
                ...priorities.slice(1),
              ];
            }

            return {
              stepNumber: typeof s.stepNumber === 'number' ? s.stepNumber : idx + 1,
              dateLabel: typeof s.dateLabel === 'string' ? s.dateLabel : undefined,
              monthKey: typeof s.monthKey === 'string' ? s.monthKey : undefined,
              phase:
                s.phase === 'menstrual' ||
                s.phase === 'follicular' ||
                s.phase === 'ovulation' ||
                s.phase === 'luteal'
                  ? (s.phase as GoalPhaseKind)
                  : undefined,
              priorities,
              todos,
              taskText: legacyText,
              status: legacyStatus,
              completedAt: typeof s.completedAt === 'number' ? s.completedAt : undefined,
              missedAt: typeof s.missedAt === 'number' ? s.missedAt : undefined,
              carryovers: Array.isArray(s.carryovers)
                ? s.carryovers.map((c) => ({
                    id: typeof c.id === 'string' ? c.id : makeEntryId('co'),
                    originStepNumber:
                      typeof c.originStepNumber === 'number' ? c.originStepNumber : 1,
                    kind: c.kind === 'todo' ? 'todo' : 'priority',
                    text: typeof c.text === 'string' ? c.text : '',
                    status:
                      c.status === 'done' || c.status === 'pushed' ? c.status : 'pending',
                    completedAt:
                      typeof c.completedAt === 'number' ? c.completedAt : undefined,
                  }))
                : [],
            };
          })
        : [];
      const rawPc = g.phaseConfig as Partial<PhaseConfig> | undefined;
      const phaseConfig: PhaseConfig | undefined =
        rawPc && typeof rawPc === 'object'
          ? {
              cycleDates: Array.isArray(rawPc.cycleDates)
                ? rawPc.cycleDates.filter((d): d is string => typeof d === 'string')
                : [],
              periodLengthDays:
                typeof rawPc.periodLengthDays === 'number' && rawPc.periodLengthDays >= 1
                  ? rawPc.periodLengthDays
                  : 5,
              averageCycleDays:
                typeof rawPc.averageCycleDays === 'number' && rawPc.averageCycleDays >= 18
                  ? rawPc.averageCycleDays
                  : 28,
              dataMode: rawPc.dataMode === '1month' ? '1month' : '3months',
            }
          : undefined;
      const scopePlans: Record<string, GoalScopePlan> = {};
      if (g.scopePlans && typeof g.scopePlans === 'object') {
        for (const [k, rawScope] of Object.entries(g.scopePlans)) {
          if (rawScope && typeof rawScope === 'object') {
            const rs = rawScope as Partial<GoalScopePlan>;
            scopePlans[k] = {
              priorities: normalizeTaskEntries(rs.priorities, 'priority', 1),
              todos: normalizeTaskEntries(rs.todos, 'todo', 3),
            };
          }
        }
      }
      return {
        id: String(g.id),
        title: typeof g.title === 'string' && g.title.trim() ? g.title : 'Untitled Goal',
        cadence:
          g.cadence === 'daily' ||
          g.cadence === 'custom' ||
          g.cadence === 'week' ||
          g.cadence === 'month' ||
          g.cadence === 'phase'
            ? (g.cadence as GoalCadence)
            : 'week',
        unit:
          g.unit === 'days' ||
          g.unit === 'weeks' ||
          g.unit === 'months' ||
          g.unit === 'phase_days'
            ? (g.unit as GoalUnit)
            : 'days',
        totalSteps: steps.length || (typeof g.totalSteps === 'number' ? g.totalSteps : 1),
        startDate: typeof g.startDate === 'string' ? g.startDate : undefined,
        endDate: typeof g.endDate === 'string' ? g.endDate : undefined,
        startMonth: typeof g.startMonth === 'string' ? g.startMonth : undefined,
        endMonth: typeof g.endMonth === 'string' ? g.endMonth : undefined,
        ...(phaseConfig ? { phaseConfig } : {}),
        accent: g.accent ?? 'sky',
        scopePlans,
        steps,
        trailingCarryovers: Array.isArray(g.trailingCarryovers) ? g.trailingCarryovers : [],
        createdAt: typeof g.createdAt === 'number' ? g.createdAt : Date.now(),
        updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : Date.now(),
      };
    });
}

export function normalizeChecklistTables(rawTables: unknown): ChecklistTableRecord[] {
  if (!Array.isArray(rawTables)) return [];
  return rawTables
    .filter((t): t is ChecklistTableRecord => Boolean(t && typeof t === 'object' && 'id' in t))
    .map((t) => {
      const columns: ChecklistColumn[] = Array.isArray(t.columns)
        ? t.columns
            .filter((c): c is ChecklistColumn => Boolean(c && typeof c === 'object'))
            .map((c, idx) => ({
              id: typeof c.id === 'string' && c.id ? c.id : makeEntryId('col'),
              label: typeof c.label === 'string' ? c.label : String(idx + 1),
              ...(typeof c.dateKey === 'string' ? { dateKey: c.dateKey } : {}),
            }))
        : [];
      const rows: ChecklistRow[] = Array.isArray(t.rows)
        ? t.rows
            .filter((r): r is ChecklistRow => Boolean(r && typeof r === 'object'))
            .map((r, idx) => ({
              id: typeof r.id === 'string' && r.id ? r.id : makeEntryId('row'),
              label: typeof r.label === 'string' ? r.label : `Item ${idx + 1}`,
            }))
        : [];
      const checks: Record<string, boolean> = {};
      if (t.checks && typeof t.checks === 'object') {
        for (const [k, v] of Object.entries(t.checks)) {
          if (v === true) checks[k] = true;
        }
      }
      const checkTimestamps: Record<string, number> = {};
      if (t.checkTimestamps && typeof t.checkTimestamps === 'object') {
        for (const [k, v] of Object.entries(t.checkTimestamps)) {
          if (typeof v === 'number' && Number.isFinite(v)) checkTimestamps[k] = v;
        }
      }
      return {
        id: String(t.id),
        title: typeof t.title === 'string' && t.title.trim() ? t.title : 'Checklist',
        cadence:
          t.cadence === 'checklist' ||
          t.cadence === 'quick' ||
          t.cadence === 'week' ||
          t.cadence === 'month' ||
          t.cadence === 'custom'
            ? t.cadence
            : 'quick',
        accent: t.accent ?? 'sky',
        ...(typeof t.startDate === 'string' ? { startDate: t.startDate } : {}),
        ...(typeof t.endDate === 'string' ? { endDate: t.endDate } : {}),
        columns,
        rows,
        checks,
        checkTimestamps,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
        updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
      };
    });
}

export function createDefaultDayLog(dateKey = toLocalDateKey(Date.now())): DayLogEntry {
  const now = Date.now();
  return {
    id: makeEntryId('dlog'),
    dateKey,
    strokes: [],
    hourNotes: {},
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeStrokes(raw: unknown): DayLogStroke[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is DayLogStroke => Boolean(s && typeof s === 'object'))
    .map((s): DayLogStroke => ({
      id: typeof s.id === 'string' && s.id ? s.id : makeEntryId('st'),
      tool: s.tool === 'eraser' ? 'eraser' : 'pen',
      color: typeof s.color === 'string' ? s.color : '#e2f1ff',
      width: typeof s.width === 'number' && s.width > 0 ? s.width : 3,
      points: Array.isArray(s.points)
        ? s.points.filter(
            (p): p is { x: number; y: number } =>
              Boolean(p && typeof p.x === 'number' && typeof p.y === 'number')
          )
        : [],
    }))
    .filter((s) => s.points.length > 0);
}

export function normalizeDayLogEntry(raw: unknown): DayLogEntry {
  if (!raw || typeof raw !== 'object') {
    return createDefaultDayLog();
  }
  const r = raw as Partial<DayLogEntry>;
  const hourNotes: Record<string, string> = {};
  if (r.hourNotes && typeof r.hourNotes === 'object') {
    for (const [k, v] of Object.entries(r.hourNotes)) {
      if (typeof v === 'string' && v.length > 0) hourNotes[k] = v;
    }
  }
  return {
    id: typeof r.id === 'string' && r.id ? r.id : makeEntryId('dlog'),
    dateKey: typeof r.dateKey === 'string' && r.dateKey ? r.dateKey : toLocalDateKey(Date.now()),
    ...(typeof r.title === 'string' ? { title: r.title } : {}),
    strokes: normalizeStrokes(r.strokes),
    hourNotes,
    ...(typeof r.cycleSummary === 'string' ? { cycleSummary: r.cycleSummary } : {}),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    ...(typeof r.archivedAt === 'number' ? { archivedAt: r.archivedAt } : {}),
  };
}

export function normalizeDayLogHistory(raw: unknown): DayLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is DayLogEntry => Boolean(item && typeof item === 'object'))
    .map(normalizeDayLogEntry)
    .slice(0, 90);
}

export function normalizeCycleLogs(raw: unknown): Record<string, CycleDayLog> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, CycleDayLog> = {};
  const validFlows = new Set<CycleFlowLevel>([
    'none',
    'spotting',
    'light',
    'medium',
    'heavy',
    'ended',
  ]);
  for (const [dateKey, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Partial<CycleDayLog>;
    result[dateKey] = {
      dateKey: typeof v.dateKey === 'string' ? v.dateKey : dateKey,
      flow: v.flow && validFlows.has(v.flow) ? v.flow : 'none',
      symptoms: Array.isArray(v.symptoms)
        ? v.symptoms.filter((s): s is string => typeof s === 'string')
        : [],
      note: typeof v.note === 'string' ? v.note : '',
      updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
    };
  }
  return result;
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

  const rolled = rolloverExpiredDailyPlan(
    normalizeDailyPlan(raw.activeDailyPlan),
    normalizeDailyHistory(raw.dailyHistory)
  );

  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt ?? Date.now(),
    studyCards: cards,
    goals: normalizeGoals(raw.goals),
    checklistTables: normalizeChecklistTables(raw.checklistTables),
    activeDayLog: normalizeDayLogEntry(raw.activeDayLog),
    dayLogHistory: normalizeDayLogHistory(raw.dayLogHistory),
    cycleLogs: normalizeCycleLogs(raw.cycleLogs),
    activeDailyPlan: rolled.activeDailyPlan,
    dailyHistory: rolled.dailyHistory,
    gamification: normalizeGamification(raw.gamification),
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
      goals: p.goals ?? [],
      checklistTables: p.checklistTables ?? [],
      activeDayLog: p.activeDayLog ? { ...p.activeDayLog, previewDataUrl: undefined } : undefined,
      dayLogHistory: (p.dayLogHistory ?? []).map((d) => ({
        ...d,
        previewDataUrl: undefined,
      })),
      cycleLogs: p.cycleLogs ?? {},
      activeDailyPlan: p.activeDailyPlan,
      dailyHistory: p.dailyHistory ?? [],
      gamification: p.gamification ?? DEFAULT_GAMIFICATION_STATS,
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
    goals?: GoalPlan[];
    checklistTables?: ChecklistTableRecord[];
    activeDayLog?: DayLogEntry;
    dayLogHistory?: DayLogEntry[];
    cycleLogs?: Record<string, CycleDayLog>;
    activeDailyPlan?: DailyPlanRecord;
    dailyHistory?: DailyPlanRecord[];
    gamification?: GamificationStats;
  };
}

export interface DaySyncExtras {
  activeDayLog?: DayLogEntry;
  dayLogHistory?: DayLogEntry[];
  cycleLogs?: Record<string, CycleDayLog>;
}

export async function registerAccount(
  username: string,
  password: string,
  studyCards: StudySessionCard[] = [],
  goals: GoalPlan[] = [],
  gamification: GamificationStats = DEFAULT_GAMIFICATION_STATS,
  activeDailyPlan?: DailyPlanRecord,
  dailyHistory: DailyPlanRecord[] = [],
  checklistTables: ChecklistTableRecord[] = [],
  daySync?: DaySyncExtras
): Promise<ServerAccountResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      studyCards: sanitizeStudyCardsForSync(studyCards),
      goals,
      checklistTables,
      ...(daySync?.activeDayLog
        ? { activeDayLog: { ...daySync.activeDayLog, previewDataUrl: undefined } }
        : {}),
      ...(daySync?.dayLogHistory
        ? {
            dayLogHistory: daySync.dayLogHistory.map((d) => ({
              ...d,
              previewDataUrl: undefined,
            })),
          }
        : {}),
      ...(daySync?.cycleLogs ? { cycleLogs: daySync.cycleLogs } : {}),
      activeDailyPlan,
      dailyHistory,
      gamification,
    }),
  });
  const data = (await res.json()) as ServerAccountResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not create account.');
  }
  const rolled = rolloverExpiredDailyPlan(
    normalizeDailyPlan(data.account.activeDailyPlan),
    normalizeDailyHistory(data.account.dailyHistory)
  );
  return {
    token: data.token,
    account: {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
      goals: normalizeGoals(data.account.goals),
      checklistTables: normalizeChecklistTables(data.account.checklistTables),
      activeDayLog: normalizeDayLogEntry(data.account.activeDayLog),
      dayLogHistory: normalizeDayLogHistory(data.account.dayLogHistory),
      cycleLogs: normalizeCycleLogs(data.account.cycleLogs),
      activeDailyPlan: rolled.activeDailyPlan,
      dailyHistory: rolled.dailyHistory,
      gamification: normalizeGamification(data.account.gamification),
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
  const rolled = rolloverExpiredDailyPlan(
    normalizeDailyPlan(data.account.activeDailyPlan),
    normalizeDailyHistory(data.account.dailyHistory)
  );
  return {
    token: data.token,
    account: {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
      goals: normalizeGoals(data.account.goals),
      checklistTables: normalizeChecklistTables(data.account.checklistTables),
      activeDayLog: normalizeDayLogEntry(data.account.activeDayLog),
      dayLogHistory: normalizeDayLogHistory(data.account.dayLogHistory),
      cycleLogs: normalizeCycleLogs(data.account.cycleLogs),
      activeDailyPlan: rolled.activeDailyPlan,
      dailyHistory: rolled.dailyHistory,
      gamification: normalizeGamification(data.account.gamification),
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
    const rolled = rolloverExpiredDailyPlan(
      normalizeDailyPlan(data.account.activeDailyPlan),
      normalizeDailyHistory(data.account.dailyHistory)
    );
    return {
      ...data.account,
      studyCards: normalizeStudyCards(data.account.studyCards),
      goals: normalizeGoals(data.account.goals),
      checklistTables: normalizeChecklistTables(data.account.checklistTables),
      activeDayLog: normalizeDayLogEntry(data.account.activeDayLog),
      dayLogHistory: normalizeDayLogHistory(data.account.dayLogHistory),
      cycleLogs: normalizeCycleLogs(data.account.cycleLogs),
      activeDailyPlan: rolled.activeDailyPlan,
      dailyHistory: rolled.dailyHistory,
      gamification: normalizeGamification(data.account.gamification),
    };
  } catch {
    return null;
  }
}

export async function syncAccountCards(
  token: string,
  cards: StudySessionCard[],
  keepalive = false,
  goals?: GoalPlan[],
  gamification?: GamificationStats,
  activeDailyPlan?: DailyPlanRecord,
  dailyHistory?: DailyPlanRecord[],
  checklistTables?: ChecklistTableRecord[],
  daySync?: DaySyncExtras
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
        ...(goals !== undefined ? { goals } : {}),
        ...(checklistTables !== undefined ? { checklistTables } : {}),
        ...(daySync?.activeDayLog !== undefined
          ? { activeDayLog: { ...daySync.activeDayLog, previewDataUrl: undefined } }
          : {}),
        ...(daySync?.dayLogHistory !== undefined
          ? {
              dayLogHistory: daySync.dayLogHistory.map((d) => ({
                ...d,
                previewDataUrl: undefined,
              })),
            }
          : {}),
        ...(daySync?.cycleLogs !== undefined ? { cycleLogs: daySync.cycleLogs } : {}),
        ...(gamification !== undefined ? { gamification } : {}),
        ...(activeDailyPlan !== undefined ? { activeDailyPlan } : {}),
        ...(dailyHistory !== undefined ? { dailyHistory } : {}),
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
