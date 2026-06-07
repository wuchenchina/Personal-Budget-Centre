import { Button, Empty, Space, Tag } from 'antd';
import { ArrowRight, BriefcaseBusiness, CalendarRange, Plus } from 'lucide-react';
import { budgetStatusLabels } from '../../config/appConfig';
import type { BudgetDetail, BudgetStatus, BudgetSummary, CurrencyCode } from '../../types/budget';
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
  onOpenProject: (budgetId: number) => void;
}

const statusColors: Record<BudgetStatus, string> = {
  draft: 'default',
  active: 'blue',
  closed: 'green',
  archived: 'default',
};

export function BudgetProjectDashboard({
  budgets,
  selectedBudget,
  baseCurrency,
  canWriteBudgets,
  loading,
  onNavigate,
  onNewProject,
  onOpenProject,
}: BudgetProjectDashboardProps) {
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
  const activeProjectPeriod = activeProject ? formatBudgetPeriod(activeProject) : null;

  return (
    <div className="project-dashboard">
      <section className="project-hero">
        <div>
          <Tag color="blue">Budget Projects</Tag>
          <h1>预算项目总览</h1>
          <p>每一份预算都是独立项目；工作区只承担共享、协作和权限管理。</p>
        </div>
        <Space wrap>
          <Button icon={<BriefcaseBusiness size={16} />} onClick={() => onNavigate('budgets')}>
            项目库
          </Button>
          {canWriteBudgets ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={onNewProject}>
              新建预算项目
            </Button>
          ) : null}
        </Space>
      </section>

      <section className="project-overview-grid" aria-label="Budget project overview">
        <OverviewTile label="预算项目" value={totalProjects.toLocaleString('en-US')} />
        <OverviewTile label="启用中" value={activeProjects.toLocaleString('en-US')} />
        <OverviewTile label="草稿" value={draftProjects.toLocaleString('en-US')} />
        <OverviewTile
          label={`${dashboardCurrency} 差异`}
          value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.variance })}
          tone={projectTotals.variance < 0 ? 'warning' : 'default'}
        />
      </section>

      <section className="project-main-grid">
        <div className="project-panel project-panel-focus">
          <div className="project-panel-heading">
            <div>
              <span>当前预算项目</span>
              <strong>{activeProject?.title ?? '暂无预算项目'}</strong>
            </div>
            {activeProject ? (
              <Tag color={statusColors[activeProject.status]}>
                {budgetStatusLabels[activeProject.status]}
              </Tag>
            ) : null}
          </div>
          {loading ? (
            <div className="empty-line">正在加载预算项目...</div>
          ) : activeProject === null ? (
            <Empty description="还没有预算项目" />
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
                  label="预算"
                  value={formatMoney({
                    currency: activeProject.baseCurrency,
                    amount: activeProject.totals.totalBudgetBase,
                  })}
                />
                <MetricMini
                  label="预估实际"
                  value={formatMoney({
                    currency: activeProject.baseCurrency,
                    amount: activeProject.totals.totalEstimatedBase,
                  })}
                />
                <MetricMini
                  label="交易"
                  value={activeProject.totals.transactionCount.toLocaleString('en-US')}
                />
              </div>
              <Button
                type="primary"
                icon={<ArrowRight size={15} />}
                onClick={() => onOpenProject(activeProject.id)}
              >
                新标签页编辑
              </Button>
            </>
          )}
        </div>

        <div className="project-panel">
          <div className="project-panel-heading">
            <div>
              <span>{dashboardCurrency} 汇总</span>
              <strong>{sameCurrencyProjects.length} 个同币种项目</strong>
            </div>
          </div>
          <div className="project-money-stack">
            <MetricMini
              label="总预算"
              value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.budget })}
            />
            <MetricMini
              label="预估实际"
              value={formatMoney({ currency: dashboardCurrency, amount: projectTotals.estimated })}
            />
            <MetricMini
              label="交易数"
              value={projectTotals.transactions.toLocaleString('en-US')}
            />
          </div>
        </div>
      </section>

      <section className="project-panel">
        <div className="project-panel-heading">
          <div>
            <span>最近预算项目</span>
            <strong>从项目库打开独立编辑页</strong>
          </div>
          <Button type="link" onClick={() => onNavigate('budgets')}>
            查看全部
          </Button>
        </div>
        {recentProjects.length === 0 ? (
          <Empty description="暂无预算项目" />
        ) : (
          <div className="project-card-grid">
            {recentProjects.map((project) => {
              const projectPeriod = formatBudgetPeriod(project);

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
  tone?: 'default' | 'warning';
}) {
  return (
    <div className={tone === 'warning' ? 'overview-tile overview-tile-warning' : 'overview-tile'}>
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
