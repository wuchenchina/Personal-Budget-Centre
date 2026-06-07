import { Alert, Button, Popconfirm, Select, Space, Tag } from 'antd';
import {
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { assignableWorkspaceRoleOptions, roleColors, roleLabels } from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';
import type { BudgetController } from '../../hooks/useBudgetController';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import { OperationsSections } from './OperationsSections';

interface GovernancePanelProps {
  activeKey: string;
  budget: BudgetController;
  workspace: WorkspaceController;
  operations: OperationsController;
  currentUserId: number | null;
  canManageWorkspaceMembers: boolean;
}

export function GovernancePanel({
  activeKey,
  budget,
  workspace,
  operations,
  currentUserId,
  canManageWorkspaceMembers,
}: GovernancePanelProps) {
  const showBudgetCollaboration = activeKey === 'budget-editor';
  const showOperations = ['categories', 'rates'].includes(activeKey);

  return (
    <aside className="governance-panel">
      {showBudgetCollaboration ? (
        <>
          <WorkspaceSideSection workspace={workspace} />
          <MemberSideSection
            workspace={workspace}
            currentUserId={currentUserId}
            canManageWorkspaceMembers={canManageWorkspaceMembers}
          />
          <PermissionSideSection />
        </>
      ) : null}
      {showOperations ? (
        <OperationsSections
          activeKey={activeKey}
          operations={operations}
          selectedBudget={budget.selectedBudget}
          activeWorkspaceId={workspace.activeWorkspaceId}
          canManageBudgetShares={canManageWorkspaceMembers}
        />
      ) : null}
    </aside>
  );
}

function WorkspaceSideSection({ workspace }: { workspace: WorkspaceController }) {
  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <LayoutDashboard size={16} />
          <span>工作区</span>
        </span>
        <Button icon={<Plus size={14} />} onClick={workspace.openWorkspaceModal} size="small">
          新建
        </Button>
      </div>
      {workspace.workspaceError ? (
        <Alert type="error" showIcon message={workspace.workspaceError} />
      ) : (
        <div className="workspace-list">
          {workspace.isWorkspaceLoading ? (
            <div className="empty-line">正在加载工作区...</div>
          ) : workspace.workspaces.length === 0 ? (
            <div className="empty-line">暂无可访问工作区。</div>
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
                <Tag color={roleColors[item.role]}>{roleLabels[item.role]}</Tag>
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
          <span>成员</span>
        </span>
        {canManageWorkspaceMembers ? (
          <Button
            disabled={workspace.activeWorkspaceId === null}
            icon={<Plus size={14} />}
            onClick={workspace.openWorkspaceMemberModal}
            size="small"
          >
            添加
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
          <div className="empty-line">正在加载成员...</div>
        ) : workspace.workspaceMembers.length === 0 ? (
          <div className="empty-line">暂无成员。</div>
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
            aria-label={`${member.displayName} 的角色`}
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
            title="移除成员"
            description="这会移除此成员在当前工作区的访问权限。"
            okText="移除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => workspace.handleWorkspaceMemberDelete(member)}
          >
            <Button
              aria-label={`移除 ${member.displayName}`}
              danger
              icon={<Trash2 size={13} />}
              loading={workspace.deletingMemberUserId === member.userId}
              size="small"
            />
          </Popconfirm>
        </Space>
      ) : (
        <Tag color={roleColors[member.role]}>{roleLabels[member.role]}</Tag>
      )}
    </div>
  );
}

function PermissionSideSection() {
  return (
    <div className="side-section">
      <div className="side-title">
        <ShieldCheck size={16} />
        <span>权限</span>
      </div>
      <Space wrap>
        <Tag color={roleColors.owner}>{roleLabels.owner}</Tag>
        <Tag color={roleColors.admin}>{roleLabels.admin}</Tag>
        <Tag color={roleColors.editor}>{roleLabels.editor}</Tag>
        <Tag color={roleColors.auditor}>{roleLabels.auditor}</Tag>
      </Space>
    </div>
  );
}
