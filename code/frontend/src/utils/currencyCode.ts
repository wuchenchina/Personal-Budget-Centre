import type { CurrencyCode } from '../types/budget';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return /^[A-Z]{3}$/.test(value);
}

export function toCurrencyCode(value: string | undefined): CurrencyCode {
  const normalized = (value ?? '').trim().toUpperCase();

  return isCurrencyCode(normalized) ? normalized : 'CNY';
}

export function toOptionalCurrencyCode(value: string | null | undefined): CurrencyCode | null {
  const normalized = (value ?? '').trim().toUpperCase();

  return isCurrencyCode(normalized) ? normalized : null;
}
