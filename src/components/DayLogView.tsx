import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  BookmarkCheck,
  Calendar,
  Check,
  CopyCheck,
  Download,
  Eraser,
  HeartPulse,
  History,
  Layers,
  PenTool,
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import type {
  CustomDateLogSheet,
  CycleDayLog,
  CycleFlowLevel,
  DateRangeLogSheet,
  DayLogEntry,
  DayLogSheetDivision,
  DayLogStroke,
  GoalPlan,
} from '../types';
import { PHASE_META, resolveActiveCycleContext } from '../utils/goalRewards';
import {
  buildDateDivisionsForRange,
  buildMonthStartEnd,
  createCustomDateLogSheet,
  createDateRangeLogSheet,
  toLocalDateKey,
} from '../utils/profileStorage';

export const DAY_LOG_VIRTUAL_WIDTH = 1000;
export const DAY_LOG_ROW_HEIGHT = 64;
export const DAY_LOG_ROW_COUNT = 24;
export const DAY_LOG_VIRTUAL_HEIGHT = DAY_LOG_ROW_HEIGHT * DAY_LOG_ROW_COUNT; // 1536
export const DIVISION_VIRTUAL_ROW_HEIGHT = 136;

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

const penWidth = 4.8;

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

export function renderDividedSheetToDataUrl(options: {
  title: string;
  subtitle: string;
  divisions: DayLogSheetDivision[];
  strokes: DayLogStroke[];
  cycleSummary?: string;
}): string {
  if (typeof document === 'undefined') return '';
  const { title, subtitle, divisions, strokes, cycleSummary } = options;
  const rows = Math.max(1, divisions.length);
  const canvas = document.createElement('canvas');
  const W = DAY_LOG_VIRTUAL_WIDTH;
  const headerH = 92;
  const sheetH = rows * DIVISION_VIRTUAL_ROW_HEIGHT;
  const H = headerH + sheetH;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04121f');
  bg.addColorStop(0.5, '#030d18');
  bg.addColorStop(1, '#020812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

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
  ctx.fillText(title, 28, 38);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 15px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText(subtitle, 28, 68);

  if (cycleSummary) {
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(cycleSummary, W - 28, 42);
    ctx.textAlign = 'left';
  }

  const gutterX = 196;

  divisions.forEach((div, idx) => {
    const topY = headerH + idx * DIVISION_VIRTUAL_ROW_HEIGHT;
    if (idx % 2 === 1) {
      ctx.fillStyle = 'rgba(15, 36, 56, 0.28)';
      ctx.fillRect(0, topY, W, DIVISION_VIRTUAL_ROW_HEIGHT);
    }

    ctx.strokeStyle = 'rgba(103, 232, 249, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(W, topY);
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    [0.33, 0.66].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(gutterX, topY + DIVISION_VIRTUAL_ROW_HEIGHT * ratio);
      ctx.lineTo(W, topY + DIVISION_VIRTUAL_ROW_HEIGHT * ratio);
      ctx.stroke();
    });
    ctx.restore();

    ctx.fillStyle = div.completed ? '#94a3b8' : '#67e8f9';
    ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
    const prefix = div.completed ? '✓ ' : '';
    ctx.fillText(`${prefix}${div.label}`.slice(0, 22), 20, topY + 34);

    if (div.note && div.note.trim()) {
      ctx.fillStyle = 'rgba(253, 230, 138, 0.92)';
      ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(div.note.trim().slice(0, 24), 20, topY + 60);
    }
  });

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gutterX, headerH);
  ctx.lineTo(gutterX, H);
  ctx.stroke();

  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = W;
  inkCanvas.height = sheetH;
  const inkCtx = inkCanvas.getContext('2d');
  if (inkCtx) {
    for (const s of strokes) {
      drawStrokePath(inkCtx, s, 1, 1);
    }
    ctx.drawImage(inkCanvas, 0, headerH);
  }

  return canvas.toDataURL('image/png');
}

function makeDivisionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function shiftStrokesOnDivisionDelete(
  strokes: DayLogStroke[],
  removedIndex: number
): DayLogStroke[] {
  const bandStart = removedIndex * DIVISION_VIRTUAL_ROW_HEIGHT;
  const bandEnd = bandStart + DIVISION_VIRTUAL_ROW_HEIGHT;
  return strokes
    .filter((stroke) => {
      if (stroke.points.length === 0) return false;
      const avgY =
        stroke.points.reduce((sum, pt) => sum + pt.y, 0) / stroke.points.length;
      return avgY < bandStart || avgY >= bandEnd;
    })
    .map((stroke) => {
      const avgY =
        stroke.points.reduce((sum, pt) => sum + pt.y, 0) / stroke.points.length;
      if (avgY < bandEnd) return stroke;
      return {
        ...stroke,
        points: stroke.points.map((pt) => ({
          x: pt.x,
          y: Math.max(0, Math.round((pt.y - DIVISION_VIRTUAL_ROW_HEIGHT) * 10) / 10),
        })),
      };
    });
}

function remapStrokesForDateDivisions(
  strokes: DayLogStroke[],
  oldDivisions: DayLogSheetDivision[],
  newDivisions: DayLogSheetDivision[]
): DayLogStroke[] {
  if (strokes.length === 0) return [];
  const oldIndexByDate = new Map<string, number>();
  oldDivisions.forEach((d, idx) => {
    if (d.dateKey) oldIndexByDate.set(d.dateKey, idx);
  });
  const newIndexByDate = new Map<string, number>();
  newDivisions.forEach((d, idx) => {
    if (d.dateKey) newIndexByDate.set(d.dateKey, idx);
  });

  const maxVirtualY = Math.max(1, newDivisions.length) * DIVISION_VIRTUAL_ROW_HEIGHT;
  const remapped: DayLogStroke[] = [];
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const avgY = stroke.points.reduce((s, p) => s + p.y, 0) / stroke.points.length;
    const oldRowIdx = Math.max(
      0,
      Math.min(oldDivisions.length - 1, Math.floor(avgY / DIVISION_VIRTUAL_ROW_HEIGHT))
    );
    const oldDate = oldDivisions[oldRowIdx]?.dateKey;
    if (!oldDate) continue;
    const targetIdx = newIndexByDate.get(oldDate);
    if (targetIdx === undefined) continue;
    const deltaY = (targetIdx - oldRowIdx) * DIVISION_VIRTUAL_ROW_HEIGHT;
    remapped.push({
      ...stroke,
      points: stroke.points.map((pt) => ({
        x: pt.x,
        y: Math.max(0, Math.min(maxVirtualY, Math.round((pt.y + deltaY) * 10) / 10)),
      })),
    });
  }
  return remapped;
}

interface DayLogViewProps {
  activeDayLog: DayLogEntry;
  dayLogHistory: DayLogEntry[];
  customDateLogs: CustomDateLogSheet[];
  dateRangeLogs: DateRangeLogSheet[];
  goals: GoalPlan[];
  cycleLogs: Record<string, CycleDayLog>;
  onUpdateActiveDayLog: (updater: (prev: DayLogEntry) => DayLogEntry) => void;
  onUpdateCustomDateLogs: (
    updater: (prev: CustomDateLogSheet[]) => CustomDateLogSheet[]
  ) => void;
  onUpdateDateRangeLogs: (
    updater: (prev: DateRangeLogSheet[]) => DateRangeLogSheet[]
  ) => void;
  onArchiveDayLog: (snapshot: DayLogEntry, resetAfterArchive: boolean) => void;
  onUpdateCycleLog: (dateKey: string, updater: (prev: CycleDayLog) => CycleDayLog) => void;
  onQuickStartPeriodGoal: () => void;
  onOpenHistoryTab: () => void;
  onOpenGoalsTab: () => void;
}

interface DividedStylusSheetProps {
  divisions: DayLogSheetDivision[];
  strokes: DayLogStroke[];
  divisionHeight: number;
  tool: 'pen' | 'eraser' | 'scroll';
  penColor: string;
  showCompletionCheck?: boolean;
  isDateLocked?: boolean;
  todayIso?: string;
  notePlaceholder?: string;
  onCommitStroke: (stroke: DayLogStroke) => void;
  onUpdateDivision: (
    divisionId: string,
    patch: Partial<Pick<DayLogSheetDivision, 'label' | 'completed' | 'note'>>
  ) => void;
  onDeleteDivision: (divisionIndex: number) => void;
  canDeleteDivision: boolean;
}

function DividedStylusSheet({
  divisions,
  strokes,
  divisionHeight,
  tool,
  penColor,
  showCompletionCheck = false,
  isDateLocked = false,
  todayIso = '',
  notePlaceholder = '+ tag',
  onCommitStroke,
  onUpdateDivision,
  onDeleteDivision,
  canDeleteDivision,
}: DividedStylusSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DayLogStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const safeRowCount = Math.max(1, divisions.length);
  const virtualHeight = safeRowCount * DIVISION_VIRTUAL_ROW_HEIGHT;
  const totalCssHeight = safeRowCount * divisionHeight;

  const redraw = useCallback(
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
      const scaleY = canvas.height / virtualHeight;

      for (const s of strokes) {
        drawStrokePath(ctx, s, scaleX, scaleY);
      }
      if (inProgress) {
        drawStrokePath(ctx, inProgress, scaleX, scaleY);
      }
    },
    [strokes, virtualHeight]
  );

  useEffect(() => {
    redraw(activeStrokeRef.current);
  }, [redraw]);

  useEffect(() => {
    const handleResize = () => redraw(activeStrokeRef.current);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redraw]);

  const toPt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * DAY_LOG_VIRTUAL_WIDTH;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * virtualHeight;
    return {
      x: Math.round(Math.max(0, Math.min(DAY_LOG_VIRTUAL_WIDTH, x)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(virtualHeight, y)) * 10) / 10,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'scroll') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.cancelable) e.preventDefault();

    const pt = toPt(e);
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors
    }
    const nextStroke: DayLogStroke = {
      id: makeStrokeId(),
      tool,
      color: penColor,
      width: tool === 'eraser' ? Math.max(16, penWidth * 3.5) : penWidth,
      points: [pt],
    };
    activeStrokeRef.current = nextStroke;
    redraw(nextStroke);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    const stroke = activeStrokeRef.current;
    if (!stroke || activePointerIdRef.current !== e.pointerId) return;
    const pt = toPt(e);
    const prev = stroke.points[stroke.points.length - 1];
    if (prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (dx * dx + dy * dy < 2.2) return;
    }
    stroke.points.push(pt);
    redraw(stroke);
  };

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (stroke.points.length > 0) {
      onCommitStroke(stroke);
    }
  };

  return (
    <div
      className="relative w-full select-none bg-[#030e19]"
      style={{ height: `${totalCssHeight}px` }}
    >
      {/* Ruled horizontal division rows matching the Daily Log sheet */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {divisions.map((div, idx) => (
          <div
            key={div.id}
            style={{ height: `${divisionHeight}px` }}
            className={`relative flex border-b border-cyan-200/20 ${
              idx % 2 === 1 ? 'bg-cyan-400/[0.025]' : ''
            }`}
          >
            {/* Subtle dashed ruled guide lines inside each writing row */}
            <div className="pointer-events-none absolute right-0 left-[156px] sm:left-[196px] top-1/3 border-t border-dashed border-slate-500/15" />
            <div className="pointer-events-none absolute right-0 left-[156px] sm:left-[196px] top-2/3 border-t border-dashed border-slate-500/15" />

            {/* Left division column border */}
            <div className="w-[156px] shrink-0 border-r border-cyan-200/20 sm:w-[196px]" />
            <div className="flex-1" />
          </div>
        ))}
      </div>

      {/* Single continuous transparent stylus overlay canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={tool === 'scroll' ? undefined : handleDown}
        onPointerMove={tool === 'scroll' ? undefined : handleMove}
        onPointerUp={tool === 'scroll' ? undefined : handleUp}
        onPointerCancel={tool === 'scroll' ? undefined : handleUp}
        className={`absolute inset-0 z-10 h-full w-full ${
          tool === 'scroll' ? 'pointer-events-none' : 'touch-none'
        } ${
          tool === 'scroll'
            ? 'cursor-default'
            : tool === 'eraser'
              ? 'cursor-cell'
              : 'cursor-crosshair'
        }`}
      />

      {/* Interactive Left Gutter Division Labels, Ticks, Notes & Delete */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-[156px] flex-col sm:w-[196px]">
        {divisions.map((div, idx) => (
          <div
            key={`ctrl-${div.id}`}
            style={{ height: `${divisionHeight}px` }}
            className="flex flex-col justify-between px-2.5 py-2"
          >
            <div className="pointer-events-auto flex items-center gap-1.5">
              {showCompletionCheck && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDivision(div.id, { completed: !div.completed })
                  }
                  aria-label={div.completed ? 'Mark incomplete' : 'Mark complete'}
                  className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border transition ${
                    div.completed
                      ? 'border-cyan-300/70 bg-cyan-400/25 text-cyan-100'
                      : 'border-cyan-200/20 bg-slate-950/60 text-slate-400 hover:border-cyan-300/50 hover:text-cyan-100'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}

              {isDateLocked ? (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-xs font-semibold ${
                        div.completed ? 'text-cyan-200/65 line-through' : 'text-cyan-200'
                      }`}
                    >
                      {div.label}
                    </span>
                    {div.dateKey && div.dateKey === todayIso && (
                      <span className="shrink-0 rounded bg-cyan-400/20 px-1 py-0.5 text-[9px] font-bold uppercase text-cyan-100">
                        Today
                      </span>
                    )}
                  </div>
                  {div.dateKey && (
                    <span className="font-mono-tabular block text-[10px] text-slate-500">
                      {div.dateKey}
                    </span>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={div.label}
                  onChange={(e) => onUpdateDivision(div.id, { label: e.target.value })}
                  aria-label={`Division ${idx + 1} label`}
                  className={`min-w-0 flex-1 rounded bg-slate-950/50 px-1.5 py-1 text-xs font-semibold focus:bg-slate-950/90 focus:outline-none focus:ring-1 focus:ring-cyan-300/45 ${
                    div.completed ? 'text-cyan-200/70 line-through' : 'text-cyan-200'
                  }`}
                />
              )}

              {canDeleteDivision && (
                <button
                  type="button"
                  onClick={() => onDeleteDivision(idx)}
                  aria-label={`Delete ${div.label}`}
                  title="Remove row"
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-rose-500/15 hover:text-rose-200"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>

            <input
              type="text"
              value={div.note ?? ''}
              onChange={(e) => onUpdateDivision(div.id, { note: e.target.value })}
              placeholder={notePlaceholder}
              aria-label={`${div.label} plan note`}
              className="pointer-events-auto w-full rounded bg-slate-950/35 px-1.5 py-0.5 text-[11px] font-medium text-amber-200/95 placeholder:text-slate-600/80 focus:bg-slate-950/90 focus:outline-none focus:ring-1 focus:ring-cyan-300/45"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type DayLogSubTab = 'daily' | 'custom' | 'date';

export function DayLogView({
  activeDayLog,
  dayLogHistory,
  customDateLogs,
  dateRangeLogs,
  goals,
  cycleLogs,
  onUpdateActiveDayLog,
  onUpdateCustomDateLogs,
  onUpdateDateRangeLogs,
  onArchiveDayLog,
  onUpdateCycleLog,
  onQuickStartPeriodGoal,
  onOpenHistoryTab,
  onOpenGoalsTab,
}: DayLogViewProps) {
  const todayIso = toLocalDateKey(Date.now());
  const sheetDateKey = activeDayLog.dateKey || todayIso;

  const [subTab, setSubTab] = useState<DayLogSubTab>('daily');
  const [tool, setTool] = useState<'pen' | 'eraser' | 'scroll'>('scroll');
  const [penColor, setPenColor] = useState<string>('#f1f5f9');
  const [isToolbarOpen, setIsToolbarOpen] = useState<boolean>(true);
  const [redoStacks, setRedoStacks] = useState<Record<string, DayLogStroke[]>>({});
  const [selectedCustomLogId, setSelectedCustomLogId] = useState<string>(
    () => customDateLogs[0]?.id ?? ''
  );
  const [selectedDateLogId, setSelectedDateLogId] = useState<string>(
    () => dateRangeLogs[0]?.id ?? ''
  );
  const [showNewDateLogForm, setShowNewDateLogForm] = useState<boolean>(false);
  const [newDateLogTitle, setNewDateLogTitle] = useState<string>('');
  const [newDateLogMode, setNewDateLogMode] = useState<'range' | 'month'>('range');
  const [newDateLogStart, setNewDateLogStart] = useState<string>(() => sheetDateKey);
  const [newDateLogEnd, setNewDateLogEnd] = useState<string>(() => {
    const base = new Date(`${sheetDateKey}T00:00:00`);
    base.setDate(base.getDate() + 6);
    return toLocalDateKey(base.getTime());
  });
  const [newDateLogMonth, setNewDateLogMonth] = useState<string>(() =>
    sheetDateKey.slice(0, 7)
  );
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DayLogStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const ensuredCustomLogs = useMemo(
    () =>
      customDateLogs.length > 0
        ? customDateLogs
        : [createCustomDateLogSheet(sheetDateKey, 'Custom Log')],
    [customDateLogs, sheetDateKey]
  );

  const activeCustomDateLog = useMemo(
    () =>
      ensuredCustomLogs.find((sheet) => sheet.id === selectedCustomLogId) ??
      ensuredCustomLogs[0],
    [ensuredCustomLogs, selectedCustomLogId]
  );

  const ensuredDateRangeLogs = useMemo(
    () =>
      dateRangeLogs.length > 0
        ? dateRangeLogs
        : [createDateRangeLogSheet({ title: 'Custom Logs', startDate: sheetDateKey })],
    [dateRangeLogs, sheetDateKey]
  );

  const activeDateRangeLog = useMemo(
    () =>
      ensuredDateRangeLogs.find((sheet) => sheet.id === selectedDateLogId) ??
      ensuredDateRangeLogs[0],
    [ensuredDateRangeLogs, selectedDateLogId]
  );

  const effectiveTarget = useMemo(() => {
    if (subTab === 'daily') return { kind: 'daily' as const, key: 'daily' };
    if (subTab === 'custom') {
      return {
        kind: 'custom' as const,
        sheetId: activeCustomDateLog.id,
        key: `custom:${activeCustomDateLog.id}`,
      };
    }
    return {
      kind: 'date' as const,
      sheetId: activeDateRangeLog.id,
      key: `date:${activeDateRangeLog.id}`,
    };
  }, [activeCustomDateLog.id, activeDateRangeLog.id, subTab]);

  const activeTargetStrokes = useMemo(() => {
    if (effectiveTarget.kind === 'daily') return activeDayLog.strokes;
    if (effectiveTarget.kind === 'custom') return activeCustomDateLog.strokes;
    return activeDateRangeLog.strokes;
  }, [
    activeCustomDateLog.strokes,
    activeDateRangeLog.strokes,
    activeDayLog.strokes,
    effectiveTarget.kind,
  ]);

  const activeRedoStack = redoStacks[effectiveTarget.key] ?? [];

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
    if (subTab === 'daily') {
      redrawOverlayCanvas(activeStrokeRef.current);
    }
  }, [redrawOverlayCanvas, subTab]);

  useEffect(() => {
    const handleResize = () => {
      if (subTab === 'daily') redrawOverlayCanvas(activeStrokeRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawOverlayCanvas, subTab]);

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
    if (tool === 'scroll') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (e.cancelable) {
      e.preventDefault();
    }

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
    if (e.cancelable) {
      e.preventDefault();
    }
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

    setRedoStacks((prev) => ({ ...prev, daily: [] }));
    onUpdateActiveDayLog((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      strokes: [...prev.strokes, stroke],
    }));
  };

  const updateActiveCustomSheet = (
    updater: (sheet: CustomDateLogSheet) => CustomDateLogSheet
  ) => {
    onUpdateCustomDateLogs((prev) => {
      const base = prev.length > 0 ? prev : ensuredCustomLogs;
      const targetId = activeCustomDateLog.id;
      const found = base.some((s) => s.id === targetId);
      const list = found ? base : [activeCustomDateLog, ...base];
      return list.map((sheet) =>
        sheet.id === targetId ? { ...updater(sheet), updatedAt: Date.now() } : sheet
      );
    });
  };

  const updateActiveDateRangeSheet = (
    updater: (sheet: DateRangeLogSheet) => DateRangeLogSheet
  ) => {
    onUpdateDateRangeLogs((prev) => {
      const base = prev.length > 0 ? prev : ensuredDateRangeLogs;
      const targetId = activeDateRangeLog.id;
      const found = base.some((s) => s.id === targetId);
      const list = found ? base : [activeDateRangeLog, ...base];
      return list.map((sheet) =>
        sheet.id === targetId ? { ...updater(sheet), updatedAt: Date.now() } : sheet
      );
    });
  };

  const handleUndo = () => {
    if (activeTargetStrokes.length === 0) return;
    const removed = activeTargetStrokes[activeTargetStrokes.length - 1];
    setRedoStacks((prev) => ({
      ...prev,
      [effectiveTarget.key]: [...(prev[effectiveTarget.key] ?? []), removed],
    }));

    if (effectiveTarget.kind === 'daily') {
      onUpdateActiveDayLog((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        strokes: prev.strokes.slice(0, -1),
      }));
    } else if (effectiveTarget.kind === 'custom') {
      updateActiveCustomSheet((sheet) => ({
        ...sheet,
        strokes: sheet.strokes.slice(0, -1),
      }));
    } else {
      updateActiveDateRangeSheet((sheet) => ({
        ...sheet,
        strokes: sheet.strokes.slice(0, -1),
      }));
    }
  };

  const handleRedo = () => {
    if (activeRedoStack.length === 0) return;
    const restored = activeRedoStack[activeRedoStack.length - 1];
    setRedoStacks((prev) => ({
      ...prev,
      [effectiveTarget.key]: (prev[effectiveTarget.key] ?? []).slice(0, -1),
    }));

    if (effectiveTarget.kind === 'daily') {
      onUpdateActiveDayLog((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        strokes: [...prev.strokes, restored],
      }));
    } else if (effectiveTarget.kind === 'custom') {
      updateActiveCustomSheet((sheet) => ({
        ...sheet,
        strokes: [...sheet.strokes, restored],
      }));
    } else {
      updateActiveDateRangeSheet((sheet) => ({
        ...sheet,
        strokes: [...sheet.strokes, restored],
      }));
    }
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
      setRedoStacks({});
      flashNotice('Saved sheet to History and opened a fresh blank page.');
    } else {
      flashNotice('Saved snapshot copy to History (active sheet kept intact).');
    }
  };

  const handleDownloadPng = () => {
    let dataUrl = '';
    let filename = `day-log-${sheetDateKey}.png`;

    if (subTab === 'daily') {
      dataUrl = renderDayLogSheetToDataUrl({
        ...activeDayLog,
        cycleSummary: cycleSummaryText || undefined,
      });
    } else if (subTab === 'custom') {
      dataUrl = renderDividedSheetToDataUrl({
        title: activeCustomDateLog.title.trim() || 'Custom Log',
        subtitle: `Custom Log · ${activeCustomDateLog.dateKey}`,
        divisions: activeCustomDateLog.divisions,
        strokes: activeCustomDateLog.strokes,
        cycleSummary: cycleSummaryText || undefined,
      });
      filename = `custom-log-${activeCustomDateLog.dateKey}.png`;
    } else {
      dataUrl = renderDividedSheetToDataUrl({
        title: activeDateRangeLog.title.trim() || 'Custom Logs',
        subtitle: `${activeDateRangeLog.startDate} → ${activeDateRangeLog.endDate} (${activeDateRangeLog.divisions.length} days)`,
        divisions: activeDateRangeLog.divisions,
        strokes: activeDateRangeLog.strokes,
        cycleSummary: cycleSummaryText || undefined,
      });
      filename = `date-log-${activeDateRangeLog.startDate}-to-${activeDateRangeLog.endDate}.png`;
    }

    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[1340px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 pb-36 sm:px-6 lg:px-8 quiet-scroll">
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

      {/* Tablet Orientation & Scroll Reminder Notice */}
      <section className="glass-panel flex items-center gap-2.5 rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100">
        <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" />
        <span>
          <strong>Tablet Reminder:</strong> For best writing and scrolling experience, rotate your tablet to portrait. Scroll is selected by default so your finger scrolls smoothly—tap <strong>Pen</strong> whenever you want to write!
        </span>
      </section>

      {/* Day Log Sub-Views Switcher: Daily Log (default) | Custom Log | Date Log */}
      <section className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-xl p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              {
                id: 'daily' as const,
                label: 'Daily Log (4 AM–3 AM)',
                count: activeDayLog.strokes.length,
                icon: PenTool,
              },
              {
                id: 'custom' as const,
                label: 'Custom Log',
                count: ensuredCustomLogs.length,
                icon: Layers,
              },
              {
                id: 'date' as const,
                label: 'Date Log',
                count: ensuredDateRangeLogs.length,
                icon: Calendar,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all ${
                  active
                    ? 'bio-glow-chip'
                    : 'border-cyan-200/12 bg-slate-950/50 text-slate-300 hover:border-cyan-300/40 hover:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span className="font-mono-tabular rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-cyan-200">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <span className="px-2 text-[11px] text-slate-400">
          Mode:{' '}
          <strong className={tool === 'scroll' ? 'text-emerald-200' : 'text-cyan-200'}>
            {tool === 'scroll' ? 'Scroll' : tool === 'pen' ? 'Pen Writing' : 'Eraser'}
          </strong>
        </span>
      </section>

      {/* SUB-VIEW 1: 4:00 AM -> 3:00 AM LINED WRITING SHEET */}
      {subTab === 'daily' && (
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
                  className={`relative flex h-[64px] border-b border-cyan-200/15 ${
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
              onPointerDown={tool === 'scroll' ? undefined : handlePointerDown}
              onPointerMove={tool === 'scroll' ? undefined : handlePointerMove}
              onPointerUp={tool === 'scroll' ? undefined : finishStroke}
              onPointerCancel={tool === 'scroll' ? undefined : finishStroke}
              className={`absolute inset-0 z-10 h-full w-full ${
                tool === 'scroll' ? 'pointer-events-none' : 'touch-none'
              } ${
                tool === 'scroll'
                  ? 'cursor-default'
                  : tool === 'eraser'
                    ? 'cursor-cell'
                    : 'cursor-crosshair'
              }`}
            />

            {/* Interactive Gutter Tag Overlay (never steals strokes from main writing sheet) */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-[124px] flex-col sm:w-[148px]">
              {DAY_LOG_HOURS.map((slot) => (
                <div
                  key={`tag-${slot.hourKey}`}
                  className="flex h-[64px] flex-col justify-end px-2.5 pb-1.5"
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
      )}

      {/* SUB-VIEW 2: CUSTOM LOG (UNLIMITED NAMED CUSTOM DIVIDED SHEETS) */}
      {subTab === 'custom' && (
        <section className="space-y-4">
          <div className="glass-panel rounded-2xl border border-cyan-200/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Custom Log — Divided Writing Sheets
                </h2>
                <p className="text-xs text-slate-400">
                  Create as many named custom sheets as you need. Each starts with 3 divisions (add unlimited or remove down to 1).
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const created = createCustomDateLogSheet(
                    sheetDateKey,
                    `Custom Log ${ensuredCustomLogs.length + 1}`,
                    3
                  );
                  onUpdateCustomDateLogs((prev) => [created, ...prev]);
                  setSelectedCustomLogId(created.id);
                }}
                className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                New Custom Log
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ensuredCustomLogs.map((sheet) => {
                const selected = sheet.id === activeCustomDateLog.id;
                return (
                  <div
                    key={sheet.id}
                    className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs transition ${
                      selected
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/15 bg-slate-950/55 text-slate-300 hover:border-cyan-300/35'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCustomLogId(sheet.id)}
                      className="flex cursor-pointer items-center gap-2 text-left"
                    >
                      <span className="max-w-[180px] truncate font-semibold">
                        {sheet.title || 'Custom Log'}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        ({sheet.divisions.length})
                      </span>
                    </button>

                    {ensuredCustomLogs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = ensuredCustomLogs.filter(
                            (s) => s.id !== sheet.id
                          );
                          onUpdateCustomDateLogs(() => remaining);
                          if (selected && remaining[0]) {
                            setSelectedCustomLogId(remaining[0].id);
                          }
                        }}
                        aria-label={`Delete custom log ${sheet.title}`}
                        className="ml-1 cursor-pointer rounded p-0.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-200"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl border border-cyan-200/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-200/15 bg-[#04121f]/90 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  value={activeCustomDateLog.title}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    updateActiveCustomSheet((sheet) => ({
                      ...sheet,
                      title: nextTitle,
                    }));
                  }}
                  placeholder="Name this Custom Log..."
                  className="bio-input min-w-[200px] flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100"
                />

                <label className="flex items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300">
                  <Calendar className="h-3.5 w-3.5 text-cyan-300" />
                  <input
                    type="date"
                    value={activeCustomDateLog.dateKey}
                    onChange={(e) => {
                      const nextDate = e.target.value || todayIso;
                      updateActiveCustomSheet((sheet) => ({
                        ...sheet,
                        dateKey: nextDate,
                      }));
                    }}
                    className="bg-transparent text-xs text-slate-100 [color-scheme:dark] focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5 text-[11px]">
                  {[
                    { label: 'Compact', px: 112 },
                    { label: 'Standard', px: 136 },
                    { label: 'Tall', px: 180 },
                  ].map((opt) => (
                    <button
                      key={opt.px}
                      type="button"
                      onClick={() =>
                        updateActiveCustomSheet((sheet) => ({
                          ...sheet,
                          divisionHeight: opt.px,
                        }))
                      }
                      className={`cursor-pointer rounded-md px-2 py-1 font-medium transition ${
                        (activeCustomDateLog.divisionHeight ?? 136) === opt.px
                          ? 'bg-cyan-400/20 text-cyan-100'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {activeCustomDateLog.strokes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveCustomSheet((sheet) => ({
                        ...sheet,
                        strokes: [],
                      }));
                      setRedoStacks((prev) => ({
                        ...prev,
                        [`custom:${activeCustomDateLog.id}`]: [],
                      }));
                    }}
                    className="cursor-pointer rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
                  >
                    Clear Ink
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    updateActiveCustomSheet((sheet) => ({
                      ...sheet,
                      divisions: [
                        ...sheet.divisions,
                        {
                          id: makeDivisionId('cdiv'),
                          label: `Item ${sheet.divisions.length + 1}`,
                          note: '',
                        },
                      ],
                    }))
                  }
                  className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            <DividedStylusSheet
              divisions={activeCustomDateLog.divisions}
              strokes={activeCustomDateLog.strokes}
              divisionHeight={activeCustomDateLog.divisionHeight ?? 136}
              tool={tool}
              penColor={penColor}
              showCompletionCheck
              canDeleteDivision={activeCustomDateLog.divisions.length > 1}
              onCommitStroke={(stroke) => {
                setRedoStacks((prev) => ({
                  ...prev,
                  [`custom:${activeCustomDateLog.id}`]: [],
                }));
                updateActiveCustomSheet((sheet) => ({
                  ...sheet,
                  strokes: [...sheet.strokes, stroke],
                }));
              }}
              onUpdateDivision={(divisionId, patch) => {
                updateActiveCustomSheet((sheet) => ({
                  ...sheet,
                  divisions: sheet.divisions.map((d) =>
                    d.id === divisionId ? { ...d, ...patch } : d
                  ),
                }));
              }}
              onDeleteDivision={(divisionIndex) => {
                if (activeCustomDateLog.divisions.length <= 1) return;
                updateActiveCustomSheet((sheet) => {
                  if (sheet.divisions.length <= 1) return sheet;
                  return {
                    ...sheet,
                    divisions: sheet.divisions.filter((_, idx) => idx !== divisionIndex),
                    strokes: shiftStrokesOnDivisionDelete(sheet.strokes, divisionIndex),
                  };
                });
                setRedoStacks((prev) => ({
                  ...prev,
                  [`custom:${activeCustomDateLog.id}`]: [],
                }));
              }}
            />
          </div>
        </section>
      )}

      {/* SUB-VIEW 3: DATE LOG ("Custom Logs" — Select From Date -> To Date or Month) */}
      {subTab === 'date' && (
        <section className="space-y-4">
          <div className="glass-panel rounded-2xl border border-cyan-200/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Custom Logs — Date Logs
                </h2>
                <p className="text-xs text-slate-400">
                  Select any start date to end date (From → To) or choose a month. Every date gets a dedicated row to plan and write what you will do.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowNewDateLogForm((prev) => !prev);
                  if (!newDateLogTitle.trim()) {
                    setNewDateLogTitle(
                      ensuredDateRangeLogs.length === 0
                        ? 'Custom Logs'
                        : `Custom Logs ${ensuredDateRangeLogs.length + 1}`
                    );
                  }
                }}
                className="bio-btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                {showNewDateLogForm ? 'Close New Date Log' : 'New Date Log'}
              </button>
            </div>

            {showNewDateLogForm && (
              <div className="mt-3 rounded-xl border border-cyan-300/35 bg-slate-950/75 p-3.5">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cyan-100">
                    Create a New Date Log
                  </span>
                  <div className="flex rounded-lg border border-cyan-200/20 bg-slate-950/80 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setNewDateLogMode('range')}
                      className={`cursor-pointer rounded-md px-2.5 py-1 font-semibold transition ${
                        newDateLogMode === 'range'
                          ? 'bg-cyan-400/25 text-cyan-100'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      From Date → To Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewDateLogMode('month')}
                      className={`cursor-pointer rounded-md px-2.5 py-1 font-semibold transition ${
                        newDateLogMode === 'month'
                          ? 'bg-cyan-400/25 text-cyan-100'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Select Month
                    </button>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-1 text-[11px] text-slate-300">
                    <span className="font-medium text-slate-400">Name</span>
                    <input
                      type="text"
                      value={newDateLogTitle}
                      onChange={(e) => setNewDateLogTitle(e.target.value)}
                      placeholder="Custom Logs"
                      className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  </label>

                  {newDateLogMode === 'range' ? (
                    <>
                      <label className="flex flex-col gap-1 text-[11px] text-slate-300">
                        <span className="font-medium text-slate-400">From Date</span>
                        <input
                          type="date"
                          value={newDateLogStart}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            if (!nextStart) return;
                            setNewDateLogStart(nextStart);
                            if (newDateLogEnd < nextStart) {
                              setNewDateLogEnd(nextStart);
                            }
                          }}
                          className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100 [color-scheme:dark]"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] text-slate-300">
                        <span className="font-medium text-slate-400">To Date</span>
                        <input
                          type="date"
                          value={newDateLogEnd}
                          min={newDateLogStart}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            if (!nextEnd) return;
                            setNewDateLogEnd(nextEnd);
                          }}
                          className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100 [color-scheme:dark]"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex flex-col gap-1 text-[11px] text-slate-300 sm:col-span-2">
                      <span className="font-medium text-slate-400">Select Month</span>
                      <input
                        type="month"
                        value={newDateLogMonth}
                        onChange={(e) => {
                          if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                            setNewDateLogMonth(e.target.value);
                          }
                        }}
                        className="bio-input rounded-lg px-3 py-2 text-xs text-slate-100 [color-scheme:dark]"
                      />
                    </label>
                  )}

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        const created = createDateRangeLogSheet({
                          title:
                            newDateLogTitle.trim() ||
                            (ensuredDateRangeLogs.length === 0
                              ? 'Custom Logs'
                              : `Custom Logs ${ensuredDateRangeLogs.length + 1}`),
                          mode: newDateLogMode,
                          startDate: newDateLogStart,
                          endDate:
                            newDateLogEnd < newDateLogStart
                              ? newDateLogStart
                              : newDateLogEnd,
                          monthKey: newDateLogMonth,
                        });
                        onUpdateDateRangeLogs((prev) => [
                          created,
                          ...(prev.length > 0 ? prev : ensuredDateRangeLogs),
                        ]);
                        setSelectedDateLogId(created.id);
                        setShowNewDateLogForm(false);
                        setNewDateLogTitle('');
                      }}
                      className="bio-btn-primary w-full cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold"
                    >
                      Create Date Log
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {ensuredDateRangeLogs.map((sheet) => {
                const selected = sheet.id === activeDateRangeLog.id;
                return (
                  <div
                    key={sheet.id}
                    className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs transition ${
                      selected
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/15 bg-slate-950/55 text-slate-300 hover:border-cyan-300/35'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDateLogId(sheet.id)}
                      className="flex cursor-pointer items-center gap-2 text-left"
                    >
                      <span className="max-w-[160px] truncate font-semibold">
                        {sheet.title || 'Custom Logs'}
                      </span>
                      <span className="font-mono-tabular rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] text-cyan-200">
                        {sheet.mode === 'month'
                          ? sheet.monthKey
                          : `${sheet.startDate} → ${sheet.endDate}`}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        ({sheet.divisions.length}d)
                      </span>
                    </button>

                    {ensuredDateRangeLogs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = ensuredDateRangeLogs.filter(
                            (s) => s.id !== sheet.id
                          );
                          onUpdateDateRangeLogs(() => remaining);
                          if (selected && remaining[0]) {
                            setSelectedDateLogId(remaining[0].id);
                          }
                        }}
                        aria-label={`Delete date log ${sheet.title}`}
                        className="ml-1 cursor-pointer rounded p-0.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-200"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl border border-cyan-200/20">
            <div className="flex flex-col gap-3 border-b border-cyan-200/15 bg-[#04121f]/90 px-4 py-3.5">
              {/* Prominent Date Range / Month Selector Bar */}
              <div className="rounded-xl border border-cyan-300/25 bg-slate-950/75 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-cyan-100">
                      Choose Dates:
                    </span>
                    <div className="flex rounded-lg border border-cyan-200/20 bg-slate-950/90 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveDateRangeSheet((sheet) => {
                            if (sheet.mode === 'range') return sheet;
                            const nextDivs = buildDateDivisionsForRange(
                              sheet.startDate,
                              sheet.endDate,
                              sheet.divisions
                            );
                            return {
                              ...sheet,
                              mode: 'range',
                              divisions: nextDivs,
                              strokes: remapStrokesForDateDivisions(
                                sheet.strokes,
                                sheet.divisions,
                                nextDivs
                              ),
                            };
                          })
                        }
                        className={`cursor-pointer rounded-md px-3 py-1 font-semibold transition ${
                          activeDateRangeLog.mode === 'range'
                            ? 'bg-cyan-400/25 text-cyan-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        From Date → To Date
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveDateRangeSheet((sheet) => {
                            const bounds = buildMonthStartEnd(sheet.monthKey);
                            const nextDivs = buildDateDivisionsForRange(
                              bounds.startDate,
                              bounds.endDate,
                              sheet.divisions
                            );
                            return {
                              ...sheet,
                              mode: 'month',
                              startDate: bounds.startDate,
                              endDate: bounds.endDate,
                              divisions: nextDivs,
                              strokes: remapStrokesForDateDivisions(
                                sheet.strokes,
                                sheet.divisions,
                                nextDivs
                              ),
                            };
                          })
                        }
                        className={`cursor-pointer rounded-md px-3 py-1 font-semibold transition ${
                          activeDateRangeLog.mode === 'month'
                            ? 'bg-cyan-400/25 text-cyan-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Select Month
                      </button>
                    </div>
                  </div>

                  <span className="font-mono-tabular text-[11px] text-cyan-200">
                    {activeDateRangeLog.divisions.length} date row
                    {activeDateRangeLog.divisions.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-end gap-3">
                  {activeDateRangeLog.mode === 'range' ? (
                    <>
                      <label className="flex min-w-[165px] flex-1 flex-col gap-1 sm:flex-initial">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                          From Date
                        </span>
                        <input
                          type="date"
                          value={activeDateRangeLog.startDate}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            if (!nextStart) return;
                            updateActiveDateRangeSheet((sheet) => {
                              const nextEnd =
                                sheet.endDate < nextStart ? nextStart : sheet.endDate;
                              const nextDivs = buildDateDivisionsForRange(
                                nextStart,
                                nextEnd,
                                sheet.divisions
                              );
                              return {
                                ...sheet,
                                startDate: nextStart,
                                endDate: nextEnd,
                                divisions: nextDivs,
                                strokes: remapStrokesForDateDivisions(
                                  sheet.strokes,
                                  sheet.divisions,
                                  nextDivs
                                ),
                              };
                            });
                          }}
                          className="bio-input rounded-lg px-3 py-2 text-xs font-medium text-slate-100 [color-scheme:dark]"
                        />
                      </label>

                      <span className="pb-2 text-sm font-bold text-cyan-300">→</span>

                      <label className="flex min-w-[165px] flex-1 flex-col gap-1 sm:flex-initial">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                          To Date
                        </span>
                        <input
                          type="date"
                          value={activeDateRangeLog.endDate}
                          min={activeDateRangeLog.startDate}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            if (!nextEnd) return;
                            updateActiveDateRangeSheet((sheet) => {
                              const nextStart =
                                nextEnd < sheet.startDate ? nextEnd : sheet.startDate;
                              const nextDivs = buildDateDivisionsForRange(
                                nextStart,
                                nextEnd,
                                sheet.divisions
                              );
                              return {
                                ...sheet,
                                startDate: nextStart,
                                endDate: nextEnd,
                                divisions: nextDivs,
                                strokes: remapStrokesForDateDivisions(
                                  sheet.strokes,
                                  sheet.divisions,
                                  nextDivs
                                ),
                              };
                            });
                          }}
                          className="bio-input rounded-lg px-3 py-2 text-xs font-medium text-slate-100 [color-scheme:dark]"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex min-w-[200px] flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                        Select Month
                      </span>
                      <input
                        type="month"
                        value={activeDateRangeLog.monthKey}
                        onChange={(e) => {
                          const nextMonth = e.target.value;
                          if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
                          updateActiveDateRangeSheet((sheet) => {
                            const bounds = buildMonthStartEnd(nextMonth);
                            const nextDivs = buildDateDivisionsForRange(
                              bounds.startDate,
                              bounds.endDate,
                              sheet.divisions
                            );
                            return {
                              ...sheet,
                              mode: 'month',
                              monthKey: nextMonth,
                              startDate: bounds.startDate,
                              endDate: bounds.endDate,
                              divisions: nextDivs,
                              strokes: remapStrokesForDateDivisions(
                                sheet.strokes,
                                sheet.divisions,
                                nextDivs
                              ),
                            };
                          });
                        }}
                        className="bio-input rounded-lg px-3 py-2 text-xs font-medium text-slate-100 [color-scheme:dark]"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <input
                  type="text"
                  value={activeDateRangeLog.title}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    updateActiveDateRangeSheet((sheet) => ({
                      ...sheet,
                      title: nextTitle,
                    }));
                  }}
                  placeholder="Custom Logs"
                  className="bio-input min-w-[200px] flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/60 p-0.5 text-[11px]">
                    {[
                      { label: 'Compact', px: 112 },
                      { label: 'Standard', px: 136 },
                      { label: 'Tall', px: 180 },
                    ].map((opt) => (
                      <button
                        key={opt.px}
                        type="button"
                        onClick={() =>
                          updateActiveDateRangeSheet((sheet) => ({
                            ...sheet,
                            divisionHeight: opt.px,
                          }))
                        }
                        className={`cursor-pointer rounded-md px-2 py-1 font-medium transition ${
                          (activeDateRangeLog.divisionHeight ?? 136) === opt.px
                            ? 'bg-cyan-400/20 text-cyan-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {activeDateRangeLog.strokes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveDateRangeSheet((sheet) => ({
                          ...sheet,
                          strokes: [],
                        }));
                        setRedoStacks((prev) => ({
                          ...prev,
                          [`date:${activeDateRangeLog.id}`]: [],
                        }));
                      }}
                      className="cursor-pointer rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
                    >
                      Clear Ink
                    </button>
                  )}
                </div>
              </div>
            </div>

            <DividedStylusSheet
              divisions={activeDateRangeLog.divisions}
              strokes={activeDateRangeLog.strokes}
              divisionHeight={activeDateRangeLog.divisionHeight ?? 136}
              tool={tool}
              penColor={penColor}
              showCompletionCheck
              isDateLocked
              todayIso={todayIso}
              notePlaceholder="What I'm going to do..."
              canDeleteDivision={activeDateRangeLog.divisions.length > 1}
              onCommitStroke={(stroke) => {
                setRedoStacks((prev) => ({
                  ...prev,
                  [`date:${activeDateRangeLog.id}`]: [],
                }));
                updateActiveDateRangeSheet((sheet) => ({
                  ...sheet,
                  strokes: [...sheet.strokes, stroke],
                }));
              }}
              onUpdateDivision={(divisionId, patch) => {
                updateActiveDateRangeSheet((sheet) => ({
                  ...sheet,
                  divisions: sheet.divisions.map((d) =>
                    d.id === divisionId ? { ...d, ...patch } : d
                  ),
                }));
              }}
              onDeleteDivision={(divisionIndex) => {
                if (activeDateRangeLog.divisions.length <= 1) return;
                updateActiveDateRangeSheet((sheet) => {
                  if (sheet.divisions.length <= 1) return sheet;
                  return {
                    ...sheet,
                    divisions: sheet.divisions.filter((_, idx) => idx !== divisionIndex),
                    strokes: shiftStrokesOnDivisionDelete(sheet.strokes, divisionIndex),
                  };
                });
                setRedoStacks((prev) => ({
                  ...prev,
                  [`date:${activeDateRangeLog.id}`]: [],
                }));
              }}
            />
          </div>
        </section>
      )}

      {/* Collapsible Floating Toolbar Widget (Minimize to a small corner button so 3 AM hours are never blocked!) */}
      {!isToolbarOpen ? (
        <button
          type="button"
          onClick={() => setIsToolbarOpen(true)}
          title="Open Writing Tools"
          className="fixed bottom-6 right-6 z-50 flex h-13 w-13 cursor-pointer items-center justify-center rounded-full border border-cyan-300/60 bg-slate-950/95 text-cyan-200 shadow-2xl backdrop-blur-xl hover:scale-110 hover:border-cyan-300"
        >
          <PenTool className="h-5 w-5" />
        </button>
      ) : (
        <section className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 rounded-2xl border border-cyan-300/40 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-xl max-w-[92vw] sm:max-w-[480px]">
          <div className="flex items-center justify-between border-b border-cyan-200/15 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200">
              <PenTool className="h-3.5 w-3.5" />
              Writing Tools &amp; Palette
            </div>
            <button
              type="button"
              onClick={() => setIsToolbarOpen(false)}
              title="Minimize to small corner button"
              className="cursor-pointer rounded-lg border border-cyan-200/25 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
            >
              Minimize ✕
            </button>
          </div>

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

            <button
              type="button"
              onClick={() => setTool('scroll')}
              title="Scroll mode: scroll up and down freely"
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                tool === 'scroll'
                  ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100'
                  : 'border-cyan-200/15 bg-slate-950/55 text-slate-300'
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Scroll
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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

            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {activeTargetStrokes.length} strokes
              </span>

              <button
                type="button"
                onClick={handleUndo}
                disabled={activeTargetStrokes.length === 0}
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={activeRedoStack.length === 0}
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
              >
                <Redo2 className="h-3.5 w-3.5" />
                Redo
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                title="Download PNG"
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-200/15 bg-slate-950/55 px-2 py-1 text-xs text-cyan-200"
              >
                <Download className="h-3.5 w-3.5" />
                PNG
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
