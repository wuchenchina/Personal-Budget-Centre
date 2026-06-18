export function normalizedAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizedNonNegativeAmount(value: number | null | undefined): number | null {
  const amount = normalizedAmount(value);

  return amount === null || amount < 0 ? null : amount;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function originalAmountFromBase(amountBase: number, rateToBase: number): number {
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) {
    return roundMoney(amountBase);
  }

  return roundMoney(amountBase / rateToBase);
}
