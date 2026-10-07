import { useI18n } from '../../i18n';
import type { BudgetSummary } from '../../types/budget';
import { incomeSummary } from '../../utils/expectedIncome';
import { formatMoney } from '../../utils/currency';

export function ExpectedIncomeSummary({ budget, embedded = false }: { budget: BudgetSummary | null; embedded?: boolean }) {
  const { t } = useI18n();
  if (!budget) return null;
  const summary = incomeSummary(budget);
  const metric = (label: string, amount: number) => <div className="metric-mini"><span>{label}</span><strong>{formatMoney({ currency: budget.baseCurrency, amount })}</strong></div>;
  return (
    <section className={embedded ? 'income-summary' : 'project-panel income-summary'} aria-label={t('incomeFundingSummary')}>
      <div className="project-panel-heading"><strong>{t('incomeFundingSummary')}</strong></div>
      <div className="income-summary-grid">
        {metric(t('expectedMonthlyIncome'), summary.monthly)}
        {metric(t('incomeOneOffTotal'), summary.oneOff)}
        {metric(budget.startDate && budget.endDate ? t('expectedPeriodIncome') : t('incomeMonthTotal'), summary.total)}
        {metric(t('incomePlannedExpense'), summary.expenses)}
        {metric(summary.balance < 0 ? t('incomeFundingGap') : summary.balance > 0 ? t('incomeFundingSurplus') : t('incomeFundingBalanced'), Math.abs(summary.balance))}
      </div>
      <p>{t('incomeProjectionHelp')}</p><p>{t('incomeFundingHelp')}</p>
    </section>
  );
}
