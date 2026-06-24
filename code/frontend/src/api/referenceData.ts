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

export interface ListCurrenciesParams {
  workspaceId?: number | null;
  budgetId?: number | null;
}

export function listCurrencies(params: ListCurrenciesParams = {}): Promise<Currency[]> {
  const search = new URLSearchParams();
  if (params.workspaceId !== undefined && params.workspaceId !== null) {
    search.set('workspaceId', String(params.workspaceId));
  }
  if (params.budgetId !== undefined && params.budgetId !== null) {
    search.set('budgetId', String(params.budgetId));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';

  return apiGet<CurrencyListResponse>(`/api/currencies${suffix}`).then(
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
