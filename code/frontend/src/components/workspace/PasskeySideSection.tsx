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
        <span>Passkey</span>
      </div>
      <Space.Compact className="side-compact-row" block>
        <Input
          allowClear
          disabled={operations.isPasskeyRegistering}
          placeholder="Device name"
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
          Add
        </Button>
      </Space.Compact>
      <div className="operation-list">
        {operations.isPasskeyLoading ? (
          <div className="empty-line">Loading passkeys...</div>
        ) : operations.passkeys.length === 0 ? (
          <div className="empty-line">No passkey registered.</div>
        ) : (
          operations.passkeys.map((passkey) => (
            <div className="operation-list-item operation-list-item-row" key={passkey.id}>
              <div className="operation-list-main">
                <span>{passkey.deviceName ?? 'Passkey'}</span>
                <small>{passkey.lastUsedAt ? `Last used ${passkey.lastUsedAt}` : passkey.createdAt}</small>
              </div>
              <Space size={4}>
                <Button
                  icon={<Pencil size={13} />}
                  size="small"
                  onClick={() => {
                    const nextName = window.prompt('Device name', passkey.deviceName ?? '');
                    if (nextName !== null) {
                      void operations.renamePasskey(passkey.id, nextName.trim() || null);
                    }
                  }}
                />
                <Popconfirm
                  title="Delete passkey"
                  description="This device will no longer be able to login with passkey."
                  okText="Delete"
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
