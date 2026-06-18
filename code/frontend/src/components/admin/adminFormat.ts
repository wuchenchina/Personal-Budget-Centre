import dayjs from 'dayjs';

export function formatDate(value: string | null): string {
  return value === null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm');
}
