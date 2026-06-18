import { supportedCurrencyCodeSet } from '../config/currencies';
import type { CurrencyCode } from '../types/budget';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return supportedCurrencyCodeSet.has(value);
}

export function toCurrencyCode(value: string | undefined): CurrencyCode {
  const normalized = (value ?? 'CNY').trim().toUpperCase();

  return isCurrencyCode(normalized) ? normalized : 'CNY';
}
