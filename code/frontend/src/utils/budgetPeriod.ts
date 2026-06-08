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

export function formatBudgetPeriodEnglish(budget: BudgetPeriodLike): string | null {
  if (budget.startDate === null && budget.endDate === null) {
    return null;
  }

  if (budget.startDate !== null && budget.endDate !== null) {
    return `${formatDateEnglish(budget.startDate)} to ${formatDateEnglish(budget.endDate)}`;
  }

  return formatDateEnglish(budget.startDate ?? budget.endDate ?? '');
}

function formatDateEnglish(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) {
    return value;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
