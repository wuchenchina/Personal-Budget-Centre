import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
} from 'antd';
import type { DescriptionsProps, TableColumnsType } from 'antd';
import {
  ArrowRightLeft,
  Edit3,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createAccountExchangeRate,
  deleteAccountExchangeRate,
  listAccountExchangeRates,
  listBochkRateBoard,
  updateAccountExchangeRate,
  type AccountExchangeRatePayload,
  type BochkRateBoardRow,
} from '../../api/exchangeRates';
import { listCurrencyPresets } from '../../api/referenceData';
import type { OperationsController } from '../../hooks/useOperationsController';
import { useI18n } from '../../i18n';
import type { Currency, CurrencyCode, CurrencyRate } from '../../types/budget';
import { buildCurrencyOptions, renderCurrencyOption } from '../../utils/currencyOptions';

interface ExchangeRateSideSectionProps {
  activeWorkspaceId: number | null;
  canManageExchangeRates: boolean;
  operations: OperationsController;
}

interface PrivateRateFormValues {
  id?: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  note?: string;
}

const priorityCurrencies = ['USD', 'CNY', 'CNH', 'EUR', 'GBP', 'JPY'];

export function ExchangeRateSideSection({
  activeWorkspaceId,
  canManageExchangeRates,
  operations,
}: ExchangeRateSideSectionProps) {
  const { t } = useI18n();
  const [boardRows, setBoardRows] = useState<BochkRateBoardRow[]>([]);
  const [privateRates, setPrivateRates] = useState<CurrencyRate[]>([]);
  const [supportedCodes, setSupportedCodes] = useState<CurrencyCode[]>([]);
  const [currencyPresets, setCurrencyPresets] = useState<Currency[]>([]);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [isLoadingPrivateRates, setIsLoadingPrivateRates] = useState(false);
  const [savingPrivateRate, setSavingPrivateRate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [calculatorAmount, setCalculatorAmount] = useState<number | null>(1000);
  const [calculatorCurrency, setCalculatorCurrency] = useState<CurrencyCode>('USD');
  const [calculatorMode, setCalculatorMode] = useState<'sell_foreign' | 'buy_foreign'>('sell_foreign');
  const [editingPrivateRate, setEditingPrivateRate] = useState<CurrencyRate | null>(null);
  const [privateRateModalOpen, setPrivateRateModalOpen] = useState(false);
  const [privateRateForm] = Form.useForm<PrivateRateFormValues>();

  const loadBoard = useCallback(async () => {
    setIsLoadingBoard(true);
    setError(null);

    try {
      const board = await listBochkRateBoard({ workspaceId: activeWorkspaceId });
      setBoardRows(board.rates);
      if (board.rates.length > 0 && !board.rates.some((rate) => rate.currency === calculatorCurrency)) {
        setCalculatorCurrency(board.rates[0].currency);
      }
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('loadingExchangeRatesFailed'));
    } finally {
      setIsLoadingBoard(false);
    }
  }, [activeWorkspaceId, calculatorCurrency, t]);

  const loadPrivateRates = useCallback(async () => {
    setIsLoadingPrivateRates(true);
    setError(null);

    try {
      const response = await listAccountExchangeRates();
      setPrivateRates(response.rates);
      setSupportedCodes(response.bochkSupportedCodes);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('loadingExchangeRatesFailed'));
    } finally {
      setIsLoadingPrivateRates(false);
    }
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadBoard();
      void loadPrivateRates();
      void listCurrencyPresets()
        .then(setCurrencyPresets)
        .catch(() => setCurrencyPresets([]));
    });
  }, [loadBoard, loadPrivateRates]);

  const filteredBoardRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (keyword === '') {
      return boardRows;
    }

    return boardRows.filter((row) => (
      row.currency.toLowerCase().includes(keyword)
      || row.currencyName.toLowerCase().includes(keyword)
      || row.currencySymbol.toLowerCase().includes(keyword)
    ));
  }, [boardRows, searchText]);

  const featuredRows = useMemo(() => {
    const byCode = new Map(boardRows.map((row) => [row.currency, row]));
    const featured = priorityCurrencies
      .map((code) => byCode.get(code))
      .filter((row): row is BochkRateBoardRow => row !== undefined);

    return featured.length > 0 ? featured : boardRows.slice(0, 6);
  }, [boardRows]);

  const calculatorRow = boardRows.find((row) => row.currency === calculatorCurrency) ?? null;
  const calculatorRate = calculatorMode === 'sell_foreign'
    ? calculatorRow?.customerBuyRate
    : calculatorRow?.customerSellRate;
  const calculatorResult =
    typeof calculatorAmount === 'number'
    && Number.isFinite(calculatorAmount)
    && calculatorAmount >= 0
    && calculatorRate !== undefined
      ? calculatorAmount * calculatorRate
      : null;

  const bochkCurrencyOptions = boardRows.map((row) => ({
    label: `${row.currency} ${row.currencyName}`,
    value: row.currency,
  }));
  const presetOptions = buildCurrencyOptions(currencyPresets);
  const bochkSupportedSet = useMemo(() => new Set(supportedCodes), [supportedCodes]);
  const unsupportedCurrencyOptions = presetOptions.filter((option) => !bochkSupportedSet.has(option.value));
  const supportedCurrencyOptions = presetOptions.filter((option) => bochkSupportedSet.has(option.value));

  const handleRefreshBochk = async () => {
    await operations.refreshBochk();
    await loadBoard();
  };

  const openCreatePrivateRate = () => {
    setEditingPrivateRate(null);
    privateRateForm.resetFields();
    privateRateForm.setFieldsValue({
      fromCurrency: supportedCurrencyOptions[0]?.value ?? 'USD',
      toCurrency: unsupportedCurrencyOptions[0]?.value,
      rateDate: todayInputDate(),
    });
    setPrivateRateModalOpen(true);
  };

  const openEditPrivateRate = (rate: CurrencyRate) => {
    setEditingPrivateRate(rate);
    privateRateForm.setFieldsValue({
      id: rate.id,
      fromCurrency: rate.from,
      toCurrency: rate.to,
      rate: rate.rate,
      rateDate: rate.rateDate,
      note: rate.note ?? undefined,
    });
    setPrivateRateModalOpen(true);
  };

  const savePrivateRate = async () => {
    const values = await privateRateForm.validateFields();
    const payload: AccountExchangeRatePayload = {
      id: editingPrivateRate?.id,
      fromCurrency: values.fromCurrency,
      toCurrency: values.toCurrency,
      rate: values.rate,
      rateDate: values.rateDate,
      note: values.note ?? null,
    };

    setSavingPrivateRate(true);
    setError(null);

    try {
      const nextRate = editingPrivateRate === null
        ? await createAccountExchangeRate(payload)
        : await updateAccountExchangeRate(payload);
      setPrivateRates((current) => [
        nextRate,
        ...current.filter((rate) => rate.id !== nextRate.id && rate.id !== editingPrivateRate?.id),
      ]);
      setPrivateRateModalOpen(false);
      setEditingPrivateRate(null);
      privateRateForm.resetFields();
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('saveExchangeRateFailed'));
    } finally {
      setSavingPrivateRate(false);
    }
  };

  const removePrivateRate = async (id: number) => {
    setError(null);

    try {
      setPrivateRates(await deleteAccountExchangeRate(id));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('saveExchangeRateFailed'));
    }
  };

  const boardColumns = useMemo<TableColumnsType<BochkRateBoardRow>>(
    () => [
      {
        key: 'currency',
        title: t('currency'),
        sorter: (left, right) => left.currency.localeCompare(right.currency),
        render: (_, row) => (
          <span className="rate-board-currency">
            <strong>{row.currency}</strong>
            <small>{row.currencyName}</small>
          </span>
        ),
      },
      {
        dataIndex: 'customerSellRate',
        key: 'customerSellRate',
        title: t('customerSellRate'),
        align: 'right',
        sorter: (left, right) => left.customerSellRate - right.customerSellRate,
        render: formatRate,
      },
      {
        dataIndex: 'customerBuyRate',
        key: 'customerBuyRate',
        title: t('customerBuyRate'),
        align: 'right',
        sorter: (left, right) => left.customerBuyRate - right.customerBuyRate,
        render: formatRate,
      },
      {
        key: 'spread',
        title: t('spread'),
        align: 'right',
        render: (_, row) => formatRate(row.customerSellRate - row.customerBuyRate),
      },
      {
        dataIndex: 'rateDate',
        key: 'rateDate',
        title: t('date'),
        width: 120,
      },
    ],
    [t],
  );

  const privateColumns = useMemo<TableColumnsType<CurrencyRate>>(
    () => [
      {
        key: 'pair',
        title: t('currencyPair'),
        render: (_, rate) => (
          <span className="rate-board-currency">
            <strong>{rate.from} → {rate.to}</strong>
            <small>{t('accountPrivateRate')}</small>
          </span>
        ),
      },
      {
        dataIndex: 'rate',
        key: 'rate',
        title: t('rate'),
        align: 'right',
        render: formatRate,
      },
      {
        dataIndex: 'rateDate',
        key: 'rateDate',
        title: t('date'),
        width: 120,
      },
      {
        dataIndex: 'note',
        key: 'note',
        title: t('note'),
        ellipsis: true,
        render: (note: string | null) => note ?? '--',
      },
      {
        key: 'actions',
        width: 96,
        render: (_, rate) => (
          <Space size={4}>
            <Button
              aria-label={t('edit')}
              icon={<Edit3 size={13} />}
              size="small"
              onClick={() => openEditPrivateRate(rate)}
            />
            <Popconfirm
              title={t('remove')}
              okText={t('remove')}
              cancelText={t('cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={() => void removePrivateRate(rate.id)}
            >
              <Button aria-label={t('remove')} danger icon={<Trash2 size={13} />} size="small" />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [t],
  );

  const boardMetaItems: DescriptionsProps['items'] = [
    { key: 'base', label: t('baseCurrency'), children: 'HKD' },
    { key: 'date', label: t('date'), children: boardRows[0]?.rateDate ?? '--' },
  ];

  return (
    <div className="side-section exchange-rate-section exchange-rate-workbench">
      <div className="side-title side-title-row">
        <span className="side-title-label">
          <ArrowRightLeft size={16} />
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
              {t('refreshBochkRates')}
            </Button>
          ) : null}
          <Button
            icon={<RefreshCcw size={13} />}
            loading={isLoadingBoard || isLoadingPrivateRates}
            size="small"
            onClick={() => {
              void loadBoard();
              void loadPrivateRates();
            }}
          >
            {t('reload')}
          </Button>
        </Space>
      </div>

      {error ? <Alert className="side-alert" type="error" showIcon message={error} /> : null}

      <Tabs
        items={[
          {
            key: 'bochk',
            label: t('bochkRatesTab'),
            children: (
              <div className="rate-workbench-stack">
                <section className="rate-calculator-panel">
                  <div className="rate-panel-heading">
                    <div>
                      <strong>{t('exchangeRateCalculator')}</strong>
                      <span>{t('bochkQuoteUnitHint')}</span>
                    </div>
                  </div>
                  <div className="rate-calculator-grid">
                    <InputNumber
                      className="form-full-width"
                      min={0}
                      precision={2}
                      step={100}
                      value={calculatorAmount}
                      onChange={(value) => setCalculatorAmount(typeof value === 'number' ? value : null)}
                    />
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={bochkCurrencyOptions}
                      value={calculatorCurrency}
                      onChange={setCalculatorCurrency}
                    />
                    <Select
                      options={[
                        { label: t('sellForeignCurrency'), value: 'sell_foreign' },
                        { label: t('buyForeignCurrency'), value: 'buy_foreign' },
                      ]}
                      value={calculatorMode}
                      onChange={setCalculatorMode}
                    />
                    <div className="rate-calculator-result">
                      <span>{calculatorMode === 'sell_foreign' ? t('estimatedHkdReceivable') : t('estimatedHkdPayable')}</span>
                      <strong>{calculatorResult === null ? 'HKD --' : `HKD ${formatMoney(calculatorResult)}`}</strong>
                      <small>{calculatorRate === undefined ? '--' : `${t('appliedRate')}: ${formatRate(calculatorRate)}`}</small>
                    </div>
                  </div>
                </section>

                <Descriptions
                  bordered
                  column={{ xs: 1, sm: 2, md: 4 }}
                  items={boardMetaItems}
                  size="small"
                />

                <section className="featured-rate-grid">
                  {featuredRows.map((row) => (
                    <article className="featured-rate-card" key={row.currency}>
                      <div>
                        <strong>{row.currency}</strong>
                        <span>{row.currencyName}</span>
                      </div>
                      <div className="featured-rate-values">
                        <span>{t('customerBuyRate')} <strong>{formatRate(row.customerBuyRate)}</strong></span>
                        <span>{t('customerSellRate')} <strong>{formatRate(row.customerSellRate)}</strong></span>
                      </div>
                      <small>{t('spread')}: {formatRate(row.customerSellRate - row.customerBuyRate)}</small>
                    </article>
                  ))}
                </section>

                <section className="rate-board-panel">
                  <div className="rate-board-toolbar">
                    <div>
                      <strong>{t('bochkRateBoard')}</strong>
                      <span>{t('bochkNoReciprocalHint')}</span>
                    </div>
                    <Input
                      allowClear
                      className="rate-board-search"
                      prefix={<Search size={14} />}
                      placeholder={t('search')}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                  </div>
                  <Table<BochkRateBoardRow>
                    columns={boardColumns}
                    dataSource={filteredBoardRows}
                    loading={isLoadingBoard}
                    locale={{ emptyText: t('noExchangeRates') }}
                    pagination={{ hideOnSinglePage: true, pageSize: 12 }}
                    rowKey="currency"
                    scroll={{ x: 720 }}
                    size="small"
                  />
                </section>
              </div>
            ),
          },
          {
            key: 'private',
            label: t('privateRatesTab'),
            children: (
              <div className="rate-workbench-stack">
                <Alert
                  showIcon
                  type="info"
                  message={t('privateRateHelp')}
                />
                <div className="rate-board-toolbar">
                  <div>
                    <strong>{t('accountPrivateRate')}</strong>
                    <span>{t('privateRatePairRule')}</span>
                  </div>
                  <Button icon={<Plus size={14} />} type="primary" onClick={openCreatePrivateRate}>
                    {t('add')}
                  </Button>
                </div>
                <Table<CurrencyRate>
                  columns={privateColumns}
                  dataSource={privateRates}
                  loading={isLoadingPrivateRates}
                  locale={{ emptyText: t('noExchangeRates') }}
                  pagination={false}
                  rowKey="id"
                  scroll={{ x: 720 }}
                  size="small"
                />
              </div>
            ),
          },
        ]}
      />

      <Modal
        confirmLoading={savingPrivateRate}
        okText={t('save')}
        open={privateRateModalOpen}
        title={editingPrivateRate === null ? t('addPrivateRate') : t('editPrivateRate')}
        onCancel={() => setPrivateRateModalOpen(false)}
        onOk={() => void savePrivateRate()}
      >
        <Alert className="modal-error" showIcon type="info" message={t('privateRatePairRule')} />
        <Form<PrivateRateFormValues>
          form={privateRateForm}
          layout="vertical"
          name="account-private-exchange-rate"
          requiredMark={false}
        >
          <div className="currency-reference-grid">
            <Form.Item
              label={t('referenceCurrency')}
              name="fromCurrency"
              rules={[{ required: true, message: t('selectCurrency') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                optionRender={renderCurrencyOption}
                options={supportedCurrencyOptions}
              />
            </Form.Item>
            <Form.Item
              label={t('unsupportedCurrency')}
              name="toCurrency"
              rules={[{ required: true, message: t('selectCurrency') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                optionRender={renderCurrencyOption}
                options={unsupportedCurrencyOptions}
              />
            </Form.Item>
          </div>
          <div className="currency-reference-grid">
            <Form.Item
              label={t('rate')}
              name="rate"
              rules={[{ required: true, type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
            >
              <InputNumber className="form-full-width" precision={8} step={0.01} />
            </Form.Item>
            <Form.Item label={t('date')} name="rateDate">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item label={t('note')} name="note" rules={[{ max: 500, message: t('transactionRemarkMax') }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function formatRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return value.toLocaleString('en-US', {
    maximumFractionDigits: 8,
    minimumFractionDigits: 2,
  });
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}
