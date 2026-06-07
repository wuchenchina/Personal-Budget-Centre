import { Alert, Button, Empty, Select, Space, Tag } from 'antd';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarRange,
  Plus,
  UsersRound,
} from 'lucide-react';
import { budgetStatusLabels, roleColors, roleLabels } from '../../config/appConfig';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetDetail, BudgetStatus, BudgetSummary, CurrencyCode } from '../../types/budget';
import { formatBudgetPeriod } from '../../utils/budgetPeriod';
import { formatMoney } from '../../utils/currency';

interface BudgetProjectDashboardProps {
  budgets: BudgetSummary[];
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  workspace: WorkspaceController;
  currentUserId: number | null;
  canWriteBudgets: boolean;
  canManageWorkspaceMembers: boolean;
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
  workspace,
  currentUserId,
  canWriteBudgets,
  canManageWorkspaceMembers,
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

      <WorkspaceCommandCenter
        workspace={workspace}
        currentUserId={currentUserId}
        canManageWorkspaceMembers={canManageWorkspaceMembers}
      />

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

function WorkspaceCommandCenter({
  workspace,
  currentUserId,
  canManageWorkspaceMembers,
}: {
  workspace: WorkspaceController;
  currentUserId: number | null;
  canManageWorkspaceMembers: boolean;
}) {
  const activeWorkspace = workspace.workspaces.find(
    (item) => item.id === workspace.activeWorkspaceId,
  );
  const activeMembers = workspace.workspaceMembers.filter((member) => member.status === 'active');
  const invitedMembers = workspace.workspaceMembers.filter((member) => member.status === 'invited');

  return (
    <section className="workspace-command-panel">
      <div className="workspace-command-header">
        <div>
          <Tag color="geekblue">Workspace</Tag>
          <h2>工作台</h2>
          <p>在首页选择工作区、查看成员与权限；预算编辑页只保留预算内容。</p>
        </div>
        <Space wrap>
          <Select<number>
            aria-label="切换工作区"
            className="workspace-command-select"
            disabled={workspace.workspaces.length === 0}
            loading={workspace.isWorkspaceLoading || workspace.isWorkspaceSwitching}
            optionFilterProp="label"
            options={workspace.workspaceOptions}
            placeholder="选择工作区"
            showSearch
            value={workspace.activeWorkspaceId ?? undefined}
            onChange={(workspaceId) => void workspace.handleWorkspaceSwitch(workspaceId)}
          />
          <Button icon={<Plus size={15} />} onClick={workspace.openWorkspaceModal}>
            新建工作区
          </Button>
          {canManageWorkspaceMembers ? (
            <Button
              disabled={workspace.activeWorkspaceId === null}
              icon={<UsersRound size={15} />}
              onClick={workspace.openWorkspaceMemberModal}
            >
              添加成员
            </Button>
          ) : null}
        </Space>
      </div>

      {workspace.workspaceError ? (
        <Alert className="workspace-command-alert" type="error" showIcon message={workspace.workspaceError} />
      ) : null}
      {workspace.workspaceMemberError ? (
        <Alert
          className="workspace-command-alert"
          type="error"
          showIcon
          message={workspace.workspaceMemberError}
        />
      ) : null}

      <div className="workspace-command-grid">
        <div className="workspace-directory-panel">
          <div className="workspace-section-heading">
            <span>工作区清单</span>
            <strong>{workspace.workspaces.length.toLocaleString('en-US')}</strong>
          </div>
          <div className="workspace-directory-list">
            {workspace.isWorkspaceLoading ? (
              <div className="empty-line">正在加载工作区...</div>
            ) : workspace.workspaces.length === 0 ? (
              <Empty description="暂无可访问工作区" />
            ) : (
              workspace.workspaces.map((item) => (
                <button
                  className={
                    item.id === workspace.activeWorkspaceId
                      ? 'workspace-directory-item workspace-directory-item-active'
                      : 'workspace-directory-item'
                  }
                  disabled={workspace.isWorkspaceSwitching}
                  key={item.id}
                  type="button"
                  onClick={() => void workspace.handleWorkspaceSwitch(item.id)}
                >
                  <span>{item.name}</span>
                  <Tag color={roleColors[item.role]}>{roleLabels[item.role]}</Tag>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="workspace-summary-panel">
          <div className="workspace-section-heading">
            <span>当前上下文</span>
            <strong>{activeWorkspace?.name ?? '未选择工作区'}</strong>
          </div>
          <div className="workspace-stat-grid">
            <WorkspaceStat label="成员" value={activeMembers.length.toLocaleString('en-US')} />
            <WorkspaceStat label="邀请中" value={invitedMembers.length.toLocaleString('en-US')} />
            <WorkspaceStat
              label="默认货币"
              value={activeWorkspace?.defaultCurrency ?? '-'}
            />
          </div>
          <div className="workspace-member-strip">
            {workspace.isWorkspaceMemberLoading ? (
              <div className="empty-line">正在加载成员...</div>
            ) : workspace.workspaceMembers.length === 0 ? (
              <div className="empty-line">暂无成员。</div>
            ) : (
              workspace.workspaceMembers.slice(0, 6).map((member) => (
                <WorkspaceMemberChip
                  currentUserId={currentUserId}
                  key={member.userId}
                  member={member}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkspaceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WorkspaceMemberChip({
  member,
  currentUserId,
}: {
  member: WorkspaceMember;
  currentUserId: number | null;
}) {
  return (
    <div className="workspace-member-chip">
      <div className="workspace-member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</div>
      <div>
        <span>
          {member.displayName}
          {member.userId === currentUserId ? '（我）' : ''}
        </span>
        <small>{member.email}</small>
      </div>
      <Tag color={roleColors[member.role]}>{roleLabels[member.role]}</Tag>
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
