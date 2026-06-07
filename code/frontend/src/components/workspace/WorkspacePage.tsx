import { Alert, Button, Empty, Select, Space, Tag } from 'antd';
import { Plus, UsersRound } from 'lucide-react';
import { roleColors, roleLabels } from '../../config/appConfig';
import type { WorkspaceController } from '../../hooks/useWorkspaceController';
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
            <Tag color="geekblue">Workspace</Tag>
            <h1>工作區</h1>
            <p>在這裡選擇工作區、管理成員與檢查權限；預算編輯頁只處理預算內容。</p>
          </div>
          <Space wrap>
            <Select<number>
              aria-label="切換工作區"
              className="workspace-command-select"
              disabled={workspace.workspaces.length === 0}
              loading={workspace.isWorkspaceLoading || workspace.isWorkspaceSwitching}
              optionFilterProp="label"
              options={workspace.workspaceOptions}
              placeholder="選擇工作區"
              showSearch
              value={workspace.activeWorkspaceId ?? undefined}
              onChange={(workspaceId) => void workspace.handleWorkspaceSwitch(workspaceId)}
            />
            <Button icon={<Plus size={15} />} onClick={workspace.openWorkspaceModal}>
              新建工作區
            </Button>
            {canManageWorkspaceMembers ? (
              <Button
                disabled={workspace.activeWorkspaceId === null}
                icon={<UsersRound size={15} />}
                onClick={workspace.openWorkspaceMemberModal}
              >
                添加成員
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
              <span>工作區清單</span>
              <strong>{workspace.workspaces.length.toLocaleString('en-US')}</strong>
            </div>
            <div className="workspace-directory-list">
              {workspace.isWorkspaceLoading ? (
                <div className="empty-line">正在載入工作區...</div>
              ) : workspace.workspaces.length === 0 ? (
                <Empty description="暫無可存取工作區" />
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
              <span>目前上下文</span>
              <strong>{activeWorkspace?.name ?? '未選擇工作區'}</strong>
            </div>
            <div className="workspace-stat-grid">
              <WorkspaceStat label="成員" value={activeMembers.length.toLocaleString('en-US')} />
              <WorkspaceStat label="邀請中" value={invitedMembers.length.toLocaleString('en-US')} />
              <WorkspaceStat label="預設貨幣" value={activeWorkspace?.defaultCurrency ?? '-'} />
            </div>
            <div className="workspace-member-strip">
              {workspace.isWorkspaceMemberLoading ? (
                <div className="empty-line">正在載入成員...</div>
              ) : workspace.workspaceMembers.length === 0 ? (
                <div className="empty-line">暫無成員。</div>
              ) : (
                workspace.workspaceMembers.map((member) => (
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
