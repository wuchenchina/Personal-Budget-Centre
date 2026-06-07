import { Alert, Button, Descriptions, Input, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { Mail, RefreshCcw, ServerCog, ShieldCheck, UserCog } from 'lucide-react';
import { userStatusColors } from '../../config/appConfig';
import type { AdminController } from '../../hooks/useAdminController';
import { userStatusLabelsByLanguage, useI18n } from '../../i18n';
import type { AdminUser } from '../../types/admin';
import type { UserStatus } from '../../types/auth';

const { Search } = Input;

interface AdminPanelProps {
  controller: AdminController;
  currentUserId: number | null;
}

export function AdminPanel({ controller, currentUserId }: AdminPanelProps) {
  const { language, t } = useI18n();
  const statusOptions: Array<{ label: string; value: UserStatus | 'all' }> = [
    { label: t('allStatus'), value: 'all' },
    { label: userStatusLabelsByLanguage[language].active, value: 'active' },
    { label: userStatusLabelsByLanguage[language].pending, value: 'pending' },
    { label: userStatusLabelsByLanguage[language].disabled, value: 'disabled' },
  ];
  const columns: TableProps<AdminUser>['columns'] = [
    {
      title: t('user'),
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
      title: t('email'),
      dataIndex: 'email',
      width: 260,
      render: (email: string) => <span className="admin-email">{email}</span>,
    },
    {
      title: t('status'),
      dataIndex: 'status',
      width: 112,
      render: (status: UserStatus) => (
        <Tag color={userStatusColors[status]}>{userStatusLabelsByLanguage[language][status]}</Tag>
      ),
    },
    {
      title: t('emailVerified'),
      dataIndex: 'emailVerifiedAt',
      width: 190,
      render: (_value, record) => {
        const verified = record.emailVerifiedAt !== null;

        return (
          <Space size={6} wrap>
            <Tag color={verified ? 'blue' : 'orange'}>
              {verified ? t('verified') : t('emailPending')}
            </Tag>
            {!verified ? (
              <>
                <Button
                  icon={<ShieldCheck size={13} />}
                  loading={controller.savingUserId === record.id}
                  size="small"
                  onClick={() => void controller.updateUser({ id: record.id, emailVerified: true })}
                >
                  {t('mark')}
                </Button>
                <Button
                  icon={<Mail size={13} />}
                  loading={controller.savingUserId === record.id}
                  size="small"
                  onClick={() => void controller.resendVerification(record.id)}
                >
                  {t('resend')}
                </Button>
              </>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: t('administrator'),
      dataIndex: 'isAdmin',
      width: 110,
      render: (isAdmin: boolean, record) => (
        <Switch
          checked={isAdmin}
          checkedChildren={t('yes')}
          disabled={record.id === currentUserId}
          loading={controller.savingUserId === record.id}
          size="small"
          unCheckedChildren={t('no')}
          onChange={(checked) => void controller.updateUser({ id: record.id, isAdmin: checked })}
        />
      ),
    },
    {
      title: t('date'),
      dataIndex: 'createdAt',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 128,
      render: (_value, record) => {
        const disabled = record.status === 'disabled';
        const nextStatus: UserStatus = disabled ? 'active' : 'disabled';
        const buttonText = disabled ? t('active') : t('disabled');

        return (
          <Popconfirm
            title={disabled ? t('enableUser') : t('disableUser')}
            description={
              disabled
                ? t('confirmEnableUser', { name: record.displayName })
                : t('confirmDisableUser', { name: record.displayName })
            }
            okText={buttonText}
            cancelText={t('cancel')}
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
          <h2>{t('adminUserManagement')}</h2>
        </div>
        <Space wrap>
          <Search
            allowClear
            className="admin-search"
            enterButton={t('search')}
            placeholder={t('searchUsersPlaceholder')}
            onSearch={controller.applySearch}
          />
          <Select<UserStatus | 'all'>
            className="admin-status-filter"
            options={statusOptions}
            value={controller.status}
            onChange={controller.applyStatus}
          />
          <Button
            icon={<ServerCog size={14} />}
            loading={controller.isEnvironmentLoading}
            onClick={() => void controller.checkEnvironment()}
          >
            {t('environmentCheck')}
          </Button>
        </Space>
      </div>

      {controller.error ? (
        <Alert className="admin-alert" type="error" showIcon message={controller.error} />
      ) : null}
      {controller.notice ? (
        <Alert className="admin-alert" type="success" showIcon message={controller.notice} />
      ) : null}
      {controller.environment ? (
        <EnvironmentCheckSummary environment={controller.environment} />
      ) : null}

      <Table<AdminUser>
        bordered
        columns={columns}
        dataSource={controller.users}
        loading={controller.loading}
        locale={{ emptyText: t('noUsers') }}
        pagination={{
          current: controller.page,
          pageSize: controller.pageSize,
          total: controller.total,
          showSizeChanger: true,
          showTotal: (total) => `${total}`,
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

function EnvironmentCheckSummary({
  environment,
}: {
  environment: AdminController['environment'];
}) {
  const { t } = useI18n();

  if (environment === null) {
    return null;
  }

  const missingExtensions = environment.extensions.filter((extension) => !extension.loaded);
  const descriptionItems = [
    {
      key: 'php',
      label: 'PHP',
      children: environment.phpVersion,
    },
    {
      key: 'ok',
      label: t('overallStatus'),
      children: (
        <Tag color={environment.ok ? 'blue' : 'orange'}>
          {environment.ok ? t('verified') : t('environmentCheckNeedsAttention')}
        </Tag>
      ),
    },
    {
      key: 'extensions',
      label: t('missingExtensions'),
      span: 2,
      children:
        missingExtensions.length === 0 ? (
          <Tag color="blue">{t('none')}</Tag>
        ) : (
          <Space wrap>
            {missingExtensions.map((extension) => (
              <Tag color="red" key={extension.name}>{extension.name}</Tag>
            ))}
          </Space>
        ),
    },
    {
      key: 'path',
      label: t('exportDirectory'),
      span: 2,
      children: <span className="admin-path">{environment.exportStorage.path}</span>,
    },
    {
      key: 'writable',
      label: t('writable'),
      children: (
        <Tag color={environment.exportStorage.writable ? 'blue' : 'red'}>
          {environment.exportStorage.writable ? t('yes') : t('no')}
        </Tag>
      ),
    },
    {
      key: 'parentWritable',
      label: t('parentDirectoryWritable'),
      children: (
        <Tag color={environment.exportStorage.parentWritable ? 'blue' : 'orange'}>
          {environment.exportStorage.parentWritable ? t('yes') : t('no')}
        </Tag>
      ),
    },
  ];

  return (
    <div className="admin-environment">
      <Descriptions bordered size="small" column={2} items={descriptionItems} />
      {environment.recommendations.length > 0 ? (
        <Alert
          className="admin-alert admin-environment-alert"
          type="warning"
          showIcon
          message={environment.recommendations.join(' ')}
        />
      ) : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  return value === null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm');
}
