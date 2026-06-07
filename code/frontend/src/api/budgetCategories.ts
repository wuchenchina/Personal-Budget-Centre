import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { BudgetCategory, CurrencyCode } from '../types/budget';

interface CategoryListResponse {
  categories: BudgetCategory[];
}

export interface SaveBudgetCategoryPayload {
  id?: number;
  workspaceId?: number;
  name: string;
  defaultCurrency?: CurrencyCode | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateCategoryAliasPayload {
  workspaceId: number;
  categoryId: number;
  alias: string;
}

export function listBudgetCategories(workspaceId: number): Promise<BudgetCategory[]> {
  return apiGet<CategoryListResponse>(`/api/budget-categories?workspaceId=${workspaceId}`).then(
    (payload) => payload.categories,
  );
}

export function createBudgetCategory(
  payload: SaveBudgetCategoryPayload & { workspaceId: number },
): Promise<BudgetCategory[]> {
  return apiPost<CategoryListResponse>('/api/budget-categories', payload).then(
    (response) => response.categories,
  );
}

export function updateBudgetCategory(
  payload: SaveBudgetCategoryPayload & { id: number },
): Promise<BudgetCategory[]> {
  return apiPatch<CategoryListResponse>('/api/budget-categories', payload).then(
    (response) => response.categories,
  );
}

export function deleteBudgetCategory(id: number): Promise<BudgetCategory[]> {
  return apiDelete<CategoryListResponse>('/api/budget-categories', { id }).then(
    (response) => response.categories,
  );
}

export function deleteBudgetCategories(ids: number[]): Promise<BudgetCategory[]> {
  return apiDelete<CategoryListResponse>('/api/budget-categories', { ids }).then(
    (response) => response.categories,
  );
}

export function createCategoryAlias(
  payload: CreateCategoryAliasPayload,
): Promise<BudgetCategory[]> {
  return apiPost<CategoryListResponse>('/api/budget-category-aliases', payload).then(
    (response) => response.categories,
  );
}

export function deleteCategoryAlias(id: number): Promise<BudgetCategory[]> {
  return apiDelete<CategoryListResponse>('/api/budget-category-aliases', { id }).then(
    (response) => response.categories,
  );
}
