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
import type {
  BudgetDetail,
  BudgetShare,
  BudgetShareRole,
} from '../../types/budget';

interface ShareSideSectionProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  canManageBudgetShares: boolean;
}

export function ShareSideSection({
  operations,
  selectedBudget,
  canManageBudgetShares,
}: ShareSideSectionProps) {
  const [principalIdentifier, setPrincipalIdentifier] = useState('');
  const [role, setRole] = useState<BudgetShareRole>('viewer');
  const [canExport, setCanExport] = useState(false);
  const [canReshare, setCanReshare] = useState(false);

  if (!canManageBudgetShares) {
    return null;
  }

  const normalizedPrincipalIdentifier = principalIdentifier.trim();
  const canCreate = selectedBudget !== null && normalizedPrincipalIdentifier.length > 0;
  const userShares = operations.shares.filter((share) => share.principalType === 'user');

  const handleCreate = () => {
    if (!canCreate) {
      return;
    }

    void operations.saveShare({
      principalType: 'user',
      principalIdentifier: normalizedPrincipalIdentifier,
      role,
      canExport,
      canReshare,
    });
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
          <div className="share-create-grid share-create-grid-user-only">
            <Input
              allowClear
              placeholder="用户名或邮箱"
              size="small"
              value={principalIdentifier}
              onChange={(event) => setPrincipalIdentifier(event.target.value)}
              onPressEnter={handleCreate}
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
            ) : userShares.length === 0 ? (
              <div className="empty-line">暂无共享规则。</div>
            ) : (
              userShares.map((share) => (
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
