import { apiGet, apiPost, apiUrl } from './http';
import type { BudgetExport, BudgetExportFormat, BudgetExportOptions } from '../types/budget';

interface ExportListResponse {
  exports: BudgetExport[];
}

interface ExportResponse {
  export: BudgetExport;
}

export function listBudgetExports(budgetId: number): Promise<BudgetExport[]> {
  return apiGet<ExportListResponse>(`/api/exports?budgetId=${budgetId}`).then(
    (payload) => payload.exports,
  );
}

export function getBudgetExportStatus(budgetId: number, exportId: number): Promise<BudgetExport> {
  return listBudgetExports(budgetId).then((exports) => {
    const item = exports.find((candidate) => candidate.id === exportId);
    if (!item) {
      throw new Error('Export job was not found.');
    }
    return item;
  });
}

export function createBudgetExport(
  budgetId: number,
  format: BudgetExportFormat,
  options: BudgetExportOptions = {},
): Promise<BudgetExport> {
  return apiPost<ExportResponse>('/api/exports', { budgetId, format, ...options }).then(
    (payload) => payload.export,
  );
}

export function exportDownloadUrl(item: BudgetExport): string {
  return apiUrl(item.downloadUrl);
}
