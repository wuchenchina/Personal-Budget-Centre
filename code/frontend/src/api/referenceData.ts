import { apiDelete, apiGet, apiPost } from './http';
import type { Currency } from '../types/budget';

interface CurrencyListResponse {
  currencies: Currency[];
}

interface CurrencyResponse {
  currency: Currency;
}

export interface CreateCurrencyPayload {
  code: string;
  name: string;
  symbol?: string;
  decimalPlaces: number;
}

export function listCurrencies(): Promise<Currency[]> {
  return apiGet<CurrencyListResponse>('/api/currencies').then(
    (payload) => payload.currencies,
  );
}

export function createCurrency(payload: CreateCurrencyPayload): Promise<Currency> {
  return apiPost<CurrencyResponse>('/api/currencies', payload).then(
    (response) => response.currency,
  );
}

export function deleteCurrency(id: number): Promise<Currency[]> {
  return apiDelete<CurrencyListResponse>('/api/currencies', { id }).then(
    (payload) => payload.currencies,
  );
}
