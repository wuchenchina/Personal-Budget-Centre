import { useState } from 'react';
import { Button, Input, Popconfirm, Space } from 'antd';
import { Check, KeyRound, Pencil, ShieldCheck, Trash2, X } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { PasskeyCredential } from '../../types/auth';

export function PasskeySideSection({ operations }: { operations: OperationsController }) {
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
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <KeyRound size={16} />
          <span>通行密钥</span>
        </span>
      </div>
      <div className="passkey-register-row">
        <Input
          allowClear
          disabled={operations.isPasskeyRegistering}
          placeholder="设备名称"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          onPressEnter={handleRegister}
        />
        <Button
          icon={<ShieldCheck size={13} />}
          loading={operations.isPasskeyRegistering}
          onClick={handleRegister}
        >
          添加
        </Button>
      </div>
      <div className="operation-list">
        {operations.isPasskeyLoading ? (
          <div className="empty-line">正在加载通行密钥...</div>
        ) : operations.passkeys.length === 0 ? (
          <div className="empty-line">暂无通行密钥。</div>
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
                    <span>{passkey.deviceName ?? '通行密钥'}</span>
                    <small>
                      {passkey.lastUsedAt
                        ? `上次使用 ${formatPasskeyDate(passkey.lastUsedAt)}`
                        : `创建于 ${formatPasskeyDate(passkey.createdAt)}`}
                    </small>
                  </div>
                  <Space className="passkey-action-row" size={4}>
                    <Button
                      icon={<Pencil size={13} />}
                      size="small"
                      onClick={() => startEditing(passkey)}
                    >
                      重命名
                    </Button>
                    <Popconfirm
                      title="删除通行密钥"
                      description="此设备将不能再使用通行密钥登录。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => operations.removePasskey(passkey.id)}
                    >
                      <Button danger icon={<Trash2 size={13} />} size="small">
                        删除
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

function formatPasskeyDate(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}
