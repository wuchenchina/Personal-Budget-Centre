import { useState } from 'react';
import { Button, Checkbox, Input, Popconfirm, Select, Tag } from 'antd';
import { Plus, Share2, Trash2 } from 'lucide-react';
import {
  budgetShareRoleLabels,
  budgetShareRoleOptions,
  principalTypeLabels,
  roleColors,
} from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { WorkspaceMember } from '../../types/auth';
import type {
  BudgetDetail,
  BudgetShare,
  BudgetSharePrincipalType,
  BudgetShareRole,
} from '../../types/budget';

const principalTypeOptions: Array<{ label: string; value: BudgetSharePrincipalType }> = [
  { label: principalTypeLabels.user, value: 'user' },
  { label: principalTypeLabels.workspace, value: 'workspace' },
];

type UserShareTargetMode = 'member' | 'identifier';

const userShareTargetOptions: Array<{ label: string; value: UserShareTargetMode }> = [
  { label: '成员', value: 'member' },
  { label: '其他使用者', value: 'identifier' },
];

interface ShareSideSectionProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  workspaceMembers: WorkspaceMember[];
  canManageBudgetShares: boolean;
}

export function ShareSideSection({
  operations,
  selectedBudget,
  activeWorkspaceId,
  workspaceMembers,
  canManageBudgetShares,
}: ShareSideSectionProps) {
  const [principalType, setPrincipalType] = useState<BudgetSharePrincipalType>('user');
  const [userTargetMode, setUserTargetMode] = useState<UserShareTargetMode>('member');
  const [principalId, setPrincipalId] = useState<number | undefined>();
  const [principalIdentifier, setPrincipalIdentifier] = useState('');
  const [role, setRole] = useState<BudgetShareRole>('viewer');
  const [canExport, setCanExport] = useState(false);
  const [canReshare, setCanReshare] = useState(false);

  if (!canManageBudgetShares) {
    return null;
  }

  const memberOptions = workspaceMembers.map((member) => ({
    label: `${member.displayName} (${member.email})`,
    value: member.userId,
  }));
  const principalOptions = [
    {
      label: '所有工作区成员',
      value: activeWorkspaceId ?? 0,
    },
  ];
  const nextPrincipalId = principalType === 'workspace' ? activeWorkspaceId ?? undefined : principalId;
  const normalizedPrincipalIdentifier = principalIdentifier.trim();
  const isIdentifierShare = principalType === 'user' && userTargetMode === 'identifier';
  const canCreate =
    selectedBudget !== null &&
    (isIdentifierShare
      ? normalizedPrincipalIdentifier.length > 0
      : nextPrincipalId !== undefined && nextPrincipalId > 0);

  const handleCreate = () => {
    if (!canCreate) {
      return;
    }

    void operations.saveShare({
      principalType,
      principalId: isIdentifierShare ? undefined : nextPrincipalId,
      principalIdentifier: isIdentifierShare ? normalizedPrincipalIdentifier : undefined,
      role,
      canExport,
      canReshare,
    });
    setPrincipalId(undefined);
    setPrincipalIdentifier('');
    setRole('viewer');
    setCanExport(false);
    setCanReshare(false);
  };

  return (
    <div className="side-section">
      <div className="side-title">
        <Share2 size={16} />
        <span>共享</span>
      </div>
      {selectedBudget === null ? (
        <div className="empty-line">选择一个预算后管理共享。</div>
      ) : (
        <>
          <div
            className={
              principalType === 'user'
                ? 'share-create-grid share-create-grid-user'
                : 'share-create-grid'
            }
          >
            <Select<BudgetSharePrincipalType>
              options={principalTypeOptions}
              size="small"
              value={principalType}
              onChange={(value) => {
                setPrincipalType(value);
                setUserTargetMode('member');
                setPrincipalId(undefined);
                setPrincipalIdentifier('');
              }}
            />
            {principalType === 'user' ? (
              <Select<UserShareTargetMode>
                options={userShareTargetOptions}
                size="small"
                value={userTargetMode}
                onChange={(value) => {
                  setUserTargetMode(value);
                  setPrincipalId(undefined);
                  setPrincipalIdentifier('');
                }}
              />
            ) : null}
            {principalType === 'user' && userTargetMode === 'identifier' ? (
              <Input
                allowClear
                placeholder="用户名或邮箱"
                size="small"
                value={principalIdentifier}
                onChange={(event) => setPrincipalIdentifier(event.target.value)}
              />
            ) : (
              <Select<number>
                disabled={principalType === 'workspace'}
                options={principalType === 'user' ? memberOptions : principalOptions}
                optionFilterProp="label"
                placeholder={principalType === 'user' ? '选择成员' : '共享对象'}
                showSearch
                size="small"
                value={nextPrincipalId}
                onChange={setPrincipalId}
              />
            )}
            <Select<BudgetShareRole>
              options={budgetShareRoleOptions}
              size="small"
              value={role}
              onChange={setRole}
            />
          </div>
          <div className="share-toggle-row">
            <Checkbox checked={canExport} onChange={(event) => setCanExport(event.target.checked)}>
              允许导出
            </Checkbox>
            <Checkbox checked={canReshare} onChange={(event) => setCanReshare(event.target.checked)}>
              允许转分享
            </Checkbox>
            <Button
              disabled={!canCreate}
              icon={<Plus size={13} />}
              loading={operations.isShareSaving}
              size="small"
              onClick={handleCreate}
            >
              添加
            </Button>
          </div>
          <div className="operation-list">
            {operations.isShareLoading ? (
              <div className="empty-line">正在加载共享规则...</div>
            ) : operations.shares.length === 0 ? (
              <div className="empty-line">暂无共享规则。</div>
            ) : (
              operations.shares.map((share) => (
                <ShareRow key={share.id} share={share} operations={operations} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShareRow({
  share,
  operations,
}: {
  share: BudgetShare;
  operations: OperationsController;
}) {
  return (
    <div className="operation-list-item">
      <div className="operation-list-main">
        <span>{share.principalName}</span>
        <small>
          {principalTypeLabels[share.principalType]}
          {share.principalEmail ? ` - ${share.principalEmail}` : ''}
        </small>
      </div>
      <div className="share-row-controls">
        <Select<BudgetShareRole>
          options={budgetShareRoleOptions}
          size="small"
          value={share.role}
          onChange={(nextRole) =>
            operations.saveShare({
              id: share.id,
              role: nextRole,
              canExport: share.canExport,
              canReshare: share.canReshare,
              expiresAt: share.expiresAt,
            })
          }
        />
        <Tag color={roleColors[share.role]}>{budgetShareRoleLabels[share.role]}</Tag>
      </div>
      <div className="share-toggle-row">
        <Checkbox
          checked={share.canExport}
          onChange={(event) =>
            operations.saveShare({
              id: share.id,
              role: share.role,
              canExport: event.target.checked,
              canReshare: share.canReshare,
              expiresAt: share.expiresAt,
            })
          }
        >
          允许导出
        </Checkbox>
        <Checkbox
          checked={share.canReshare}
          onChange={(event) =>
            operations.saveShare({
              id: share.id,
              role: share.role,
              canExport: share.canExport,
              canReshare: event.target.checked,
              expiresAt: share.expiresAt,
            })
          }
        >
          允许转分享
        </Checkbox>
        <Popconfirm
          title="移除共享"
          description="此对象将失去该规则授予的访问权限。"
          okText="移除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => operations.removeShare(share.id)}
        >
          <Button
            danger
            icon={<Trash2 size={13} />}
            loading={operations.isShareSaving}
            size="small"
          />
        </Popconfirm>
      </div>
    </div>
  );
}
