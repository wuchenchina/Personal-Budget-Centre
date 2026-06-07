import { useMemo, useState } from 'react';
import { Button, Empty, Input, Segmented, Space, Tag } from 'antd';
import { CalendarRange, ExternalLink, Pencil, Plus, Search } from 'lucide-react';
import { budgetStatusLabels } from '../../config/appConfig';
import type { BudgetStatus, BudgetSummary } from '../../types/budget';
import { formatBudgetPeriod } from '../../utils/budgetPeriod';
import { formatMoney } from '../../utils/currency';

type ProjectFilter = 'all' | BudgetStatus;

interface BudgetProjectListProps {
  budgets: BudgetSummary[];
  selectedBudgetId: number | null;
  canWriteBudgets: boolean;
  loading: boolean;
  onEditProjectInfo: (budget: BudgetSummary) => void;
  onNewProject: () => void;
  onOpenProject: (budgetId: number) => void;
  onSelectProject: (budgetId: number) => void;
}

const filterOptions: Array<{ label: string; value: ProjectFilter }> = [
  { label: '全部', value: 'all' },
  { label: budgetStatusLabels.active, value: 'active' },
  { label: budgetStatusLabels.draft, value: 'draft' },
  { label: budgetStatusLabels.closed, value: 'closed' },
  { label: budgetStatusLabels.archived, value: 'archived' },
];

const statusColors: Record<BudgetStatus, string> = {
  draft: 'default',
  active: 'blue',
  closed: 'green',
  archived: 'default',
};

export function BudgetProjectList({
  budgets,
  selectedBudgetId,
  canWriteBudgets,
  loading,
  onEditProjectInfo,
  onNewProject,
  onOpenProject,
  onSelectProject,
}: BudgetProjectListProps) {
  const [statusFilter, setStatusFilter] = useState<ProjectFilter>('all');
  const [searchText, setSearchText] = useState('');

  const filteredBudgets = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return budgets.filter((budget) => {
      const matchesStatus = statusFilter === 'all' || budget.status === statusFilter;
      const matchesKeyword =
        keyword.length === 0 ||
        budget.title.toLowerCase().includes(keyword) ||
        budget.ownerName.toLowerCase().includes(keyword);

      return matchesStatus && matchesKeyword;
    });
  }, [budgets, searchText, statusFilter]);

  return (
    <div className="project-library">
      <section className="project-page-header">
        <div>
          <Tag color="blue">Project Library</Tag>
          <h1>预算项目库</h1>
          <p>预算项目独立存在；需要协作时，再通过共享规则关联到工作区或用户。</p>
        </div>
        {canWriteBudgets ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={onNewProject}>
            新建预算项目
          </Button>
        ) : null}
      </section>

      <div className="project-filter-row">
        <Segmented
          options={filterOptions}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as ProjectFilter)}
        />
        <Input
          allowClear
          className="project-search"
          placeholder="搜索预算项目"
          prefix={<Search size={15} />}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="project-panel">
          <div className="empty-line">正在加载预算项目...</div>
        </div>
      ) : filteredBudgets.length === 0 ? (
        <div className="project-panel">
          <Empty description="没有匹配的预算项目" />
        </div>
      ) : (
        <div className="project-list-grid">
          {filteredBudgets.map((budget) => {
            const budgetPeriod = formatBudgetPeriod(budget);
            const ownerName = budget.ownerName.trim();

            return (
              <article
                className={
                  budget.id === selectedBudgetId
                    ? 'project-list-card project-list-card-active'
                    : 'project-list-card'
                }
                key={budget.id}
              >
                <div className="project-list-card-main">
                  <div>
                    <Tag color={statusColors[budget.status]}>
                      {budgetStatusLabels[budget.status]}
                    </Tag>
                    <h2>{budget.title}</h2>
                    {ownerName ? <p>({ownerName})</p> : null}
                  </div>
                  {budgetPeriod ? (
                    <div className="project-period">
                      <CalendarRange size={15} />
                      <span>{budgetPeriod}</span>
                    </div>
                  ) : null}
                </div>

                <div className="project-money-row">
                  <ProjectAmount
                    label="预算"
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalBudgetBase,
                    })}
                  />
                  <ProjectAmount
                    label="预估实际"
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalEstimatedBase,
                    })}
                  />
                  <ProjectAmount
                    label="差异"
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalVarianceBase,
                    })}
                  />
                </div>

                <Space wrap>
                  <Button
                    type="primary"
                    icon={<ExternalLink size={15} />}
                    onClick={() => onOpenProject(budget.id)}
                  >
                    新标签页编辑
                  </Button>
                  <Button onClick={() => onSelectProject(budget.id)}>设为当前</Button>
                  {canWriteBudgets ? (
                    <Button
                      icon={<Pencil size={15} />}
                      onClick={() => onEditProjectInfo(budget)}
                    >
                      项目信息
                    </Button>
                  ) : null}
                </Space>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectAmount({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
