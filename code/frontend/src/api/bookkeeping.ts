import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { BookkeepingRecord, CurrencyCode, TransactionType } from '../types/budget';

interface BookkeepingRecordsResponse {
  records: BookkeepingRecord[];
}

interface BookkeepingRecordResponse {
  record: BookkeepingRecord;
}

interface CreateBookkeepingRecordResponse extends BookkeepingRecordResponse {
  generatedIncomeRecord?: BookkeepingRecord;
}

interface DeleteBookkeepingRecordResponse {
  id: number;
}

export interface SaveBookkeepingRecordPayload {
  transactionType: TransactionType;
  recordDate?: string | null;
  orderReference?: string | null;
  details: string;
  categoryLabel?: string | null;
  sourceAccountName?: string | null;
  destinationAccountName?: string | null;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  targetBaseAmount?: number | null;
  rateScope?: 'item' | 'budget_default';
  destinationCurrency?: CurrencyCode;
  destinationAmount?: number | null;
  destinationRate?: number;
  remark?: string | null;
  sortOrder?: number;
}

export interface CreateBookkeepingRecordPayload extends SaveBookkeepingRecordPayload {
  budgetId: number;
  createLoanIncome?: boolean;
}

export interface UpdateBookkeepingRecordPayload extends SaveBookkeepingRecordPayload {
  id: number;
}

export function listBookkeepingRecords(budgetId: number): Promise<BookkeepingRecord[]> {
  return apiGet<BookkeepingRecordsResponse>(`/api/bookkeeping-records?budgetId=${budgetId}`).then(
    (response) => response.records,
  );
}

export function createBookkeepingRecord(
  payload: CreateBookkeepingRecordPayload,
): Promise<BookkeepingRecord[]> {
  return apiPost<CreateBookkeepingRecordResponse>('/api/bookkeeping-records', payload).then(
    (response) => response.generatedIncomeRecord === undefined
      ? [response.record]
      : [response.record, response.generatedIncomeRecord],
  );
}

export function updateBookkeepingRecord(
  payload: UpdateBookkeepingRecordPayload,
): Promise<BookkeepingRecord> {
  return apiPatch<BookkeepingRecordResponse>('/api/bookkeeping-records', payload).then(
    (response) => response.record,
  );
}

export function deleteBookkeepingRecord(id: number): Promise<number> {
  return apiDelete<DeleteBookkeepingRecordResponse>('/api/bookkeeping-records', { id }).then(
    (response) => response.id,
  );
}
