import { useState } from 'react';
import { Button, Input, Popconfirm, Space } from 'antd';
import { KeyRound, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';

export function PasskeySideSection({ operations }: { operations: OperationsController }) {
  const [deviceName, setDeviceName] = useState('');

  const handleRegister = () => {
    void operations.registerPasskey(deviceName);
    setDeviceName('');
  };

  return (
    <div className="side-section">
      <div className="side-title">
        <KeyRound size={16} />
        <span>通行密钥</span>
      </div>
      <Space.Compact className="side-compact-row" block>
        <Input
          allowClear
          disabled={operations.isPasskeyRegistering}
          placeholder="设备名称"
          size="small"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          onPressEnter={handleRegister}
        />
        <Button
          icon={<ShieldCheck size={13} />}
          loading={operations.isPasskeyRegistering}
          size="small"
          onClick={handleRegister}
        >
          添加
        </Button>
      </Space.Compact>
      <div className="operation-list">
        {operations.isPasskeyLoading ? (
          <div className="empty-line">正在加载通行密钥...</div>
        ) : operations.passkeys.length === 0 ? (
          <div className="empty-line">暂无通行密钥。</div>
        ) : (
          operations.passkeys.map((passkey) => (
            <div className="operation-list-item operation-list-item-row" key={passkey.id}>
              <div className="operation-list-main">
                <span>{passkey.deviceName ?? '通行密钥'}</span>
                <small>{passkey.lastUsedAt ? `上次使用 ${passkey.lastUsedAt}` : passkey.createdAt}</small>
              </div>
              <Space className="passkey-action-row" size={10}>
                <Button
                  icon={<Pencil size={13} />}
                  size="small"
                  onClick={() => {
                    const nextName = window.prompt('设备名称', passkey.deviceName ?? '');
                    if (nextName !== null) {
                      void operations.renamePasskey(passkey.id, nextName.trim() || null);
                    }
                  }}
                />
                <Popconfirm
                  title="删除通行密钥"
                  description="此设备将不能再使用通行密钥登录。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => operations.removePasskey(passkey.id)}
                >
                  <Button danger icon={<Trash2 size={13} />} size="small" />
                </Popconfirm>
              </Space>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
