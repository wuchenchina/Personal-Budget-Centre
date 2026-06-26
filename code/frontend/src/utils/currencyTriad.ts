export interface CurrencyTriadKeys<TValues extends object> {
  amountKey: keyof TValues;
  rateKey: keyof TValues;
  targetKey: keyof TValues;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function syncCurrencyTriad<TValues extends object>(
  changedValues: Partial<TValues>,
  allValues: TValues,
  keys: CurrencyTriadKeys<TValues>,
): Partial<TValues> {
  const changedKeys = new Set(Object.keys(changedValues));
  const amount = allValues[keys.amountKey];
  const rate = allValues[keys.rateKey];
  const target = allValues[keys.targetKey];

  if (changedKeys.has(String(keys.targetKey))) {
    if (isFiniteNumber(target) && isFiniteNumber(rate) && rate > 0 && !isFiniteNumber(amount)) {
      return { [keys.amountKey]: roundMoney(target / rate) } as Partial<TValues>;
    }

    if (!isFiniteNumber(target) || !isFiniteNumber(amount) || amount <= 0) {
      return {};
    }

    const nextRate = roundRate(target / amount);

    return nextRate > 0 ? { [keys.rateKey]: nextRate } as Partial<TValues> : {};
  }

  if (changedKeys.has(String(keys.amountKey)) || changedKeys.has(String(keys.rateKey))) {
    if (changedKeys.has(String(keys.rateKey)) && isFiniteNumber(rate) && rate > 0 && isFiniteNumber(target) && !isFiniteNumber(amount)) {
      return { [keys.amountKey]: roundMoney(target / rate) } as Partial<TValues>;
    }

    if (isFiniteNumber(amount) && isFiniteNumber(rate) && rate > 0) {
      return { [keys.targetKey]: roundMoney(amount * rate) } as Partial<TValues>;
    }

    if (changedKeys.has(String(keys.amountKey)) && isFiniteNumber(amount) && amount > 0 && isFiniteNumber(target)) {
      const nextRate = roundRate(target / amount);

      return nextRate > 0 ? { [keys.rateKey]: nextRate } as Partial<TValues> : {};
    }
  }

  return {};
}

export function syncCurrencyTriadAfterProgrammaticChange<TValues extends object>(
  allValues: TValues,
  keys: CurrencyTriadKeys<TValues>,
): Partial<TValues> {
  const amount = allValues[keys.amountKey];
  const rate = allValues[keys.rateKey];
  const target = allValues[keys.targetKey];

  if (isFiniteNumber(amount) && isFiniteNumber(rate) && rate > 0) {
    return { [keys.targetKey]: roundMoney(amount * rate) } as Partial<TValues>;
  }

  if (isFiniteNumber(rate) && rate > 0 && isFiniteNumber(target)) {
    return { [keys.amountKey]: roundMoney(target / rate) } as Partial<TValues>;
  }

  if (isFiniteNumber(amount) && amount > 0 && isFiniteNumber(target)) {
    const nextRate = roundRate(target / amount);

    return nextRate > 0 ? { [keys.rateKey]: nextRate } as Partial<TValues> : {};
  }

  return {};
}
