import type { CurrencyCode } from '../types/budget';

export const supportedCurrencyCodes = [
  'CNY',
  'CNH',
  'HKD',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'TWD',
  'MOP',
  'AUD',
  'NZD',
  'CAD',
  'CHF',
  'DKK',
  'NOK',
  'SEK',
  'SGD',
  'THB',
  'BND',
  'ZAR',
] as const satisfies readonly CurrencyCode[];

export const supportedCurrencyCodeSet: ReadonlySet<string> = new Set(supportedCurrencyCodes);

export const currencyOptions = supportedCurrencyCodes.map((code) => ({
  label: code,
  value: code,
}));
