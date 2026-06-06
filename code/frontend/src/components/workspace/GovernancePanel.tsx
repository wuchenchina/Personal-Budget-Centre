import { Alert, Button, Popconfirm, Select, Space, Tag } from 'antd';
import {
  LayoutDashboard,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';
import { assignableWorkspaceRoleOptions, roleColors } from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';
import type { BudgetController } from '../../hooks/useBudgetController';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import type { WorkgroupController } from '../../hooks/useWorkgroupController';
import { OperationsSections } from './OperationsSections';

interface GovernancePanelProps {
  budget: BudgetController;
  workspace: WorkspaceController;
  workgroup: WorkgroupController;
  operations: OperationsController;
  currentUserId: number | null;
  canWriteBudgets: boolean;
  canManageWorkspaceMembers: boolean;
}

export function GovernancePanel({
  budget,
  workspace,
  workgroup,
  operations,
  currentUserId,
  canWriteBudgets,
  canManageWorkspaceMembers,
}: GovernancePanelProps) {
  return (
    <aside className="governance-panel">
      <BudgetSideSection
        budget={budget}
        activeWorkspaceId={workspace.activeWorkspaceId}
        canWriteBudgets={canWriteBudgets}
      />
      <WorkspaceSideSection workspace={workspace} />
      <MemberSideSection
        workspace={workspace}
        currentUserId={currentUserId}
        canManageWorkspaceMembers={canManageWorkspaceMembers}
      />
      <WorkgroupSideSection workgroup={workgroup} activeWorkspaceId={workspace.activeWorkspaceId} />
      <PermissionSideSection />
      <OperationsSections
        operations={operations}
        selectedBudget={budget.selectedBudget}
        canWriteBudgets={canWriteBudgets}
      />
    </aside>
  );
}

function BudgetSideSection({
  budget,
  activeWorkspaceId,
  canWriteBudgets,
}: {
  budget: BudgetController;
  activeWorkspaceId: number | null;
  canWriteBudgets: boolean;
}) {
  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <WalletCards size={16} />
          <span>Budgets</span>
        </span>
        {canWriteBudgets ? (
          <Button
            disabled={activeWorkspaceId === null}
            icon={<Plus size={14} />}
            onClick={budget.openBudgetModal}
            size="small"
          >
            New
          </Button>
        ) : null}
      </div>
      {budget.budgetError ? (
        <Alert className="side-alert" type="error" showIcon message={budget.budgetError} />
      ) : null}
      <div className="budget-list">
        {budget.isBudgetLoading ? (
          <div className="empty-line">Loading budgets...</div>
        ) : budget.budgets.length === 0 ? (
          <div className="empty-line">No budgets created.</div>
        ) : (
          budget.budgets.map((item) => (
            <div
              className={
                budget.selectedBudget?.id === item.id
                  ? 'budget-list-item budget-list-item-active'
                  : 'budget-list-item'
              }
              key={item.id}
            >
              <button
                className="budget-list-main"
                type="button"
                onClick={() => void budget.handleBudgetSelect(item.id)}
              >
                <span>{item.title}</span>
                <small>
                  {item.startDate} to {item.endDate}
                </small>
              </button>
              {canWriteBudgets ? (
                <Space size={4}>
                  <Button
                    aria-label={`Edit ${item.title}`}
                    icon={<Pencil size={13} />}
                    onClick={() => budget.openBudgetEditModal(item)}
                    size="small"
                  />
                  <Popconfirm
                    title="Delete budget"
                    description="This removes the budget and its rows."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => budget.handleBudgetDelete(item.id)}
                  >
                    <Button
                      aria-label={`Delete ${item.title}`}
                      danger
                      icon={<Trash2 size={13} />}
                      loading={budget.deletingBudgetId === item.id}
                      size="small"
                    />
                  </Popconfirm>
                </Space>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function WorkspaceSideSection({ workspace }: { workspace: WorkspaceController }) {
  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <LayoutDashboard size={16} />
          <span>Workspaces</span>
        </span>
        <Button icon={<Plus size={14} />} onClick={workspace.openWorkspaceModal} size="small">
          New
        </Button>
      </div>
      {workspace.workspaceError ? (
        <Alert type="error" showIcon message={workspace.workspaceError} />
      ) : (
        <div className="workspace-list">
          {workspace.isWorkspaceLoading ? (
            <div className="empty-line">Loading workspaces...</div>
          ) : workspace.workspaces.length === 0 ? (
            <div className="empty-line">No workspace access found.</div>
          ) : (
            workspace.workspaces.map((item) => (
              <div
                className={
                  item.id === workspace.activeWorkspaceId
                    ? 'workspace-list-item workspace-list-item-active'
                    : 'workspace-list-item'
                }
                key={item.id}
              >
                <span>{item.name}</span>
                <Tag color={roleColors[item.role]}>{item.role}</Tag>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MemberSideSection({
  workspace,
  currentUserId,
  canManageWorkspaceMembers,
}: {
  workspace: WorkspaceController;
  currentUserId: number | null;
  canManageWorkspaceMembers: boolean;
}) {
  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <UserRound size={16} />
          <span>Members</span>
        </span>
        {canManageWorkspaceMembers ? (
          <Button
            disabled={workspace.activeWorkspaceId === null}
            icon={<Plus size={14} />}
            onClick={workspace.openWorkspaceMemberModal}
            size="small"
          >
            Add
          </Button>
        ) : null}
      </div>
      {workspace.workspaceMemberError ? (
        <Alert
          className="side-alert"
          type="error"
          showIcon
          message={workspace.workspaceMemberError}
        />
      ) : null}
      <div className="member-list">
        {workspace.isWorkspaceMemberLoading ? (
          <div className="empty-line">Loading members...</div>
        ) : workspace.workspaceMembers.length === 0 ? (
          <div className="empty-line">No active members.</div>
        ) : (
          workspace.workspaceMembers.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              workspace={workspace}
              currentUserId={currentUserId}
              canManageWorkspaceMembers={canManageWorkspaceMembers}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  workspace,
  currentUserId,
  canManageWorkspaceMembers,
}: {
  member: WorkspaceMember;
  workspace: WorkspaceController;
  currentUserId: number | null;
  canManageWorkspaceMembers: boolean;
}) {
  const canManageThisMember =
    canManageWorkspaceMembers && member.role !== 'owner' && member.userId !== currentUserId;

  return (
    <div className="member-list-item">
      <div className="member-list-main">
        <span>{member.displayName}</span>
        <small>{member.email}</small>
      </div>
      {canManageThisMember ? (
        <Space size={4} wrap={false}>
          <Select<WorkspaceRole>
            aria-label={`Role for ${member.displayName}`}
            className="member-role-select"
            disabled={
              workspace.updatingMemberUserId === member.userId ||
              workspace.deletingMemberUserId === member.userId
            }
            loading={workspace.updatingMemberUserId === member.userId}
            options={assignableWorkspaceRoleOptions}
            size="small"
            value={member.role}
            onChange={(role) => workspace.handleWorkspaceMemberRoleChange(member, role)}
          />
          <Popconfirm
            title="Remove member"
            description="This also removes their workgroup membership in this workspace."
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => workspace.handleWorkspaceMemberDelete(member)}
          >
            <Button
              aria-label={`Remove ${member.displayName}`}
              danger
              icon={<Trash2 size={13} />}
              loading={workspace.deletingMemberUserId === member.userId}
              size="small"
            />
          </Popconfirm>
        </Space>
      ) : (
        <Tag color={roleColors[member.role]}>{member.role}</Tag>
      )}
    </div>
  );
}

function WorkgroupSideSection({
  workgroup,
  activeWorkspaceId,
}: {
  workgroup: WorkgroupController;
  activeWorkspaceId: number | null;
}) {
  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <Users size={16} />
          <span>Workgroups</span>
        </span>
        <Button
          disabled={activeWorkspaceId === null}
          icon={<Plus size={14} />}
          onClick={() => workgroup.openWorkgroupModal()}
          size="small"
        >
          New
        </Button>
      </div>
      {workgroup.workgroupError ? (
        <Alert type="error" showIcon message={workgroup.workgroupError} />
      ) : (
        <div className="workgroup-list">
          {workgroup.isWorkgroupLoading ? (
            <div className="empty-line">Loading workgroups...</div>
          ) : workgroup.workgroups.length === 0 ? (
            <div className="empty-line">No workgroups created.</div>
          ) : (
            workgroup.workgroups.map((item) => (
              <div className="workgroup-list-item" key={item.id}>
                <div className="workgroup-list-main">
                  <span>{item.name}</span>
                  <small>
                    {item.memberCount} members{item.description ? ` - ${item.description}` : ''}
                  </small>
                </div>
                <Space size={4}>
                  <Button
                    aria-label={`Edit ${item.name}`}
                    icon={<Pencil size={13} />}
                    onClick={() => workgroup.openWorkgroupModal(item)}
                    size="small"
                  />
                  <Popconfirm
                    title="Delete workgroup"
                    description="This removes the group and its membership records."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => workgroup.handleWorkgroupDelete(item.id)}
                  >
                    <Button
                      aria-label={`Delete ${item.name}`}
                      danger
                      icon={<Trash2 size={13} />}
                      loading={workgroup.deletingWorkgroupId === item.id}
                      size="small"
                    />
                  </Popconfirm>
                </Space>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PermissionSideSection() {
  return (
    <div className="side-section">
      <div className="side-title">
        <ShieldCheck size={16} />
        <span>Permissions</span>
      </div>
      <Space wrap>
        <Tag color={roleColors.owner}>owner</Tag>
        <Tag color={roleColors.admin}>admin</Tag>
        <Tag color={roleColors.editor}>editor</Tag>
        <Tag color={roleColors.auditor}>auditor</Tag>
      </Space>
    </div>
  );
}
