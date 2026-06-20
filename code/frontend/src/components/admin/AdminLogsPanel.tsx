import { Button, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { RefreshCcw } from 'lucide-react';
import type { AdminController } from '../../hooks/useAdminController';
import { useI18n } from '../../i18n';
import type { AdminLogEntry } from '../../types/admin';
import { formatDate } from './adminFormat';

interface AdminLogsPanelProps {
  controller: AdminController;
}

export function AdminLogsPanel({ controller }: AdminLogsPanelProps) {
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
      render: (code: string) => <Tag color="orange">{code}</Tag>,
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
