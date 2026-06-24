import { Alert } from 'antd';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { BudgetDetail } from '../../types/budget';
import { CategorySideSection } from './CategorySideSection';
import { CurrencySideSection } from './CurrencySideSection';
import { ExchangeRateSideSection } from './ExchangeRateSideSection';
import { ShareSideSection } from './ShareSideSection';

interface OperationsSectionsProps {
  activeKey: string;
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  isSystemAdmin: boolean;
  canManageExchangeRates: boolean;
  canManageBudgetShares: boolean;
}

export function OperationsSections({
  activeKey,
  operations,
  selectedBudget,
  activeWorkspaceId,
  isSystemAdmin,
  canManageExchangeRates,
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
          canManageBudgetShares={canManageBudgetShares}
        />
      ) : null}
      {showCategories ? <CategorySideSection operations={operations} /> : null}
      {showCategories ? (
        <CurrencySideSection
          isSystemAdmin={isSystemAdmin}
          operations={operations}
        />
      ) : null}
      {showRates ? (
        <ExchangeRateSideSection
          activeWorkspaceId={activeWorkspaceId}
          canManageExchangeRates={canManageExchangeRates}
          operations={operations}
        />
      ) : null}
    </>
  );
}
