import { lazy, Suspense } from 'react';
import { BudgetExchangeRateManager } from './BudgetExchangeRateManager';
import { BudgetMetrics } from './BudgetMetrics';
import { GroupBudgetSummaryPanel } from './GroupBudgetSummaryPanel';
import type { BudgetController } from '../../hooks/useBudgetController';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { TemplateController } from '../../hooks/useTemplateController';
import type { PdfExportSettings } from '../../types/auth';
import type { CurrencyCode, PdfThemeKey } from '../../types/budget';
import { useI18n } from '../../i18n';

const BudgetDocumentPreview = lazy(() =>
  import('./BudgetDocumentPreview').then((module) => ({ default: module.BudgetDocumentPreview })),
);

interface BudgetEditorViewProps {
  baseCurrency: CurrencyCode;
  budget: BudgetController;
  canManageWorkspaceMembers: boolean;
  canWriteBudgets: boolean;
  defaultPdfTheme: PdfThemeKey;
  entry: BudgetEntryController;
  entryCategoryOptions: Array<{ label: string; value: number }>;
  operations: OperationsController;
  onOpenShare: () => void;
  pdfExportSettings: PdfExportSettings;
  template: TemplateController;
  transactionCategoryOptions: Array<{ label: string; value: number }>;
}

export function BudgetEditorView({
  baseCurrency,
  budget,
  canManageWorkspaceMembers,
  canWriteBudgets,
  defaultPdfTheme,
  entry,
  entryCategoryOptions,
  operations,
  onOpenShare,
  pdfExportSettings,
  template,
  transactionCategoryOptions,
}: BudgetEditorViewProps) {
  const { t } = useI18n();
  const openSelectedBudgetSettings = () => {
    if (budget.selectedBudget !== null) {
      budget.openBudgetEditModal(budget.selectedBudget);
    }
  };
  const openSelectedBudgetSignatureSettings = () => {
    if (budget.selectedBudget !== null) {
      budget.openBudgetSignatureModal(budget.selectedBudget);
    }
  };
  const openSelectedBudgetInstallmentSettings = () => {
    if (budget.selectedBudget !== null) {
      budget.openBudgetInstallmentModal(budget.selectedBudget);
    }
  };

  return (
    <div className="budget-editor-shell">
      <BudgetMetrics
        selectedBudget={budget.selectedBudget}
        baseCurrency={baseCurrency}
        loading={budget.isBudgetDetailLoading}
      />
      <GroupBudgetSummaryPanel
        selectedBudget={budget.selectedBudget}
        baseCurrency={baseCurrency}
      />
      <div className="budget-rate-entry-strip">
        <div>
          <strong>{t('budgetExchangeRates')}</strong>
          <span>{t('budgetExchangeRateEntryHint')}</span>
        </div>
        <BudgetExchangeRateManager
          budgetId={budget.selectedBudget?.id ?? null}
          baseCurrency={budget.selectedBudget?.baseCurrency ?? baseCurrency}
          canWriteBudgets={canWriteBudgets}
          currencyOptions={operations.currencyCatalogOptions}
        />
      </div>
      <Suspense fallback={<div className="empty-line">{t('loadingBudget')}</div>}>
        <BudgetDocumentPreview
          selectedBudget={budget.selectedBudget}
          template={template.template}
          templateError={template.templateError}
          budgetError={budget.budgetError}
          baseCurrency={baseCurrency}
          canWriteBudgets={canWriteBudgets}
          defaultPdfTheme={defaultPdfTheme}
          entry={entry}
          operations={operations}
          isBudgetLoading={budget.isBudgetLoading}
          isBudgetDetailLoading={budget.isBudgetDetailLoading}
          isBudgetSaving={budget.isBudgetSaving}
          isTemplateLoading={template.isTemplateLoading}
          onEditBudget={budget.selectedBudget === null ? undefined : openSelectedBudgetSettings}
          onEditInstallments={
            budget.selectedBudget === null ? undefined : openSelectedBudgetInstallmentSettings
          }
          onEditSignature={
            budget.selectedBudget === null ? undefined : openSelectedBudgetSignatureSettings
          }
          onInlineHeaderSave={budget.handleBudgetHeaderSave}
          onOpenShare={canManageWorkspaceMembers ? onOpenShare : undefined}
          pdfExportSettings={pdfExportSettings}
          categoryOptions={entryCategoryOptions}
          transactionCategoryOptions={transactionCategoryOptions}
        />
      </Suspense>
    </div>
  );
}
