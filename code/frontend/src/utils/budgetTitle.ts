import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

export function defaultBudgetDateRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf('month'), dayjs().endOf('month')];
}

export function defaultBudgetTitle(dateRange?: [Dayjs, Dayjs] | null): string {
  const [start, end] = dateRange ?? [];

  if (start?.isValid() && end?.isValid()) {
    return `Personal Budget of ${start.format('MMMM D, YYYY')} to ${end.format('MMMM D, YYYY')}`;
  }

  return 'Personal Budget';
}
