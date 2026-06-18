import { useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import {
  Mail,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { userStatusColors } from '../../config/appConfig';
import { currencyOptions } from '../../config/currencies';
import type { AdminController } from '../../hooks/useAdminController';
import { userStatusLabelsByLanguage, useI18n } from '../../i18n';
import type { AdminLogEntry, AdminUser, AdminUserCreatePayload } from '../../types/admin';
import type { UserStatus } from '../../types/auth';

const { Search } = Input;

interface AdminPanelProps {
  controller: AdminController;
  currentUserId: number | null;
}

export function AdminPanel({ controller, currentUserId }: AdminPanelProps) {
  const { language, t } = useI18n();
  const [createForm] = Form.useForm<AdminUserCreatePayload>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const statusOptions: Array<{ label: string; value: UserStatus | 'all' }> = [
    { label: t('allStatus'), value: 'all' },
    { label: userStatusLabelsByLanguage[language].active, value: 'active' },
    { label: userStatusLabelsByLanguage[language].pending, value: 'pending' },
    { label: userStatusLabelsByLanguage[language].disabled, value: 'disabled' },
  ];
  const openCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({
      defaultCurrency: 'CNY',
      emailVerified: true,
      isAdmin: false,
    });
    setIsCreateModalOpen(true);
  };
  const handleCreateUser = async () => {
    try {
      const values = await createForm.validateFields();
      const created = await controller.createUser({
        ...values,
        email: values.email.trim(),
        username: values.username.trim(),
        displayName: values.displayName.trim(),
      });

      if (created) {
        setIsCreateModalOpen(false);
        createForm.resetFields();
      }
    } catch {
      // Ant Design has already rendered field-level validation errors.
    }
  };
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
        const buttonText = disabled ? t('enableAccountAction') : t('disableAccountAction');

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
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <span className="admin-page-kicker">{t('admin')}</span>
          <h1>{t('adminTitle')}</h1>
        </div>
        <Space className="admin-page-actions" wrap>
          <Button
            icon={<ServerCog size={14} />}
            loading={controller.isEnvironmentLoading}
            onClick={() => void controller.checkEnvironment()}
          >
            {t('environmentCheck')}
          </Button>
          <Popconfirm
            title={t('cleanupExportCache')}
            description={t('confirmCleanupExportCache')}
            okText={t('cleanup')}
            cancelText={t('cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => void controller.cleanupExportCache()}
          >
            <Button
              danger
              icon={<Trash2 size={14} />}
              loading={controller.isExportCacheCleaning}
            >
              {t('cleanupExportCache')}
            </Button>
          </Popconfirm>
        </Space>
      </header>

      {controller.error ? (
        <Alert className="admin-alert" type="error" showIcon message={controller.error} />
      ) : null}
      {controller.notice ? (
        <Alert className="admin-alert" type="success" showIcon message={controller.notice} />
      ) : null}
      {controller.environment ? (
        <EnvironmentCheckSummary environment={controller.environment} />
      ) : null}

      <AdminLogsPanel controller={controller} />

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
            <Button icon={<UserPlus size={14} />} type="primary" onClick={openCreateModal}>
              {t('createAccount')}
            </Button>
          </Space>
        </div>

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

      <Modal
        destroyOnClose
        confirmLoading={controller.isUserCreating}
        okText={t('create')}
        open={isCreateModalOpen}
        title={t('createAccount')}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={() => void handleCreateUser()}
      >
        <Form<AdminUserCreatePayload>
          form={createForm}
          layout="vertical"
          name="budget-centre-admin-create-user"
          requiredMark={false}
          initialValues={{
            defaultCurrency: 'CNY',
            emailVerified: true,
            isAdmin: false,
          }}
        >
          <Form.Item
            label={t('email')}
            name="email"
            rules={[
              { required: true, message: t('emailRequired') },
              { type: 'email', message: t('emailValidRequired') },
            ]}
          >
            <Input autoComplete="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item
            label={t('username')}
            name="username"
            rules={[
              { required: true, message: t('usernameRequired') },
              {
                pattern: /^[a-zA-Z0-9._-]{3,32}$/,
                message: t('usernamePattern'),
              },
            ]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label={t('displayName')}
            name="displayName"
            rules={[
              { required: true, message: t('displayNameRequired') },
              { max: 120, message: t('displayNameMax120') },
            ]}
          >
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item
            label={t('password')}
            name="password"
            rules={[
              { required: true, message: t('passwordRequired') },
              { min: 10, message: t('passwordMin') },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label={t('defaultCurrency')}
            name="defaultCurrency"
            rules={[{ required: true, message: t('selectDefaultCurrency') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={currencyOptions}
              placeholder={t('defaultCurrencyPlaceholder')}
            />
          </Form.Item>
          <div className="admin-create-switches">
            <Form.Item label={t('emailVerified')} name="emailVerified" valuePropName="checked">
              <Switch checkedChildren={t('yes')} unCheckedChildren={t('no')} />
            </Form.Item>
            <Form.Item label={t('administrator')} name="isAdmin" valuePropName="checked">
              <Switch checkedChildren={t('yes')} unCheckedChildren={t('no')} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

function AdminLogsPanel({ controller }: { controller: AdminController }) {
  const { t } = useI18n();
  const columns: TableProps<AdminLogEntry>['columns'] = [
    {
      title: t('dateTime'),
      dataIndex: 'timestamp',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      width: 96,
      render: (status: number) => (
        <Tag color={status >= 500 ? 'red' : 'orange'}>{status}</Tag>
      ),
    },
    {
      title: t('errorCode'),
      dataIndex: 'code',
      width: 180,
      render: (code: string) => <Tag color="volcano">{code}</Tag>,
    },
    {
      title: t('request'),
      key: 'request',
      width: 260,
      render: (_value, record) => (
        <span className="admin-log-request">
          {record.method ?? '-'} {record.path ?? '-'}
        </span>
      ),
    },
    {
      title: t('message'),
      dataIndex: 'message',
      render: (message: string, record) => (
        <div className="admin-log-message">
          <span>{message || record.exception}</span>
          <small>{record.exception}</small>
        </div>
      ),
    },
  ];

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <div>
          <h2>{t('errorLogs')}</h2>
          {controller.logPath ? (
            <small className="admin-toolbar-note">{controller.logPath}</small>
          ) : null}
        </div>
        <Button
          icon={<RefreshCcw size={14} />}
          loading={controller.isLogsLoading}
          onClick={() => void controller.refreshLogs()}
        >
          {t('refresh')}
        </Button>
      </div>

      <Table<AdminLogEntry>
        bordered
        columns={columns}
        dataSource={controller.logs}
        expandable={{
          expandedRowRender: (record) => <LogEntryDetails entry={record} />,
          rowExpandable: (record) => record.trace.length > 0 || record.file !== '',
        }}
        loading={controller.isLogsLoading}
        locale={{ emptyText: t('noLogs') }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        rowKey="id"
        scroll={{ x: 980 }}
        size="small"
      />
    </section>
  );
}

function LogEntryDetails({ entry }: { entry: AdminLogEntry }) {
  const { t } = useI18n();
  const details = [
    `${t('exception')}: ${entry.exception || '-'}`,
    `${t('source')}: ${entry.file || '-'}${entry.line === null ? '' : `:${entry.line}`}`,
    `${t('ipAddress')}: ${entry.ipAddress ?? '-'}`,
    `${t('userAgent')}: ${entry.userAgent ?? '-'}`,
    `${t('query')}: ${JSON.stringify(entry.query)}`,
  ];

  return (
    <div className="admin-log-details">
      <pre>{[...details, '', ...entry.trace].join('\n')}</pre>
    </div>
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
