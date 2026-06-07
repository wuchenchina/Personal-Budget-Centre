import { useState } from 'react';
import { Button, Checkbox, Input, Popconfirm, Select, Tag } from 'antd';
import { Plus, Share2, Trash2 } from 'lucide-react';
import { roleColors } from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import {
  budgetShareRoleLabelsByLanguage,
  principalTypeLabelsByLanguage,
  useI18n,
} from '../../i18n';
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
  const { language, t } = useI18n();
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
  const roleOptions: Array<{ label: string; value: BudgetShareRole }> = [
    { label: budgetShareRoleLabelsByLanguage[language].editor, value: 'editor' },
    { label: budgetShareRoleLabelsByLanguage[language].viewer, value: 'viewer' },
    { label: budgetShareRoleLabelsByLanguage[language].auditor, value: 'auditor' },
  ];

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
        <span>{t('share')}</span>
      </div>
      {selectedBudget === null ? (
        <div className="empty-line">{t('shareManageAfterBudgetSelect')}</div>
      ) : (
        <>
          <div className="share-create-grid share-create-grid-user-only">
            <Input
              allowClear
              placeholder={t('usernameOrEmail')}
              size="small"
              value={principalIdentifier}
              onChange={(event) => setPrincipalIdentifier(event.target.value)}
              onPressEnter={handleCreate}
            />
            <Select<BudgetShareRole>
              options={roleOptions}
              size="small"
              value={role}
              onChange={setRole}
            />
          </div>
          <div className="share-toggle-row">
            <Checkbox checked={canExport} onChange={(event) => setCanExport(event.target.checked)}>
              {t('allowExport')}
            </Checkbox>
            <Checkbox checked={canReshare} onChange={(event) => setCanReshare(event.target.checked)}>
              {t('allowReshare')}
            </Checkbox>
            <Button
              disabled={!canCreate}
              icon={<Plus size={13} />}
              loading={operations.isShareSaving}
              size="small"
              onClick={handleCreate}
            >
              {t('add')}
            </Button>
          </div>
          <div className="operation-list">
            {operations.isShareLoading ? (
              <div className="empty-line">{t('loadingShares')}</div>
            ) : userShares.length === 0 ? (
              <div className="empty-line">{t('noShares')}</div>
            ) : (
              userShares.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  operations={operations}
                  roleOptions={roleOptions}
                />
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
  roleOptions,
}: {
  share: BudgetShare;
  operations: OperationsController;
  roleOptions: Array<{ label: string; value: BudgetShareRole }>;
}) {
  const { language, t } = useI18n();

  return (
    <div className="operation-list-item">
      <div className="operation-list-main">
        <span>{share.principalName}</span>
        <small>
          {principalTypeLabelsByLanguage[language][share.principalType]}
          {share.principalEmail ? ` - ${share.principalEmail}` : ''}
        </small>
      </div>
      <div className="share-row-controls">
        <Select<BudgetShareRole>
          options={roleOptions}
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
        <Tag color={roleColors[share.role]}>
          {budgetShareRoleLabelsByLanguage[language][share.role]}
        </Tag>
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
          {t('allowExport')}
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
          {t('allowReshare')}
        </Checkbox>
        <Popconfirm
          title={t('removeShare')}
          description={t('removeShareDescription')}
          okText={t('remove')}
          cancelText={t('cancel')}
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
