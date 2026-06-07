import { useState } from 'react';
import { Button, Input, Popconfirm, Space } from 'antd';
import { Check, KeyRound, Pencil, ShieldCheck, Trash2, X } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import { useI18n } from '../../i18n';
import type { PasskeyCredential } from '../../types/auth';

interface PasskeySideSectionProps {
  operations: OperationsController;
  compactTitle?: boolean;
}

export function PasskeySideSection({
  operations,
  compactTitle = false,
}: PasskeySideSectionProps) {
  const { language, t } = useI18n();
  const [deviceName, setDeviceName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleRegister = () => {
    void operations.registerPasskey(deviceName);
    setDeviceName('');
  };

  const startEditing = (passkey: PasskeyCredential) => {
    setEditingId(passkey.id);
    setEditingName(passkey.deviceName ?? '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEditing = () => {
    if (editingId === null) {
      return;
    }

    void operations.renamePasskey(editingId, editingName.trim() || null);
    cancelEditing();
  };

  return (
    <div className="side-section">
      {compactTitle ? null : (
        <div className="side-title side-title-row">
          <span className="side-title-label">
            <KeyRound size={16} />
            <span>{t('passkey')}</span>
          </span>
        </div>
      )}
      <div className="passkey-register-row">
        <Input
          allowClear
          disabled={operations.isPasskeyRegistering}
          placeholder={t('deviceName')}
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          onPressEnter={handleRegister}
        />
        <Button
          icon={<ShieldCheck size={13} />}
          loading={operations.isPasskeyRegistering}
          onClick={handleRegister}
        >
          {t('add')}
        </Button>
      </div>
      <div className="operation-list">
        {operations.isPasskeyLoading ? (
          <div className="empty-line">{t('loadingPasskeys')}</div>
        ) : operations.passkeys.length === 0 ? (
          <div className="empty-line">{t('noPasskeys')}</div>
        ) : (
          operations.passkeys.map((passkey) => (
            <div className="operation-list-item operation-list-item-row" key={passkey.id}>
              {editingId === passkey.id ? (
                <>
                  <Input
                    allowClear
                    className="passkey-edit-input"
                    autoFocus
                    disabled={operations.isPasskeyLoading}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onPressEnter={saveEditing}
                  />
                  <Space className="passkey-action-row" size={4}>
                    <Button icon={<Check size={13} />} size="small" onClick={saveEditing} />
                    <Button icon={<X size={13} />} size="small" onClick={cancelEditing} />
                  </Space>
                </>
              ) : (
                <>
                  <div className="operation-list-main passkey-main">
                    <span>{passkey.deviceName ?? t('passkey')}</span>
                    <small>
                      {passkey.lastUsedAt
                        ? t('passkeyLastUsed', {
                            date: formatPasskeyDate(passkey.lastUsedAt, language),
                          })
                        : t('passkeyCreatedAt', {
                            date: formatPasskeyDate(passkey.createdAt, language),
                          })}
                    </small>
                  </div>
                  <Space className="passkey-action-row" size={4}>
                    <Button
                      icon={<Pencil size={13} />}
                      size="small"
                      onClick={() => startEditing(passkey)}
                    >
                      {t('passkeyRename')}
                    </Button>
                    <Popconfirm
                      title={t('deletePasskey')}
                      description={t('deletePasskeyDescription')}
                      okText={t('delete')}
                      cancelText={t('cancel')}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => operations.removePasskey(passkey.id)}
                    >
                      <Button danger icon={<Trash2 size={13} />} size="small">
                        {t('delete')}
                      </Button>
                    </Popconfirm>
                  </Space>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatPasskeyDate(value: string, language: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  const locale = language === 'en' ? 'en-US' : language === 'sc' ? 'zh-CN' : 'zh-HK';

  return timestamp.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}
