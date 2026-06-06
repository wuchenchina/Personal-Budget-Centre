import { Tag } from 'antd';
import { RefreshCcw } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { BudgetDetail } from '../../types/budget';
import { formatMoney } from '../../utils/currency';

interface ReconciliationSideSectionProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
}

export function ReconciliationSideSection({
  operations,
  selectedBudget,
}: ReconciliationSideSectionProps) {
  const currency = selectedBudget?.baseCurrency ?? 'CNY';

  return (
    <div className="side-section">
      <div className="side-title">
        <RefreshCcw size={16} />
        <span>Reconciliation</span>
      </div>
      <div className="operation-list">
        {selectedBudget === null ? (
          <div className="empty-line">Select a budget to compare rows.</div>
        ) : operations.isReconciliationLoading ? (
          <div className="empty-line">Loading reconciliation...</div>
        ) : operations.reconciliation.length === 0 ? (
          <div className="empty-line">No reconciliation difference.</div>
        ) : (
          operations.reconciliation.slice(0, 6).map((row) => (
            <div className="operation-list-item" key={`${row.budgetId}-${row.label}`}>
              <div className="operation-list-main">
                <span>{row.category ?? row.label}</span>
                <small>{row.label}</small>
              </div>
              <div className="reconciliation-grid">
                <small>Est. {formatMoney({ currency, amount: row.estimatedAmountBase })}</small>
                <small>Tx {formatMoney({ currency, amount: row.transactionTotalBase })}</small>
                <Tag color={Math.abs(row.differenceBase) < 0.01 ? 'green' : 'orange'}>
                  {formatMoney({ currency, amount: row.differenceBase })}
                </Tag>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
