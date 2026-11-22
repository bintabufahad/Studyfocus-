import { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Grid3X3,
  Layers,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ChecklistCadence,
  ChecklistColumn,
  ChecklistRow,
  ChecklistTableRecord,
  StudySessionCard,
} from '../types';
import { toLocalDateKey } from '../utils/profileStorage';

interface ChecklistTableSectionProps {
  tables: ChecklistTableRecord[];
  onUpdateTables: (updater: (prev: ChecklistTableRecord[]) => ChecklistTableRecord[]) => void;
  onCellTickedReward: () => void;
}

const ACCENT_OPTIONS: Array<{
  key: StudySessionCard['accent'];
  swatch: string;
  dot: string;
  label: string;
}> = [
  {
    key: 'sky',
    swatch: 'bg-cyan-200/95 shadow-[0_0_8px_rgba(165,243,252,0.7)]',
    dot: 'bg-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.85)]',
    label: 'Cyan',
  },
  {
    key: 'emerald',
    swatch: 'bg-emerald-100/90 shadow-[0_0_8px_rgba(167,243,208,0.65)]',
    dot: 'bg-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.85)]',
    label: 'Seafoam',
  },
  {
    key: 'amber',
    swatch: 'bg-amber-200/95 shadow-[0_0_8px_rgba(253,230,138,0.65)]',
    dot: 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.85)]',
    label: 'Gold',
  },
  {
    key: 'rose',
    swatch: 'bg-slate-300/85 shadow-[0_0_8px_rgba(226,232,240,0.55)]',
    dot: 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.85)]',
    label: 'Starlight',
  },
];

const CADENCE_LABELS: Record<ChecklistCadence, string> = {
  checklist: 'Simple Checklist',
  quick: 'Flexible Table',
  week: 'Week Challenge',
  month: 'Month Challenge',
  custom: 'Custom Dates',
};

interface ChecklistTemplateDef {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  cadence: ChecklistCadence;
  accent: StudySessionCard['accent'];
  columnLabels?: string[];
  rows: string[];
}

const CHECKLIST_TEMPLATES: ChecklistTemplateDef[] = [
  {
    id: 'blank',
    name: 'Blank / Custom Checklist',
    description: 'Start fresh with 3 editable starter items',
    defaultTitle: '',
    cadence: 'checklist',
    accent: 'sky',
    rows: ['Item 1', 'Item 2', 'Item 3'],
  },
  {
    id: 'weekly-routine',
    name: 'Weekly Routine',
    description: 'Mon–Sun columns for daily rhythms & anchors',
    defaultTitle: 'Weekly Routine',
    cadence: 'week',
    accent: 'sky',
    columnLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    rows: [
      'Morning Hydration & Stretch',
      'Deep Focus Block',
      '20m Walk / Movement',
      'Evening Review & Reset',
    ],
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Stage columns from Plan to Final',
    defaultTitle: 'Project Tracker',
    cadence: 'quick',
    accent: 'amber',
    columnLabels: ['Plan', 'Draft', 'Review', 'Final'],
    rows: [
      'Research & Outline',
      'Core Implementation',
      'Testing & Polish',
      'Final Delivery',
    ],
  },
  {
    id: 'medicine-care',
    name: 'Daily Care & Medicine',
    description: '7-day tracker for doses, water & health',
    defaultTitle: 'Daily Care & Medicine',
    cadence: 'week',
    accent: 'emerald',
    columnLabels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
    rows: [
      'Morning Medicine',
      'Vitamins / Afternoon Dose',
      '2L Water Intake',
      'Walking / Gentle Movement',
    ],
  },
  {
    id: 'study-exam',
    name: 'Study & Exam Prep',
    description: 'Track Lecture, Notes, Practice & Recall per topic',
    defaultTitle: 'Study & Exam Prep',
    cadence: 'quick',
    accent: 'rose',
    columnLabels: ['Lecture', 'Notes', 'Practice', 'Recall'],
    rows: [
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Past Paper Practice',
    ],
  },
  {
    id: 'monthly-habits',
    name: 'Monthly Habit Grid',
    description: 'Full calendar month days for core daily habits',
    defaultTitle: 'Monthly Habit Grid',
    cadence: 'month',
    accent: 'emerald',
    rows: [
      'Read 20 Pages',
      'Exercise / Movement',
      '1h Distraction-Free Work',
      'Sleep Before 11 PM',
    ],
  },
  {
    id: 'trip-packing',
    name: 'Packing & Prep Checklist',
    description: 'Single-column checklist you can expand anytime',
    defaultTitle: 'Trip Packing Checklist',
    cadence: 'checklist',
    accent: 'sky',
    columnLabels: ['Packed'],
    rows: [
      'ID / Passport & Wallet',
      'Phone & Laptop Chargers',
      'Medications & Toiletries',
      'Outfits & Weather Gear',
    ],
  },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateKey(dt.getTime());
}

function formatShortColDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildMonthColumns(startMonth: string, endMonth: string): ChecklistColumn[] {
  const safeEnd = endMonth < startMonth ? startMonth : endMonth;
  const [sy, sm] = startMonth.split('-').map((n) => Number.parseInt(n, 10));
  const [ey, em] = safeEnd.split('-').map((n) => Number.parseInt(n, 10));
  if (!sy || !sm || !ey || !em) {
    return Array.from({ length: 30 }, (_, i) => ({
      id: makeId('col'),
      label: `${i + 1}`,
    }));
  }

  const cols: ChecklistColumn[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  const multiMonth = sy !== ey || sm !== em;

  while ((y < ey || (y === ey && m <= em)) && guard < 12) {
    guard += 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthShort = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(m).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      cols.push({
        id: makeId('col'),
        label: multiMonth ? `${monthShort} ${day}` : `${day}`,
        dateKey: `${y}-${mm}-${dd}`,
      });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return cols;
}

function buildDateRangeColumns(startIso: string, endIso: string): ChecklistColumn[] {
  const [sy, sm, sd] = startIso.split('-').map((n) => Number.parseInt(n, 10));
  const [ey, em, ed] = endIso.split('-').map((n) => Number.parseInt(n, 10));
  if (!sy || !sm || !sd || !ey || !em || !ed) {
    return Array.from({ length: 7 }, (_, i) => ({
      id: makeId('col'),
      label: `Day ${i + 1}`,
    }));
  }
  const sDate = new Date(sy, sm - 1, sd);
  const eDate = new Date(ey, em - 1, ed);
  const diffDays = Math.max(
    1,
    Math.min(120, Math.round((eDate.getTime() - sDate.getTime()) / 86_400_000) + 1)
  );
  return Array.from({ length: diffDays }, (_, i) => {
    const dk = addDaysIso(startIso, i);
    return {
      id: makeId('col'),
      label: formatShortColDate(dk),
      dateKey: dk,
    };
  });
}

function makeStarterRows(): ChecklistRow[] {
  return [
    { id: makeId('row'), label: 'Item 1' },
    { id: makeId('row'), label: 'Item 2' },
    { id: makeId('row'), label: 'Item 3' },
  ];
}

export function cellCheckKey(rowId: string, colId: string): string {
  return `${rowId}::${colId}`;
}

export function isCellChecked(
  checks: Record<string, boolean>,
  rowId: string,
  colId: string
): boolean {
  return Boolean(checks[`${rowId}::${colId}`] ?? checks[`${rowId}:${colId}`]);
}

export function ChecklistTableSection({
  tables,
  onUpdateTables,
  onCellTickedReward,
}: ChecklistTableSectionProps) {
  const todayIso = toLocalDateKey(Date.now());
  const currentMonthKey = todayIso.slice(0, 7);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => tables[0]?.id ?? null
  );
  const [showCreator, setShowCreator] = useState<boolean>(() => tables.length === 0);

  // Builder state (NO pre-asking how many rows/cols — user decides names & additions right on the sheet!)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [newTitle, setNewTitle] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [builderCadence, setBuilderCadence] = useState<ChecklistCadence>('checklist');
  const [accent, setAccent] = useState<StudySessionCard['accent']>('sky');
  const [weekCountInput, setWeekCountInput] = useState('1');
  const [monthStart, setMonthStart] = useState(currentMonthKey);
  const [monthEnd, setMonthEnd] = useState(currentMonthKey);
  const [customStart, setCustomStart] = useState(todayIso);
  const [customEnd, setCustomEnd] = useState(() => addDaysIso(todayIso, 6));

  const selectedTemplate = useMemo(
    () => CHECKLIST_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? CHECKLIST_TEMPLATES[0],
    [selectedTemplateId]
  );

  const handleSelectTemplate = (templateId: string) => {
    const nextTpl =
      CHECKLIST_TEMPLATES.find((t) => t.id === templateId) ?? CHECKLIST_TEMPLATES[0];
    const prevTpl = selectedTemplate;

    setSelectedTemplateId(nextTpl.id);
    setBuilderCadence(nextTpl.cadence);
    setAccent(nextTpl.accent);

    const trimmedCurrent = newTitle.trim();
    const wasAutoTitle =
      trimmedCurrent.length === 0 ||
      (prevTpl.defaultTitle && trimmedCurrent === prevTpl.defaultTitle);
    if (wasAutoTitle) {
      setNewTitle(nextTpl.defaultTitle);
      setTitleError(false);
    }
  };

  // Filter tabs inside active Week / Month checklist
  const [selectedWeekTab, setSelectedWeekTab] = useState<'all' | number>('all');
  const [selectedMonthTab, setSelectedMonthTab] = useState<string>('all');

  // Effortless inline editing & fast row/column addition
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRowText, setEditingRowText] = useState('');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColText, setEditingColText] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState('');
  const [inlineNewRowText, setInlineNewRowText] = useState('');
  const newRowInputRef = useRef<HTMLInputElement | null>(null);

  // Bright toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  const activeTable = useMemo(() => {
    if (tables.length === 0) return null;
    return tables.find((t) => t.id === selectedTableId) ?? tables[0];
  }, [selectedTableId, tables]);

  const parsedWeeks = useMemo(() => {
    const n = Number.parseInt(weekCountInput, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(24, n));
  }, [weekCountInput]);

  const handleCreateChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    setTitleError(false);

    let columns: ChecklistColumn[] = [];
    let startDate: string | undefined;
    let endDate: string | undefined;

    const templateCols =
      selectedTemplate.id !== 'blank' &&
      selectedTemplate.columnLabels &&
      selectedTemplate.cadence === builderCadence
        ? selectedTemplate.columnLabels
        : null;

    if (builderCadence === 'checklist') {
      columns = (templateCols ?? ['Done']).map((label) => ({
        id: makeId('col'),
        label,
      }));
    } else if (builderCadence === 'quick') {
      const labels = templateCols ?? ['1', '2', '3', '4', '5'];
      columns = labels.map((label) => ({
        id: makeId('col'),
        label,
      }));
    } else if (builderCadence === 'week') {
      const totalDays = parsedWeeks * 7;
      columns = Array.from({ length: totalDays }, (_, i) => {
        const dk = addDaysIso(todayIso, i);
        let label = `Day ${i + 1}`;
        if (templateCols && templateCols.length === 7) {
          const dayName = templateCols[i % 7];
          const wkNum = Math.floor(i / 7) + 1;
          label = parsedWeeks > 1 ? `W${wkNum} ${dayName}` : dayName;
        }
        return {
          id: makeId('col'),
          label,
          dateKey: dk,
        };
      });
      startDate = todayIso;
      endDate = addDaysIso(todayIso, totalDays - 1);
    } else if (builderCadence === 'month') {
      columns = buildMonthColumns(monthStart, monthEnd);
      startDate = columns[0]?.dateKey;
      endDate = columns[columns.length - 1]?.dateKey;
    } else {
      columns = buildDateRangeColumns(customStart, customEnd);
      startDate = columns[0]?.dateKey;
      endDate = columns[columns.length - 1]?.dateKey;
    }

    const rows: ChecklistRow[] =
      selectedTemplate.id !== 'blank' && selectedTemplate.rows.length > 0
        ? selectedTemplate.rows.map((label) => ({ id: makeId('row'), label }))
        : makeStarterRows();

    const now = Date.now();
    const record: ChecklistTableRecord = {
      id: makeId('tbl'),
      title: trimmed,
      cadence: builderCadence,
      accent,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      columns,
      rows,
      checks: {},
      checkTimestamps: {},
      createdAt: now,
      updatedAt: now,
    };

    onUpdateTables((prev) => [record, ...prev]);
    setSelectedTableId(record.id);
    setSelectedWeekTab('all');
    setSelectedMonthTab('all');
    setShowCreator(false);
    setNewTitle('');
    setSelectedTemplateId('blank');
    showNotice(`Created "${record.title}" — click any item or column name to rename it!`);
  };

  const updateActiveTable = (updater: (t: ChecklistTableRecord) => ChecklistTableRecord) => {
    if (!activeTable) return;
    onUpdateTables((prev) =>
      prev.map((t) =>
        t.id === activeTable.id ? { ...updater(t), updatedAt: Date.now() } : t
      )
    );
  };

  const handleToggleCell = (rowId: string, colId: string) => {
    if (!activeTable) return;
    const key = cellCheckKey(rowId, colId);
    const legacyKey = `${rowId}:${colId}`;
    const wasChecked = isCellChecked(activeTable.checks, rowId, colId);

    updateActiveTable((t) => {
      const nextChecks = { ...t.checks };
      const nextTimestamps = { ...(t.checkTimestamps ?? {}) };
      if (wasChecked) {
        delete nextChecks[key];
        delete nextChecks[legacyKey];
        delete nextTimestamps[key];
        delete nextTimestamps[legacyKey];
      } else {
        nextChecks[key] = true;
        nextTimestamps[key] = Date.now();
      }
      return {
        ...t,
        checks: nextChecks,
        checkTimestamps: nextTimestamps,
      };
    });

    if (!wasChecked) {
      onCellTickedReward();
    }
  };

  const handleQuickAddColumn = () => {
    if (!activeTable) return;
    const nextNum = activeTable.columns.length + 1;
    const firstLabel = activeTable.columns[0]?.label ?? '';
    const nextLabel =
      firstLabel === 'Done' && activeTable.columns.length === 1
        ? 'Col 2'
        : firstLabel.startsWith('Day ')
          ? `Day ${nextNum}`
          : `${nextNum}`;
    const newCol: ChecklistColumn = { id: makeId('col'), label: nextLabel };

    updateActiveTable((t) => ({
      ...t,
      columns: [...t.columns, newCol],
    }));
    setSelectedWeekTab('all');
    setSelectedMonthTab('all');
    setEditingColId(newCol.id);
    setEditingColText(newCol.label);
  };

  const handleQuickAddRow = (customLabel?: string) => {
    if (!activeTable) return;
    const trimmed = (customLabel ?? '').trim();
    const newRow: ChecklistRow = {
      id: makeId('row'),
      label: trimmed || `Item ${activeTable.rows.length + 1}`,
    };
    updateActiveTable((t) => ({
      ...t,
      rows: [...t.rows, newRow],
    }));
    if (trimmed) {
      setInlineNewRowText('');
      window.setTimeout(() => newRowInputRef.current?.focus(), 20);
    } else {
      setEditingRowId(newRow.id);
      setEditingRowText(newRow.label);
    }
  };

  const handleCommitRowRename = (rowId: string) => {
    const next = editingRowText.trim();
    if (next) {
      updateActiveTable((t) => ({
        ...t,
        rows: t.rows.map((r) => (r.id === rowId ? { ...r, label: next } : r)),
      }));
    }
    setEditingRowId(null);
  };

  const handleCommitColRename = (colId: string) => {
    const next = editingColText.trim();
    if (next) {
      updateActiveTable((t) => ({
        ...t,
        columns: t.columns.map((c) => (c.id === colId ? { ...c, label: next } : c)),
      }));
    }
    setEditingColId(null);
  };

  const handleDeleteRow = (rowId: string) => {
    updateActiveTable((t) => {
      const nextChecks = { ...t.checks };
      const nextTimestamps = { ...(t.checkTimestamps ?? {}) };
      for (const k of Object.keys(nextChecks)) {
        if (k.startsWith(`${rowId}::`) || k.startsWith(`${rowId}:`)) {
          delete nextChecks[k];
          delete nextTimestamps[k];
        }
      }
      return {
        ...t,
        rows: t.rows.filter((r) => r.id !== rowId),
        checks: nextChecks,
        checkTimestamps: nextTimestamps,
      };
    });
  };

  const handleDeleteColumn = (colId: string) => {
    updateActiveTable((t) => {
      if (t.columns.length <= 1) return t;
      const nextChecks = { ...t.checks };
      const nextTimestamps = { ...(t.checkTimestamps ?? {}) };
      for (const k of Object.keys(nextChecks)) {
        if (k.endsWith(`::${colId}`) || k.endsWith(`:${colId}`)) {
          delete nextChecks[k];
          delete nextTimestamps[k];
        }
      }
      return {
        ...t,
        columns: t.columns.filter((c) => c.id !== colId),
        checks: nextChecks,
        checkTimestamps: nextTimestamps,
      };
    });
  };

  // Week / Month tabs for active checklist
  const weekTabsForTable = useMemo(() => {
    if (!activeTable || activeTable.cadence !== 'week') return [];
    const totalWeeks = Math.ceil(activeTable.columns.length / 7);
    if (totalWeeks <= 1) return [];
    return Array.from({ length: totalWeeks }, (_, idx) => {
      const weekNum = idx + 1;
      const start = idx * 7 + 1;
      const end = Math.min(activeTable.columns.length, weekNum * 7);
      return { weekNum, start, end };
    });
  }, [activeTable]);

  const monthTabsForTable = useMemo(() => {
    if (!activeTable) return [];
    const map = new Map<string, number>();
    for (const c of activeTable.columns) {
      if (c.dateKey) {
        const mk = c.dateKey.slice(0, 7);
        map.set(mk, (map.get(mk) ?? 0) + 1);
      }
    }
    if (map.size <= 1) return [];
    return Array.from(map.entries()).map(([monthKey, count]) => {
      const [y, m] = monthKey.split('-').map((n) => Number.parseInt(n, 10));
      const label =
        y && m
          ? new Date(y, m - 1, 1).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })
          : monthKey;
      return { monthKey, label, count };
    });
  }, [activeTable]);

  const displayedColumns = useMemo(() => {
    if (!activeTable) return [];
    let cols = activeTable.columns;
    if (weekTabsForTable.length > 0 && selectedWeekTab !== 'all') {
      const startIdx = (selectedWeekTab - 1) * 7;
      cols = cols.slice(startIdx, startIdx + 7);
    }
    if (monthTabsForTable.length > 1 && selectedMonthTab !== 'all') {
      cols = cols.filter((c) => c.dateKey?.startsWith(selectedMonthTab));
    }
    return cols;
  }, [activeTable, monthTabsForTable.length, selectedMonthTab, selectedWeekTab, weekTabsForTable.length]);

  const activeStats = useMemo(() => {
    if (!activeTable) return { totalCells: 0, checkedCells: 0, pct: 0 };
    const totalCells = activeTable.rows.length * activeTable.columns.length;
    let checkedCells = 0;
    for (const r of activeTable.rows) {
      for (const c of activeTable.columns) {
        if (isCellChecked(activeTable.checks, r.id, c.id)) {
          checkedCells += 1;
        }
      }
    }
    const pct = totalCells > 0 ? Math.round((checkedCells / totalCells) * 100) : 0;
    return { totalCells, checkedCells, pct };
  }, [activeTable]);

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[1220px] flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 quiet-scroll">
      {toastMsg && (
        <div className="glass-panel flex items-center justify-between gap-3 rounded-xl border border-cyan-300/40 bg-cyan-400/12 px-4 py-2.5 text-xs text-cyan-50 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            {toastMsg}
          </span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="cursor-pointer text-slate-300 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 1. Checklists Shelf (Just like Goals) */}
      <section className="glass-panel rounded-2xl border border-cyan-300/25 p-5 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-200">
              <CheckSquare className="h-4 w-4 text-cyan-300" />
              <span>Checklists &amp; Interactive Tables</span>
            </div>
            <h1 className="font-display mt-0.5 text-xl font-semibold text-white sm:text-2xl">
              Your Checklists
            </h1>
            <p className="mt-0.5 text-xs text-slate-300/85">
              Start with a simple checklist or a Week / Month table — rename rows, add columns, and switch freely anytime.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreator((v) => !v)}
            className="bio-btn-primary flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold shadow-[0_0_16px_rgba(56,189,248,0.3)]"
          >
            {showCreator ? (
              <>
                <X className="h-4 w-4" />
                Close Builder
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                New Checklist
              </>
            )}
          </button>
        </div>

        {/* Checklist Shelf Cards */}
        {tables.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => {
              const total = t.rows.length * t.columns.length;
              let checked = 0;
              for (const r of t.rows) {
                for (const c of t.columns) {
                  if (isCellChecked(t.checks, r.id, c.id)) checked += 1;
                }
              }
              const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
              const isSelected = activeTable?.id === t.id && !showCreator;
              const dotClass =
                ACCENT_OPTIONS.find((a) => a.key === t.accent)?.dot ?? ACCENT_OPTIONS[0].dot;

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setSelectedWeekTab('all');
                    setSelectedMonthTab('all');
                    setShowCreator(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTableId(t.id);
                      setShowCreator(false);
                    }
                  }}
                  className={`group flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'bio-glow-chip shadow-[0_0_22px_rgba(56,189,248,0.2)]'
                      : 'border-cyan-200/20 bg-[#061829]/80 hover:border-cyan-300/50 hover:bg-[#082035]/85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                      <span className="truncate text-sm font-semibold text-white">
                        {t.title}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTables((prev) => prev.filter((item) => item.id !== t.id));
                        showNotice(`Deleted "${t.title}".`);
                      }}
                      aria-label={`Delete ${t.title}`}
                      className="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-300">
                    <span>
                      {CADENCE_LABELS[t.cadence ?? 'quick']} · {t.rows.length}×{t.columns.length}
                    </span>
                    <span className="font-mono-tabular font-semibold text-cyan-200">
                      {checked}/{total} ({pct}%)
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-950/80">
                    <div
                      className="bio-progress h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. New Checklist / Challenge Builder (No upfront row/col counts!) */}
      {showCreator && (
        <section className="glass-panel rounded-2xl border border-cyan-300/30 bg-[#061a2c]/85 p-5 sm:p-7 shadow-[0_0_32px_rgba(56,189,248,0.12)]">
          <form onSubmit={handleCreateChecklist} className="space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Create a Checklist or Table
              </h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Pick a common template from the menu or start blank — you can rename items &amp; add rows or columns right inside the live table anytime.
              </p>
            </div>

            {/* Common Checklist Templates Menu */}
            <div className="space-y-3 rounded-xl border border-cyan-300/25 bg-[#041322]/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label
                    htmlFor="checklist-template-menu"
                    className="flex items-center gap-1.5 text-xs font-semibold text-cyan-100"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    Checklist Template Menu
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Choose a starter template (e.g. Weekly Routine, Project Tracker) or start blank.
                  </p>
                </div>

                <div className="relative min-w-[230px] sm:w-72">
                  <select
                    id="checklist-template-menu"
                    value={selectedTemplateId}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    className="bio-input w-full cursor-pointer appearance-none rounded-xl px-3.5 py-2 pr-9 text-xs font-medium text-white"
                  >
                    {CHECKLIST_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id} className="bg-[#061829] text-white">
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200" />
                </div>
              </div>

              {/* Quick Template Pills */}
              <div className="flex flex-wrap gap-1.5">
                {CHECKLIST_TEMPLATES.map((tpl) => {
                  const isPicked = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl.id)}
                      className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isPicked
                          ? 'bio-glow-chip'
                          : 'border-cyan-200/15 bg-slate-950/55 text-slate-300 hover:border-cyan-300/40 hover:text-white'
                      }`}
                    >
                      {tpl.name}
                    </button>
                  );
                })}
              </div>

              {/* Live Template Preview */}
              {selectedTemplate.id !== 'blank' && (
                <div className="rounded-lg border border-cyan-200/15 bg-slate-950/60 px-3 py-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-cyan-100">
                    <span className="font-medium">{selectedTemplate.description}</span>
                    <button
                      type="button"
                      onClick={() => handleSelectTemplate('blank')}
                      className="cursor-pointer text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                    >
                      Reset to blank
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-slate-300">
                    <span className="text-slate-400">Columns:</span>
                    {(selectedTemplate.columnLabels ?? ['1..Month Days']).map((col) => (
                      <span
                        key={col}
                        className="rounded border border-cyan-200/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-100"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-slate-300">
                    <span className="text-slate-400">Starter rows:</span>
                    {selectedTemplate.rows.map((row) => (
                      <span
                        key={row}
                        className="rounded border border-amber-200/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-100"
                      >
                        {row}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-8">
                <label className="mb-1.5 block text-xs font-semibold text-cyan-100">
                  Checklist Name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    if (titleError) setTitleError(false);
                  }}
                  placeholder="e.g. Daily Medicine & Walk, 3-Week Workout, Packing List..."
                  className={`bio-input w-full rounded-xl px-4 py-2.5 text-sm text-white ${
                    titleError ? 'border-rose-400/80 ring-1 ring-rose-400/50' : ''
                  }`}
                />
                {titleError && (
                  <p className="mt-1 text-xs text-rose-300">Please enter a checklist name.</p>
                )}
              </div>

              <div className="md:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-cyan-100">
                  Accent Glow
                </span>
                <div className="flex h-[42px] items-center gap-3 rounded-xl border border-cyan-200/20 bg-slate-950/60 px-3.5">
                  {ACCENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAccent(opt.key)}
                      title={opt.label}
                      className={`h-6 w-6 cursor-pointer rounded-full transition-transform ${
                        opt.swatch
                      } ${accent === opt.key ? 'scale-115 ring-2 ring-white' : 'opacity-65 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Starting Layout Options (Just like Goals) */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-cyan-100">
                Choose Starting Style
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                {(
                  [
                    {
                      id: 'checklist',
                      title: 'Simple Checklist',
                      desc: '1 clean list (expand into table anytime)',
                      icon: ListChecks,
                    },
                    {
                      id: 'week',
                      title: 'Week Checklist',
                      desc: '7-day blocks with Week tabs',
                      icon: Calendar,
                    },
                    {
                      id: 'month',
                      title: 'Month Checklist',
                      desc: 'Full calendar month days',
                      icon: Calendar,
                    },
                    {
                      id: 'custom',
                      title: 'Custom Dates',
                      desc: 'Pick start & end dates',
                      icon: Layers,
                    },
                    {
                      id: 'quick',
                      title: 'Blank Table Grid',
                      desc: 'Ready 5-col grid — rename anytime',
                      icon: Grid3X3,
                    },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = builderCadence === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBuilderCadence(opt.id)}
                      className={`flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'bio-glow-chip shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                          : 'border-cyan-200/18 bg-[#041220]/75 text-slate-200 hover:border-cyan-300/45'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Icon className="h-3.5 w-3.5 text-cyan-300" />
                        {opt.title}
                      </div>
                      <span className="text-[11px] text-slate-300/80">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {builderCadence === 'week' && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-cyan-200/20 bg-slate-950/55 p-3.5 text-xs">
                <span className="font-medium text-cyan-100">How many weeks?</span>
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeekCountInput(String(w))}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 font-mono-tabular font-medium ${
                      parsedWeeks === w
                        ? 'bio-glow-chip'
                        : 'border-cyan-200/20 bg-slate-900/60 text-slate-200 hover:border-cyan-300/45'
                    }`}
                  >
                    {w} {w === 1 ? 'Week' : 'Weeks'}
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="numeric"
                  value={weekCountInput}
                  onChange={(e) => setWeekCountInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setWeekCountInput(String(parsedWeeks))}
                  className="bio-input font-mono-tabular w-16 rounded-lg px-2 py-1 text-center text-xs text-white"
                  aria-label="Custom number of weeks"
                />
                <span className="text-slate-400">
                  ({parsedWeeks * 7} day columns)
                </span>
              </div>
            )}

            {builderCadence === 'month' && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-200/20 bg-slate-950/55 p-3.5 text-xs">
                <label className="flex items-center gap-2 text-cyan-100">
                  Start Month
                  <input
                    type="month"
                    value={monthStart}
                    onChange={(e) => {
                      setMonthStart(e.target.value);
                      if (e.target.value > monthEnd) setMonthEnd(e.target.value);
                    }}
                    className="bio-input rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="flex items-center gap-2 text-cyan-100">
                  End Month
                  <input
                    type="month"
                    value={monthEnd}
                    min={monthStart}
                    onChange={(e) => setMonthEnd(e.target.value)}
                    className="bio-input rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </label>
              </div>
            )}

            {builderCadence === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-200/20 bg-slate-950/55 p-3.5 text-xs">
                <label className="flex items-center gap-2 text-cyan-100">
                  Start Date
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => {
                      setCustomStart(e.target.value);
                      if (e.target.value > customEnd) setCustomEnd(e.target.value);
                    }}
                    className="bio-input rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="flex items-center gap-2 text-cyan-100">
                  End Date
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bio-input rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/15 pt-4">
              <p className="text-xs text-slate-300">
                Starts with editable items — click any item or column name right inside the table to customize it.
              </p>
              <button
                type="submit"
                className="bio-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-xs font-semibold shadow-[0_0_18px_rgba(56,189,248,0.3)]"
              >
                Create Checklist
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. Bright Interactive Spreadsheet / Checklist Workspace */}
      {activeTable && !showCreator && (
        <section className="glass-panel rounded-2xl border border-cyan-300/30 bg-[#071b2f]/88 p-5 sm:p-6 shadow-[0_0_36px_rgba(34,211,238,0.12)]">
          {/* Header with Inline Editable Title & Quick Actions */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-200/15 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-cyan-200">
                <span className="rounded-md border border-cyan-300/35 bg-cyan-400/15 px-2 py-0.5">
                  {CADENCE_LABELS[activeTable.cadence ?? 'quick']}
                </span>
                <span className="font-mono-tabular text-amber-200">
                  {activeStats.checkedCells}/{activeStats.totalCells} checked ({activeStats.pct}%)
                </span>
                <span className="text-slate-400">· Click any header or item name to edit</span>
              </div>

              {editingTitle ? (
                <input
                  type="text"
                  value={editingTitleText}
                  onChange={(e) => setEditingTitleText(e.target.value)}
                  onBlur={() => {
                    const next = editingTitleText.trim();
                    if (next) updateActiveTable((t) => ({ ...t, title: next }));
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const next = editingTitleText.trim();
                      if (next) updateActiveTable((t) => ({ ...t, title: next }));
                      setEditingTitle(false);
                    } else if (e.key === 'Escape') {
                      setEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="bio-input font-display mt-1.5 w-full max-w-md rounded-lg px-3 py-1 text-xl font-semibold text-white"
                />
              ) : (
                <h2
                  onClick={() => {
                    setEditingTitle(true);
                    setEditingTitleText(activeTable.title);
                  }}
                  title="Click to rename checklist"
                  className="font-display mt-1.5 cursor-pointer text-xl font-semibold text-white hover:text-cyan-200 sm:text-2xl"
                >
                  {activeTable.title}
                </h2>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickAddRow()}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-300/45 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/25"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Row
              </button>

              <button
                type="button"
                onClick={handleQuickAddColumn}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300/45 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/25"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Column
              </button>

              <button
                type="button"
                onClick={() => {
                  const deleted = activeTable.title;
                  onUpdateTables((prev) => prev.filter((t) => t.id !== activeTable.id));
                  showNotice(`Deleted "${deleted}".`);
                }}
                aria-label={`Delete ${activeTable.title}`}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/25"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-950/80">
            <div
              className="bio-progress h-full rounded-full transition-all duration-300"
              style={{ width: `${activeStats.pct}%` }}
            />
          </div>

          {/* Week Filter Tabs (when multi-week) */}
          {weekTabsForTable.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedWeekTab('all')}
                className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium ${
                  selectedWeekTab === 'all'
                    ? 'bio-glow-chip'
                    : 'border-cyan-200/20 bg-slate-950/50 text-slate-200 hover:border-cyan-300/45'
                }`}
              >
                All Weeks ({activeTable.columns.length} cols)
              </button>
              {weekTabsForTable.map((wk) => (
                <button
                  key={wk.weekNum}
                  type="button"
                  onClick={() => setSelectedWeekTab(wk.weekNum)}
                  className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium ${
                    selectedWeekTab === wk.weekNum
                      ? 'bio-glow-chip'
                      : 'border-cyan-200/20 bg-slate-950/50 text-slate-200 hover:border-cyan-300/45'
                  }`}
                >
                  Week {wk.weekNum} ({wk.start}–{wk.end})
                </button>
              ))}
            </div>
          )}

          {/* Month Filter Tabs (when multi-month) */}
          {monthTabsForTable.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMonthTab('all')}
                className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium ${
                  selectedMonthTab === 'all'
                    ? 'bio-glow-chip'
                    : 'border-cyan-200/20 bg-slate-950/50 text-slate-200 hover:border-cyan-300/45'
                }`}
              >
                All Months
              </button>
              {monthTabsForTable.map((m) => (
                <button
                  key={m.monthKey}
                  type="button"
                  onClick={() => setSelectedMonthTab(m.monthKey)}
                  className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium ${
                    selectedMonthTab === m.monthKey
                      ? 'bio-glow-chip'
                      : 'border-cyan-200/20 bg-slate-950/50 text-slate-200 hover:border-cyan-300/45'
                  }`}
                >
                  {m.label} ({m.count})
                </button>
              ))}
            </div>
          )}

          {/* Bright Interactive Sheet */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-300/25 bg-[#092036]/85 shadow-inner quiet-scroll">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-cyan-300/20 bg-[#0d2a45]">
                  <th className="sticky left-0 z-10 min-w-[200px] bg-[#0d2a45] px-4 py-3 font-semibold text-cyan-100">
                    Item / Task
                  </th>

                  {displayedColumns.map((col) => {
                    const isEditing = editingColId === col.id;
                    return (
                      <th
                        key={col.id}
                        className="min-w-[78px] border-l border-cyan-200/15 px-2 py-2.5 text-center font-semibold text-white"
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingColText}
                            onChange={(e) => setEditingColText(e.target.value)}
                            onBlur={() => handleCommitColRename(col.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCommitColRename(col.id);
                              } else if (e.key === 'Escape') {
                                setEditingColId(null);
                              }
                            }}
                            autoFocus
                            className="bio-input w-20 rounded-md px-2 py-1 text-center text-xs text-white"
                          />
                        ) : (
                          <div className="group flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingColId(col.id);
                                setEditingColText(col.label);
                              }}
                              title="Click to rename column"
                              className="cursor-pointer rounded px-1.5 py-0.5 text-white transition-colors hover:bg-cyan-400/20 hover:text-cyan-100"
                            >
                              {col.label}
                            </button>
                            {activeTable.columns.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteColumn(col.id)}
                                title="Remove column"
                                className="opacity-0 cursor-pointer text-slate-400 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}

                  {/* Direct Edge "+ Add Column" Cell */}
                  <th className="w-[82px] border-l border-cyan-200/15 px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={handleQuickAddColumn}
                      title="Add another column right here"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-amber-300/50 bg-amber-400/12 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-400/25"
                    >
                      <Plus className="h-3 w-3" />
                      Col
                    </button>
                  </th>

                  <th className="min-w-[70px] border-l border-cyan-200/15 px-3 py-2.5 text-center font-semibold text-amber-200">
                    Done
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-cyan-200/12">
                {activeTable.rows.map((row, rowIndex) => {
                  const isEditing = editingRowId === row.id;
                  const rowCheckedCount = activeTable.columns.filter((c) =>
                    isCellChecked(activeTable.checks, row.id, c.id)
                  ).length;

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-cyan-400/[0.08] ${
                        rowIndex % 2 === 1 ? 'bg-slate-950/20' : ''
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-[#081d31]/95 px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingRowText}
                            onChange={(e) => setEditingRowText(e.target.value)}
                            onBlur={() => handleCommitRowRename(row.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCommitRowRename(row.id);
                              } else if (e.key === 'Escape') {
                                setEditingRowId(null);
                              }
                            }}
                            autoFocus
                            className="bio-input w-full rounded-lg px-2.5 py-1 text-xs text-white"
                          />
                        ) : (
                          <div className="group flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRowId(row.id);
                                setEditingRowText(row.label);
                              }}
                              title="Click to rename item"
                              className="min-w-0 flex-1 cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-sm font-medium text-white transition-colors hover:bg-cyan-400/15 hover:text-cyan-100"
                            >
                              {row.label}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              aria-label={`Delete ${row.label}`}
                              className="opacity-0 cursor-pointer rounded p-1 text-slate-400 transition-opacity hover:bg-rose-500/20 hover:text-rose-200 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {displayedColumns.map((col) => {
                        const checked = isCellChecked(activeTable.checks, row.id, col.id);
                        return (
                          <td
                            key={col.id}
                            className="border-l border-cyan-200/12 p-1.5 text-center"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleCell(row.id, col.id)}
                              aria-label={`${row.label} — ${col.label}: ${checked ? 'Done' : 'Not checked'}`}
                              className={`mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-all ${
                                checked
                                  ? 'border-cyan-200 bg-gradient-to-br from-cyan-400/55 via-cyan-300/40 to-amber-300/45 text-white shadow-[0_0_16px_rgba(56,189,248,0.45)] scale-[1.03]'
                                  : 'border-cyan-200/25 bg-slate-900/55 text-transparent hover:border-cyan-300/70 hover:bg-cyan-400/15'
                              }`}
                            >
                              <Check className="h-4.5 w-4.5 stroke-[2.75]" />
                            </button>
                          </td>
                        );
                      })}

                      <td className="border-l border-cyan-200/12" />

                      <td className="font-mono-tabular border-l border-cyan-200/12 px-3 py-2 text-center font-semibold text-amber-200">
                        {rowCheckedCount}/{activeTable.columns.length}
                      </td>
                    </tr>
                  );
                })}

                {/* Direct Inline "+ Add Row" Row Glued to Bottom of Sheet */}
                <tr className="bg-[#0b253d]/90">
                  <td
                    colSpan={displayedColumns.length + 3}
                    className="px-4 py-2.5"
                  >
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleQuickAddRow(inlineNewRowText);
                      }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Plus className="h-4 w-4 shrink-0 text-cyan-300" />
                      <input
                        ref={newRowInputRef}
                        type="text"
                        value={inlineNewRowText}
                        onChange={(e) => setInlineNewRowText(e.target.value)}
                        placeholder="Type new row item & press Enter (e.g. Eating medicine, Walking)..."
                        className="min-w-[220px] flex-1 bg-transparent text-xs text-white placeholder:text-slate-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-lg border border-cyan-300/40 bg-cyan-400/18 px-3 py-1 text-[11px] font-semibold text-cyan-50 hover:bg-cyan-400/30"
                      >
                        + Add Row
                      </button>
                    </form>
                  </td>
                </tr>
              </tbody>

              <tfoot>
                <tr className="border-t border-cyan-300/20 bg-[#0d2a45] text-[11px] text-cyan-100">
                  <td className="sticky left-0 z-10 bg-[#0d2a45] px-4 py-2 font-semibold">
                    Column Totals
                  </td>
                  {displayedColumns.map((col) => {
                    const colDone = activeTable.rows.filter((r) =>
                      isCellChecked(activeTable.checks, r.id, col.id)
                    ).length;
                    return (
                      <td
                        key={col.id}
                        className="font-mono-tabular border-l border-cyan-200/15 px-2 py-2 text-center font-semibold text-cyan-200"
                      >
                        {colDone}/{activeTable.rows.length}
                      </td>
                    );
                  })}
                  <td className="border-l border-cyan-200/15" />
                  <td className="font-mono-tabular border-l border-cyan-200/15 px-3 py-2 text-center font-bold text-amber-200">
                    {activeStats.pct}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
