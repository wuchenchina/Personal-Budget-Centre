import { Statistic } from 'antd';
import { defaultBudgetTotals } from '../../config/appConfig';
import type { BudgetDetail, CurrencyCode } from '../../types/budget';

interface BudgetMetricsProps {
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  loading: boolean;
}

export function BudgetMetrics({ selectedBudget, baseCurrency, loading }: BudgetMetricsProps) {
  const activeCurrency = selectedBudget?.baseCurrency ?? baseCurrency;
  const activeTotals = selectedBudget?.totals ?? defaultBudgetTotals;

  return (
    <section className="metric-grid" aria-label="Budget totals">
      <div className="metric-panel">
        <Statistic
          title="Budget Total"
          value={activeTotals.totalBudgetBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title="Estimated Actuals"
          value={activeTotals.totalEstimatedBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title="Variance"
          value={activeTotals.totalVarianceBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title="Transactions"
          value={activeTotals.transactionCount}
          loading={loading}
        />
      </div>
    </section>
  );
}
