import type { ReactNode } from 'react';
import type { Currency, CurrencyCode } from '../types/budget';

type CurrencyOptionRenderInput = {
  data?: {
    currency?: Currency;
    label?: ReactNode;
    value?: unknown;
  };
  label?: ReactNode;
  value?: unknown;
};

export interface CurrencySelectOption {
  label: string;
  value: CurrencyCode;
  currency: Currency;
}

export function buildCurrencyOptions(currencies: Currency[]): CurrencySelectOption[] {
  return currencies.map((currency) => ({
    label: currencySearchLabel(currency),
    value: currency.code,
    currency,
  }));
}

export function currencySearchLabel(currency: Pick<Currency, 'code' | 'name' | 'symbol'>): string {
  return [currency.code, currency.name, currency.symbol]
    .filter((part) => part.trim() !== '')
    .join(' ');
}

export function renderCurrencyOption(option: CurrencyOptionRenderInput): ReactNode {
  const currency = option.data?.currency;
  const code = currency?.code ?? String(option.data?.value ?? option.value ?? '');
  const name = currency?.name ?? String(option.data?.label ?? option.label ?? '');

  return (
    <span className="currency-option-two-line">
      <span className="currency-option-code">{code}</span>
      <small>{name}</small>
    </span>
  );
}
