import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
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
- BEFORE the focus timer starts (when no tasks exist yet and the timer is off), warmly ask two clear things: (1) what they want to work on today, and (2) whether they want periodic check-ins and after how many minutes.
- ONCE the focus timer is running, NEVER disturb the user by asking what they are planning to do. Stay quietly supportive; during scheduled check-ins on existing tasks, only ask gently how progress is going on their current task.
- Whenever the user tells you how often to check in (e.g. "every 10 minutes", "check on me in 5 mins", "no check-ins", "stop checking up"), ALWAYS call/emit the check-in preference update immediately so the app timer updates.
- Whenever the user shares goals, tasks, overwhelm, or progress (e.g. "I finished X", "I'm stuck on Y", "Next I want to do Z"), proactively update their live To-Do list (add tasks, check off completed tasks, or add tiny 5-10 min micro-steps).
- Keep spoken and text responses natural, warm, and concise (1 to 3 short sentences).`;

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
    'Updates whether Sora should automatically check in on the user and after how many minutes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      enabled: {
        type: Type.BOOLEAN,
        description: 'True to enable automatic periodic check-ins, false to disable.',
      },
      intervalMinutes: {
        type: Type.NUMBER,
        description: 'Check-in interval in minutes (1 to 180) when enabled.',
      },
    },
    required: ['enabled'],
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

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
1. If they describe goals, tasks, progress, finished items, or feeling stuck, populate taskActions (add_task, toggle_task, add_subtasks, set_focus) to update their To-Do list.
2. If they mention wanting check-ins every X minutes (or turning check-ins on/off), populate checkInAction with { enabled, intervalMinutes }.
3. If they have not yet picked a task or check-in cadence, warmly confirm what you updated and ask the missing piece briefly.`;

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
                  'Warm, concise, ADHD-friendly reply from Sora (1 to 3 sentences).',
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
                        'One of: "add_task", "add_subtasks", "toggle_task", "set_focus".',
                    },
                    taskId: {
                      type: Type.STRING,
                      description:
                        'Existing task id when adding subtasks, toggling, or setting focus.',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'Task title for add_task, or fallback title match.',
                    },
                    estimatedMinutes: {
                      type: Type.NUMBER,
                      description: 'Optional estimated minutes for add_task.',
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
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                addTaskLiveTool,
                completeTaskLiveTool,
                addSubtasksLiveTool,
                setCheckInPreferenceLiveTool,
              ],
            },
          ],
          systemInstruction: `${SORA_SYSTEM_INSTRUCTION}
You are in a live real-time voice body-doubling conversation with ${userName} inside their "${cardTitle}" study card.
Speak naturally, warmly, and briefly—like a calm friend sitting across the desk.
Always use addTask, completeTask, addSubtasks, and setCheckInPreference tools to keep their To-Do list and check-in interval synced with what they tell you.`,
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
                return {
                  id: call.id,
                  name: call.name,
                  response: {
                    result:
                      call.name === 'setCheckInPreference'
                        ? 'Updated automatic check-in schedule successfully.'
                        : 'Updated live To-Do list successfully.',
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

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusPair server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
