import { useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import {
  Mail,
  RefreshCcw,
  Database,
  ServerCog,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { userStatusColors } from '../../config/appConfig';
import type { AdminController } from '../../hooks/useAdminController';
import { userStatusLabelsByLanguage, useI18n } from '../../i18n';
import type { AdminUser, AdminUserCreatePayload } from '../../types/admin';
import type { UserStatus } from '../../types/auth';
import { AdminCreateUserModal } from './AdminCreateUserModal';
import { AdminLogsPanel } from './AdminLogsPanel';
import { EnvironmentCheckSummary } from './EnvironmentCheckSummary';
import { formatDate } from './adminFormat';

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
            <Tag color={verified ? 'green' : 'orange'}>
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
        <Alert
          className="admin-alert admin-notice-alert"
          type="success"
          showIcon
          message={controller.notice}
        />
      ) : null}
      {controller.environment ? (
        <EnvironmentCheckSummary environment={controller.environment} />
      ) : null}

      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <h2>資料庫維護</h2>
          </div>
          <Space wrap>
            <Button
              icon={<Database size={14} />}
              loading={controller.isDatabaseLoading}
              onClick={() => void controller.refreshDatabaseStatus()}
            >
              讀取狀態
            </Button>
            <Button
              loading={controller.isDatabaseLoading}
              onClick={() => void controller.dryRunDatabaseMigration()}
            >
              Dry-run
            </Button>
            <Button
              icon={<RefreshCcw size={14} />}
              loading={controller.isDatabaseLoading}
              onClick={() => void controller.retryDatabaseMigration()}
            >
              重試增量
            </Button>
          </Space>
        </div>
        {controller.databaseStatus ? (
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 4 }}
            items={[
              {
                key: 'connected',
                label: '連線',
                children: (
                  <Tag color={controller.databaseStatus.connected ? 'green' : 'red'}>
                    {controller.databaseStatus.connected ? '正常' : '異常'}
                  </Tag>
                ),
              },
              {
                key: 'database',
                label: '資料庫',
                children: controller.databaseStatus.database,
              },
              {
                key: 'coreReady',
                label: '核心表',
                children: (
                  <Tag color={controller.databaseStatus.coreReady ? 'green' : 'orange'}>
                    {controller.databaseStatus.coreReady ? '已就緒' : '待初始化'}
                  </Tag>
                ),
              },
              {
                key: 'pending',
                label: '待套用',
                children: controller.databaseStatus.pending.length,
              },
            ]}
          />
        ) : (
          <Alert type="info" showIcon message="尚未讀取資料庫狀態。" />
        )}
      </section>

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

      <AdminCreateUserModal
        form={createForm}
        open={isCreateModalOpen}
        confirmLoading={controller.isUserCreating}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={() => void handleCreateUser()}
      />
    </div>
  );
}
