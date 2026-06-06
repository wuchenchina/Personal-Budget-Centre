import { Alert, Button, Input, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { Mail, RefreshCcw, ShieldCheck, UserCog } from 'lucide-react';
import { userStatusColors, userStatusLabels } from '../../config/appConfig';
import type { AdminController } from '../../hooks/useAdminController';
import type { AdminUser } from '../../types/admin';
import type { UserStatus } from '../../types/auth';

const { Search } = Input;

const statusOptions: Array<{ label: string; value: UserStatus | 'all' }> = [
  { label: '全部状态', value: 'all' },
  { label: userStatusLabels.active, value: 'active' },
  { label: userStatusLabels.pending, value: 'pending' },
  { label: userStatusLabels.disabled, value: 'disabled' },
];

interface AdminPanelProps {
  controller: AdminController;
  currentUserId: number | null;
}

export function AdminPanel({ controller, currentUserId }: AdminPanelProps) {
  const columns: TableProps<AdminUser>['columns'] = [
    {
      title: '用户',
      dataIndex: 'displayName',
      width: 260,
      render: (_value, record) => (
        <div className="admin-user-cell">
          <span>{record.displayName}</span>
          <small>{record.username ? `@${record.username}` : record.email}</small>
        </div>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 260,
      render: (email: string) => <span className="admin-email">{email}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 112,
      render: (status: UserStatus) => (
        <Tag color={userStatusColors[status]}>{userStatusLabels[status]}</Tag>
      ),
    },
    {
      title: '邮箱验证',
      dataIndex: 'emailVerifiedAt',
      width: 190,
      render: (_value, record) => {
        const verified = record.emailVerifiedAt !== null;

        return (
          <Space size={6} wrap>
            <Tag color={verified ? 'blue' : 'orange'}>{verified ? '已验证' : '未验证'}</Tag>
            {!verified ? (
              <>
                <Button
                  icon={<ShieldCheck size={13} />}
                  loading={controller.savingUserId === record.id}
                  size="small"
                  onClick={() => void controller.updateUser({ id: record.id, emailVerified: true })}
                >
                  标记
                </Button>
                <Button
                  icon={<Mail size={13} />}
                  loading={controller.savingUserId === record.id}
                  size="small"
                  onClick={() => void controller.resendVerification(record.id)}
                >
                  重发
                </Button>
              </>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '管理员',
      dataIndex: 'isAdmin',
      width: 110,
      render: (isAdmin: boolean, record) => (
        <Switch
          checked={isAdmin}
          checkedChildren="是"
          disabled={record.id === currentUserId}
          loading={controller.savingUserId === record.id}
          size="small"
          unCheckedChildren="否"
          onChange={(checked) => void controller.updateUser({ id: record.id, isAdmin: checked })}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 128,
      render: (_value, record) => {
        const disabled = record.status === 'disabled';
        const nextStatus: UserStatus = disabled ? 'active' : 'disabled';
        const buttonText = disabled ? '启用' : '停用';

        return (
          <Popconfirm
            title={`${buttonText}用户`}
            description={`确认${buttonText} ${record.displayName}？`}
            okText={buttonText}
            cancelText="取消"
            okButtonProps={{ danger: !disabled }}
            disabled={record.id === currentUserId}
            onConfirm={() => void controller.updateUser({ id: record.id, status: nextStatus })}
          >
            <Button
              danger={!disabled}
              disabled={record.id === currentUserId}
              icon={disabled ? <RefreshCcw size={13} /> : <UserCog size={13} />}
              loading={controller.savingUserId === record.id}
              size="small"
            >
              {buttonText}
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <div>
          <h2>后台用户管理</h2>
        </div>
        <Space wrap>
          <Search
            allowClear
            className="admin-search"
            enterButton="搜索"
            placeholder="搜索邮箱、用户名或显示名称"
            onSearch={controller.applySearch}
          />
          <Select<UserStatus | 'all'>
            className="admin-status-filter"
            options={statusOptions}
            value={controller.status}
            onChange={controller.applyStatus}
          />
        </Space>
      </div>

      {controller.error ? (
        <Alert className="admin-alert" type="error" showIcon message={controller.error} />
      ) : null}
      {controller.notice ? (
        <Alert className="admin-alert" type="success" showIcon message={controller.notice} />
      ) : null}

      <Table<AdminUser>
        bordered
        columns={columns}
        dataSource={controller.users}
        loading={controller.loading}
        locale={{ emptyText: '暂无用户' }}
        pagination={{
          current: controller.page,
          pageSize: controller.pageSize,
          total: controller.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 位用户`,
          onChange: (nextPage, nextPageSize) => {
            controller.setPage(nextPage);
            controller.setPageSize(nextPageSize);
          },
        }}
        rowKey="id"
        scroll={{ x: 1200 }}
        size="small"
      />
    </section>
  );
}

function formatDate(value: string | null): string {
  return value === null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm');
}
