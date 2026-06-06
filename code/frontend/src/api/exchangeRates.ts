import { apiGet, apiPost } from './http';
import type { CurrencyCode, CurrencyRate } from '../types/budget';

interface ExchangeRateListResponse {
  rates: CurrencyRate[];
}

interface ExchangeRateResponse {
  rate: CurrencyRate;
}

interface ConversionResponse {
  conversion: {
    from: CurrencyCode;
    to: CurrencyCode;
    amount: number;
    rate: number;
    convertedAmount: number;
    rateDate: string | null;
    source: string;
    conversionPath: string;
  };
}

interface ProviderRefreshResponse {
  provider: {
    source: 'bochk' | 'mastercard';
    sourceName: string;
    sourceUrl: string;
    rateDate: string;
    saved: number;
    skipped: CurrencyCode[];
    rates: CurrencyRate[];
  };
}

export interface ListExchangeRatesParams {
  workspaceId: number;
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  rateDate?: string;
  source?: 'manual' | 'budget_default' | 'bochk' | 'mastercard';
}

export interface CreateManualExchangeRatePayload {
  workspaceId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  note?: string | null;
}

export interface ConvertCurrencyPayload {
  workspaceId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amount: number;
  rateDate?: string;
}

export interface RefreshMastercardPayload {
  workspaceId: number;
  toCurrency?: CurrencyCode;
  currencies?: CurrencyCode[];
  rateDate?: string;
  bankFee?: number;
}

export function listExchangeRates(params: ListExchangeRatesParams): Promise<CurrencyRate[]> {
  return apiGet<ExchangeRateListResponse>(`/api/exchange-rates?${queryString(params)}`).then(
    (response) => response.rates,
  );
}

export function createManualExchangeRate(
  payload: CreateManualExchangeRatePayload,
): Promise<CurrencyRate> {
  return apiPost<ExchangeRateResponse>('/api/exchange-rates', payload).then(
    (response) => response.rate,
  );
}

export function convertCurrency(payload: ConvertCurrencyPayload): Promise<ConversionResponse['conversion']> {
  return apiPost<ConversionResponse>('/api/exchange-rates/convert', payload).then(
    (response) => response.conversion,
  );
}

export function refreshBochkRates(workspaceId: number): Promise<ProviderRefreshResponse['provider']> {
  return apiPost<ProviderRefreshResponse>('/api/exchange-rates/bochk/refresh', {
    workspaceId,
  }).then((response) => response.provider);
}

export function refreshMastercardRates(
  payload: RefreshMastercardPayload,
): Promise<ProviderRefreshResponse['provider']> {
  return apiPost<ProviderRefreshResponse>('/api/exchange-rates/mastercard/refresh', payload).then(
    (response) => response.provider,
  );
}

function queryString(params: ListExchangeRatesParams): string {
  const search = new URLSearchParams();
  search.set('workspaceId', String(params.workspaceId));

  if (params.fromCurrency !== undefined) {
    search.set('fromCurrency', params.fromCurrency);
  }

  if (params.toCurrency !== undefined) {
    search.set('toCurrency', params.toCurrency);
  }

  if (params.rateDate !== undefined) {
    search.set('rateDate', params.rateDate);
  }

  if (params.source !== undefined) {
    search.set('source', params.source);
  }

  return search.toString();
}
