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
  timerSettings: TimerSettings;
  sessionLogs: SessionLog[];
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  studyCards: StudySessionCard[];
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

export type AppView = 'hub' | 'workspace' | 'history';
