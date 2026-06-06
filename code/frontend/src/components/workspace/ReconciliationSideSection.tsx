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
        <span>对账</span>
      </div>
      <div className="operation-list">
        {selectedBudget === null ? (
          <div className="empty-line">选择一个预算后查看差异。</div>
        ) : operations.isReconciliationLoading ? (
          <div className="empty-line">正在加载对账结果...</div>
        ) : operations.reconciliation.length === 0 ? (
          <div className="empty-line">暂无对账差异。</div>
        ) : (
          operations.reconciliation.slice(0, 6).map((row) => (
            <div className="operation-list-item" key={`${row.budgetId}-${row.label}`}>
              <div className="operation-list-main">
                <span>{row.category ?? row.label}</span>
                <small>{row.label}</small>
              </div>
              <div className="reconciliation-grid">
                <small>预算 {formatMoney({ currency, amount: row.estimatedAmountBase })}</small>
                <small>交易 {formatMoney({ currency, amount: row.transactionTotalBase })}</small>
                <Tag color={Math.abs(row.differenceBase) < 0.01 ? 'blue' : 'orange'}>
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
