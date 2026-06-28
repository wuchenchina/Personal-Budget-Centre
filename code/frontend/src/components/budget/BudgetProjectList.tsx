import { useMemo, useState } from 'react';
import { Button, Empty, Input, Popconfirm, Segmented, Select, Tag } from 'antd';
import { CalendarRange, ExternalLink, Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { budgetStatusColors } from '../../config/appConfig';
import { budgetStatusLabelsByLanguage, useI18n } from '../../i18n';
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
  onDeleteProject: (budgetId: number) => void;
  onNewProject: () => void;
  onOpenBookkeeping: (budgetId: number) => void;
  onOpenProject: (budgetId: number) => void;
  onSelectProject: (budgetId: number) => void;
  onStatusChange: (budget: BudgetSummary, status: BudgetStatus) => void;
}

export function BudgetProjectList({
  budgets,
  selectedBudgetId,
  canWriteBudgets,
  loading,
  onEditProjectInfo,
  onDeleteProject,
  onNewProject,
  onOpenBookkeeping,
  onOpenProject,
  onSelectProject,
  onStatusChange,
}: BudgetProjectListProps) {
  const { language, t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<ProjectFilter>('all');
  const [searchText, setSearchText] = useState('');
  const filterOptions: Array<{ label: string; value: ProjectFilter }> = [
    { label: t('all'), value: 'all' },
    { label: budgetStatusLabelsByLanguage[language].active, value: 'active' },
    { label: budgetStatusLabelsByLanguage[language].draft, value: 'draft' },
    { label: budgetStatusLabelsByLanguage[language].closed, value: 'closed' },
    { label: budgetStatusLabelsByLanguage[language].archived, value: 'archived' },
  ];
  const statusOptions: Array<{ label: string; value: BudgetStatus }> = [
    { label: budgetStatusLabelsByLanguage[language].draft, value: 'draft' },
    { label: budgetStatusLabelsByLanguage[language].active, value: 'active' },
    { label: budgetStatusLabelsByLanguage[language].closed, value: 'closed' },
    { label: budgetStatusLabelsByLanguage[language].archived, value: 'archived' },
  ];

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
          <Tag color="red">{t('projectLibrary')}</Tag>
          <h1>{t('projectLibraryTitle')}</h1>
          <p>{t('projectLibraryDesc')}</p>
        </div>
        {canWriteBudgets ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={onNewProject}>
            {t('createBudgetProject')}
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
          className="bc-search-input project-search"
          placeholder={t('searchBudgetProjects')}
          prefix={<Search size={15} />}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="project-panel">
          <div className="empty-line">{t('loadingBudgetProjects')}</div>
        </div>
      ) : filteredBudgets.length === 0 ? (
        <div className="project-panel">
          <Empty description={t('noMatchingBudgetProjects')} />
        </div>
      ) : (
        <div className="project-list-grid">
          {filteredBudgets.map((budget) => {
            const budgetPeriod = formatBudgetPeriod(budget, language);
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
                    {canWriteBudgets ? (
                      <Select
                        className="project-status-select"
                        options={statusOptions}
                        value={budget.status}
                        onChange={(nextStatus) => onStatusChange(budget, nextStatus)}
                      />
                    ) : (
                      <Tag color={budgetStatusColors[budget.status]}>
                        {budgetStatusLabelsByLanguage[language][budget.status]}
                      </Tag>
                    )}
                    <h2>{budget.title}</h2>
                    {ownerName ? <p>{ownerName}</p> : null}
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
                    label={t('budget')}
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalBudgetBase,
                    })}
                  />
                  <ProjectAmount
                    label={t('estimatedActuals')}
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalEstimatedBase,
                    })}
                  />
                  <ProjectAmount
                    label={t('variance')}
                    value={formatMoney({
                      currency: budget.baseCurrency,
                      amount: budget.totals.totalVarianceBase,
                    })}
                  />
                </div>

                <div className="project-card-actions">
                  <Button
                    type="primary"
                    icon={<ExternalLink size={15} />}
                    onClick={() => onOpenProject(budget.id)}
                  >
                    {t('newTabEdit')}
                  </Button>
                  <Button
                    icon={<ReceiptText size={15} />}
                    onClick={() => onOpenBookkeeping(budget.id)}
                  >
                    {t('bookkeeping')}
                  </Button>
                  <Button onClick={() => onSelectProject(budget.id)}>{t('setCurrent')}</Button>
                  {canWriteBudgets ? (
                    <Button
                      icon={<Pencil size={15} />}
                      onClick={() => onEditProjectInfo(budget)}
                    >
                      {t('projectInfo')}
                    </Button>
                  ) : null}
                  {canWriteBudgets ? (
                    <Popconfirm
                      title={t('deleteBudgetTitle')}
                      description={t('deleteBudgetDescription')}
                      okButtonProps={{ danger: true }}
                      okText={t('delete')}
                      cancelText={t('cancel')}
                      onConfirm={() => onDeleteProject(budget.id)}
                    >
                      <Button danger icon={<Trash2 size={15} />}>
                        {t('delete')}
                      </Button>
                    </Popconfirm>
                  ) : null}
                </div>
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
