import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  GripVertical,
  Pencil,
  Plus,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { TaskItem } from '../types';

interface TodoPanelProps {
  tasks: TaskItem[];
  activeTaskId: string | null;
  breakingDownTaskId: string | null;
  onAddTask: (title: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleCollapse: (taskId: string) => void;
  onSelectFocusTask: (taskId: string) => void;
  onReorderTask: (fromIndex: number, toIndex: number) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onBreakDownTask: (taskId: string) => void;
  onClearCompleted: () => void;
}

export function TodoPanel({
  tasks,
  activeTaskId,
  breakingDownTaskId,
  onAddTask,
  onEditTask,
  onToggleTask,
  onDeleteTask,
  onToggleCollapse,
  onSelectFocusTask,
  onReorderTask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onBreakDownTask,
  onClearCompleted,
}: TodoPanelProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [subtaskInputs, setSubtaskInputs] = useState<Record<string, string>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const totalSteps = tasks.reduce((acc, t) => acc + 1 + t.subtasks.length, 0);
  const completedSteps = tasks.reduce(
    (acc, t) =>
      acc + (t.completed ? 1 : 0) + t.subtasks.filter((s) => s.completed).length,
    0
  );
  const completedMainCount = tasks.filter((t) => t.completed).length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const handleAddMain = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    onAddTask(trimmed);
    setNewTaskTitle('');
  };

  const handleAddSub = (taskId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = (subtaskInputs[taskId] ?? '').trim();
    if (!text) return;
    onAddSubtask(taskId, text);
    setSubtaskInputs((prev) => ({ ...prev, [taskId]: '' }));
  };

  const commitTaskEdit = (taskId: string) => {
    const trimmed = editingDraft.trim();
    if (trimmed) {
      onEditTask(taskId, trimmed);
    }
    setEditingTaskId(null);
    setEditingDraft('');
  };

  return (
    <section
      aria-label="Live Focus Plan"
      className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
    >
      {/* Header & Progress */}
      <div className="shrink-0 border-b border-cyan-200/[0.08] px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-100">
              Live Focus Plan
            </h1>
            <p className="text-xs text-slate-400">
              Speak with Sora or add tasks directly below — split any task into tiny micro-steps
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <span className="font-mono-tabular bg-gradient-to-r from-cyan-200 to-amber-200 bg-clip-text text-base font-semibold text-transparent">
                {completedMainCount}/{tasks.length}
              </span>
              <span className="ml-1.5 text-xs text-slate-400">done</span>
            </div>
            {completedMainCount > 0 && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="cursor-pointer text-xs font-medium text-slate-400 transition-colors hover:text-cyan-200 whitespace-nowrap"
              >
                Clear done
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-cyan-200/[0.08]">
            <div
              style={{ width: `${progressPct}%` }}
              className="bio-progress h-full rounded-full transition-all duration-300"
            />
          </div>
          <span className="font-mono-tabular text-xs text-slate-400">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Add Task Input */}
      <form
        onSubmit={handleAddMain}
        className="flex shrink-0 items-center gap-2.5 border-b border-cyan-200/[0.08] px-5 py-3"
      >
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="What are we tackling right now? Add a task..."
          aria-label="Add a main task"
          className="bio-input min-w-0 flex-1 rounded-lg px-3.5 py-2 text-sm placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim()}
          className="bio-btn-primary flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </form>

      {/* Spacious Tasks List */}
      <div className="quiet-scroll min-h-0 flex-1 divide-y divide-cyan-200/[0.07] overflow-y-auto px-5 py-2">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <p className="font-display text-base font-medium text-slate-200">
              Ready when you are
            </p>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">
              Type a task above or click <span className="text-cyan-300">Talk Live</span> to tell Sora what you want to finish today—she will organize your plan in real time.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {tasks.map((task, idx) => {
              const isFocus = task.id === activeTaskId;
              const isBreakingDown = breakingDownTaskId === task.id;
              const isEditing = editingTaskId === task.id;
              const subDone = task.subtasks.filter((s) => s.completed).length;

              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  draggable={!isEditing}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== idx) {
                      onReorderTask(dragIndex, idx);
                    }
                    setDragIndex(null);
                  }}
                  className={`py-3.5 transition-colors ${
                    isFocus
                      ? '-mx-5 bg-gradient-to-r from-cyan-400/[0.08] via-teal-400/[0.04] to-amber-400/[0.06] px-5'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-label="Drag to reorder"
                      className="mt-1 hidden cursor-grab text-slate-600 hover:text-cyan-300/70 sm:block"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                      className={`mt-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-all shrink-0 ${
                        task.completed
                          ? 'border-transparent bg-gradient-to-br from-cyan-300 to-amber-300 text-slate-950 shadow-[0_0_10px_rgba(103,232,249,0.3)]'
                          : 'border-cyan-200/35 bg-transparent hover:border-cyan-300'
                      }`}
                    >
                      {task.completed && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitTaskEdit(task.id);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditingTaskId(null);
                                setEditingDraft('');
                              }
                            }}
                            aria-label="Edit task title"
                            className="bio-input min-w-0 flex-1 rounded px-2.5 py-1 text-sm"
                          />
                          <button
                            type="submit"
                            aria-label="Save task edit"
                            className="bio-btn-primary flex h-7 w-7 cursor-pointer items-center justify-center rounded"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTaskId(null);
                              setEditingDraft('');
                            }}
                            aria-label="Cancel task edit"
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-cyan-200/15 text-slate-400 hover:text-cyan-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleCollapse(task.id)}
                          className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left"
                        >
                          {task.collapsed ? (
                            <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                          )}
                          <span
                            className={`text-sm font-medium leading-snug sm:text-base ${
                              task.completed
                                ? 'text-slate-500 line-through'
                                : 'text-slate-100'
                            }`}
                          >
                            {task.title}
                          </span>
                        </button>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-2 pl-5 text-xs text-slate-500">
                        {isFocus && (
                          <>
                            <span className="bg-gradient-to-r from-cyan-300 to-amber-200 bg-clip-text font-medium text-transparent">
                              Current Focus
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        {task.estimatedMinutes && (
                          <>
                            <span className="font-mono-tabular">~{task.estimatedMinutes}m</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="font-mono-tabular">
                          {subDone}/{task.subtasks.length} steps
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTaskId(task.id);
                          setEditingDraft(task.title);
                        }}
                        title="Edit task"
                        aria-label="Edit task"
                        className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectFocusTask(task.id)}
                        title="Pin as current focus"
                        aria-label="Pin as current focus"
                        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                          isFocus
                            ? 'bio-glow-chip border'
                            : 'text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-200'
                        }`}
                      >
                        <Crosshair className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onBreakDownTask(task.id)}
                        disabled={isBreakingDown}
                        title="Break into smaller steps with Sora"
                        aria-label="Break into smaller steps"
                        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-200/15 bg-cyan-400/[0.04] px-2.5 text-xs text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-cyan-100 disabled:opacity-50"
                      >
                        <Split className="h-3.5 w-3.5" />
                        <span>{isBreakingDown ? 'Splitting...' : 'Split Steps'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onReorderTask(idx, idx - 1)}
                        aria-label="Move task up"
                        className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-25"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === tasks.length - 1}
                        onClick={() => onReorderTask(idx, idx + 1)}
                        aria-label="Move task down"
                        className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-25"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        aria-label="Delete task"
                        className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {!task.collapsed && (
                    <div className="mt-2.5 space-y-1.5 pl-8 sm:pl-12">
                      {isBreakingDown && (
                        <div className="space-y-1.5 py-1">
                          <div className="h-5 w-3/4 animate-pulse rounded bg-cyan-300/[0.08]" />
                          <div className="h-5 w-2/3 animate-pulse rounded bg-amber-300/[0.06]" />
                        </div>
                      )}

                      {task.subtasks.map((sub) => (
                        <div
                          key={sub.id}
                          className="group flex items-center justify-between gap-2 rounded py-0.5 pr-1"
                        >
                          <button
                            type="button"
                            onClick={() => onToggleSubtask(task.id, sub.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0 ${
                                sub.completed
                                  ? 'border-transparent bg-gradient-to-br from-cyan-300 to-amber-300 text-slate-950'
                                  : 'border-cyan-200/30 group-hover:border-cyan-300/70'
                              }`}
                            >
                              {sub.completed && <Check className="h-3 w-3 stroke-[2.5]" />}
                            </span>
                            <span
                              className={`text-xs leading-relaxed sm:text-sm ${
                                sub.completed
                                  ? 'text-slate-500 line-through'
                                  : 'text-slate-300'
                              }`}
                            >
                              {sub.title}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteSubtask(task.id, sub.id)}
                            aria-label="Remove step"
                            className="cursor-pointer p-1 text-slate-600 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      <form onSubmit={(e) => handleAddSub(task.id, e)} className="pt-1">
                        <input
                          type="text"
                          value={subtaskInputs[task.id] ?? ''}
                          onChange={(e) =>
                            setSubtaskInputs((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="+ Add tiny step..."
                          aria-label={`Add step to ${task.title}`}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:border-cyan-300/30 focus:bg-[#040814]/80 focus:outline-none"
                        />
                      </form>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
