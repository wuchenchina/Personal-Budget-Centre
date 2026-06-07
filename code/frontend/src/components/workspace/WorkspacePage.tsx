import { Alert, Button, Empty, Select, Space, Tag } from 'antd';
import { Plus, UsersRound } from 'lucide-react';
import { roleColors } from '../../config/appConfig';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import { roleLabelsByLanguage, useI18n } from '../../i18n';
import type { WorkspaceMember } from '../../types/auth';

interface WorkspacePageProps {
  workspace: WorkspaceController;
  currentUserId: number | null;
  canManageWorkspaceMembers: boolean;
}

export function WorkspacePage({
  workspace,
  currentUserId,
  canManageWorkspaceMembers,
}: WorkspacePageProps) {
  const { language, t } = useI18n();
  const activeWorkspace = workspace.workspaces.find(
    (item) => item.id === workspace.activeWorkspaceId,
  );
  const activeMembers = workspace.workspaceMembers.filter((member) => member.status === 'active');
  const invitedMembers = workspace.workspaceMembers.filter((member) => member.status === 'invited');

  return (
    <div className="workspace-page">
      <section className="workspace-command-panel">
        <div className="workspace-command-header">
          <div>
            <Tag color="geekblue">{t('workspace')}</Tag>
            <h1>{t('workspace')}</h1>
            <p>{t('workspacePageDesc')}</p>
          </div>
          <Space wrap>
            <Select<number>
              aria-label={t('selectWorkspace')}
              className="workspace-command-select"
              disabled={workspace.workspaces.length === 0}
              loading={workspace.isWorkspaceLoading || workspace.isWorkspaceSwitching}
              optionFilterProp="label"
              options={workspace.workspaceOptions}
              placeholder={t('selectWorkspace')}
              showSearch
              value={workspace.activeWorkspaceId ?? undefined}
              onChange={(workspaceId) => void workspace.handleWorkspaceSwitch(workspaceId)}
            />
            <Button icon={<Plus size={15} />} onClick={workspace.openWorkspaceModal}>
              {t('createWorkspace')}
            </Button>
            {canManageWorkspaceMembers ? (
              <Button
                disabled={workspace.activeWorkspaceId === null}
                icon={<UsersRound size={15} />}
                onClick={workspace.openWorkspaceMemberModal}
              >
                {t('addMember')}
              </Button>
            ) : null}
          </Space>
        </div>

        {workspace.workspaceError ? (
          <Alert
            className="workspace-command-alert"
            type="error"
            showIcon
            message={workspace.workspaceError}
          />
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
              <span>{t('workspaceDirectory')}</span>
              <strong>{workspace.workspaces.length.toLocaleString('en-US')}</strong>
            </div>
            <div className="workspace-directory-list">
              {workspace.isWorkspaceLoading ? (
                <div className="empty-line">{t('loadingWorkspaces')}</div>
              ) : workspace.workspaces.length === 0 ? (
                <Empty description={t('noWorkspaces')} />
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
                    <Tag color={roleColors[item.role]}>
                      {roleLabelsByLanguage[language][item.role]}
                    </Tag>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="workspace-summary-panel">
            <div className="workspace-section-heading">
              <span>{t('currentContext')}</span>
              <strong>{activeWorkspace?.name ?? t('noWorkspaceSelected')}</strong>
            </div>
            <div className="workspace-stat-grid">
              <WorkspaceStat label={t('members')} value={activeMembers.length.toLocaleString('en-US')} />
              <WorkspaceStat label={t('invitePending')} value={invitedMembers.length.toLocaleString('en-US')} />
              <WorkspaceStat
                label={t('defaultCurrency')}
                value={activeWorkspace?.defaultCurrency ?? '-'}
              />
            </div>
            <div className="workspace-member-strip">
              {workspace.isWorkspaceMemberLoading ? (
                <div className="empty-line">{t('loadingMembers')}</div>
              ) : workspace.workspaceMembers.length === 0 ? (
                <div className="empty-line">{t('noMembers')}</div>
              ) : (
                workspace.workspaceMembers.map((member) => (
                  <WorkspaceMemberChip
                    currentUserId={currentUserId}
                    key={member.userId}
                    member={member}
                    meLabel={t('me')}
                    roleLabel={roleLabelsByLanguage[language][member.role]}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
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
  meLabel,
  roleLabel,
}: {
  member: WorkspaceMember;
  currentUserId: number | null;
  meLabel: string;
  roleLabel: string;
}) {
  return (
    <div className="workspace-member-chip">
      <div className="workspace-member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</div>
      <div>
        <span>
          {member.displayName}
          {member.userId === currentUserId ? ` (${meLabel})` : ''}
        </span>
        <small>{member.email}</small>
      </div>
      <Tag color={roleColors[member.role]}>{roleLabel}</Tag>
    </div>
  );
}
