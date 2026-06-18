import { Alert, Descriptions, Space, Tag } from 'antd';
import type { AdminController } from '../../hooks/useAdminController';
import { useI18n } from '../../i18n';

interface EnvironmentCheckSummaryProps {
  environment: AdminController['environment'];
}

export function EnvironmentCheckSummary({ environment }: EnvironmentCheckSummaryProps) {
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
