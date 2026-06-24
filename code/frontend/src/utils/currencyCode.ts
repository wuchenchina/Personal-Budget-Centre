import type { CurrencyCode } from '../types/budget';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return /^[A-Z]{3}$/.test(value);
}

export function toCurrencyCode(value: string | undefined): CurrencyCode {
  const normalized = (value ?? 'CNY').trim().toUpperCase();

  return isCurrencyCode(normalized) ? normalized : 'CNY';
}
