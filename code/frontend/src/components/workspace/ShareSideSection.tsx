import { useState } from 'react';
import { Button, Checkbox, Popconfirm, Select, Tag } from 'antd';
import { Plus, Share2, Trash2 } from 'lucide-react';
import type { Workgroup } from '../../api/workgroups';
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
  { label: principalTypeLabels.workgroup, value: 'workgroup' },
  { label: principalTypeLabels.workspace, value: 'workspace' },
];

interface ShareSideSectionProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  activeWorkspaceId: number | null;
  workspaceMembers: WorkspaceMember[];
  workgroups: Workgroup[];
  canManageBudgetShares: boolean;
}

export function ShareSideSection({
  operations,
  selectedBudget,
  activeWorkspaceId,
  workspaceMembers,
  workgroups,
  canManageBudgetShares,
}: ShareSideSectionProps) {
  const [principalType, setPrincipalType] = useState<BudgetSharePrincipalType>('user');
  const [principalId, setPrincipalId] = useState<number | undefined>();
  const [role, setRole] = useState<BudgetShareRole>('viewer');
  const [canExport, setCanExport] = useState(false);
  const [canReshare, setCanReshare] = useState(false);

  if (!canManageBudgetShares) {
    return null;
  }

  const principalOptions =
    principalType === 'user'
      ? workspaceMembers.map((member) => ({
          label: `${member.displayName} (${member.email})`,
          value: member.userId,
        }))
      : principalType === 'workgroup'
        ? workgroups.map((group) => ({
            label: `${group.name} (${group.memberCount})`,
            value: group.id,
          }))
        : [
            {
              label: '所有工作区成员',
              value: activeWorkspaceId ?? 0,
            },
          ];
  const nextPrincipalId = principalType === 'workspace' ? activeWorkspaceId ?? undefined : principalId;
  const canCreate = selectedBudget !== null && nextPrincipalId !== undefined && nextPrincipalId > 0;

  const handleCreate = () => {
    if (!canCreate) {
      return;
    }

    void operations.saveShare({
      principalType,
      principalId: nextPrincipalId,
      role,
      canExport,
      canReshare,
    });
    setPrincipalId(undefined);
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
          <div className="share-create-grid">
            <Select<BudgetSharePrincipalType>
              options={principalTypeOptions}
              size="small"
              value={principalType}
              onChange={(value) => {
                setPrincipalType(value);
                setPrincipalId(undefined);
              }}
            />
            <Select<number>
              disabled={principalType === 'workspace'}
              options={principalOptions}
              placeholder="共享对象"
              size="small"
              value={nextPrincipalId}
              onChange={setPrincipalId}
            />
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
