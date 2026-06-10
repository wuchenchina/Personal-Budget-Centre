import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type {
  BudgetDetail,
  BudgetInstallmentDisplayMode,
  BudgetInstallmentPeriodUnit,
  BudgetParticipant,
  BudgetParticipantMode,
  BudgetStatus,
  BudgetSummary,
  BudgetType,
  CurrencyCode,
  BudgetSignatureConfig,
  Visibility,
} from '../types/budget';

interface BudgetListResponse {
  budgets: BudgetSummary[];
}

interface BudgetResponse {
  budget: BudgetDetail;
}

export interface CreateBudgetPayload {
  workspaceId: number;
  title: string;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  budgetType?: BudgetType;
  participantMode?: BudgetParticipantMode;
  participants?: Array<Partial<BudgetParticipant>>;
  installmentDisplayMode?: BudgetInstallmentDisplayMode;
  installmentPeriodUnit?: BudgetInstallmentPeriodUnit;
  visibility: Visibility;
  status?: BudgetStatus;
  note?: string | null;
  signatureConfig?: BudgetSignatureConfig;
}

export interface UpdateBudgetPayload extends Omit<CreateBudgetPayload, 'workspaceId'> {
  id: number;
}

export function listBudgets(workspaceId: number): Promise<BudgetSummary[]> {
  return apiGet<BudgetListResponse>(`/api/budgets?workspaceId=${workspaceId}`).then(
    (payload) => payload.budgets,
  );
}

export function createBudget(payload: CreateBudgetPayload): Promise<BudgetDetail> {
  return apiPost<BudgetResponse>('/api/budgets', payload).then(
    (response) => response.budget,
  );
}

export function updateBudget(payload: UpdateBudgetPayload): Promise<BudgetDetail> {
  return apiPatch<BudgetResponse>('/api/budgets', payload).then(
    (response) => response.budget,
  );
}

export function deleteBudget(id: number): Promise<Record<string, never>> {
  return apiDelete<Record<string, never>>('/api/budgets', { id });
}

export function getBudgetDetail(id: number): Promise<BudgetDetail> {
  return apiGet<BudgetResponse>(`/api/budget?id=${id}`).then(
    (payload) => payload.budget,
  );
}
