export function formatDateOnly(value: string | null | undefined): string {
  const date = inputDateValue(value);
  return date ?? '--';
}

export function inputDateValue(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = value.trim();
  if (text.length < 10) {
    return undefined;
  }

  const date = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}
