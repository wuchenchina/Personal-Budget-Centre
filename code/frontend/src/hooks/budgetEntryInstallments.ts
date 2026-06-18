import dayjs from 'dayjs';
import type { BudgetDetail, BudgetItem } from '../types/budget';
import { effectiveBudgetItemAmounts } from '../utils/budgetTemplate';
import { roundMoney } from './budgetEntryMath';

export function installmentPeriodStateFromItem(
  item: BudgetItem,
  periodCount: number,
  targetAmount: number,
): {
  periodAmounts: number[];
  periodLocked: boolean[];
  periodProgress: boolean[];
  periodRemarks: string[];
} {
  const defaultAmount = roundMoney(targetAmount / periodCount);

  return {
    periodAmounts: Array.from({ length: periodCount }, (_, index) =>
      roundMoney(item.installmentConfig.periodAmounts[index] ?? defaultAmount),
    ),
    periodLocked: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodLocked[index] === true,
    ),
    periodProgress: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodProgress[index] === true,
    ),
    periodRemarks: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodRemarks[index] ?? '',
    ),
  };
}

export function installmentPeriodStateFromOverallPlan(
  budget: BudgetDetail,
  periodCount: number,
  targetAmount: number,
): {
  periodAmounts: number[];
  periodLocked: boolean[];
  periodProgress: boolean[];
  periodRemarks: string[];
} {
  const defaultAmounts = splitMoneyAcrossPeriods(targetAmount, periodCount);

  return {
    periodAmounts: Array.from({ length: periodCount }, (_, index) =>
      roundMoney(budget.overallInstallmentPlan.periodAmounts[index] ?? defaultAmounts[index] ?? 0),
    ),
    periodLocked: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodLocked[index] === true,
    ),
    periodProgress: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodProgress[index] === true,
    ),
    periodRemarks: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodRemarks[index] ?? '',
    ),
  };
}

export function installmentPeriodCountForItem(item: BudgetItem, budget: BudgetDetail): number | null {
  const months =
    item.installmentConfig.months
    ?? budgetDurationMonths(budget.startDate, budget.endDate);
  if (months === null) {
    return null;
  }

  return Math.max(1, Math.ceil(periodCountFromMonths(months, budget.installmentPeriodUnit)));
}

export function resetInstallmentTargetAmount(item: BudgetItem, budget: BudgetDetail): number {
  return roundMoney(effectiveBudgetItemAmounts(item, budget.transactions).budgetAmountOriginal);
}

export function distributeRemainingInstallmentAmount(
  periodAmounts: number[],
  adjustableIndexes: number[],
  targetAmount: number,
  lockedTotal: number,
) {
  const remainingAmount = Math.max(0, roundMoney(targetAmount - lockedTotal));
  const averageAmount = roundMoney(remainingAmount / adjustableIndexes.length);
  let assignedTotal = 0;
  adjustableIndexes.forEach((index, position) => {
    const isLast = position === adjustableIndexes.length - 1;
    const nextAmount = isLast ? roundMoney(remainingAmount - assignedTotal) : averageAmount;
    periodAmounts[index] = nextAmount;
    assignedTotal = roundMoney(assignedTotal + nextAmount);
  });
}

export function resetInstallmentPeriodState(
  periodAmounts: number[],
  periodLocked: boolean[],
  periodProgress: boolean[],
  periodRemarks: string[],
  periodIndex: number,
  targetAmount: number,
) {
  periodLocked[periodIndex] = false;
  periodProgress[periodIndex] = false;
  periodRemarks[periodIndex] = '';

  const lockedIndexes = new Set<number>();
  for (let index = 0; index < periodIndex; index += 1) {
    lockedIndexes.add(index);
  }
  periodLocked.forEach((isLocked, index) => {
    if (isLocked) {
      lockedIndexes.add(index);
    }
  });
  periodProgress.forEach((isDone, index) => {
    if (isDone) {
      lockedIndexes.add(index);
    }
  });

  const adjustableIndexes = periodAmounts
    .map((_amount, index) => index)
    .filter((index) => !lockedIndexes.has(index));
  const lockedTotal = Array.from(lockedIndexes)
    .reduce((total, index) => total + (periodAmounts[index] ?? 0), 0);
  if (adjustableIndexes.length > 0) {
    distributeRemainingInstallmentAmount(periodAmounts, adjustableIndexes, targetAmount, lockedTotal);
  }
}

export function createInstallmentVersions(
  item: BudgetItem,
  periodAmounts: number[],
  periodProgress: boolean[],
  periodRemarks: string[],
  label: string,
): BudgetItem['installmentConfig']['versions'] {
  return [
    {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      label,
      periodAmounts,
      periodProgress,
      periodRemarks,
      totalAmount: item.installmentConfig.totalAmount
        ?? roundMoney(periodAmounts.reduce((total, amount) => total + amount, 0)),
    },
    ...item.installmentConfig.versions,
  ].slice(0, 25);
}

export function installmentMonthsFromPeriodCount(
  periodCount: number,
  unit: BudgetDetail['installmentPeriodUnit'],
): number {
  if (unit === 'day') {
    return Math.max(1, Math.ceil(periodCount * (12 / 365)));
  }

  if (unit === 'week') {
    return Math.max(1, Math.ceil(periodCount * (12 / 52)));
  }

  if (unit === 'year') {
    return Math.max(1, periodCount * 12);
  }

  return periodCount;
}

function splitMoneyAcrossPeriods(totalAmount: number, periodCount: number): number[] {
  const averageAmount = roundMoney(totalAmount / periodCount);
  let assignedTotal = 0;

  return Array.from({ length: periodCount }, (_, index) => {
    const isLast = index === periodCount - 1;
    const amount = isLast ? roundMoney(totalAmount - assignedTotal) : averageAmount;
    assignedTotal = roundMoney(assignedTotal + amount);

    return amount;
  });
}

function budgetDurationMonths(startDate: string | null, endDate: string | null): number | null {
  if (startDate === null || endDate === null) {
    return null;
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return null;
  }

  return Math.max(1, (end.diff(start, 'day') + 1) / 30.4375);
}

function periodCountFromMonths(months: number, unit: BudgetDetail['installmentPeriodUnit']): number {
  if (unit === 'day') {
    return months * (365 / 12);
  }

  if (unit === 'week') {
    return months * (52 / 12);
  }

  if (unit === 'year') {
    return months / 12;
  }

  return months;
}
