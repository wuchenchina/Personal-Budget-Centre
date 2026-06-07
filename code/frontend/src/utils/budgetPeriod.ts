export interface BudgetPeriodLike {
  startDate: string | null;
  endDate: string | null;
}

export function formatBudgetPeriod(budget: BudgetPeriodLike): string | null {
  if (budget.startDate === null && budget.endDate === null) {
    return null;
  }

  if (budget.startDate !== null && budget.endDate !== null) {
    return `${budget.startDate} 至 ${budget.endDate}`;
  }

  return budget.startDate ?? budget.endDate;
}
