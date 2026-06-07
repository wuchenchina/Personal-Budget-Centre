import { Alert } from 'antd';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetDetail } from '../../types/budget';
import { CategorySideSection } from './CategorySideSection';
import { ExchangeRateSideSection } from './ExchangeRateSideSection';
import { ShareSideSection } from './ShareSideSection';

interface OperationsSectionsProps {
  activeKey: string;
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  workspaceMembers: WorkspaceMember[];
  canWriteBudgets: boolean;
  canManageBudgetShares: boolean;
}

export function OperationsSections({
  activeKey,
  operations,
  selectedBudget,
  activeWorkspaceId,
  workspaceMembers,
  canWriteBudgets,
  canManageBudgetShares,
}: OperationsSectionsProps) {
  const showCategories = activeKey === 'categories';
  const showRates = activeKey === 'rates';
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
          canManageBudgetShares={canManageBudgetShares}
        />
      ) : null}
      {showCategories ? (
        <CategorySideSection operations={operations} canWriteBudgets={canWriteBudgets} />
      ) : null}
      {showRates ? (
        <ExchangeRateSideSection
          activeWorkspaceId={activeWorkspaceId}
          operations={operations}
        />
      ) : null}
    </>
  );
}
