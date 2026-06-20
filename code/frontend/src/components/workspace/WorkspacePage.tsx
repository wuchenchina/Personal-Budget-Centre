import { Alert, Button, Empty, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { Edit3, Plus, Trash2, UsersRound } from 'lucide-react';
import { roleColors } from '../../config/appConfig';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
import { roleLabelsByLanguage, useI18n } from '../../i18n';
import type { WorkspaceMember } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

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
  const roleOptions: Array<{ label: string; value: WorkspaceRole }> = [
    { label: roleLabelsByLanguage[language].admin, value: 'admin' },
    { label: roleLabelsByLanguage[language].editor, value: 'editor' },
    { label: roleLabelsByLanguage[language].auditor, value: 'auditor' },
    { label: roleLabelsByLanguage[language].viewer, value: 'viewer' },
  ];
  const canDeleteWorkspace = activeWorkspace?.role === 'owner' && activeWorkspace.type !== 'personal';
  const memberColumns: TableProps<WorkspaceMember>['columns'] = [
    {
      title: t('member'),
      dataIndex: 'displayName',
      render: (_value, member) => (
        <div className="workspace-member-cell">
          <div className="workspace-member-avatar">
            {member.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <span>
              {member.displayName}
              {member.userId === currentUserId ? ` (${t('me')})` : ''}
            </span>
            <small>{member.email}</small>
          </div>
        </div>
      ),
    },
    {
      title: t('role'),
      dataIndex: 'role',
      width: 190,
      render: (role: WorkspaceRole, member) =>
        canManageWorkspaceMembers && role !== 'owner' && member.userId !== currentUserId ? (
          <Select<WorkspaceRole>
            className="workspace-role-select"
            disabled={workspace.updatingMemberUserId === member.userId}
            loading={workspace.updatingMemberUserId === member.userId}
            options={roleOptions}
            value={role}
            onChange={(nextRole) => void workspace.handleWorkspaceMemberRoleChange(member, nextRole)}
          />
        ) : (
          <Tag color={roleColors[role]}>{roleLabelsByLanguage[language][role]}</Tag>
        ),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      width: 110,
      render: () => <Tag color="green">{t('active')}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_value, member) =>
        canManageWorkspaceMembers && member.role !== 'owner' && member.userId !== currentUserId ? (
          <Popconfirm
            title={t('removeMember')}
            description={t('removeMemberDescription')}
            okText={t('remove')}
            cancelText={t('cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => void workspace.handleWorkspaceMemberDelete(member)}
          >
            <Button
              danger
              icon={<Trash2 size={13} />}
              loading={workspace.deletingMemberUserId === member.userId}
              size="small"
            >
              {t('remove')}
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div className="workspace-page">
      <section className="workspace-command-panel">
        <div className="workspace-command-header">
          <div>
            <Tag color="red">{t('workspace')}</Tag>
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
                disabled={activeWorkspace === undefined}
                icon={<Edit3 size={15} />}
                onClick={workspace.openWorkspaceEditModal}
              >
                {t('edit')}
              </Button>
            ) : null}
            {canDeleteWorkspace ? (
              <Popconfirm
                title={t('deleteWorkspace')}
                description={t('deleteWorkspaceDescription')}
                okText={t('delete')}
                cancelText={t('cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void workspace.handleWorkspaceDelete()}
              >
                <Button
                  danger
                  icon={<Trash2 size={15} />}
                  loading={workspace.isWorkspaceDeleting}
                >
                  {t('delete')}
                </Button>
              </Popconfirm>
            ) : null}
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
              <WorkspaceStat
                label={t('defaultCurrency')}
                value={activeWorkspace?.defaultCurrency ?? '-'}
              />
            </div>
            <Table<WorkspaceMember>
              className="workspace-member-table"
              columns={memberColumns}
              dataSource={activeMembers}
              loading={workspace.isWorkspaceMemberLoading}
              locale={{ emptyText: t('noMembers') }}
              pagination={false}
              rowKey="userId"
              scroll={{ x: 760 }}
              size="small"
            />
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
