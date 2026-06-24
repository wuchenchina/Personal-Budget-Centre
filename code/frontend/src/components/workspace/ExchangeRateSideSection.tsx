import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, InputNumber, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { createManualExchangeRate, listExchangeRates } from '../../api/exchangeRates';
import { currencyRateSourceColors } from '../../config/appConfig';
import type { OperationsController } from '../../hooks/useOperationsController';
import { currencyRateSourceLabelsByLanguage, useI18n } from '../../i18n';
import type { CurrencyCode, CurrencyRate } from '../../types/budget';

interface ExchangeRateSideSectionProps {
  activeWorkspaceId: number | null;
  isSystemAdmin: boolean;
  canManageExchangeRates: boolean;
  operations: OperationsController;
}

export function ExchangeRateSideSection({
  activeWorkspaceId,
  isSystemAdmin,
  canManageExchangeRates,
  operations,
}: ExchangeRateSideSectionProps) {
  const { language, t } = useI18n();
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencyName, setCurrencyName] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [manualFromCurrency, setManualFromCurrency] = useState<CurrencyCode | undefined>();
  const [manualToCurrency, setManualToCurrency] = useState<CurrencyCode | undefined>();
  const [manualRate, setManualRate] = useState<number | null>(null);
  const [manualRateDate, setManualRateDate] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [isManualRateSaving, setIsManualRateSaving] = useState(false);

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
          <Tag color={currencyRateSourceColors[rate.source]}>
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

  const canSaveManualRate =
    canManageExchangeRates
    && activeWorkspaceId !== null
    && manualFromCurrency !== undefined
    && manualToCurrency !== undefined
    && manualFromCurrency !== manualToCurrency
    && manualRate !== null
    && manualRate > 0;

  const handleCreateManualRate = async () => {
    if (!canSaveManualRate || activeWorkspaceId === null || manualRate === null) {
      return;
    }

    setIsManualRateSaving(true);
    setError(null);

    try {
      await createManualExchangeRate({
        workspaceId: activeWorkspaceId,
        fromCurrency: manualFromCurrency,
        toCurrency: manualToCurrency,
        rate: manualRate,
        rateDate: manualRateDate || undefined,
        note: manualNote.trim() === '' ? null : manualNote.trim(),
      });
      setManualRate(null);
      setManualNote('');
      await loadRates();
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('saveExchangeRateFailed'));
    } finally {
      setIsManualRateSaving(false);
    }
  };

  const canCreateCurrency =
    /^[A-Z]{3}$/.test(currencyCode)
    && currencyName.trim() !== ''
    && decimalPlaces >= 0
    && decimalPlaces <= 6;

  const handleCreateCurrency = async () => {
    if (!canCreateCurrency) {
      return;
    }

    const saved = await operations.saveCurrency({
      code: currencyCode,
      name: currencyName,
      symbol: currencySymbol,
      decimalPlaces,
    });

    if (saved) {
      setCurrencyCode('');
      setCurrencyName('');
      setCurrencySymbol('');
      setDecimalPlaces(2);
    }
  };

  return (
    <div className="side-section exchange-rate-section">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <RefreshCcw size={16} />
          <span>{t('rates')}</span>
        </span>
        <Space className="exchange-rate-title-actions" size={6} wrap>
          {canManageExchangeRates ? (
            <Button
              icon={<RefreshCcw size={13} />}
              loading={operations.refreshingExchangeRateSource === 'bochk'}
              size="small"
              onClick={() => void handleRefreshBochk()}
            >
              {t('refreshProviderRates', {
                source: currencyRateSourceLabelsByLanguage[language].bochk,
              })}
            </Button>
          ) : null}
          <Button
            icon={<RefreshCcw size={13} />}
            loading={isLoading}
            size="small"
            onClick={() => void loadRates()}
          >
            {t('reload')}
          </Button>
        </Space>
      </div>

      {canManageExchangeRates ? (
        <div className="manual-rate-row">
          <Select
            aria-label={t('fromCurrency')}
            options={operations.currencyOptions}
            optionFilterProp="label"
            placeholder={t('fromCurrency')}
            showSearch
            size="small"
            value={manualFromCurrency}
            onChange={(value) => setManualFromCurrency(value)}
          />
          <Select
            aria-label={t('toCurrency')}
            options={operations.currencyOptions}
            optionFilterProp="label"
            placeholder={t('toCurrency')}
            showSearch
            size="small"
            value={manualToCurrency}
            onChange={(value) => setManualToCurrency(value)}
          />
          <InputNumber
            aria-label={t('rate')}
            min={0}
            placeholder={t('rate')}
            precision={8}
            size="small"
            value={manualRate}
            onChange={(value) => setManualRate(typeof value === 'number' ? value : null)}
            onPressEnter={() => void handleCreateManualRate()}
          />
          <Input
            aria-label={t('date')}
            placeholder={t('date')}
            size="small"
            type="date"
            value={manualRateDate}
            onChange={(event) => setManualRateDate(event.target.value)}
            onPressEnter={() => void handleCreateManualRate()}
          />
          <Input
            aria-label={t('remark')}
            maxLength={500}
            placeholder={t('remark')}
            size="small"
            value={manualNote}
            onChange={(event) => setManualNote(event.target.value)}
            onPressEnter={() => void handleCreateManualRate()}
          />
          <Button
            disabled={!canSaveManualRate}
            icon={<Plus size={13} />}
            loading={isManualRateSaving}
            size="small"
            onClick={() => void handleCreateManualRate()}
          >
            {t('saveManualRate')}
          </Button>
        </div>
      ) : null}

      <Space className="currency-chip-row" size={4} wrap>
        {operations.currencies.map((currency) => (
          <span className="currency-chip" key={currency.code}>
            <Tag color={currency.isApiManaged ? 'blue' : undefined}>
              {currency.code}
              {currency.isApiManaged ? <small>{t('apiManagedCurrency')}</small> : null}
            </Tag>
            {isSystemAdmin && currency.canDelete ? (
              <Popconfirm
                title={t('deleteCurrency')}
                description={t('deleteCurrencyDescription')}
                okText={t('delete')}
                cancelText={t('cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void operations.removeCurrency(currency.id)}
              >
                <Button
                  aria-label={`${t('deleteCurrency')} ${currency.code}`}
                  danger
                  icon={<Trash2 size={12} />}
                  loading={operations.deletingCurrencyId === currency.id}
                  size="small"
                  type="text"
                />
              </Popconfirm>
            ) : null}
          </span>
        ))}
      </Space>

      {isSystemAdmin ? (
        <div className="currency-create-row">
          <Input
            aria-label={t('currencyCode')}
            maxLength={3}
            placeholder={t('currencyCode')}
            size="small"
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onPressEnter={() => void handleCreateCurrency()}
          />
          <Input
            aria-label={t('currencyName')}
            maxLength={120}
            placeholder={t('currencyName')}
            size="small"
            value={currencyName}
            onChange={(event) => setCurrencyName(event.target.value)}
            onPressEnter={() => void handleCreateCurrency()}
          />
          <Input
            aria-label={t('currencySymbol')}
            maxLength={16}
            placeholder={t('currencySymbol')}
            size="small"
            value={currencySymbol}
            onChange={(event) => setCurrencySymbol(event.target.value)}
            onPressEnter={() => void handleCreateCurrency()}
          />
          <InputNumber
            aria-label={t('decimalPlaces')}
            max={6}
            min={0}
            precision={0}
            size="small"
            value={decimalPlaces}
            onChange={(value) => setDecimalPlaces(typeof value === 'number' ? value : 2)}
          />
          <Button
            disabled={!canCreateCurrency}
            icon={<Plus size={13} />}
            loading={operations.isCurrencySaving}
            size="small"
            onClick={() => void handleCreateCurrency()}
          >
            {t('addCurrency')}
          </Button>
        </div>
      ) : null}

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
