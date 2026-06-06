import { apiGet } from './http';
import type { Currency } from '../types/budget';

interface CurrencyListResponse {
  currencies: Currency[];
}

export function listCurrencies(): Promise<Currency[]> {
  return apiGet<CurrencyListResponse>('/api/currencies').then(
    (payload) => payload.currencies,
  );
}
