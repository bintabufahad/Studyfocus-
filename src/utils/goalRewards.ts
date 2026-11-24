import type { CycleDayLog, GamificationStats, GoalPhaseKind, GoalPlan, GoalStep } from '../types';

export interface BadgeDef {
  id: string;
  title: string;
  desc: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_spark', title: 'First Spark', desc: 'Complete your first goal step' },
  { id: 'tide_runner', title: 'Tide Runner', desc: 'Reach a 3x completion combo' },
  { id: 'unbreakable_wave', title: 'Unbreakable Wave', desc: 'Reach a 5x completion combo' },
  { id: 'phoenix_catchup', title: 'Phoenix Catch-Up', desc: 'Clear a missed carryover task' },
  { id: 'halfway_horizon', title: 'Halfway Horizon', desc: 'Reach 50% on a goal plan' },
  { id: 'conqueror', title: 'Challenge Conqueror', desc: 'Clear 100% of a goal plan' },
];

export const PHASE_META: Record<
  GoalPhaseKind,
  {
    label: string;
    energy: string;
    suggestion: string;
    chipClass: string;
    dotClass: string;
  }
> = {
  menstrual: {
    label: 'Menstrual',
    energy: 'Restorative & Low-Key',
    suggestion: 'Gentle review, light reading, zero pressure.',
    chipClass: 'border-rose-300/35 bg-rose-400/12 text-rose-100',
    dotClass: 'bg-rose-300',
  },
  follicular: {
    label: 'Follicular',
    energy: 'Rising Focus & Curiosity',
    suggestion: 'Fresh topics, planning, steady skill building.',
    chipClass: 'border-teal-300/35 bg-teal-400/12 text-teal-100',
    dotClass: 'bg-teal-300',
  },
  ovulation: {
    label: 'Ovulation',
    energy: 'Peak Energy & Momentum',
    suggestion: 'Deep work sprints, hardest chapters, big goals.',
    chipClass: 'border-cyan-300/45 bg-cyan-400/16 text-cyan-100',
    dotClass: 'bg-cyan-300',
  },
  luteal: {
    label: 'Luteal',
    energy: 'Steady Finishing & Wind-Down',
    suggestion: 'Wrap up drafts, light practice, gentle pacing.',
    chipClass: 'border-amber-300/40 bg-amber-400/14 text-amber-100',
    dotClass: 'bg-amber-300',
  },
};

export function computeLevelInfo(xp: number): {
  level: number;
  rankTitle: string;
  xpIntoLevel: number;
  xpNeeded: number;
  progressPct: number;
} {
  let level = 1;
  let remaining = Math.max(0, xp);
  let needed = 150;

  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = 150 + (level - 1) * 75;
  }

  const ranks = [
    'Spark Seeker',
    'Tide Runner',
    'Lantern Keeper',
    'Reef Architect',
    'Abyssal Luminary',
    'Bioluminescent Master',
  ];
  const rankTitle = ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 2))];

  return {
    level,
    rankTitle,
    xpIntoLevel: remaining,
    xpNeeded: needed,
    progressPct: Math.min(100, Math.round((remaining / needed) * 100)),
  };
}

export function computeCyclePhaseForDay(
  cycleDay: number,
  averageCycleDays: number,
  periodLengthDays: number
): GoalPhaseKind {
  const safePeriod = Math.max(1, Math.min(14, periodLengthDays));
  const safeTotal = Math.max(18, Math.min(45, averageCycleDays));
  const ovulationStart = Math.max(safePeriod + 2, safeTotal - 15);
  const lutealStart = Math.max(ovulationStart + 3, safeTotal - 11);

  if (cycleDay <= safePeriod) return 'menstrual';
  if (cycleDay < ovulationStart) return 'follicular';
  if (cycleDay < lutealStart) return 'ovulation';
  return 'luteal';
}

export function computePhaseDayBreakdown(
  averageCycleDays: number,
  periodLengthDays: number
): {
  menstrual: { start: number; end: number };
  follicular: { start: number; end: number };
  ovulation: { start: number; end: number };
  luteal: { start: number; end: number };
} {
  const safePeriod = Math.max(1, Math.min(14, periodLengthDays));
  const safeTotal = Math.max(18, Math.min(45, averageCycleDays));
  const ovulationStart = Math.max(safePeriod + 2, safeTotal - 15);
  const lutealStart = Math.max(ovulationStart + 3, safeTotal - 11);

  return {
    menstrual: { start: 1, end: safePeriod },
    follicular: { start: safePeriod + 1, end: ovulationStart - 1 },
    ovulation: { start: ovulationStart, end: lutealStart - 1 },
    luteal: { start: lutealStart, end: safeTotal },
  };
}

export function addDaysToDateKey(iso: string, offset: number): string {
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setDate(base.getDate() + offset);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatIsoWithWeekday(iso?: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function resolveStepDateIso(goal: GoalPlan, step: GoalStep): string | undefined {
  if (step.dateLabel && /^\d{4}-\d{2}-\d{2}$/.test(step.dateLabel)) {
    return step.dateLabel;
  }
  const phaseAnchor =
    goal.cadence === 'phase' && goal.phaseConfig?.cycleDates?.length
      ? [...goal.phaseConfig.cycleDates].sort((a, b) => a.localeCompare(b))[
          goal.phaseConfig.cycleDates.length - 1
        ]
      : undefined;
  const anchor = goal.steps[0]?.dateLabel || phaseAnchor || goal.startDate;
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const offset = goal.unit === 'weeks' ? (step.stepNumber - 1) * 7 : step.stepNumber - 1;
    return addDaysToDateKey(anchor, offset);
  }
  const createdDate = new Date(goal.createdAt);
  if (!Number.isNaN(createdDate.getTime())) {
    const y = createdDate.getFullYear();
    const m = String(createdDate.getMonth() + 1).padStart(2, '0');
    const d = String(createdDate.getDate()).padStart(2, '0');
    const offset = goal.unit === 'weeks' ? (step.stepNumber - 1) * 7 : step.stepNumber - 1;
    return addDaysToDateKey(`${y}-${m}-${d}`, offset);
  }
  return undefined;
}

export interface CycleEpisode {
  startDate: string;
  endDate: string;
  lengthDays: number;
}

export function deriveCycleStatsFromLogs(
  goal: GoalPlan | null | undefined,
  cycleLogs: Record<string, CycleDayLog>
): {
  hasPreviousData: boolean;
  detectedCycleDays: number;
  detectedPeriodDays: number;
  previousCycleDays: number | null;
  previousPeriodDays: number | null;
  episodes: CycleEpisode[];
  latestPeriodStart: string | null;
  nextPredictedStart: string | null;
  phaseBreakdown: ReturnType<typeof computePhaseDayBreakdown>;
} {
  const flowDates = Object.values(cycleLogs)
    .filter(
      (log) =>
        log &&
        /^\d{4}-\d{2}-\d{2}$/.test(log.dateKey) &&
        (log.flow === 'spotting' ||
          log.flow === 'light' ||
          log.flow === 'medium' ||
          log.flow === 'heavy')
    )
    .map((log) => log.dateKey)
    .sort((a, b) => a.localeCompare(b));

  const endedDates = new Set(
    Object.values(cycleLogs)
      .filter((log) => log && log.flow === 'ended')
      .map((log) => log.dateKey)
  );

  const episodes: CycleEpisode[] = [];
  for (const dateKey of flowDates) {
    const last = episodes[episodes.length - 1];
    if (!last) {
      episodes.push({ startDate: dateKey, endDate: dateKey, lengthDays: 1 });
      continue;
    }
    const gap = diffDaysIso(last.endDate, dateKey);
    const hasExplicitEndBetween = Array.from(endedDates).some(
      (ed) => ed > last.endDate && ed <= dateKey
    );
    if (gap <= 2 && !hasExplicitEndBetween) {
      last.endDate = dateKey;
      last.lengthDays = Math.max(1, diffDaysIso(last.startDate, dateKey) + 1);
    } else {
      episodes.push({ startDate: dateKey, endDate: dateKey, lengthDays: 1 });
    }
  }

  // Merge cycleDates from goal.phaseConfig that aren't already part of an active flow episode
  const configStarts = [...(goal?.phaseConfig?.cycleDates ?? [])]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => a.localeCompare(b));

  const mergedStartDates = [...episodes.map((ep) => ep.startDate)];
  for (const cs of configStarts) {
    const closeExisting = mergedStartDates.some((s) => Math.abs(diffDaysIso(s, cs)) < 12);
    if (!closeExisting) {
      mergedStartDates.push(cs);
    }
  }
  mergedStartDates.sort((a, b) => a.localeCompare(b));

  const cycleIntervals: number[] = [];
  for (let i = 1; i < mergedStartDates.length; i++) {
    const gap = diffDaysIso(mergedStartDates[i - 1], mergedStartDates[i]);
    if (gap >= 15 && gap <= 60) {
      cycleIntervals.push(gap);
    }
  }

  // If the user explicitly marked menstrual steps inside the goal without logging flow daily, detect count
  const menstrualStepsCount =
    goal?.steps.filter((s) => s.phase === 'menstrual').length ?? 0;

  const fallbackCycle = goal?.phaseConfig?.averageCycleDays ?? goal?.steps.length ?? 28;
  const fallbackPeriod =
    goal?.phaseConfig?.periodLengthDays ?? (menstrualStepsCount > 0 ? menstrualStepsCount : 6);

  // Previous completed cycle = most recent interval; if 2+ completed episodes, use most recent completed episode's bleed length
  const previousCycleDays =
    cycleIntervals.length > 0 ? cycleIntervals[cycleIntervals.length - 1] : null;

  const completedEpisodes =
    episodes.length >= 2
      ? episodes.slice(0, -1)
      : episodes.length === 1 && episodes[0].lengthDays >= 2
        ? episodes
        : [];
  const previousPeriodDays =
    completedEpisodes.length > 0
      ? Math.max(1, Math.min(14, completedEpisodes[completedEpisodes.length - 1].lengthDays))
      : null;

  const detectedCycleDays = Math.max(
    18,
    Math.min(45, previousCycleDays ?? fallbackCycle)
  );
  const detectedPeriodDays = Math.max(
    1,
    Math.min(14, previousPeriodDays ?? fallbackPeriod)
  );

  const latestPeriodStart =
    mergedStartDates[mergedStartDates.length - 1] ?? goal?.startDate ?? null;
  const nextPredictedStart = latestPeriodStart
    ? addDaysToDateKey(latestPeriodStart, detectedCycleDays)
    : null;

  return {
    hasPreviousData: previousCycleDays !== null || previousPeriodDays !== null,
    detectedCycleDays,
    detectedPeriodDays,
    previousCycleDays,
    previousPeriodDays,
    episodes,
    latestPeriodStart,
    nextPredictedStart,
    phaseBreakdown: computePhaseDayBreakdown(detectedCycleDays, detectedPeriodDays),
  };
}

export function resolveActiveCycleContext(
  goals: GoalPlan[],
  todayIso: string
): {
  phaseGoal: GoalPlan | null;
  cycleDay: number;
  totalCycleDays: number;
  periodLengthDays: number;
  phase: GoalPhaseKind;
  cycleStartIso: string;
} | null {
  const phaseGoals = goals.filter((g) => g.cadence === 'phase' && g.phaseConfig);
  if (phaseGoals.length === 0) return null;
  const phaseGoal = [...phaseGoals].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const cfg = phaseGoal.phaseConfig!;
  const sortedDates = [...cfg.cycleDates].sort((a, b) => a.localeCompare(b));
  const latestStart = sortedDates[sortedDates.length - 1] ?? phaseGoal.startDate ?? todayIso;
  const total = Math.max(1, phaseGoal.steps.length);
  const matchedTodayIdx = phaseGoal.steps.findIndex((s) => s.dateLabel === todayIso);
  const elapsed = Math.max(0, diffDaysIso(latestStart, todayIso));
  const cycleDay =
    matchedTodayIdx !== -1
      ? matchedTodayIdx + 1
      : Math.min(total, (elapsed % Math.max(1, cfg.averageCycleDays)) + 1);
  const matchingStep = phaseGoal.steps.find((s) => s.stepNumber === cycleDay);
  const phase =
    matchingStep?.phase ??
    computeCyclePhaseForDay(cycleDay, cfg.averageCycleDays, cfg.periodLengthDays);

  return {
    phaseGoal,
    cycleDay,
    totalCycleDays: total,
    periodLengthDays: cfg.periodLengthDays,
    phase,
    cycleStartIso: latestStart,
  };
}

export function applyGoalCompletionReward(
  prev: GamificationStats,
  baseXp: number,
  isRescue: boolean,
  updatedGoalSnapshot?: GoalPlan
): {
  nextStats: GamificationStats;
  earnedXp: number;
  leveledUpTo: number | null;
  earnedShield: boolean;
} {
  const prevLevel = computeLevelInfo(prev.xp).level;
  const nextCombo = prev.combo + 1;
  const comboBonus = Math.min(90, (nextCombo - 1) * 15);
  const earnedXp = baseXp + comboBonus;
  const nextXp = prev.xp + earnedXp;
  const earnedShield = nextCombo > 0 && nextCombo % 3 === 0 && prev.shields < 3;

  const badges = new Set(prev.unlockedBadges);
  badges.add('first_spark');
  if (nextCombo >= 3) badges.add('tide_runner');
  if (nextCombo >= 5) badges.add('unbreakable_wave');
  if (isRescue) badges.add('phoenix_catchup');

  if (updatedGoalSnapshot) {
    const allEntries = updatedGoalSnapshot.steps.flatMap((s) => [
      ...(s.priorities ?? []).filter((e) => e.text.trim()),
      ...(s.todos ?? []).filter((e) => e.text.trim()),
    ]);
    const doneEntries = allEntries.filter((e) => e.status === 'done').length;

    if (allEntries.length > 0) {
      const pct = (doneEntries / allEntries.length) * 100;
      if (pct >= 50) badges.add('halfway_horizon');
      if (
        doneEntries === allEntries.length &&
        updatedGoalSnapshot.steps.every((s) => s.carryovers.every((c) => c.status !== 'pending')) &&
        (updatedGoalSnapshot.trailingCarryovers ?? []).every((c) => c.status !== 'pending')
      ) {
        badges.add('conqueror');
      }
    }
  }

  const nextLevel = computeLevelInfo(nextXp).level;
  return {
    nextStats: {
      xp: nextXp,
      combo: nextCombo,
      bestCombo: Math.max(prev.bestCombo, nextCombo),
      shields: Math.min(3, prev.shields + (earnedShield ? 1 : 0)),
      rescuesCompleted: prev.rescuesCompleted + (isRescue ? 1 : 0),
      totalStepsCompleted: prev.totalStepsCompleted + 1,
      unlockedBadges: Array.from(badges),
    },
    earnedXp,
    leveledUpTo: nextLevel > prevLevel ? nextLevel : null,
    earnedShield,
  };
}
