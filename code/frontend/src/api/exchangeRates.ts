import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { BudgetExchangeRate, CurrencyCode, CurrencyRate } from '../types/budget';

interface ExchangeRateListResponse {
  rates: CurrencyRate[];
}

interface ExchangeRateResponse {
  rate: CurrencyRate;
}

export interface BankReferenceRateBoardRow {
  currency: CurrencyCode;
  currencyName: string;
  currencySymbol: string;
  baseCurrency: 'HKD';
  customerSellRate: number;
  customerBuyRate: number;
  rateDate: string;
  providerUpdatedAt: string | null;
  fetchedAt: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

interface BankReferenceRateBoardResponse {
  board: {
    baseCurrency: 'HKD';
    source: 'bank_reference';
    sourceName: string;
    sourceUrl: string | null;
    rates: BankReferenceRateBoardRow[];
  };
}

interface AccountExchangeRateListResponse {
  rates: CurrencyRate[];
  bankReferenceSupportedCodes: CurrencyCode[];
}

interface BudgetExchangeRateListResponse {
  rates: BudgetExchangeRate[];
}

interface BudgetExchangeRateResponse {
  rate: BudgetExchangeRate;
}

interface BudgetExchangeRateSyncResponse {
  applied: BudgetExchangeRate[];
  skipped: Array<{ from: CurrencyCode; to: CurrencyCode; reason: string }>;
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
    source: 'bank_reference';
    sourceName: string;
    sourceUrl: string | null;
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
  source?: 'manual' | 'budget_default' | 'bank_reference';
}

export interface CreateManualExchangeRatePayload {
  workspaceId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  note?: string | null;
}

export interface CreateBudgetExchangeRatePayload {
  id?: number;
  budgetId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  note?: string | null;
}

export interface SyncBudgetExchangeRatesPayload {
  budgetId: number;
  pairs: Array<{
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    rateDate?: string;
  }>;
}

export interface AccountExchangeRatePayload {
  id?: number;
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

export function listBankReferenceRateBoard(params: { workspaceId?: number | null; rateDate?: string } = {}) {
  const search = new URLSearchParams();
  if (params.workspaceId !== undefined && params.workspaceId !== null) {
    search.set('workspaceId', String(params.workspaceId));
  }
  if (params.rateDate !== undefined) {
    search.set('rateDate', params.rateDate);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';

  return apiGet<BankReferenceRateBoardResponse>(`/api/exchange-rates/reference/board${suffix}`).then(
    (response) => response.board,
  );
}

export function listAccountExchangeRates(): Promise<AccountExchangeRateListResponse> {
  return apiGet<AccountExchangeRateListResponse>('/api/account-exchange-rates');
}

export function createAccountExchangeRate(payload: AccountExchangeRatePayload): Promise<CurrencyRate> {
  return apiPost<ExchangeRateResponse>('/api/account-exchange-rates', payload).then(
    (response) => response.rate,
  );
}

export function updateAccountExchangeRate(payload: AccountExchangeRatePayload): Promise<CurrencyRate> {
  return apiPatch<ExchangeRateResponse>('/api/account-exchange-rates', payload).then(
    (response) => response.rate,
  );
}

export function deleteAccountExchangeRate(id: number): Promise<CurrencyRate[]> {
  return apiDelete<ExchangeRateListResponse>('/api/account-exchange-rates', { id }).then(
    (response) => response.rates,
  );
}

export function listBudgetExchangeRates(budgetId: number): Promise<BudgetExchangeRate[]> {
  return apiGet<BudgetExchangeRateListResponse>(`/api/budget-exchange-rates?budgetId=${budgetId}`).then(
    (response) => response.rates,
  );
}

export function createBudgetExchangeRate(
  payload: CreateBudgetExchangeRatePayload,
): Promise<BudgetExchangeRate> {
  return apiPost<BudgetExchangeRateResponse>('/api/budget-exchange-rates', payload).then(
    (response) => response.rate,
  );
}

export function updateBudgetExchangeRate(
  payload: CreateBudgetExchangeRatePayload,
): Promise<BudgetExchangeRate> {
  return apiPatch<BudgetExchangeRateResponse>('/api/budget-exchange-rates', payload).then(
    (response) => response.rate,
  );
}

export function deleteBudgetExchangeRate(id: number): Promise<BudgetExchangeRate[]> {
  return apiDelete<BudgetExchangeRateListResponse>('/api/budget-exchange-rates', { id }).then(
    (response) => response.rates,
  );
}

export function syncBudgetExchangeRatesFromGlobal(
  payload: SyncBudgetExchangeRatesPayload,
): Promise<BudgetExchangeRateSyncResponse> {
  return apiPost<BudgetExchangeRateSyncResponse>('/api/budget-exchange-rates/sync-global', payload);
}

export function convertCurrency(payload: ConvertCurrencyPayload): Promise<ConversionResponse['conversion']> {
  return apiPost<ConversionResponse>('/api/exchange-rates/convert', payload).then(
    (response) => response.conversion,
  );
}

export function refreshBankReferenceRates(workspaceId: number): Promise<ProviderRefreshResponse['provider']> {
  return apiPost<ProviderRefreshResponse>('/api/exchange-rates/reference/refresh', {
    workspaceId,
  }).then((response) => response.provider);
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
