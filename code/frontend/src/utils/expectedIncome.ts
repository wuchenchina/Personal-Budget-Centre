import dayjs from 'dayjs';
import type { AnnualSalary } from '../types/auth';
import type { BudgetSummary, ExpectedIncome, ExpectedIncomeEntry } from '../types/budget';

export function annualSalaryAmount(salary: AnnualSalary | null | undefined): number {
  if (!salary) return 0;
  return salary.mode === 'monthly' ? salary.amount * salary.paymentsPerYear : salary.amount;
}

export function expectedMonthlyIncome(income: ExpectedIncomeEntry | null | undefined): number {
  if (!income || income.mode === 'one_off') return 0;
  if (income.mode === 'annual' || (income.mode === 'auto' && (income.annualAmount ?? 0) > 0)) {
    return (income.annualAmount ?? 0) / 12;
  }
  if (income.mode === 'daily') return income.dailyAmount * income.workdays;
  return income.monthlyAmount;
}

// Inclusive dates, prorated by the actual number of calendar days in each month.
export function incomePeriodMonths(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  let cursor = dayjs(start).startOf('day');
  const last = dayjs(end).startOf('day');
  if (!cursor.isValid() || !last.isValid() || cursor.isAfter(last)) return 0;
  let months = 0;
  while (!cursor.isAfter(last)) {
    const monthEnd = cursor.endOf('month').startOf('day');
    const segmentEnd = monthEnd.isAfter(last) ? last : monthEnd;
    months += (segmentEnd.diff(cursor, 'day') + 1) / cursor.daysInMonth();
    cursor = segmentEnd.add(1, 'day');
  }
  return months;
}

export function incomeEntries(income: ExpectedIncome | null | undefined): ExpectedIncomeEntry[] {
  if (!income) return [];
  if (Array.isArray(income.entries)) return income.entries;
  const legacy = income as unknown as ExpectedIncomeEntry;
  return legacy.mode ? [{ ...legacy, id: 'legacy', title: '', oneOffAmount: 0 }] : [];
}

export function incomeSummary(budget: Pick<BudgetSummary, 'expectedIncome' | 'startDate' | 'endDate' | 'totals'>) {
  const entries = incomeEntries(budget.expectedIncome);
  const monthly = entries.reduce((sum, entry) => sum + expectedMonthlyIncome(entry), 0);
  const oneOff = entries.reduce((sum, entry) => sum + (entry.mode === 'one_off' ? entry.oneOffAmount : 0), 0);
  const total = monthly * incomePeriodMonths(budget.startDate, budget.endDate) + oneOff;
  const expenses = budget.totals.totalBudgetBase;
  return { monthly, oneOff, total, expenses, balance: total - expenses };
}
