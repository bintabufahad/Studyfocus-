export type CompanionPose = 'typing' | 'coffee' | 'speaking';

export type SprintPhase = 'work' | 'break';

export type WorkspacePanelMode = 'focus' | 'video';

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: number;
  estimatedMinutes?: number;
  collapsed?: boolean;
  subtasks: SubtaskItem[];
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  source?: 'text' | 'voice' | 'checkin';
}

export interface TaskAction {
  action:
    | 'add_task'
    | 'edit_task'
    | 'delete_task'
    | 'add_subtasks'
    | 'toggle_task'
    | 'set_focus';
  taskId?: string;
  title?: string;
  newTitle?: string;
  estimatedMinutes?: number;
  subtasks?: string[];
}

export interface TimerControlAction {
  timer: 'focus' | 'break' | 'checkin';
  action: 'start' | 'pause' | 'stop' | 'reset';
  minutes?: number;
}

export interface PlaylistItem {
  id: string;
  title: string;
  url: string;
  sourceType: 'youtube' | 'youtube_playlist' | 'direct' | 'local';
  playlistId?: string;
  durationSeconds?: number;
  addedAt: number;
}

export interface SessionLog {
  id: string;
  sessionCardId?: string;
  sessionCardTitle?: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  phase: SprintPhase;
  completedTasksCount: number;
  completedTaskTitles: string[];
  note: string;
  hasVideo: boolean;
  videoUrl?: string;
}

export interface TimerSettings {
  workMinutes: number;
  breakMinutes: number;
  checkInMinutes: number;
  reminderMinutesBeforeEnd: number;
  chimeEnabled: boolean;
  visualCuesEnabled: boolean;
}

export interface VideoPlaylistGroup {
  id: string;
  title: string;
  items: PlaylistItem[];
  activeVideoId: string | null;
  trimIntroSeconds: number;
  trimOutroSeconds: number;
  createdAt: number;
}

export interface StudySessionCard {
  id: string;
  title: string;
  accent: 'amber' | 'sky' | 'emerald' | 'rose';
  createdAt: number;
  lastOpenedAt: number;
  tasks: TaskItem[];
  playlist: PlaylistItem[];
  activeVideoId: string | null;
  videoTrimIntroSeconds?: number;
  videoTrimOutroSeconds?: number;
  playlists?: VideoPlaylistGroup[];
  activePlaylistId?: string | null;
  timerSettings: TimerSettings;
  sessionLogs: SessionLog[];
}

export type GoalCadence = 'daily' | 'custom' | 'week' | 'month' | 'phase';

export type GoalUnit = 'days' | 'weeks' | 'months' | 'phase_days';

export type GoalPhaseKind = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export type SalahName = 'Fajr' | 'Zuhr' | 'Asr' | 'Maghrib' | 'Isha';

export type DeadlineMode = 'none' | 'clock' | 'hours' | 'salah';

export interface PriorityDeadline {
  mode: DeadlineMode;
  clockTime?: string; // 24h "HH:mm"
  durationHours?: number;
  dueTimestamp?: number;
  salah?: SalahName;
}

export interface GoalTaskEntry {
  id: string;
  kind: 'priority' | 'todo';
  text: string;
  status: 'empty' | 'pending' | 'done' | 'missed';
  deadline?: PriorityDeadline;
  completedAt?: number;
  missedAt?: number;
  syncKey?: string;
}

export interface DailyPlanRecord {
  dateKey: string; // YYYY-MM-DD
  priorities: GoalTaskEntry[];
  todos: GoalTaskEntry[];
  dismissedImportBanner?: boolean;
  syncedGoalIds?: string[];
  autoSyncGoals?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PhaseConfig {
  cycleDates: string[];
  periodLengthDays: number;
  averageCycleDays: number;
  dataMode: '3months' | '1month';
}

export interface GoalCarryoverItem {
  id: string;
  originStepNumber: number;
  kind?: 'priority' | 'todo';
  text: string;
  status: 'pending' | 'done' | 'pushed';
  completedAt?: number;
}

export interface GoalStep {
  stepNumber: number;
  dateLabel?: string;
  monthKey?: string; // YYYY-MM
  phase?: GoalPhaseKind;
  priorities?: GoalTaskEntry[];
  todos?: GoalTaskEntry[];
  taskText: string;
  status: 'empty' | 'pending' | 'done' | 'missed';
  completedAt?: number;
  missedAt?: number;
  carryovers: GoalCarryoverItem[];
}

export interface GoalScopePlan {
  priorities: GoalTaskEntry[];
  todos: GoalTaskEntry[];
}

export interface GoalPlan {
  id: string;
  title: string;
  cadence: GoalCadence;
  unit: GoalUnit;
  totalSteps: number;
  startDate?: string;
  endDate?: string;
  startMonth?: string; // YYYY-MM
  endMonth?: string; // YYYY-MM
  phaseConfig?: PhaseConfig;
  accent: StudySessionCard['accent'];
  scopePlans?: Record<string, GoalScopePlan>;
  steps: GoalStep[];
  trailingCarryovers?: GoalCarryoverItem[];
  createdAt: number;
  updatedAt: number;
}

export interface GamificationStats {
  xp: number;
  combo: number;
  bestCombo: number;
  shields: number;
  rescuesCompleted: number;
  totalStepsCompleted: number;
  unlockedBadges: string[];
}

export type ChecklistCadence = 'checklist' | 'quick' | 'week' | 'month' | 'custom';

export interface ChecklistColumn {
  id: string;
  label: string;
  dateKey?: string;
}

export interface ChecklistRow {
  id: string;
  label: string;
}

export type CycleFlowLevel = 'none' | 'spotting' | 'light' | 'medium' | 'heavy' | 'ended';

export interface CycleDayLog {
  dateKey: string; // YYYY-MM-DD
  flow: CycleFlowLevel;
  symptoms?: string[];
  note: string;
  updatedAt: number;
}

export interface DayLogStroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>; // virtual 1000x1920 coordinates
}

export interface DayLogSheetDivision {
  id: string;
  label: string;
  dateKey?: string; // YYYY-MM-DD when representing a specific calendar date
  completed?: boolean;
  note?: string;
}

export interface CustomDateLogSheet {
  id: string;
  dateKey: string; // YYYY-MM-DD
  title: string;
  divisions: DayLogSheetDivision[];
  strokes: DayLogStroke[];
  divisionHeight?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DateRangeLogSheet {
  id: string;
  title: string;
  mode: 'range' | 'month';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  divisions: DayLogSheetDivision[];
  strokes: DayLogStroke[];
  divisionHeight?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DayLogCanvasBlock {
  id: string;
  title: string;
  completed?: boolean;
  strokes: DayLogStroke[];
  height?: number;
  updatedAt: number;
}

export interface DayLogEntry {
  id: string;
  dateKey: string;
  title?: string;
  strokes: DayLogStroke[];
  hourNotes?: Record<string, string>; // '4'..'27' (4 AM to 3 AM)
  taskDivisions?: DayLogSheetDivision[];
  taskStrokes?: DayLogStroke[];
  taskDivisionHeight?: number;
  taskBlocks?: DayLogCanvasBlock[];
  customBlocks?: DayLogCanvasBlock[];
  cycleSummary?: string;
  previewDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

export interface ChecklistTableRecord {
  id: string;
  title: string;
  cadence?: ChecklistCadence;
  accent: StudySessionCard['accent'];
  startDate?: string;
  endDate?: string;
  columns: ChecklistColumn[];
  rows: ChecklistRow[];
  checks: Record<string, boolean>;
  checkTimestamps?: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  studyCards: StudySessionCard[];
  goals?: GoalPlan[];
  checklistTables?: ChecklistTableRecord[];
  activeDayLog?: DayLogEntry;
  dayLogHistory?: DayLogEntry[];
  customDateLogs?: CustomDateLogSheet[];
  dateRangeLogs?: DateRangeLogSheet[];
  cycleLogs?: Record<string, CycleDayLog>;
  activeDailyPlan?: DailyPlanRecord;
  dailyHistory?: DailyPlanRecord[];
  scheduledDailyPlans?: Record<string, DailyPlanRecord>;
  gamification?: GamificationStats;
  isCloudAccount?: boolean;
  // Legacy fallback fields kept optional for smooth migration
  timerSettings?: TimerSettings;
  tasks?: TaskItem[];
  sessionLogs?: SessionLog[];
}

export interface ActiveTimerSnapshot {
  profileId: string;
  cardId: string;
  isFocusRunning: boolean;
  focusEndAt: number | null;
  focusRemainingSeconds: number;
  isBreakRunning: boolean;
  breakEndAt: number | null;
  breakRemainingSeconds: number;
  isCheckInRunning: boolean;
  checkInEndAt: number | null;
  checkInRemainingSeconds: number;
  elapsedSessionSeconds: number;
  checkInMinutes: number;
  updatedAt: number;
}

export interface RoomParticipant {
  clientId: string;
  name: string;
  mode: WorkspacePanelMode;
  isFocusing: boolean;
  joinedAt: number;
}

export interface SharedVideoState {
  videoUrl: string;
  videoTitle: string;
  sourceType: 'youtube' | 'youtube_playlist' | 'direct';
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  updatedBy: string;
}

export type AppView = 'hub' | 'workspace' | 'goals' | 'checklists' | 'daylog' | 'history';

