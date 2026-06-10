import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { RefreshCcw } from 'lucide-react';
import { listExchangeRates } from '../../api/exchangeRates';
import type { OperationsController } from '../../hooks/useOperationsController';
import { currencyRateSourceLabelsByLanguage, useI18n } from '../../i18n';
import type { CurrencyRate } from '../../types/budget';

interface ExchangeRateSideSectionProps {
  activeWorkspaceId: number | null;
  operations: OperationsController;
}

const sourceColors: Record<CurrencyRate['source'], string> = {
  manual: 'purple',
  budget_default: 'default',
  bochk: 'blue',
};

export function ExchangeRateSideSection({
  activeWorkspaceId,
  operations,
}: ExchangeRateSideSectionProps) {
  const { language, t } = useI18n();
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRates = useCallback(async () => {
    if (activeWorkspaceId === null) {
      setRates([]);
      setError(null);

      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setRates(await listExchangeRates({ workspaceId: activeWorkspaceId }));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('loadingExchangeRatesFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, t]);

  useEffect(() => {
    queueMicrotask(() => void loadRates());
  }, [loadRates]);

  const columns = useMemo<TableColumnsType<CurrencyRate>>(
    () => [
      {
        key: 'pair',
        title: t('budgetCurrency'),
        width: 120,
        render: (_, rate) => `${rate.from} -> ${rate.to}`,
      },
      {
        key: 'rate',
        title: t('rate'),
        align: 'right',
        render: (_, rate) =>
          rate.rate.toLocaleString('en-US', {
            maximumFractionDigits: 8,
          }),
      },
      {
        key: 'source',
        title: t('source'),
        width: 112,
        render: (_, rate) => (
          <Tag color={sourceColors[rate.source]}>
            {currencyRateSourceLabelsByLanguage[language][rate.source]}
          </Tag>
        ),
      },
      {
        dataIndex: 'rateDate',
        key: 'rateDate',
        title: t('date'),
        width: 112,
      },
    ],
    [language, t],
  );

  const handleRefreshBochk = async () => {
    await operations.refreshBochk();
    await loadRates();
  };

  return (
    <div className="side-section exchange-rate-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <RefreshCcw size={16} />
          <span>{t('rates')}</span>
        </span>
        <Button
          icon={<RefreshCcw size={13} />}
          loading={isLoading}
          size="small"
          onClick={() => void loadRates()}
        >
          {t('reload')}
        </Button>
      </div>

      <div className="exchange-rate-actions">
        <Button
          icon={<RefreshCcw size={13} />}
          loading={operations.refreshingExchangeRateSource === 'bochk'}
          size="small"
          onClick={() => void handleRefreshBochk()}
        >
          BOCHK
        </Button>
      </div>

      <Space className="currency-chip-row" size={4} wrap>
        {operations.currencies.map((currency) => (
          <Tag key={currency.code}>{currency.code}</Tag>
        ))}
      </Space>

      {error ? <Alert className="side-alert" type="error" showIcon message={error} /> : null}

      <Table<CurrencyRate>
        bordered
        columns={columns}
        dataSource={rates}
        loading={isLoading}
        locale={{ emptyText: t('noExchangeRates') }}
        pagination={false}
        rowKey="id"
        scroll={{ x: 560 }}
        size="small"
      />
    </div>
  );
}
