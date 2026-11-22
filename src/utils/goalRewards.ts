import type { GamificationStats, GoalPhaseKind, GoalPlan } from '../types';

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
  const safePeriod = Math.max(2, Math.min(10, periodLengthDays));
  const safeTotal = Math.max(18, Math.min(45, averageCycleDays));
  const ovulationStart = Math.max(safePeriod + 2, safeTotal - 15);
  const lutealStart = Math.max(ovulationStart + 3, safeTotal - 11);

  if (cycleDay <= safePeriod) return 'menstrual';
  if (cycleDay < ovulationStart) return 'follicular';
  if (cycleDay < lutealStart) return 'ovulation';
  return 'luteal';
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
