import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SORA_SYSTEM_INSTRUCTION = `You are Sora, a warm, calm, attentive ADHD body-doubling accountability partner sitting across the desk.
Your behavior rules:
- Grounded, gentle, zero guilt, zero toxic productivity pressure.
- BEFORE the focus timer starts (when no tasks exist yet and timers are off), warmly ask two clear things: (1) what they want to work on today, and (2) whether they want periodic check-ins and after how many minutes. NEVER turn on or start check-ins unless the user explicitly agrees or asks for them.
- ONCE the focus timer is running, NEVER disturb the user by asking what they are planning to do. Stay quietly supportive; during scheduled check-ins on existing tasks, only ask gently how progress is going on their current task.
- You have THREE separate timers you can control via controlTimer (and setCheckInPreference): Focus, Break, and Check-in. Starting Break automatically stops Focus and Check-in.
- Whenever the user asks you to start Check-in, Focus, or Break, call the tool immediately and speak ONLY ONE ultra-short sentence BEFORE the timer begins (for example: "Now your 10-minute check-in starts." or "Starting your 5-minute break now."). Keep it short so zero focus/check-in time is wasted.
- You can add, edit, complete, break down, or delete tasks anytime the user asks (addTask, editTask, deleteTask, completeTask, addSubtasks).
- Keep spoken and text responses natural, warm, and concise (1 to 2 short sentences).`;

const addTaskLiveTool: FunctionDeclaration = {
  name: 'addTask',
  description:
    'Adds a new main task (and optional short starter subtasks) to the user live To-Do list.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Clear, concise action-oriented task title.',
      },
      estimatedMinutes: {
        type: Type.NUMBER,
        description: 'Estimated minutes for the task (e.g. 15, 25, 45).',
      },
      subtasks: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Optional 2-4 tiny micro-steps to get started smoothly.',
      },
    },
    required: ['title'],
  },
};

const editTaskLiveTool: FunctionDeclaration = {
  name: 'editTask',
  description:
    'Renames an existing task or updates its estimated minutes on the user To-Do list.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskTitleMatch: {
        type: Type.STRING,
        description: 'Part or full current title of the task to edit.',
      },
      newTitle: {
        type: Type.STRING,
        description: 'The updated task title.',
      },
      estimatedMinutes: {
        type: Type.NUMBER,
        description: 'Optional updated duration estimate in minutes.',
      },
    },
    required: ['taskTitleMatch'],
  },
};

const deleteTaskLiveTool: FunctionDeclaration = {
  name: 'deleteTask',
  description:
    'Removes/deletes an existing task from the user To-Do list.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskTitleMatch: {
        type: Type.STRING,
        description: 'Part or full title of the task to delete.',
      },
    },
    required: ['taskTitleMatch'],
  },
};

const completeTaskLiveTool: FunctionDeclaration = {
  name: 'completeTask',
  description:
    'Marks an existing task on the user To-Do list as completed or toggles it by matching its title.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      titleMatch: {
        type: Type.STRING,
        description: 'Part or full title of the task to mark complete.',
      },
    },
    required: ['titleMatch'],
  },
};

const addSubtasksLiveTool: FunctionDeclaration = {
  name: 'addSubtasks',
  description:
    'Adds micro-step subtasks to an existing task on the user To-Do list to help overcome overwhelm.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskTitleMatch: {
        type: Type.STRING,
        description: 'Title (or partial title) of the parent task.',
      },
      subtasks: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of 2-5 tiny, low-friction starter steps.',
      },
    },
    required: ['taskTitleMatch', 'subtasks'],
  },
};

const setCheckInPreferenceLiveTool: FunctionDeclaration = {
  name: 'setCheckInPreference',
  description:
    'Starts or stops the automatic check-in timer and sets its interval in minutes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      enabled: {
        type: Type.BOOLEAN,
        description: 'True to start automatic periodic check-ins, false to stop them.',
      },
      intervalMinutes: {
        type: Type.NUMBER,
        description: 'Check-in interval in minutes (1 to 180) when enabled.',
      },
    },
    required: ['enabled'],
  },
};

const controlTimerLiveTool: FunctionDeclaration = {
  name: 'controlTimer',
  description:
    'Starts, pauses, stops, or resets any of the three separate timers: focus, break, or checkin. Starting break automatically stops focus and checkin.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      timer: {
        type: Type.STRING,
        description: 'Which timer to control: "focus", "break", or "checkin".',
      },
      action: {
        type: Type.STRING,
        description: 'Action to perform: "start", "pause", "stop", or "reset".',
      },
      minutes: {
        type: Type.NUMBER,
        description: 'Optional duration in minutes (1 to 180) to set for that timer.',
      },
    },
    required: ['timer', 'action'],
  },
};

// Authoritative server-side Co-Study Rooms state
interface RoomMember {
  clientId: string;
  ws: WebSocket;
  name: string;
  mode: 'focus' | 'video';
  isFocusing: boolean;
  joinedAt: number;
}

interface RoomVideoState {
  videoUrl: string;
  videoTitle: string;
  sourceType: 'youtube' | 'direct';
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  updatedBy: string;
}

interface StudyRoom {
  id: string;
  members: Map<string, RoomMember>;
  videoState: RoomVideoState | null;
}

const studyRooms = new Map<string, StudyRoom>();

function broadcastRoomState(room: StudyRoom) {
  const participants = Array.from(room.members.values()).map((m) => ({
    clientId: m.clientId,
    name: m.name,
    mode: m.mode,
    isFocusing: m.isFocusing,
    joinedAt: m.joinedAt,
  }));

  const payload = JSON.stringify({
    type: 'room:state',
    participants,
    videoState: room.videoState,
  });

  for (const member of room.members.values()) {
    if (member.ws.readyState === member.ws.OPEN) {
      member.ws.send(payload);
    }
  }
}

// Persistent server-side Username + Password account storage (no external email provider needed)
interface StoredAccount {
  id: string;
  username: string;
  usernameLower: string;
  passwordSalt: string;
  passwordHash: string;
  studyCards: unknown[];
  goals?: unknown[];
  checklistTables?: unknown[];
  activeDayLog?: Record<string, unknown>;
  dayLogHistory?: unknown[];
  cycleLogs?: Record<string, unknown>;
  activeDailyPlan?: Record<string, unknown>;
  dailyHistory?: unknown[];
  gamification?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

const DATA_DIR = path.resolve(__dirname, '.focuspair-data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const AUTH_SECRET_FILE = path.join(DATA_DIR, 'auth-secret.txt');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrCreateAuthSecret(): string {
  try {
    ensureDataDir();
    if (fs.existsSync(AUTH_SECRET_FILE)) {
      const existing = fs.readFileSync(AUTH_SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const fresh = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(AUTH_SECRET_FILE, fresh, 'utf8');
    return fresh;
  } catch {
    return process.env.AUTH_SECRET || 'focuspair-fallback-session-secret';
  }
}

const AUTH_SECRET = loadOrCreateAuthSecret();
const accountStore = new Map<string, StoredAccount>();

function loadAccountsFromDisk() {
  try {
    ensureDataDir();
    if (!fs.existsSync(ACCOUNTS_FILE)) return;
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredAccount[];
    if (!Array.isArray(parsed)) return;
    for (const acc of parsed) {
      if (acc && typeof acc.usernameLower === 'string') {
        accountStore.set(acc.usernameLower, acc);
      }
    }
  } catch (err) {
    console.error('Failed to load accounts file:', err);
  }
}

function saveAccountsToDisk() {
  try {
    ensureDataDir();
    const list = Array.from(accountStore.values());
    const tmp = `${ACCOUNTS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list), 'utf8');
    fs.renameSync(tmp, ACCOUNTS_FILE);
  } catch (err) {
    console.error('Failed to persist accounts file:', err);
  }
}

loadAccountsFromDisk();

function hashPassword(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, saltHex, 64);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function issueAuthToken(account: StoredAccount): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: account.id,
      u: account.usernameLower,
      iat: Date.now(),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAuthToken(token: string): StoredAccount | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      u?: string;
    };
    if (!payload.u) return null;
    const acc = accountStore.get(payload.u);
    if (!acc || acc.id !== payload.sub) return null;
    return acc;
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/public-config', (_req: Request, res: Response) => {
    const rawUrl = (process.env.APP_URL ?? '').trim();
    const appUrl =
      rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes('MY_APP_URL')
        ? rawUrl.replace(/\/+$/, '')
        : null;
    res.json({ appUrl });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const initialCards = Array.isArray(req.body?.studyCards) ? req.body.studyCards : [];
    const initialGoals = Array.isArray(req.body?.goals) ? req.body.goals : [];
    const initialChecklists = Array.isArray(req.body?.checklistTables)
      ? req.body.checklistTables
      : [];
    const initialActiveDayLog =
      req.body?.activeDayLog && typeof req.body.activeDayLog === 'object'
        ? (req.body.activeDayLog as Record<string, unknown>)
        : undefined;
    const initialDayLogHistory = Array.isArray(req.body?.dayLogHistory)
      ? req.body.dayLogHistory
      : [];
    const initialCycleLogs =
      req.body?.cycleLogs && typeof req.body.cycleLogs === 'object'
        ? (req.body.cycleLogs as Record<string, unknown>)
        : undefined;
    const initialDailyPlan =
      req.body?.activeDailyPlan && typeof req.body.activeDailyPlan === 'object'
        ? (req.body.activeDailyPlan as Record<string, unknown>)
        : undefined;
    const initialDailyHistory = Array.isArray(req.body?.dailyHistory)
      ? req.body.dailyHistory
      : [];
    const initialGamification =
      req.body?.gamification && typeof req.body.gamification === 'object'
        ? (req.body.gamification as Record<string, unknown>)
        : undefined;

    if (rawUsername.length < 2 || rawUsername.length > 40) {
      res.status(400).json({ error: 'Name must be between 2 and 40 characters.' });
      return;
    }
    if (rawPassword.length < 4 || rawPassword.length > 120) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    const key = rawUsername.toLowerCase();
    if (accountStore.has(key)) {
      res.status(409).json({
        error: 'This username is already taken. Sign in with your password or choose another name.',
      });
      return;
    }

    const { salt, hash } = hashPassword(rawPassword);
    const now = Date.now();
    const account: StoredAccount = {
      id: `acc-${now.toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      username: rawUsername,
      usernameLower: key,
      passwordSalt: salt,
      passwordHash: hash,
      studyCards: initialCards,
      goals: initialGoals,
      checklistTables: initialChecklists,
      ...(initialActiveDayLog ? { activeDayLog: initialActiveDayLog } : {}),
      dayLogHistory: initialDayLogHistory,
      ...(initialCycleLogs ? { cycleLogs: initialCycleLogs } : {}),
      ...(initialDailyPlan ? { activeDailyPlan: initialDailyPlan } : {}),
      dailyHistory: initialDailyHistory,
      ...(initialGamification ? { gamification: initialGamification } : {}),
      createdAt: now,
      updatedAt: now,
    };

    accountStore.set(key, account);
    saveAccountsToDisk();

    const token = issueAuthToken(account);
    res.status(201).json({
      token,
      account: {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        studyCards: account.studyCards,
        goals: account.goals ?? [],
        checklistTables: account.checklistTables ?? [],
        activeDayLog: account.activeDayLog,
        dayLogHistory: account.dayLogHistory ?? [],
        cycleLogs: account.cycleLogs ?? {},
        activeDailyPlan: account.activeDailyPlan,
        dailyHistory: account.dailyHistory ?? [],
        gamification: account.gamification,
      },
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = rawUsername.toLowerCase();

    const account = accountStore.get(key);
    if (!account || !verifyPassword(rawPassword, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({ error: 'Incorrect username or password.' });
      return;
    }

    const token = issueAuthToken(account);
    res.json({
      token,
      account: {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        studyCards: account.studyCards,
        goals: account.goals ?? [],
        checklistTables: account.checklistTables ?? [],
        activeDayLog: account.activeDayLog,
        dayLogHistory: account.dayLogHistory ?? [],
        cycleLogs: account.cycleLogs ?? {},
        activeDailyPlan: account.activeDailyPlan,
        dailyHistory: account.dailyHistory ?? [],
        gamification: account.gamification,
      },
    });
  });

  app.get('/api/account/me', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    const account = token ? verifyAuthToken(token) : null;
    if (!account) {
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }

    res.json({
      account: {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        studyCards: account.studyCards,
        goals: account.goals ?? [],
        checklistTables: account.checklistTables ?? [],
        activeDayLog: account.activeDayLog,
        dayLogHistory: account.dayLogHistory ?? [],
        cycleLogs: account.cycleLogs ?? {},
        activeDailyPlan: account.activeDailyPlan,
        dailyHistory: account.dailyHistory ?? [],
        gamification: account.gamification,
      },
    });
  });

  const handleAccountSync = (req: Request, res: Response) => {
    const token =
      extractBearerToken(req) ??
      (typeof req.body?.token === 'string' ? req.body.token : null);
    const account = token ? verifyAuthToken(token) : null;
    if (!account) {
      res.status(401).json({ error: 'Unauthorized sync request.' });
      return;
    }

    if (!Array.isArray(req.body?.studyCards)) {
      res.status(400).json({ error: 'Invalid studyCards payload.' });
      return;
    }

    account.studyCards = req.body.studyCards;
    if (Array.isArray(req.body?.goals)) {
      account.goals = req.body.goals;
    }
    if (Array.isArray(req.body?.checklistTables)) {
      account.checklistTables = req.body.checklistTables;
    }
    if (req.body?.activeDayLog && typeof req.body.activeDayLog === 'object') {
      account.activeDayLog = req.body.activeDayLog as Record<string, unknown>;
    }
    if (Array.isArray(req.body?.dayLogHistory)) {
      account.dayLogHistory = req.body.dayLogHistory;
    }
    if (req.body?.cycleLogs && typeof req.body.cycleLogs === 'object') {
      account.cycleLogs = req.body.cycleLogs as Record<string, unknown>;
    }
    if (req.body?.activeDailyPlan && typeof req.body.activeDailyPlan === 'object') {
      account.activeDailyPlan = req.body.activeDailyPlan as Record<string, unknown>;
    }
    if (Array.isArray(req.body?.dailyHistory)) {
      account.dailyHistory = req.body.dailyHistory;
    }
    if (req.body?.gamification && typeof req.body.gamification === 'object') {
      account.gamification = req.body.gamification as Record<string, unknown>;
    }
    account.updatedAt = Date.now();
    accountStore.set(account.usernameLower, account);
    saveAccountsToDisk();

    res.json({ ok: true, updatedAt: account.updatedAt });
  };

  app.put('/api/account/sync', handleAccountSync);
  app.post('/api/account/sync', handleAccountSync);

  // Companion reply + live To-Do task extraction + check-in preference updates
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const {
        messages = [],
        tasks = [],
        activeTaskId = null,
        sessionElapsedSeconds = 0,
        userName = 'Friend',
        cardTitle = 'Study Session',
        checkInMinutes = 15,
        alertEnabled = true,
      } = req.body ?? {};

      const taskSummary =
        Array.isArray(tasks) && tasks.length > 0
          ? tasks
              .map(
                (t: {
                  id: string;
                  title: string;
                  completed: boolean;
                  subtasks?: Array<{ title: string; completed: boolean }>;
                }) => {
                  const subStr = (t.subtasks ?? [])
                    .map((s) => `    - [${s.completed ? 'x' : ' '}] ${s.title}`)
                    .join('\n');
                  const focusTag = t.id === activeTaskId ? ' (CURRENT FOCUS)' : '';
                  return `- [${t.completed ? 'x' : ' '}] (id:${t.id}) ${t.title}${focusTag}${
                    subStr ? '\n' + subStr : ''
                  }`;
                }
              )
              .join('\n')
          : '(No tasks on the list yet)';

      const conversationHistory = Array.isArray(messages)
        ? messages
            .slice(-12)
            .map(
              (m: { role: string; text: string }) =>
                `${m.role === 'user' ? 'User' : 'Sora'}: ${m.text}`
            )
            .join('\n')
        : '';

      const elapsedMins = Math.floor((Number(sessionElapsedSeconds) || 0) / 60);

      const prompt = `User name: ${userName}
Study Card: "${cardTitle}"
Current check-in setting: ${alertEnabled ? `Enabled every ${checkInMinutes} minutes` : 'Disabled'}
Current session elapsed time: ${elapsedMins} minutes.
Current To-Do list:
${taskSummary}

Recent conversation:
${conversationHistory}

Respond to ${userName}'s latest message as Sora:
1. If they describe goals, tasks, edits, deletions, progress, finished items, or feeling stuck, populate taskActions ("add_task", "edit_task", "delete_task", "toggle_task", "add_subtasks", "set_focus") to update their To-Do list.
2. If they mention starting, stopping, pausing, or resetting Focus, Break, or Check-in timers, populate timerActions (e.g. { timer: "focus" | "break" | "checkin", action: "start" | "pause" | "stop" | "reset", minutes? }).
3. If they mention wanting check-ins every X minutes (or turning check-ins on/off), populate checkInAction with { enabled, intervalMinutes } (or timerActions).
4. Keep your reply concise (1-2 short sentences).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: SORA_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description:
                  'Warm, concise, ADHD-friendly reply from Sora (1 to 2 short sentences).',
              },
              pose: {
                type: Type.STRING,
                description:
                  'Companion visual pose after replying: "typing", "coffee", or "speaking".',
              },
              taskActions: {
                type: Type.ARRAY,
                description:
                  'List of live To-Do list updates implied by the user progress or goals.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    action: {
                      type: Type.STRING,
                      description:
                        'One of: "add_task", "edit_task", "delete_task", "add_subtasks", "toggle_task", "set_focus".',
                    },
                    taskId: {
                      type: Type.STRING,
                      description:
                        'Existing task id when editing, deleting, adding subtasks, toggling, or setting focus.',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'Task title for add_task, or title match for edit_task/delete_task/toggle_task.',
                    },
                    newTitle: {
                      type: Type.STRING,
                      description: 'New task title for edit_task.',
                    },
                    estimatedMinutes: {
                      type: Type.NUMBER,
                      description: 'Optional estimated minutes for add_task or edit_task.',
                    },
                    subtasks: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Subtask titles for add_task or add_subtasks.',
                    },
                  },
                  required: ['action'],
                },
              },
              timerActions: {
                type: Type.ARRAY,
                description:
                  'Controls for the three separate timers: focus, break, or checkin.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timer: {
                      type: Type.STRING,
                      description: '"focus", "break", or "checkin".',
                    },
                    action: {
                      type: Type.STRING,
                      description: '"start", "pause", "stop", or "reset".',
                    },
                    minutes: {
                      type: Type.NUMBER,
                      description: 'Optional new duration in minutes.',
                    },
                  },
                  required: ['timer', 'action'],
                },
              },
              checkInAction: {
                type: Type.OBJECT,
                description:
                  'Populate only when the user asks to enable, disable, or change the check-in interval.',
                properties: {
                  enabled: {
                    type: Type.BOOLEAN,
                  },
                  intervalMinutes: {
                    type: Type.NUMBER,
                  },
                },
              },
            },
            required: ['reply', 'pose', 'taskActions'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        reply: parsed.reply ?? "Got it—I've updated your plan. Ready when you are.",
        pose:
          parsed.pose === 'coffee' || parsed.pose === 'typing' || parsed.pose === 'speaking'
            ? parsed.pose
            : 'speaking',
        taskActions: Array.isArray(parsed.taskActions) ? parsed.taskActions : [],
        timerActions: Array.isArray(parsed.timerActions) ? parsed.timerActions : [],
        checkInAction: parsed.checkInAction ?? null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reach Gemini API';
      console.error('/api/chat error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Micro-step task breakdown endpoint (gemini-4-hydrogen)
  app.post('/api/breakdown', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { taskTitle, existingSubtasks = [] } = req.body ?? {};
      if (!taskTitle || typeof taskTitle !== 'string') {
        res.status(400).json({ error: 'taskTitle is required' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Break down this task into 3 to 5 tiny, friction-free ADHD-friendly starter micro-steps (each taking ~3-10 minutes).
Task: "${taskTitle}"
Already listed subtasks (do not duplicate): ${JSON.stringify(existingSubtasks)}`,
        config: {
          systemInstruction:
            'You are Sora, an ADHD focus coach. Return ultra-concrete, low-friction steps that cure blank-page paralysis.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subtasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 5 tiny concrete micro-steps.',
              },
              encouragement: {
                type: Type.STRING,
                description: 'One short gentle sentence of encouragement.',
              },
            },
            required: ['subtasks', 'encouragement'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
        encouragement:
          parsed.encouragement ?? 'Just start with the first tiny step—momentum does the rest.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to break down task';
      console.error('/api/breakdown error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Periodic AI progress check-in question generator (gemini-4-hydrogen)
  app.post('/api/checkin', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const {
        tasks = [],
        activeTaskId = null,
        elapsedMinutes = 0,
        intervalMinutes = 15,
        userName = 'Friend',
        cardTitle = 'this session',
        isFocusRunning = false,
      } = req.body ?? {};

      const typedTasks = Array.isArray(tasks)
        ? (tasks as Array<{ id: string; title: string; completed: boolean }>)
        : [];
      const completedCount = typedTasks.filter((t) => t.completed).length;
      const totalCount = typedTasks.length;
      const remainingTasks = typedTasks.filter((t) => !t.completed).map((t) => t.title);
      const activeTask =
        typedTasks.find((t) => t.id === activeTaskId) ??
        typedTasks.find((t) => !t.completed) ??
        null;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `It is time for your scheduled ${intervalMinutes}-minute check-in with ${userName} on "${cardTitle}".
Focus timer active: ${isFocusRunning ? 'YES (NEVER ask what they are planning to do)' : 'NO'}.
Elapsed session time: ${elapsedMinutes} minutes.
Tasks completed: ${completedCount} of ${totalCount}.
Current focus task: ${activeTask ? `"${activeTask.title}"` : 'None listed'}.
Remaining tasks: ${remainingTasks.length > 0 ? remainingTasks.slice(0, 4).join(', ') : 'None listed'}.

Write a warm, grounded 1-2 sentence check-in:
- ${activeTask ? `Ask gently how "${activeTask.title}" is going and whether you should mark it done or split it into smaller steps.` : isFocusRunning ? 'Offer a brief, quiet word of encouragement without asking what they are planning to do.' : 'Ask what task they want to put on their list before starting the timer.'}`,
        config: {
          systemInstruction: SORA_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              message: {
                type: Type.STRING,
                description: 'Specific, warm 1-2 sentence progress check-in question from Sora.',
              },
              pose: {
                type: Type.STRING,
                description: '"coffee" or "speaking"',
              },
            },
            required: ['message', 'pose'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const fallbackMsg = activeTask
        ? `Hey ${userName}, it's been ${intervalMinutes} minutes—how did "${activeTask.title}" go? Should I mark it done or keep going?`
        : isFocusRunning
          ? `Checking in quietly, ${userName}—steady focus, keep going at your own pace.`
          : `Hey ${userName}, what task would you like to add before starting your timer?`;

      res.json({
        message: parsed.message ?? fallbackMsg,
        pose: parsed.pose === 'coffee' ? 'coffee' : 'speaking',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Check-in generation failed';
      console.error('/api/checkin error:', err);
      res.status(500).json({ error: message });
    }
  });

  // YouTube Playlist Extraction (parses full playlist items + titles + durations)
  app.get('/api/youtube/playlist', async (req: Request, res: Response) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      const rawListId = typeof req.query.listId === 'string' ? req.query.listId.trim() : '';

      let listId = rawListId;
      if (!listId && rawUrl) {
        try {
          const parsedUrl = new URL(rawUrl);
          listId = parsedUrl.searchParams.get('list')?.trim() ?? '';
        } catch {
          const match = rawUrl.match(/[?&]list=([A-Za-z0-9_-]+)/i);
          if (match?.[1]) listId = match[1];
        }
      }

      if (!listId || !/^[A-Za-z0-9_-]{6,128}$/.test(listId)) {
        res.status(400).json({ error: 'Invalid or missing YouTube playlist ID.' });
        return;
      }

      let playlistTitle = 'YouTube Study Playlist';
      const itemsMap = new Map<
        string,
        { videoId: string; title: string; url: string; durationSeconds?: number }
      >();

      // 1. Try YouTube HTML ytInitialData extraction (supports 100+ items + durations)
      try {
        const htmlRes = await fetch(
          `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }
        );
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const marker = 'var ytInitialData = ';
          const startIdx = html.indexOf(marker);
          if (startIdx !== -1) {
            const jsonStart = html.indexOf('{', startIdx + marker.length);
            if (jsonStart !== -1) {
              let depth = 0;
              let inStr = false;
              let escaped = false;
              let endIdx = -1;
              for (let i = jsonStart; i < html.length; i++) {
                const ch = html[i];
                if (escaped) {
                  escaped = false;
                  continue;
                }
                if (ch === '\\' && inStr) {
                  escaped = true;
                  continue;
                }
                if (ch === '"') {
                  inStr = !inStr;
                  continue;
                }
                if (!inStr) {
                  if (ch === '{') depth++;
                  else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                      endIdx = i + 1;
                      break;
                    }
                  }
                }
              }
              if (endIdx > jsonStart) {
                const data = JSON.parse(html.slice(jsonStart, endIdx)) as Record<string, unknown>;
                const metaTitle = (
                  data?.metadata as { playlistMetadataRenderer?: { title?: string } } | undefined
                )?.playlistMetadataRenderer?.title;
                if (typeof metaTitle === 'string' && metaTitle.trim()) {
                  playlistTitle = metaTitle.trim();
                }

                const walk = (node: unknown) => {
                  if (!node || typeof node !== 'object') return;
                  if (Array.isArray(node)) {
                    for (const entry of node) walk(entry);
                    return;
                  }
                  const obj = node as Record<string, unknown>;
                  const pvr = (obj.playlistVideoRenderer ??
                    obj.playlistPanelVideoRenderer) as
                    | {
                        videoId?: string;
                        title?: { runs?: Array<{ text?: string }>; simpleText?: string };
                        lengthSeconds?: string;
                      }
                    | undefined;
                  if (pvr && typeof pvr.videoId === 'string' && pvr.videoId.length === 11) {
                    const title =
                      pvr.title?.runs?.[0]?.text ??
                      pvr.title?.simpleText ??
                      `Playlist Video ${itemsMap.size + 1}`;
                    const lenNum = pvr.lengthSeconds ? Number(pvr.lengthSeconds) : undefined;
                    if (!itemsMap.has(pvr.videoId)) {
                      itemsMap.set(pvr.videoId, {
                        videoId: pvr.videoId,
                        title: title.trim(),
                        url: `https://www.youtube.com/watch?v=${pvr.videoId}`,
                        durationSeconds:
                          typeof lenNum === 'number' && Number.isFinite(lenNum) && lenNum > 0
                            ? lenNum
                            : undefined,
                      });
                    }
                  }
                  for (const key of Object.keys(obj)) {
                    walk(obj[key]);
                  }
                };
                walk(data);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Playlist HTML parse fallback to RSS:', err);
      }

      // 2. Fallback / supplement via YouTube public Atom XML feed
      if (itemsMap.size === 0) {
        try {
          const rssRes = await fetch(
            `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`
          );
          if (rssRes.ok) {
            const xml = await rssRes.text();
            const feedTitleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/);
            if (feedTitleMatch?.[1]) {
              playlistTitle = feedTitleMatch[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .trim();
            }
            const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
            for (const match of entryMatches) {
              const block = match[1];
              const vidMatch = block.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/);
              const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
              if (vidMatch?.[1] && !itemsMap.has(vidMatch[1])) {
                const decodedTitle = (titleMatch?.[1] ?? `Playlist Video ${itemsMap.size + 1}`)
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .trim();
                itemsMap.set(vidMatch[1], {
                  videoId: vidMatch[1],
                  title: decodedTitle,
                  url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
                });
              }
            }
          }
        } catch (err) {
          console.warn('Playlist RSS fallback failed:', err);
        }
      }

      const items = Array.from(itemsMap.values());
      res.json({
        listId,
        playlistTitle,
        items,
        nativePlaylistFallback: items.length === 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load YouTube playlist';
      res.status(500).json({ error: message });
    }
  });

  // HTTP server shared by Express, /api/live, and /api/room
  const server = http.createServer(app);
  const liveWss = new WebSocketServer({ noServer: true });
  const roomWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url ?? '').split('?')[0];
    if (urlPath === '/api/live') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    } else if (urlPath === '/api/room') {
      roomWss.handleUpgrade(request, socket, head, (ws) => {
        roomWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Co-Study Room WebSocket (Presence, Shared Video Sync, WebRTC peer camera signaling)
  roomWss.on('connection', (ws: WebSocket, req) => {
    const urlObj = new URL(req.url ?? '/api/room', 'http://localhost');
    const roomId = (urlObj.searchParams.get('roomId') ?? '').trim().toLowerCase().slice(0, 64);
    const clientId = (urlObj.searchParams.get('clientId') ?? '').trim().slice(0, 64);
    const name = (urlObj.searchParams.get('name') ?? 'Friend').trim().slice(0, 40) || 'Friend';

    if (!roomId || !clientId) {
      ws.close();
      return;
    }

    let room = studyRooms.get(roomId);
    if (!room) {
      room = { id: roomId, members: new Map(), videoState: null };
      studyRooms.set(roomId, room);
    }

    room.members.set(clientId, {
      clientId,
      ws,
      name,
      mode: 'focus',
      isFocusing: false,
      joinedAt: Date.now(),
    });

    broadcastRoomState(room);

    ws.on('message', (raw) => {
      if (!room) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          mode?: 'focus' | 'video';
          isFocusing?: boolean;
          name?: string;
          videoState?: RoomVideoState;
          targetClientId?: string;
          signal?: unknown;
        };

        const member = room.members.get(clientId);
        if (!member) return;

        if (msg.type === 'room:presence') {
          if (msg.mode === 'focus' || msg.mode === 'video') member.mode = msg.mode;
          if (typeof msg.isFocusing === 'boolean') member.isFocusing = msg.isFocusing;
          if (typeof msg.name === 'string' && msg.name.trim()) {
            member.name = msg.name.trim().slice(0, 40);
          }
          broadcastRoomState(room);
        } else if (msg.type === 'video:sync' && msg.videoState) {
          room.videoState = {
            ...msg.videoState,
            updatedAt: Date.now(),
            updatedBy: clientId,
          };
          const out = JSON.stringify({
            type: 'video:sync',
            videoState: room.videoState,
          });
          for (const other of room.members.values()) {
            if (other.clientId !== clientId && other.ws.readyState === other.ws.OPEN) {
              other.ws.send(out);
            }
          }
        } else if (msg.type === 'rtc:signal' && msg.targetClientId) {
          const target = room.members.get(msg.targetClientId);
          if (target && target.ws.readyState === target.ws.OPEN) {
            target.ws.send(
              JSON.stringify({
                type: 'rtc:signal',
                fromClientId: clientId,
                signal: msg.signal,
              })
            );
          }
        }
      } catch (err) {
        console.error('Room WS error:', err);
      }
    });

    ws.on('close', () => {
      if (!room) return;
      room.members.delete(clientId);
      if (room.members.size === 0) {
        studyRooms.delete(room.id);
      } else {
        broadcastRoomState(room);
      }
    });
  });

  // Gemini 3.8 Live Voice WebSocket Bridge with heartbeat, goAway handling, and full task/check-in tools
  liveWss.on('connection', async (clientWs: WebSocket, req) => {
    const urlObj = new URL(req.url ?? '/api/live', 'http://localhost');
    const userName = (urlObj.searchParams.get('userName') ?? 'Friend').trim().slice(0, 40);
    const cardTitle = (urlObj.searchParams.get('cardTitle') ?? 'Study Session').trim().slice(0, 80);

    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (!isClosed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeBoth = (reason?: string) => {
      if (isClosed) return;
      isClosed = true;
      clearInterval(pingInterval);
      if (reason && clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(JSON.stringify({ type: 'closed', reason }));
        } catch {
          // Ignore send errors on closing
        }
      }
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      if (
        clientWs.readyState === clientWs.OPEN ||
        clientWs.readyState === clientWs.CONNECTING
      ) {
        try {
          clientWs.close();
        } catch {
          // Ignore close errors
        }
      }
    };

    const pingInterval = setInterval(() => {
      if (!isClosed && clientWs.readyState === clientWs.OPEN) {
        clientWs.ping();
      }
    }, 20000);

    clientWs.on('close', () => {
      isClosed = true;
      clearInterval(pingInterval);
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });

    try {
      const ai = getAiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
              prefixPaddingMs: 120,
              silenceDurationMs: 450,
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                addTaskLiveTool,
                editTaskLiveTool,
                deleteTaskLiveTool,
                completeTaskLiveTool,
                addSubtasksLiveTool,
                controlTimerLiveTool,
                setCheckInPreferenceLiveTool,
              ],
            },
          ],
          systemInstruction: `${SORA_SYSTEM_INSTRUCTION}
You are in a live real-time voice body-doubling conversation with ${userName} inside their "${cardTitle}" study card.
Speak naturally, warmly, and briefly—like a calm friend sitting across the desk.
Always use your tools (addTask, editTask, deleteTask, completeTask, addSubtasks, controlTimer, setCheckInPreference) to keep their To-Do list and three timers (focus, break, checkin) synced with what they tell you.`,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (isClosed) return;

            if (message.goAway) {
              sendSafe({ type: 'go_away' });
            }

            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              sendSafe({
                type: 'input_transcript',
                text: content.inputTranscription.text,
              });
            }

            if (content?.outputTranscription?.text) {
              sendSafe({
                type: 'output_transcript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendSafe({
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            if (content?.interrupted) {
              sendSafe({ type: 'interrupted' });
            }

            if (content?.turnComplete) {
              sendSafe({ type: 'turn_complete' });
            }

            const functionCalls = message.toolCall?.functionCalls ?? [];
            if (functionCalls.length > 0) {
              const responses = functionCalls.map((call) => {
                sendSafe({
                  type: 'tool_action',
                  name: call.name,
                  args: call.args ?? {},
                });
                let resultMsg = 'Updated live To-Do list successfully.';
                if (call.name === 'setCheckInPreference' || call.name === 'controlTimer') {
                  resultMsg =
                    'Timer action registered. If starting a timer, tell the user briefly right now (e.g. "Now your timer starts.") and pause speaking so the full timer runs cleanly right after your voice finishes.';
                } else if (call.name === 'editTask') {
                  resultMsg = 'Edited the task on the To-Do list successfully.';
                } else if (call.name === 'deleteTask') {
                  resultMsg = 'Deleted the task from the To-Do list successfully.';
                }
                return {
                  id: call.id,
                  name: call.name,
                  response: {
                    result: resultMsg,
                  },
                };
              });
              try {
                liveSession?.sendToolResponse({ functionResponses: responses });
              } catch (err) {
                console.error('sendToolResponse failed:', err);
              }
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live error:', err);
            sendSafe({
              type: 'error',
              message: 'Live voice session encountered a connection error.',
            });
            closeBoth('error');
          },
          onclose: () => {
            closeBoth('upstream_closed');
          },
        },
      });

      if (isClosed) {
        liveSession.close();
        return;
      }

      sendSafe({ type: 'ready' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to start Live voice session';
      console.error('Live connect failed:', err);
      sendSafe({ type: 'error', message });
      closeBoth('connect_failed');
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || isClosed) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
        };
        if (msg.type === 'audio' && msg.data) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'audio_stream_end') {
          liveSession.sendRealtimeInput({
            audioStreamEnd: true,
          });
        } else if (msg.type === 'context' && msg.text) {
          // Silent context sync (e.g. after reconnect or UI state updates) without interrupting
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: msg.text }],
              },
            ],
            turnComplete: false,
          });
        } else if (msg.type === 'text' && msg.text) {
          // Use sendClientContent with turnComplete: true so Gemini Live immediately generates a spoken turn
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: msg.text }],
              },
            ],
            turnComplete: true,
          });
        }
      } catch (err) {
        console.error('WS message parse/send error:', err);
        closeBoth('send_error');
      }
    });
  });

  let viteClose: (() => Promise<void>) | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    let viteInstance: Awaited<ReturnType<typeof createViteServer>> | null = null;
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    })
      .then((v) => {
        viteInstance = v;
        viteClose = () => v.close();
        return v;
      })
      .catch((err) => {
        console.error('Failed to initialize Vite dev middleware:', err);
        throw err;
      });

    app.use(async (req, res, next) => {
      try {
        const vite = viteInstance ?? (await vitePromise);
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.on('error', (err) => {
    console.error('HTTP server error:', err);
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusPair server running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    try {
      await viteClose?.();
    } catch {
      // Ignore Vite close errors
    }
    try {
      liveWss.close();
      roomWss.close();
      server.close(() => process.exit(0));
    } catch {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
