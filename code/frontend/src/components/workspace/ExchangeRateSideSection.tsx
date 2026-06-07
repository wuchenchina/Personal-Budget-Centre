import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { RefreshCcw } from 'lucide-react';
import { listExchangeRates } from '../../api/exchangeRates';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { CurrencyRate } from '../../types/budget';

interface ExchangeRateSideSectionProps {
  activeWorkspaceId: number | null;
  operations: OperationsController;
}

const sourceLabels: Record<CurrencyRate['source'], string> = {
  manual: '手动',
  budget_default: '预算默认',
  bochk: 'BOCHK',
  mastercard: 'Mastercard',
};

const sourceColors: Record<CurrencyRate['source'], string> = {
  manual: 'purple',
  budget_default: 'default',
  bochk: 'blue',
  mastercard: 'green',
};

export function ExchangeRateSideSection({
  activeWorkspaceId,
  operations,
}: ExchangeRateSideSectionProps) {
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
      setError(nextError instanceof Error ? nextError.message : '加载汇率失败。');
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    queueMicrotask(() => void loadRates());
  }, [loadRates]);

  const latestRates = useMemo(() => rates.slice(0, 12), [rates]);
  const columns = useMemo<TableColumnsType<CurrencyRate>>(
    () => [
      {
        key: 'pair',
        title: '货币',
        width: 120,
        render: (_, rate) => `${rate.from} -> ${rate.to}`,
      },
      {
        key: 'rate',
        title: '汇率',
        align: 'right',
        render: (_, rate) =>
          rate.rate.toLocaleString('en-US', {
            maximumFractionDigits: 8,
          }),
      },
      {
        key: 'source',
        title: '来源',
        width: 112,
        render: (_, rate) => (
          <Tag color={sourceColors[rate.source]}>{sourceLabels[rate.source]}</Tag>
        ),
      },
      {
        dataIndex: 'rateDate',
        key: 'rateDate',
        title: '日期',
        width: 112,
      },
    ],
    [],
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
          <span>汇率</span>
        </span>
        <Button
          icon={<RefreshCcw size={13} />}
          loading={isLoading}
          size="small"
          onClick={() => void loadRates()}
        >
          重新加载
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
        dataSource={latestRates}
        loading={isLoading}
        locale={{ emptyText: '暂无汇率记录' }}
        pagination={false}
        rowKey="id"
        scroll={{ x: 560 }}
        size="small"
      />
    </div>
  );
}
