import { apiDelete, apiPatch, apiPost } from './http';
import type { BudgetDetail, BudgetInstallmentConfig, CurrencyCode } from '../types/budget';

interface BudgetResponse {
  budget: BudgetDetail;
}

export interface SaveBudgetItemPayload {
  categoryId?: number;
  label: string;
  bankFee?: number;
  budgetCurrency: CurrencyCode;
  budgetAmount?: number;
  budgetRate?: number;
  estimatedCurrency: CurrencyCode;
  estimatedAmount?: number;
  estimatedRate?: number;
  installmentConfig?: BudgetInstallmentConfig;
  sortOrder?: number;
}

export interface CreateBudgetItemPayload extends SaveBudgetItemPayload {
  budgetId: number;
}

export interface UpdateBudgetItemPayload extends SaveBudgetItemPayload {
  id: number;
}

export interface SaveTransactionPayload {
  categoryId?: number;
  transactionDate?: string | null;
  details: string;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  remark?: string | null;
  sortOrder?: number;
}

export interface CreateTransactionPayload extends SaveTransactionPayload {
  budgetId: number;
}

export interface UpdateTransactionPayload extends SaveTransactionPayload {
  id: number;
}

export function createBudgetItem(payload: CreateBudgetItemPayload): Promise<BudgetDetail> {
  return apiPost<BudgetResponse>('/api/budget-items', payload).then(
    (response) => response.budget,
  );
}

export function updateBudgetItem(payload: UpdateBudgetItemPayload): Promise<BudgetDetail> {
  return apiPatch<BudgetResponse>('/api/budget-items', payload).then(
    (response) => response.budget,
  );
}

export function deleteBudgetItem(id: number): Promise<BudgetDetail> {
  return apiDelete<BudgetResponse>('/api/budget-items', { id }).then(
    (response) => response.budget,
  );
}

export function createTransaction(payload: CreateTransactionPayload): Promise<BudgetDetail> {
  return apiPost<BudgetResponse>('/api/budget-transactions', payload).then(
    (response) => response.budget,
  );
}

export function updateTransaction(payload: UpdateTransactionPayload): Promise<BudgetDetail> {
  return apiPatch<BudgetResponse>('/api/budget-transactions', payload).then(
    (response) => response.budget,
  );
}

export function deleteTransaction(id: number): Promise<BudgetDetail> {
  return apiDelete<BudgetResponse>('/api/budget-transactions', { id }).then(
    (response) => response.budget,
  );
}
