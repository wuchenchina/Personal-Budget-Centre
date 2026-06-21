import { Statistic } from 'antd';
import { defaultBudgetTotals } from '../../config/appConfig';
import { useI18n } from '../../i18n';
import type { BudgetDetail, CurrencyCode } from '../../types/budget';
import { effectiveBudgetTotals } from '../../utils/budgetTemplate';

interface BudgetMetricsProps {
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  loading: boolean;
}

export function BudgetMetrics({ selectedBudget, baseCurrency, loading }: BudgetMetricsProps) {
  const { t } = useI18n();
  const activeCurrency = selectedBudget?.baseCurrency ?? baseCurrency;
  const activeTotals = selectedBudget === null
    ? defaultBudgetTotals
    : {
        ...selectedBudget.totals,
        ...effectiveBudgetTotals(selectedBudget),
      };

  return (
    <section className="metric-grid" aria-label={t('totalBudget')}>
      <div className="metric-panel">
        <Statistic
          title={t('totalBudgetLabel')}
          value={activeTotals.totalBudgetBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title={t('estimatedActuals')}
          value={activeTotals.totalEstimatedBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title={t('variance')}
          value={activeTotals.totalVarianceBase}
          precision={2}
          prefix={activeCurrency}
          loading={loading}
        />
      </div>
      <div className="metric-panel">
        <Statistic
          title={t('transactionCount')}
          value={activeTotals.transactionCount}
          loading={loading}
        />
      </div>
    </section>
  );
}
