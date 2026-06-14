import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { BookkeepingRecord, CurrencyCode, TransactionType } from '../types/budget';

interface BookkeepingRecordsResponse {
  records: BookkeepingRecord[];
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
  destinationCurrency?: CurrencyCode;
  destinationAmount?: number | null;
  destinationRate?: number;
  remark?: string | null;
  sortOrder?: number;
}

export interface CreateBookkeepingRecordPayload extends SaveBookkeepingRecordPayload {
  budgetId: number;
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
  return apiPost<BookkeepingRecordsResponse>('/api/bookkeeping-records', payload).then(
    (response) => response.records,
  );
}

export function updateBookkeepingRecord(
  payload: UpdateBookkeepingRecordPayload,
): Promise<BookkeepingRecord[]> {
  return apiPatch<BookkeepingRecordsResponse>('/api/bookkeeping-records', payload).then(
    (response) => response.records,
  );
}

export function deleteBookkeepingRecord(id: number): Promise<BookkeepingRecord[]> {
  return apiDelete<BookkeepingRecordsResponse>('/api/bookkeeping-records', { id }).then(
    (response) => response.records,
  );
}
