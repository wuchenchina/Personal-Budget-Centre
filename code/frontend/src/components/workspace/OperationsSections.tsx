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
  const showAll = activeKey === 'dashboard';
  const showSecurity = showAll || activeKey === 'security';
  const showCurrencies = showAll || activeKey === 'currencies';
  const showExports = showAll || activeKey === 'exports';

  return (
    <>
      {operations.operationsError ? (
        <div className="side-section">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}
      {showSecurity ? (
        <ShareSideSection
          operations={operations}
          selectedBudget={selectedBudget}
          activeWorkspaceId={activeWorkspaceId}
          workspaceMembers={workspaceMembers}
          workgroups={workgroups}
          canManageBudgetShares={canManageBudgetShares}
        />
      ) : null}
      {showCurrencies ? (
        <>
          <CategorySideSection operations={operations} canWriteBudgets={canWriteBudgets} />
          <ReconciliationSideSection operations={operations} selectedBudget={selectedBudget} />
        </>
      ) : null}
      {showExports ? (
        <ExportSideSection operations={operations} selectedBudget={selectedBudget} />
      ) : null}
      {showSecurity ? <PasskeySideSection operations={operations} /> : null}
    </>
  );
}
