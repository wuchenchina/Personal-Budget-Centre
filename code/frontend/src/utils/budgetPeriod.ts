import type { AppLanguage } from '../i18n';

export interface BudgetPeriodLike {
  startDate: string | null;
  endDate: string | null;
}

export function formatBudgetPeriod(budget: BudgetPeriodLike, language: AppLanguage = 'tc'): string | null {
  if (budget.startDate === null && budget.endDate === null) {
    return null;
  }

  if (budget.startDate !== null && budget.endDate !== null) {
    const separator = language === 'en' ? ' to ' : language === 'sc' ? ' 至 ' : ' 至 ';

    return `${budget.startDate}${separator}${budget.endDate}`;
  }

  return budget.startDate ?? budget.endDate;
}
