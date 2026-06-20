import { Button, Empty, Skeleton, Space, Tag } from 'antd';
import { ArrowRight, BriefcaseBusiness, CalendarRange, Plus, ReceiptText } from 'lucide-react';
import { budgetStatusColors } from '../../config/appConfig';
import { budgetStatusLabelsByLanguage, useI18n } from '../../i18n';
import type { BudgetDetail, BudgetSummary, CurrencyCode } from '../../types/budget';
import { formatBudgetPeriod } from '../../utils/budgetPeriod';
import { formatMoney } from '../../utils/currency';

interface BudgetProjectDashboardProps {
  budgets: BudgetSummary[];
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  loading: boolean;
  onNavigate: (key: string) => void;
  onNewProject: () => void;
  onOpenBookkeeping: (budgetId: number) => void;
  onOpenProject: (budgetId: number) => void;
}

export function BudgetProjectDashboard({
  budgets,
  selectedBudget,
  baseCurrency,
  canWriteBudgets,
  loading,
  onNavigate,
  onNewProject,
  onOpenBookkeeping,
  onOpenProject,
}: BudgetProjectDashboardProps) {
  const { language, t } = useI18n();
  const dashboardCurrency = selectedBudget?.baseCurrency ?? baseCurrency;
  const sameCurrencyProjects = budgets.filter(
    (budget) => budget.baseCurrency === dashboardCurrency,
  );
  const activeProject =
    selectedBudget ?? budgets.find((budget) => budget.status === 'active') ?? budgets[0] ?? null;
  const totalProjects = budgets.length;
  const activeProjects = budgets.filter((budget) => budget.status === 'active').length;
  const draftProjects = budgets.filter((budget) => budget.status === 'draft').length;
  const projectTotals = sameCurrencyProjects.reduce(
    (totals, budget) => ({
      budget: totals.budget + budget.totals.totalBudgetBase,
      estimated: totals.estimated + budget.totals.totalEstimatedBase,
      variance: totals.variance + budget.totals.totalVarianceBase,
      transactions: totals.transactions + budget.totals.transactionCount,
    }),
    { budget: 0, estimated: 0, variance: 0, transactions: 0 },
  );
  const recentProjects = budgets.slice(0, 4);
  const activeProjectPeriod = activeProject ? formatBudgetPeriod(activeProject, language) : null;

  return (
    <div className="project-dashboard">
      <section className="project-hero">
        <div>
          <Tag className="project-kicker-tag">{t('budgetProjectsKicker')}</Tag>
          <h1>{t('budgetProjectsTitle')}</h1>
          <p>{t('budgetProjectsDesc')}</p>
        </div>
        <Space wrap>
          <Button icon={<BriefcaseBusiness size={16} />} onClick={() => onNavigate('budgets')}>
            {t('projectLibrary')}
          </Button>
          {canWriteBudgets ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={onNewProject}>
              {t('createBudgetProject')}
            </Button>
          ) : null}
        </Space>
      </section>

      <section className="project-overview-grid" aria-label="Budget project overview">
        <OverviewTile
          label={t('totalBudgetProjects')}
          value={totalProjects.toLocaleString('en-US')}
        />
        <OverviewTile label={t('active')} value={activeProjects.toLocaleString('en-US')} />
        <OverviewTile label={t('draft')} value={draftProjects.toLocaleString('en-US')} />
        <OverviewTile
          label={t('variance')}
          value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.variance })}
          tone={projectTotals.variance < 0 ? 'loss' : projectTotals.variance > 0 ? 'gain' : 'default'}
        />
      </section>

      <section className="project-main-grid">
        <div className="project-panel project-panel-focus">
          <div className="project-panel-heading">
            <div>
              <span>{t('currentBudgetProject')}</span>
              <strong>{activeProject?.title ?? t('noBudgetSelected')}</strong>
            </div>
            {activeProject ? (
              <Tag color={budgetStatusColors[activeProject.status]}>
                {budgetStatusLabelsByLanguage[language][activeProject.status]}
              </Tag>
            ) : null}
          </div>
          {loading ? (
            <ProjectPanelSkeleton />
          ) : activeProject === null ? (
            <Empty
              description={t('noBudgetSelected')}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              {canWriteBudgets ? (
                <Button type="primary" icon={<Plus size={15} />} onClick={onNewProject}>
                  {t('createBudgetProject')}
                </Button>
              ) : null}
            </Empty>
          ) : (
            <>
              {activeProjectPeriod ? (
                <div className="project-period">
                  <CalendarRange size={16} />
                  <span>{activeProjectPeriod}</span>
                </div>
              ) : null}
              <div className="project-money-row">
                <MetricMini
                  label={t('budget')}
                  value={formatMoney({
                    currency: activeProject.baseCurrency,
                    amount: activeProject.totals.totalBudgetBase,
                  })}
                />
                <MetricMini
                  label={t('estimatedActuals')}
                  value={formatMoney({
                    currency: activeProject.baseCurrency,
                    amount: activeProject.totals.totalEstimatedBase,
                  })}
                />
                <MetricMini
                  label={t('transaction')}
                  value={activeProject.totals.transactionCount.toLocaleString('en-US')}
                />
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<ArrowRight size={15} />}
                  onClick={() => onOpenProject(activeProject.id)}
                >
                  {t('newTabEdit')}
                </Button>
                <Button
                  icon={<ReceiptText size={15} />}
                  onClick={() => onOpenBookkeeping(activeProject.id)}
                >
                  {t('bookkeeping')}
                </Button>
              </Space>
            </>
          )}
        </div>

        <div className="project-panel">
          <div className="project-panel-heading">
            <div>
              <span>{dashboardCurrency} {t('summary')}</span>
              <strong>{t('totalSameCurrencyProjects', { count: sameCurrencyProjects.length })}</strong>
            </div>
          </div>
          <div className="project-money-stack">
            <MetricMini
              label={t('totalBudget')}
              value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.budget })}
            />
            <MetricMini
              label={t('estimatedActuals')}
              value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.estimated })}
            />
            <MetricMini
              label={t('transactionCount')}
              value={projectTotals.transactions.toLocaleString('en-US')}
            />
          </div>
        </div>
      </section>

      <section className="project-panel">
        <div className="project-panel-heading">
          <div>
            <span>{t('latestBudgetProjects')}</span>
            <strong>{t('latestBudgetProjectsDesc')}</strong>
          </div>
          <Button type="link" onClick={() => onNavigate('budgets')}>
            {t('all')}
          </Button>
        </div>
        {recentProjects.length === 0 ? (
          <Empty description={t('noBudgetSelected')} />
        ) : (
          <div className="project-card-grid">
            {recentProjects.map((project) => {
              const projectPeriod = formatBudgetPeriod(project, language);

              return (
                <button
                  className="project-card"
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                >
                  <span>{project.title}</span>
                  {projectPeriod ? <small>{projectPeriod}</small> : null}
                  <strong>
                    {formatMoney({
                      currency: project.baseCurrency,
                      amount: project.totals.totalVarianceBase,
                    })}
                  </strong>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function OverviewTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'gain' | 'loss';
}) {
  return (
    <div className={`overview-tile overview-tile-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectPanelSkeleton() {
  return (
    <div className="project-panel-skeleton" aria-label="Loading budget project">
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: '54%' }} />
      <div className="project-money-row">
        <Skeleton.Input active block size="small" />
        <Skeleton.Input active block size="small" />
        <Skeleton.Input active block size="small" />
      </div>
      <Skeleton.Button active size="small" />
    </div>
  );
}
