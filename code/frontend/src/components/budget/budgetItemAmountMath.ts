export function previewBaseAmount(amount: number | null | undefined, rate: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }

  const normalizedRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;

  return roundMoney(amount * normalizedRate);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
