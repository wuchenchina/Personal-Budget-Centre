import { Alert } from 'antd';
import type { Workgroup } from '../../api/workgroups';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetDetail } from '../../types/budget';
import { CategorySideSection } from './CategorySideSection';
import { ExportSideSection } from './ExportSideSection';
import { PasskeySideSection } from './PasskeySideSection';
import { ReconciliationSideSection } from './ReconciliationSideSection';
import { ShareSideSection } from './ShareSideSection';

interface OperationsSectionsProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  workspaceMembers: WorkspaceMember[];
  workgroups: Workgroup[];
  canWriteBudgets: boolean;
  canManageBudgetShares: boolean;
}

export function OperationsSections({
  operations,
  selectedBudget,
  activeWorkspaceId,
  workspaceMembers,
  workgroups,
  canWriteBudgets,
  canManageBudgetShares,
}: OperationsSectionsProps) {
  return (
    <>
      {operations.operationsError ? (
        <div className="side-section">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}
      <ShareSideSection
        operations={operations}
        selectedBudget={selectedBudget}
        activeWorkspaceId={activeWorkspaceId}
        workspaceMembers={workspaceMembers}
        workgroups={workgroups}
        canManageBudgetShares={canManageBudgetShares}
      />
      <CategorySideSection operations={operations} canWriteBudgets={canWriteBudgets} />
      <ReconciliationSideSection operations={operations} selectedBudget={selectedBudget} />
      <ExportSideSection operations={operations} selectedBudget={selectedBudget} />
      <PasskeySideSection operations={operations} />
    </>
  );
}
