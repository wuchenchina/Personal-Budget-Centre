import type { CurrencyCode, Money } from '../types/budget';

export function formatMoney(money: Money, options: { compactZero?: boolean } = {}): string {
  const decimals = money.currency === 'JPY' ? 0 : 2;
  if (options.compactZero && money.amount === 0) {
    return `${money.currency}0`;
  }

  return `${money.currency}${money.amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatRate(from: CurrencyCode, to: CurrencyCode, rate: number): string {
  return `1 ${from} = ${rate.toFixed(6)} ${to}`;
}

export function sumMoney(values: Money[], currency: CurrencyCode): Money {
  return {
    currency,
    amount: values.reduce((total, item) => total + item.amount, 0),
  };
}

export function money(currency: CurrencyCode, amount: number): Money {
  return { currency, amount };
}
