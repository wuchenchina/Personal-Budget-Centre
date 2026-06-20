import { lazy, Suspense } from 'react';
import { Alert, Modal } from 'antd';
import type { BookkeepingController } from '../../hooks/useBookkeepingController';
import type { BudgetController } from '../../hooks/useBudgetController';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import { useI18n } from '../../i18n';
import type { CurrencyCode } from '../../types/budget';
import { ShareSideSection } from '../workspace/ShareSideSection';
import { BookkeepingRecordModal } from '../budget/BookkeepingRecordModal';

const BudgetCreateModal = lazy(() =>
  import('../budget/BudgetCreateModal')
    .then((module) => ({ default: module.BudgetCreateModal })),
);
const BudgetInstallmentModal = lazy(() =>
  import('../budget/BudgetInstallmentModal')
    .then((module) => ({ default: module.BudgetInstallmentModal })),
);
const BudgetItemModal = lazy(() =>
  import('../budget/BudgetItemModal')
    .then((module) => ({ default: module.BudgetItemModal })),
);
const BudgetSignatureModal = lazy(() =>
  import('../budget/BudgetSignatureModal')
    .then((module) => ({ default: module.BudgetSignatureModal })),
);
const TransactionModal = lazy(() =>
  import('../budget/TransactionModal')
    .then((module) => ({ default: module.TransactionModal })),
);
const WorkspaceCreateModal = lazy(() =>
  import('../workspace/WorkspaceCreateModal')
    .then((module) => ({ default: module.WorkspaceCreateModal })),
);
const WorkspaceEditModal = lazy(() =>
  import('../workspace/WorkspaceEditModal')
    .then((module) => ({ default: module.WorkspaceEditModal })),
);
const WorkspaceMemberModal = lazy(() =>
  import('../workspace/WorkspaceMemberModal')
    .then((module) => ({ default: module.WorkspaceMemberModal })),
);

interface AuthenticatedModalsProps {
  baseCurrency: CurrencyCode;
  bookkeeping: BookkeepingController;
  bookkeepingCategoryOptions: Array<{ label: string; value: string }>;
  budget: BudgetController;
  budgetEntry: BudgetEntryController;
  budgetItemPresetCategoryOptions: Array<{ label: string; value: number }>;
  canManageWorkspaceMembers: boolean;
  canWriteBudgets: boolean;
  isShareModalOpen: boolean;
  onShareModalOpenChange: (open: boolean) => void;
  operations: OperationsController;
  transactionCategoryOptions: Array<{ label: string; value: number }>;
  workspace: WorkspaceController;
}

export function AuthenticatedModals({
  baseCurrency,
  bookkeeping,
  bookkeepingCategoryOptions,
  budget,
  budgetEntry,
  budgetItemPresetCategoryOptions,
  canManageWorkspaceMembers,
  canWriteBudgets,
  isShareModalOpen,
  onShareModalOpenChange,
  operations,
  transactionCategoryOptions,
  workspace,
}: AuthenticatedModalsProps) {
  const { t } = useI18n();

  return (
    <>
      <Suspense fallback={null}>
        {budget.isBudgetModalOpen ? (
          <BudgetCreateModal
            form={budget.budgetForm}
            open={budget.isBudgetModalOpen}
            isEditing={budget.editingBudgetId !== null}
            error={budget.budgetError}
            workspaceOptions={workspace.workspaceOptions}
            confirmLoading={budget.isBudgetSaving}
            onCancel={() => budget.setIsBudgetModalOpen(false)}
            onOk={budget.handleBudgetSave}
          />
        ) : null}
        {budget.isSignatureModalOpen ? (
          <BudgetSignatureModal
            form={budget.budgetForm}
            open={budget.isSignatureModalOpen}
            error={budget.budgetError}
            workspaceMembers={workspace.workspaceMembers}
            confirmLoading={budget.isBudgetSaving}
            onCancel={() => budget.setIsSignatureModalOpen(false)}
            onOk={budget.handleBudgetSignatureSave}
          />
        ) : null}
        {budget.isInstallmentModalOpen ? (
          <BudgetInstallmentModal
            form={budget.budgetForm}
            selectedBudget={budget.selectedBudget}
            open={budget.isInstallmentModalOpen}
            error={budget.budgetError}
            canWriteBudgets={canWriteBudgets}
            confirmLoading={budget.isBudgetSaving}
            isEntrySaving={budgetEntry.isBudgetItemSaving}
            onCancel={() => budget.setIsInstallmentModalOpen(false)}
            onClearHistory={budgetEntry.handleInstallmentHistoryClear}
            onOk={budget.handleBudgetInstallmentSave}
            onResetAmounts={budgetEntry.handleInstallmentAmountsReset}
          />
        ) : null}
        {budgetEntry.isBudgetItemModalOpen ? (
          <BudgetItemModal
            form={budgetEntry.budgetItemForm}
            editingItem={budgetEntry.editingBudgetItem}
            open={budgetEntry.isBudgetItemModalOpen}
            error={budgetEntry.entryError}
            categoryOptions={budgetItemPresetCategoryOptions}
            baseCurrency={budget.selectedBudget?.baseCurrency ?? baseCurrency}
            focus={budgetEntry.budgetItemModalFocus}
            pricingEnabled={budget.selectedBudget?.pricingEnabled ?? false}
            participantMode={budget.selectedBudget?.participantMode ?? 'solo'}
            participants={budget.selectedBudget?.participants ?? []}
            transactions={budget.selectedBudget?.transactions ?? []}
            confirmLoading={budgetEntry.isBudgetItemSaving}
            onRefreshRates={budgetEntry.handleBudgetItemRateRefresh}
            onCancel={budgetEntry.closeBudgetItemModal}
            onOk={budgetEntry.handleBudgetItemSave}
          />
        ) : null}
        {budgetEntry.isTransactionModalOpen ? (
          <TransactionModal
            form={budgetEntry.transactionForm}
            editingTransaction={budgetEntry.editingTransaction}
            open={budgetEntry.isTransactionModalOpen}
            error={budgetEntry.entryError}
            categoryOptions={transactionCategoryOptions}
            baseCurrency={budget.selectedBudget?.baseCurrency ?? baseCurrency}
            pricingEnabled={budget.selectedBudget?.pricingEnabled ?? false}
            participantMode={budget.selectedBudget?.participantMode ?? 'solo'}
            participants={budget.selectedBudget?.participants ?? []}
            items={budget.selectedBudget?.items ?? []}
            confirmLoading={budgetEntry.isTransactionSaving}
            onCategoryChange={budgetEntry.handleTransactionCategoryChange}
            onRefreshRates={budgetEntry.handleTransactionRateRefresh}
            onReferenceConvert={budgetEntry.handleTransactionReferenceConvert}
            onValuesChange={budgetEntry.clearEntryError}
            onCancel={budgetEntry.closeTransactionModal}
            onOk={budgetEntry.handleTransactionSave}
          />
        ) : null}
        <BookkeepingRecordModal
          form={bookkeeping.form}
          editingRecord={bookkeeping.editingRecord}
          open={bookkeeping.modalOpen}
          error={bookkeeping.error}
          categoryOptions={bookkeepingCategoryOptions}
          baseCurrency={budget.selectedBudget?.baseCurrency ?? baseCurrency}
          confirmLoading={bookkeeping.saving}
          onValuesChange={() => undefined}
          onCancel={bookkeeping.closeModal}
          onOk={bookkeeping.saveRecord}
        />
        {workspace.isWorkspaceModalOpen ? (
          <WorkspaceCreateModal
            form={workspace.workspaceForm}
            open={workspace.isWorkspaceModalOpen}
            baseCurrency={baseCurrency}
            confirmLoading={workspace.isWorkspaceCreating}
            onCancel={() => {
              workspace.setIsWorkspaceModalOpen(false);
              workspace.workspaceForm.resetFields();
            }}
            onOk={workspace.handleWorkspaceCreate}
          />
        ) : null}
        {workspace.isWorkspaceMemberModalOpen ? (
          <WorkspaceMemberModal
            form={workspace.workspaceMemberForm}
            open={workspace.isWorkspaceMemberModalOpen}
            error={workspace.workspaceMemberError}
            confirmLoading={workspace.isWorkspaceMemberSaving}
            onCancel={() => {
              workspace.setIsWorkspaceMemberModalOpen(false);
              workspace.workspaceMemberForm.resetFields();
            }}
            onOk={workspace.handleWorkspaceMemberAdd}
          />
        ) : null}
        {workspace.isWorkspaceEditModalOpen ? (
          <WorkspaceEditModal
            form={workspace.workspaceEditForm}
            workspace={workspace.activeWorkspace}
            open={workspace.isWorkspaceEditModalOpen}
            error={workspace.workspaceError}
            confirmLoading={workspace.isWorkspaceUpdating}
            onCancel={() => {
              workspace.setIsWorkspaceEditModalOpen(false);
              workspace.workspaceEditForm.resetFields();
            }}
            onOk={workspace.handleWorkspaceUpdate}
          />
        ) : null}
      </Suspense>
      <Modal
        destroyOnClose
        footer={null}
        open={isShareModalOpen}
        title={t('shareBudget')}
        width={760}
        onCancel={() => onShareModalOpenChange(false)}
      >
        {operations.operationsError ? (
          <Alert
            className="modal-error"
            type="error"
            showIcon
            message={operations.operationsError}
          />
        ) : null}
        <ShareSideSection
          operations={operations}
          selectedBudget={budget.selectedBudget}
          canManageBudgetShares={canManageWorkspaceMembers}
        />
      </Modal>
    </>
  );
}
