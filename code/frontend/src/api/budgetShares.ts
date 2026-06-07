import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type {
  BudgetShare,
  BudgetSharePrincipalType,
  BudgetShareRole,
} from '../types/budget';

interface BudgetShareListResponse {
  shares: BudgetShare[];
}

export interface CreateBudgetSharePayload {
  budgetId: number;
  principalType: BudgetSharePrincipalType;
  principalId?: number;
  principalIdentifier?: string;
  role: BudgetShareRole;
  canExport: boolean;
  canReshare: boolean;
  expiresAt?: string | null;
}

export interface UpdateBudgetSharePayload {
  id: number;
  role: BudgetShareRole;
  canExport: boolean;
  canReshare: boolean;
  expiresAt?: string | null;
}

export function listBudgetShares(budgetId: number): Promise<BudgetShare[]> {
  return apiGet<BudgetShareListResponse>(`/api/budget-shares?budgetId=${budgetId}`).then(
    (payload) => payload.shares,
  );
}

export function createBudgetShare(payload: CreateBudgetSharePayload): Promise<BudgetShare[]> {
  return apiPost<BudgetShareListResponse>('/api/budget-shares', payload).then(
    (response) => response.shares,
  );
}

export function updateBudgetShare(payload: UpdateBudgetSharePayload): Promise<BudgetShare[]> {
  return apiPatch<BudgetShareListResponse>('/api/budget-shares', payload).then(
    (response) => response.shares,
  );
}

export function deleteBudgetShare(id: number): Promise<BudgetShare[]> {
  return apiDelete<BudgetShareListResponse>('/api/budget-shares', { id }).then(
    (response) => response.shares,
  );
}
