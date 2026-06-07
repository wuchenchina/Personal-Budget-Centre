import { Alert } from 'antd';
import type { Workgroup } from '../../api/workgroups';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetDetail } from '../../types/budget';
import { CategorySideSection } from './CategorySideSection';
import { PasskeySideSection } from './PasskeySideSection';
import { ReconciliationSideSection } from './ReconciliationSideSection';
import { ShareSideSection } from './ShareSideSection';

interface OperationsSectionsProps {
  activeKey: string;
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  workspaceMembers: WorkspaceMember[];
  workgroups: Workgroup[];
  canWriteBudgets: boolean;
  canManageBudgetShares: boolean;
}

export function OperationsSections({
  activeKey,
  operations,
  selectedBudget,
  activeWorkspaceId,
  workspaceMembers,
  workgroups,
  canWriteBudgets,
  canManageBudgetShares,
}: OperationsSectionsProps) {
  const showCategories = activeKey === 'categories';
  const showReconciliation = activeKey === 'reconciliation';
  const showSecurity = activeKey === 'security';
  const showSharing = activeKey === 'sharing';

  return (
    <>
      {operations.operationsError ? (
        <div className="side-section">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}
      {showSharing ? (
        <ShareSideSection
          operations={operations}
          selectedBudget={selectedBudget}
          activeWorkspaceId={activeWorkspaceId}
          workspaceMembers={workspaceMembers}
          workgroups={workgroups}
          canManageBudgetShares={canManageBudgetShares}
        />
      ) : null}
      {showCategories ? (
        <CategorySideSection operations={operations} canWriteBudgets={canWriteBudgets} />
      ) : null}
      {showReconciliation ? (
        <ReconciliationSideSection operations={operations} selectedBudget={selectedBudget} />
      ) : null}
      {showSecurity ? <PasskeySideSection operations={operations} /> : null}
    </>
  );
}
