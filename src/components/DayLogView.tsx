import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookmarkCheck,
  Calendar,
  Check,
  CopyCheck,
  Download,
  Eraser,
  HeartPulse,
  History,
  PenTool,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import type {
  CycleDayLog,
  CycleFlowLevel,
  DayLogEntry,
  DayLogStroke,
  GoalPlan,
} from '../types';
import { PHASE_META, resolveActiveCycleContext } from '../utils/goalRewards';
import { toLocalDateKey } from '../utils/profileStorage';

export const DAY_LOG_VIRTUAL_WIDTH = 1000;
export const DAY_LOG_ROW_HEIGHT = 80;
export const DAY_LOG_ROW_COUNT = 24;
export const DAY_LOG_VIRTUAL_HEIGHT = DAY_LOG_ROW_HEIGHT * DAY_LOG_ROW_COUNT; // 1920

export interface DayLogHourSlot {
  slotIndex: number; // 0..23
  hourKey: string; // '4'..'27'
  label: string;
  shortLabel: string;
  periodTag: string;
}

export const DAY_LOG_HOURS: DayLogHourSlot[] = Array.from(
  { length: DAY_LOG_ROW_COUNT },
  (_, idx) => {
    const rawHour = 4 + idx; // 4..27 (27 = 3 AM next calendar morning)
    const h24 = rawHour % 24;
    const isPm = h24 >= 12;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = isPm ? 'PM' : 'AM';
    let periodTag = '';
    if (rawHour === 4) periodTag = 'Dawn';
    else if (rawHour === 12) periodTag = 'Noon';
    else if (rawHour === 18) periodTag = 'Evening';
    else if (rawHour === 24) periodTag = 'Midnight';
    else if (rawHour === 27) periodTag = 'Late Night End';

    return {
      slotIndex: idx,
      hourKey: String(rawHour),
      label: `${h12}:00 ${suffix}`,
      shortLabel: `${h12}${isPm ? 'p' : 'a'}`,
      periodTag,
    };
  }
);

export const FLOW_LEVEL_OPTIONS: Array<{
  value: CycleFlowLevel;
  label: string;
  chipClass: string;
}> = [
  {
    value: 'none',
    label: 'None',
    chipClass: 'border-cyan-200/20 bg-slate-950/55 text-slate-300',
  },
  {
    value: 'spotting',
    label: 'Spotting',
    chipClass: 'border-rose-300/35 bg-rose-400/12 text-rose-100',
  },
  {
    value: 'light',
    label: 'Light Flow',
    chipClass: 'border-rose-300/45 bg-rose-400/20 text-rose-100',
  },
  {
    value: 'medium',
    label: 'Medium Flow',
    chipClass: 'border-rose-300/60 bg-rose-500/28 text-rose-50',
  },
  {
    value: 'heavy',
    label: 'Heavy Flow',
    chipClass: 'border-rose-400/75 bg-rose-500/40 text-white',
  },
  {
    value: 'ended',
    label: 'Flow Ended',
    chipClass: 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100',
  },
];

const SYMPTOM_CHIPS = ['Cramps', 'Fatigue', 'Bloating', 'Headache', 'Mood Shift', 'Clear'];

const PEN_COLORS = [
  { hex: '#f1f5f9', label: 'Ice White' },
  { hex: '#67e8f9', label: 'Aqua Glow' },
  { hex: '#fde68a', label: 'Warm Gold' },
  { hex: '#fda4af', label: 'Soft Rose' },
  { hex: '#5eead4', label: 'Seafoam' },
];

const PEN_WIDTHS = [
  { px: 2.6, label: 'Fine' },
  { px: 4.8, label: 'Medium' },
  { px: 8.8, label: 'Marker' },
];

function makeStrokeId(): string {
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  stroke: DayLogStroke,
  scaleX: number,
  scaleY: number
) {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const avgScale = (scaleX + scaleY) * 0.5;
  ctx.lineWidth = Math.max(1.2, stroke.width * avgScale);

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
  }

  const pts = stroke.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x * scaleX, pts[0].y * scaleY, ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = ((pts[i].x + pts[i + 1].x) * 0.5) * scaleX;
    const midY = ((pts[i].y + pts[i + 1].y) * 0.5) * scaleY;
    ctx.quadraticCurveTo(pts[i].x * scaleX, pts[i].y * scaleY, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * scaleX, last.y * scaleY);
  ctx.stroke();
  ctx.restore();
}

export function renderDayLogSheetToDataUrl(entry: DayLogEntry): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const W = DAY_LOG_VIRTUAL_WIDTH;
  const headerH = 92;
  const H = headerH + DAY_LOG_VIRTUAL_HEIGHT;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Deep abyssal paper backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04121f');
  bg.addColorStop(0.5, '#030d18');
  bg.addColorStop(1, '#020812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = 'rgba(14, 43, 66, 0.72)';
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(W, headerH);
  ctx.stroke();

  ctx.fillStyle = '#e2f1ff';
  ctx.font = '600 24px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(entry.title?.trim() || `Daily Log · ${entry.dateKey}`, 28, 38);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 15px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText('4:00 AM → 3:00 AM Handwritten Sheet', 28, 68);

  if (entry.cycleSummary) {
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(entry.cycleSummary, W - 28, 42);
    ctx.textAlign = 'left';
  }

  const gutterX = 148;

  // Hour rows & ruled writing lines
  for (const slot of DAY_LOG_HOURS) {
    const topY = headerH + slot.slotIndex * DAY_LOG_ROW_HEIGHT;
    if (slot.slotIndex % 2 === 1) {
      ctx.fillStyle = 'rgba(15, 36, 56, 0.28)';
      ctx.fillRect(0, topY, W, DAY_LOG_ROW_HEIGHT);
    }

    // Hour border line
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(W, topY);
    ctx.stroke();

    // Half-hour dashed writing guide
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.beginPath();
    ctx.moveTo(gutterX, topY + DAY_LOG_ROW_HEIGHT * 0.5);
    ctx.lineTo(W, topY + DAY_LOG_ROW_HEIGHT * 0.5);
    ctx.stroke();
    ctx.restore();

    // Hour label in gutter
    ctx.fillStyle = '#67e8f9';
    ctx.font = '600 15px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(slot.label, 20, topY + 30);

    if (slot.periodTag) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(slot.periodTag, 20, topY + 50);
    }

    const note = entry.hourNotes?.[slot.hourKey];
    if (note && note.trim()) {
      ctx.fillStyle = 'rgba(253, 230, 138, 0.92)';
      ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(note.trim().slice(0, 40), gutterX + 14, topY + 24);
    }
  }

  // Vertical gutter divider
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gutterX, headerH);
  ctx.lineTo(gutterX, H);
  ctx.stroke();

  // Render vector handwriting strokes onto an isolated offscreen canvas so erasers only erase ink (not lines!)
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = W;
  inkCanvas.height = DAY_LOG_VIRTUAL_HEIGHT;
  const inkCtx = inkCanvas.getContext('2d');
  if (inkCtx) {
    for (const s of entry.strokes) {
      drawStrokePath(inkCtx, s, 1, 1);
    }
    ctx.drawImage(inkCanvas, 0, headerH);
  }

  return canvas.toDataURL('image/png');
}

interface DayLogViewProps {
  activeDayLog: DayLogEntry;
  dayLogHistory: DayLogEntry[];
  goals: GoalPlan[];
  cycleLogs: Record<string, CycleDayLog>;
  onUpdateActiveDayLog: (updater: (prev: DayLogEntry) => DayLogEntry) => void;
  onArchiveDayLog: (snapshot: DayLogEntry, resetAfterArchive: boolean) => void;
  onUpdateCycleLog: (dateKey: string, updater: (prev: CycleDayLog) => CycleDayLog) => void;
  onQuickStartPeriodGoal: () => void;
  onOpenHistoryTab: () => void;
  onOpenGoalsTab: () => void;
}

export function DayLogView({
  activeDayLog,
  dayLogHistory,
  goals,
  cycleLogs,
  onUpdateActiveDayLog,
  onArchiveDayLog,
  onUpdateCycleLog,
  onQuickStartPeriodGoal,
  onOpenHistoryTab,
  onOpenGoalsTab,
}: DayLogViewProps) {
  const todayIso = toLocalDateKey(Date.now());
  const sheetDateKey = activeDayLog.dateKey || todayIso;

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>('#f1f5f9');
  const [penWidth, setPenWidth] = useState<number>(4.8);
  const [stylusOnlyMode, setStylusOnlyMode] = useState<boolean>(false);
  const [redoStack, setRedoStack] = useState<DayLogStroke[]>([]);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DayLogStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const cycleContext = useMemo(
    () => resolveActiveCycleContext(goals, sheetDateKey),
    [goals, sheetDateKey]
  );

  const currentCycleLog: CycleDayLog = useMemo(() => {
    const existing = cycleLogs[sheetDateKey];
    if (existing) return existing;
    return {
      dateKey: sheetDateKey,
      flow: 'none',
      symptoms: [],
      note: '',
      updatedAt: Date.now(),
    };
  }, [cycleLogs, sheetDateKey]);

  const cycleSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (cycleContext) {
      parts.push(
        `Cycle Day ${cycleContext.cycleDay}/${cycleContext.totalCycleDays} · ${PHASE_META[cycleContext.phase].label}`
      );
    }
    if (currentCycleLog.flow && currentCycleLog.flow !== 'none') {
      const flowLabel =
        FLOW_LEVEL_OPTIONS.find((f) => f.value === currentCycleLog.flow)?.label ??
        currentCycleLog.flow;
      parts.push(flowLabel);
    }
    if (currentCycleLog.symptoms && currentCycleLog.symptoms.length > 0) {
      parts.push(currentCycleLog.symptoms.join(', '));
    }
    return parts.join(' · ');
  }, [currentCycleLog.flow, currentCycleLog.symptoms, cycleContext]);

  const flashNotice = (msg: string) => {
    setSavedToast(msg);
    window.setTimeout(() => {
      setSavedToast((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  // Paint all stored vector strokes + optional in-progress stroke onto the transparent overlay canvas
  const redrawOverlayCanvas = useCallback(
    (inProgress?: DayLogStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;

      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scaleX = canvas.width / DAY_LOG_VIRTUAL_WIDTH;
      const scaleY = canvas.height / DAY_LOG_VIRTUAL_HEIGHT;

      for (const stroke of activeDayLog.strokes) {
        drawStrokePath(ctx, stroke, scaleX, scaleY);
      }
      if (inProgress) {
        drawStrokePath(ctx, inProgress, scaleX, scaleY);
      }
    },
    [activeDayLog.strokes]
  );

  useEffect(() => {
    redrawOverlayCanvas(activeStrokeRef.current);
  }, [redrawOverlayCanvas]);

  useEffect(() => {
    const handleResize = () => redrawOverlayCanvas(activeStrokeRef.current);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawOverlayCanvas]);

  const toVirtualPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * DAY_LOG_VIRTUAL_WIDTH;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * DAY_LOG_VIRTUAL_HEIGHT;
    return {
      x: Math.round(Math.max(0, Math.min(DAY_LOG_VIRTUAL_WIDTH, x)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(DAY_LOG_VIRTUAL_HEIGHT, y)) * 10) / 10,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // When tablet smart stylus mode is active, finger touch scrolls while pen/mouse draws
    if (stylusOnlyMode && e.pointerType === 'touch') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const pt = toVirtualPoint(e);
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic events
    }

    const newStroke: DayLogStroke = {
      id: makeStrokeId(),
      tool,
      color: penColor,
      width: tool === 'eraser' ? Math.max(16, penWidth * 3.5) : penWidth,
      points: [pt],
    };
    activeStrokeRef.current = newStroke;
    redrawOverlayCanvas(newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || activePointerIdRef.current !== e.pointerId) return;

    const pt = toVirtualPoint(e);
    const prev = stroke.points[stroke.points.length - 1];
    if (prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (dx * dx + dy * dy < 2.2) return;
    }

    stroke.points.push(pt);
    redrawOverlayCanvas(stroke);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || activePointerIdRef.current !== e.pointerId) return;

    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (stroke.points.length === 0) return;

    setRedoStack([]);
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      strokes: [...prev.strokes, stroke],
    }));
  };

  const handleUndo = () => {
    if (activeDayLog.strokes.length === 0) return;
    const removed = activeDayLog.strokes[activeDayLog.strokes.length - 1];
    setRedoStack((r) => [...r, removed]);
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      strokes: prev.strokes.slice(0, -1),
    }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      strokes: [...prev.strokes, restored],
    }));
  };

  const handleClearSheet = () => {
    setRedoStack([]);
    setConfirmClear(false);
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      strokes: [],
      hourNotes: {},
      updatedAt: Date.now(),
    }));
    flashNotice('Cleared active sheet.');
  };

  const handleSaveProgress = () => {
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      cycleSummary: cycleSummaryText || undefined,
      updatedAt: Date.now(),
    }));
    flashNotice('Saved! Your writing stays right here even if you close the site.');
  };

  const handleArchiveSheet = (resetAfterArchive: boolean) => {
    const snapshot: DayLogEntry = {
      ...activeDayLog,
      cycleSummary: cycleSummaryText || undefined,
      updatedAt: Date.now(),
      archivedAt: Date.now(),
    };
    onArchiveDayLog(snapshot, resetAfterArchive);
    if (resetAfterArchive) {
      setRedoStack([]);
      flashNotice('Saved sheet to History and opened a fresh blank page.');
    } else {
      flashNotice('Saved snapshot copy to History (active sheet kept intact).');
    }
  };

  const handleDownloadPng = () => {
    const dataUrl = renderDayLogSheetToDataUrl({
      ...activeDayLog,
      cycleSummary: cycleSummaryText || undefined,
    });
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `day-log-${sheetDateKey}.png`;
    link.click();
  };

  const writtenNotesCount = useMemo(
    () =>
      Object.values(activeDayLog.hourNotes ?? {}).filter((v) => v && v.trim().length > 0)
        .length,
    [activeDayLog.hourNotes]
  );

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[1340px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 quiet-scroll">
      {/* Header & Persistence Guarantee */}
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300/35 bg-cyan-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-100">
                <PenTool className="h-3.5 w-3.5" />
                4:00 AM → 3:00 AM Stylus Sheet
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">
                <BookmarkCheck className="h-3.5 w-3.5" />
                Auto-saved permanently (never resets on reload)
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={activeDayLog.title ?? ''}
                onChange={(e) =>
                  onUpdateActiveDayLog((prev) => ({
                    ...prev,
                    title: e.target.value,
                    updatedAt: Date.now(),
                  }))
                }
                placeholder={`Day Sheet — ${sheetDateKey}`}
                className="bio-input font-display min-w-[240px] rounded-lg px-3 py-1.5 text-base font-semibold text-slate-100 sm:min-w-[300px]"
              />

              <label className="flex items-center gap-1.5 rounded-lg border border-cyan-200/15 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-cyan-300" />
                <input
                  type="date"
                  value={sheetDateKey}
                  onChange={(e) => {
                    const nextDate = e.target.value || todayIso;
                    onUpdateActiveDayLog((prev) => ({
                      ...prev,
                      dateKey: nextDate,
                      updatedAt: Date.now(),
                    }));
                  }}
                  className="bg-transparent text-xs text-slate-100 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveProgress}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/25"
            >
              <Save className="h-3.5 w-3.5" />
              Save Progress
            </button>

            <button
              type="button"
              onClick={() => handleArchiveSheet(false)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-300/45"
            >
              <CopyCheck className="h-3.5 w-3.5 text-cyan-300" />
              Snapshot to History
            </button>

            <button
              type="button"
              onClick={() => handleArchiveSheet(true)}
              className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold"
            >
              <Archive className="h-3.5 w-3.5" />
              Save to History &amp; New Sheet
            </button>

            <button
              type="button"
              onClick={onOpenHistoryTab}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-400/20"
            >
              <History className="h-3.5 w-3.5" />
              Archived ({dayLogHistory.length})
            </button>
          </div>
        </div>

        {savedToast && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3 py-2 text-xs font-medium text-emerald-100">
            <Check className="h-4 w-4 shrink-0 text-emerald-300" />
            <span>{savedToast}</span>
          </div>
        )}

        {/* Synced Period & Cycle Strip (bidirectional with Monthly Phases & Daily Goals) */}
        <div className="mt-4 rounded-xl border border-rose-300/25 bg-rose-500/[0.06] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className="h-4 w-4 text-rose-300" />
              <span className="text-xs font-semibold text-rose-100">
                Cycle &amp; Daily Check-In ({sheetDateKey})
              </span>
              {cycleContext ? (
                <button
                  type="button"
                  onClick={onOpenGoalsTab}
                  className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    PHASE_META[cycleContext.phase].chipClass
                  }`}
                >
                  Cycle Day {cycleContext.cycleDay} of {cycleContext.totalCycleDays} ·{' '}
                  {PHASE_META[cycleContext.phase].label} Phase
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onQuickStartPeriodGoal}
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-rose-300/45 bg-rose-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/25"
                >
                  <Sparkles className="h-3 w-3" />
                  Start Structured 28-Day Period Tracker (6d Menstrual)
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Syncs live with Monthly Phases table &amp; Today&apos;s Daily Plan
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-300">Flow:</span>
            {FLOW_LEVEL_OPTIONS.map((opt) => {
              const active = currentCycleLog.flow === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onUpdateCycleLog(sheetDateKey, (prev) => ({
                      ...prev,
                      dateKey: sheetDateKey,
                      flow: opt.value,
                      updatedAt: Date.now(),
                    }))
                  }
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    active
                      ? `${opt.chipClass} ring-1 ring-rose-300/70`
                      : 'border-cyan-200/12 bg-slate-950/50 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-300">Symptoms:</span>
            {SYMPTOM_CHIPS.map((sym) => {
              const active = (currentCycleLog.symptoms ?? []).includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() =>
                    onUpdateCycleLog(sheetDateKey, (prev) => {
                      const existing = prev.symptoms ?? [];
                      const next = existing.includes(sym)
                        ? existing.filter((s) => s !== sym)
                        : [...existing, sym];
                      return {
                        ...prev,
                        dateKey: sheetDateKey,
                        symptoms: next,
                        updatedAt: Date.now(),
                      };
                    })
                  }
                  className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] transition-all ${
                    active
                      ? 'border-amber-300/55 bg-amber-400/18 text-amber-100'
                      : 'border-cyan-200/12 bg-slate-950/45 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {sym}
                </button>
              );
            })}

            <input
              type="text"
              value={currentCycleLog.note}
              onChange={(e) =>
                onUpdateCycleLog(sheetDateKey, (prev) => ({
                  ...prev,
                  dateKey: sheetDateKey,
                  note: e.target.value,
                  updatedAt: Date.now(),
                }))
              }
              placeholder="Cycle / daily synced note (shows inside Monthly Phases & Daily Goal)..."
              className="bio-input min-w-[230px] flex-1 rounded-lg px-2.5 py-1 text-xs text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Sticky Pen Toolbar */}
      <section className="glass-panel sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              tool === 'pen'
                ? 'bio-glow-chip'
                : 'border-cyan-200/15 bg-slate-950/55 text-slate-300'
            }`}
          >
            <PenTool className="h-3.5 w-3.5" />
            Pen
          </button>

          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              tool === 'eraser'
                ? 'border-amber-300/60 bg-amber-400/20 text-amber-100'
                : 'border-cyan-200/15 bg-slate-950/55 text-slate-300'
            }`}
          >
            <Eraser className="h-3.5 w-3.5" />
            Eraser
          </button>

          <div className="mx-1 h-5 w-px bg-cyan-200/15" />

          {/* Ink Colors */}
          <div className="flex items-center gap-1.5">
            {PEN_COLORS.map((c) => {
              const selected = tool === 'pen' && penColor === c.hex;
              return (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => {
                    setTool('pen');
                    setPenColor(c.hex);
                  }}
                  style={{ backgroundColor: c.hex }}
                  className={`h-6 w-6 cursor-pointer rounded-full border-2 transition-transform ${
                    selected
                      ? 'scale-115 border-cyan-300 ring-2 ring-cyan-300/60'
                      : 'border-slate-700 opacity-85 hover:opacity-100'
                  }`}
                />
              );
            })}
          </div>

          <div className="mx-1 h-5 w-px bg-cyan-200/15" />

          {/* Stroke Width */}
          <div className="flex items-center gap-1">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w.label}
                type="button"
                onClick={() => setPenWidth(w.px)}
                className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium ${
                  penWidth === w.px
                    ? 'border-cyan-300/55 bg-cyan-400/20 text-cyan-100'
                    : 'border-cyan-200/15 bg-slate-950/45 text-slate-400'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="mx-1 h-5 w-px bg-cyan-200/15" />

          {/* Tablet Stylus vs Touch Draw toggle */}
          <button
            type="button"
            onClick={() => setStylusOnlyMode((v) => !v)}
            title="Switch between Smart Stylus (Pen draws / Finger scrolls) and Draw Anywhere (Pen, Finger, and Mouse all draw)"
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
              stylusOnlyMode
                ? 'border-amber-300/50 bg-amber-400/15 text-amber-100'
                : 'border-cyan-300/40 bg-cyan-400/12 text-cyan-100'
            }`}
          >
            {stylusOnlyMode
              ? 'Tablet Stylus Mode (Finger Scrolls)'
              : 'Draw Anywhere (Pen / Mouse / Touch)'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono-tabular mr-1 text-[11px] text-slate-400">
            {activeDayLog.strokes.length} strokes
            {writtenNotesCount > 0 ? ` · ${writtenNotesCount} notes` : ''}
          </span>

          <button
            type="button"
            onClick={handleUndo}
            disabled={activeDayLog.strokes.length === 0}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2.5 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2.5 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Redo2 className="h-3.5 w-3.5" />
            Redo
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            title="Download handwritten sheet as PNG"
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2.5 py-1.5 text-xs text-cyan-200 hover:border-cyan-300/45"
          >
            <Download className="h-3.5 w-3.5" />
            PNG
          </button>

          {confirmClear ? (
            <div className="flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[11px]">
              <span className="text-rose-100">Reset blank?</span>
              <button
                type="button"
                onClick={handleClearSheet}
                className="cursor-pointer rounded bg-rose-500/40 px-2 py-0.5 font-semibold text-white"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="cursor-pointer px-1.5 text-slate-300"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Sheet
            </button>
          )}
        </div>
      </section>

      {/* 4:00 AM → 3:00 AM Lined Writing Sheet */}
      <section className="glass-panel overflow-hidden rounded-2xl border border-cyan-200/20">
        <div
          className="relative w-full select-none bg-[#030e19]"
          style={{ height: `${DAY_LOG_VIRTUAL_HEIGHT}px` }}
        >
          {/* Underlay: 24 Hour Timetable Rows (4:00 AM .. 3:00 AM) */}
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {DAY_LOG_HOURS.map((slot) => (
              <div
                key={slot.hourKey}
                className={`relative flex h-[80px] border-b border-cyan-200/15 ${
                  slot.slotIndex % 2 === 1 ? 'bg-cyan-400/[0.025]' : ''
                }`}
              >
                {/* Half-hour faint dashed rule */}
                <div className="pointer-events-none absolute right-0 left-[148px] top-1/2 border-t border-dashed border-slate-500/15" />

                {/* Left Time Gutter visual guide */}
                <div className="flex w-[124px] shrink-0 flex-col justify-start border-r border-cyan-200/20 px-3 pt-2 sm:w-[148px]">
                  <span className="font-mono-tabular text-sm font-semibold text-cyan-200">
                    {slot.label}
                  </span>
                  {slot.periodTag && (
                    <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      {slot.periodTag}
                    </span>
                  )}
                </div>

                {/* Wide Handwritten Area preview of typed label if any */}
                <div className="relative flex-1 px-3 pt-1.5" />
              </div>
            ))}
          </div>

          {/* Transparent Interactive Stylus Ink Canvas */}
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            className={`absolute inset-0 z-10 h-full w-full ${
              stylusOnlyMode ? 'touch-pan-y' : 'touch-none'
            } ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
          />

          {/* Interactive Gutter Tag Overlay (never steals strokes from main writing sheet) */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-[124px] flex-col sm:w-[148px]">
            {DAY_LOG_HOURS.map((slot) => (
              <div
                key={`tag-${slot.hourKey}`}
                className="flex h-[80px] flex-col justify-end px-2.5 pb-1.5"
              >
                <input
                  type="text"
                  value={activeDayLog.hourNotes?.[slot.hourKey] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateActiveDayLog((prev) => ({
                      ...prev,
                      updatedAt: Date.now(),
                      hourNotes: {
                        ...(prev.hourNotes ?? {}),
                        [slot.hourKey]: val,
                      },
                    }));
                  }}
                  placeholder="+ tag"
                  aria-label={`${slot.label} optional typed tag`}
                  className="pointer-events-auto w-full rounded bg-slate-950/35 px-1.5 py-0.5 text-[11px] font-medium text-amber-200/95 placeholder:text-slate-600/80 focus:bg-slate-950/90 focus:outline-none focus:ring-1 focus:ring-cyan-300/45"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quick action bar after scrolling to 3:00 AM */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/15 bg-[#04111b]/85 px-5 py-3.5 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <RotateCcw className="h-3.5 w-3.5 text-cyan-300" />
            <span>
              Reached 3:00 AM. Everything written above stays saved until you explicitly choose{' '}
              <strong className="text-cyan-100">Save to History &amp; New Sheet</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleArchiveSheet(true)}
            className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
          >
            <Archive className="h-3.5 w-3.5" />
            End of Day: Save to History &amp; Reset Blank
          </button>
        </div>
      </section>
    </main>
  );
}
