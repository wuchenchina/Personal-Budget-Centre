import { Alert, Button, Popconfirm, Select, Space, Tag } from 'antd';
import {
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { roleColors } from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import { roleLabelsByLanguage, useI18n } from '../../i18n';
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
  isSystemAdmin: boolean;
  canManageWorkspaceMembers: boolean;
  canManageExchangeRates: boolean;
}

export function GovernancePanel({
  activeKey,
  budget,
  workspace,
  operations,
  currentUserId,
  isSystemAdmin,
  canManageWorkspaceMembers,
  canManageExchangeRates,
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
          isSystemAdmin={isSystemAdmin}
          canManageExchangeRates={canManageExchangeRates}
          canManageBudgetShares={canManageWorkspaceMembers}
        />
      ) : null}
    </aside>
  );
}

function WorkspaceSideSection({ workspace }: { workspace: WorkspaceController }) {
  const { language, t } = useI18n();

  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <LayoutDashboard size={16} />
          <span>{t('workspace')}</span>
        </span>
        <Button icon={<Plus size={14} />} onClick={workspace.openWorkspaceModal} size="small">
          {t('create')}
        </Button>
      </div>
      {workspace.workspaceError ? (
        <Alert type="error" showIcon message={workspace.workspaceError} />
      ) : (
        <div className="workspace-list">
          {workspace.isWorkspaceLoading ? (
            <div className="empty-line">{t('loadingWorkspaces')}</div>
          ) : workspace.workspaces.length === 0 ? (
            <div className="empty-line">{t('noWorkspaces')}</div>
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
                <Tag color={roleColors[item.role]}>
                  {roleLabelsByLanguage[language][item.role]}
                </Tag>
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
  const { t } = useI18n();

  return (
    <div className="side-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <UserRound size={16} />
          <span>{t('members')}</span>
        </span>
        {canManageWorkspaceMembers ? (
          <Button
            disabled={workspace.activeWorkspaceId === null}
            icon={<Plus size={14} />}
            onClick={workspace.openWorkspaceMemberModal}
            size="small"
          >
            {t('add')}
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
          <div className="empty-line">{t('loadingMembers')}</div>
        ) : workspace.workspaceMembers.length === 0 ? (
          <div className="empty-line">{t('noMembers')}</div>
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
  const { language, t } = useI18n();
  const canManageThisMember =
    canManageWorkspaceMembers && member.role !== 'owner' && member.userId !== currentUserId;
  const roleOptions: Array<{ label: string; value: WorkspaceRole }> = [
    { label: roleLabelsByLanguage[language].admin, value: 'admin' },
    { label: roleLabelsByLanguage[language].editor, value: 'editor' },
    { label: roleLabelsByLanguage[language].viewer, value: 'viewer' },
    { label: roleLabelsByLanguage[language].auditor, value: 'auditor' },
  ];

  return (
    <div className="member-list-item">
      <div className="member-list-main">
        <span>{member.displayName}</span>
        <small>{member.email}</small>
      </div>
      {canManageThisMember ? (
        <Space size={4} wrap={false}>
          <Select<WorkspaceRole>
            aria-label={`${member.displayName} ${t('role')}`}
            className="member-role-select"
            disabled={
              workspace.updatingMemberUserId === member.userId ||
              workspace.deletingMemberUserId === member.userId
            }
            loading={workspace.updatingMemberUserId === member.userId}
            options={roleOptions}
            size="small"
            value={member.role}
            onChange={(role) => workspace.handleWorkspaceMemberRoleChange(member, role)}
          />
          <Popconfirm
            title={t('removeMember')}
            description={t('removeMemberDescription')}
            okText={t('remove')}
            cancelText={t('cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => workspace.handleWorkspaceMemberDelete(member)}
          >
            <Button
              aria-label={`${t('remove')} ${member.displayName}`}
              danger
              icon={<Trash2 size={13} />}
              loading={workspace.deletingMemberUserId === member.userId}
              size="small"
            />
          </Popconfirm>
        </Space>
      ) : (
        <Tag color={roleColors[member.role]}>
          {roleLabelsByLanguage[language][member.role]}
        </Tag>
      )}
    </div>
  );
}

function PermissionSideSection() {
  const { language, t } = useI18n();

  return (
    <div className="side-section">
      <div className="side-title">
        <ShieldCheck size={16} />
        <span>{t('permissions')}</span>
      </div>
      <Space wrap>
        <Tag color={roleColors.owner}>{roleLabelsByLanguage[language].owner}</Tag>
        <Tag color={roleColors.admin}>{roleLabelsByLanguage[language].admin}</Tag>
        <Tag color={roleColors.editor}>{roleLabelsByLanguage[language].editor}</Tag>
        <Tag color={roleColors.auditor}>{roleLabelsByLanguage[language].auditor}</Tag>
      </Space>
    </div>
  );
}
