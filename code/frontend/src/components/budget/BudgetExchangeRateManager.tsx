import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { Edit3, RefreshCcw, Scale, Trash2 } from 'lucide-react';
import {
  createBudgetExchangeRate,
  deleteBudgetExchangeRate,
  listBudgetExchangeRates,
  syncBudgetExchangeRatesFromGlobal,
  updateBudgetExchangeRate,
  type CreateBudgetExchangeRatePayload,
} from '../../api/exchangeRates';
import { useI18n } from '../../i18n';
import type { BudgetExchangeRate, CurrencyCode } from '../../types/budget';
import type { CurrencySelectOption } from '../../utils/currencyOptions';
import { renderCurrencyOption } from '../../utils/currencyOptions';

interface BudgetExchangeRateManagerProps {
  budgetId: number | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  currencyOptions: CurrencySelectOption[];
  triggerClassName?: string;
}

interface BudgetExchangeRateFormValues {
  id?: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  rateDate?: string;
  note?: string;
}

export function BudgetExchangeRateManager({
  budgetId,
  baseCurrency,
  canWriteBudgets,
  currencyOptions,
  triggerClassName,
}: BudgetExchangeRateManagerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [rates, setRates] = useState<BudgetExchangeRate[]>([]);
  const [editingRate, setEditingRate] = useState<BudgetExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<BudgetExchangeRateFormValues>();
  const fromCurrency = Form.useWatch('fromCurrency', form);
  const toCurrency = Form.useWatch('toCurrency', form);

  const defaultForeignCurrency = useMemo(
    () => currencyOptions.find((option) => option.value !== baseCurrency)?.value,
    [baseCurrency, currencyOptions],
  );

  const loadRates = useCallback(async () => {
    if (budgetId === null) {
      setRates([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setRates(await listBudgetExchangeRates(budgetId));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('loadingExchangeRatesFailed'));
    } finally {
      setLoading(false);
    }
  }, [budgetId, t]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        void loadRates();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadRates, open]);

  const openModal = () => {
    setOpen(true);
    if (canWriteBudgets) {
      openCreateRate();
    }
  };

  const closeModal = () => {
    setOpen(false);
    setEditingRate(null);
    setError(null);
    form.resetFields();
  };

  const openCreateRate = useCallback(() => {
    setEditingRate(null);
    form.resetFields();
    form.setFieldsValue({
      ...(defaultForeignCurrency === undefined ? {} : { fromCurrency: defaultForeignCurrency }),
      toCurrency: baseCurrency,
      rateDate: todayInputDate(),
    });
  }, [baseCurrency, defaultForeignCurrency, form]);

  const openEditRate = useCallback((rate: BudgetExchangeRate) => {
    setEditingRate(rate);
    form.setFieldsValue({
      id: rate.id,
      fromCurrency: rate.from,
      toCurrency: rate.to,
      rate: rate.rate,
      rateDate: rate.rateDate,
      note: rate.note ?? undefined,
    });
  }, [form]);

  const saveRate = async () => {
    if (budgetId === null) {
      setError(t('selectBudgetFirst'));
      return;
    }

    const values = await form.validateFields();
    const payload: CreateBudgetExchangeRatePayload = {
      id: editingRate?.id,
      budgetId,
      fromCurrency: values.fromCurrency,
      toCurrency: values.toCurrency,
      rate: values.rate,
      rateDate: values.rateDate,
      note: values.note ?? null,
    };
    if (payload.fromCurrency === payload.toCurrency) {
      setError(t('exchangeRateCurrenciesMustDiffer'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedRate = editingRate === null
        ? await createBudgetExchangeRate(payload)
        : await updateBudgetExchangeRate(payload);
      setRates((current) => [
        savedRate,
        ...current.filter((rate) => rate.id !== savedRate.id && rate.id !== editingRate?.id),
      ].sort(compareBudgetRates));
      setEditingRate(savedRate);
      form.setFieldsValue({ id: savedRate.id });
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('saveExchangeRateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const removeRate = useCallback(async (id: number) => {
    setDeletingId(id);
    setError(null);

    try {
      setRates(await deleteBudgetExchangeRate(id));
      if (editingRate?.id === id) {
        openCreateRate();
      }
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('saveExchangeRateFailed'));
    } finally {
      setDeletingId(null);
    }
  }, [editingRate, openCreateRate, t]);

  const syncBasePairs = async () => {
    if (budgetId === null) {
      setError(t('selectBudgetFirst'));
      return;
    }

    const pairs = currencyOptions
      .map((option) => option.value)
      .filter((currency) => currency !== baseCurrency)
      .map((currency) => ({ fromCurrency: currency, toCurrency: baseCurrency }));

    if (pairs.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await syncBudgetExchangeRatesFromGlobal({ budgetId, pairs });
      await loadRates();
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : t('loadingExchangeRatesFailed'));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<TableColumnsType<BudgetExchangeRate>>(
    () => [
      {
        key: 'pair',
        title: t('currencyPair'),
        width: 200,
        render: (_, rate) => (
          <span className="budget-rate-pair">
            <strong>{rate.from}{' -> '}{rate.to}</strong>
            <small>{rate.note ?? t('rateScopeBudget')}</small>
          </span>
        ),
      },
      {
        dataIndex: 'rate',
        key: 'rate',
        title: t('rate'),
        align: 'right',
        width: 112,
        render: formatRate,
      },
      {
        dataIndex: 'rateDate',
        key: 'rateDate',
        title: t('date'),
        width: 116,
      },
      {
        key: 'actions',
        align: 'right',
        width: 92,
        render: (_, rate) => (
          canWriteBudgets ? (
            <Space size={4}>
              <Tooltip title={t('edit')}>
                <Button
                  aria-label={t('edit')}
                  icon={<Edit3 size={13} />}
                  size="small"
                  onClick={() => openEditRate(rate)}
                />
              </Tooltip>
              <Popconfirm
                title={t('deleteBudgetExchangeRateTitle')}
                okText={t('delete')}
                cancelText={t('cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void removeRate(rate.id)}
              >
                <Tooltip title={t('delete')}>
                  <Button
                    aria-label={t('delete')}
                    danger
                    icon={<Trash2 size={13} />}
                    loading={deletingId === rate.id}
                    size="small"
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          ) : null
        ),
      },
    ],
    [canWriteBudgets, deletingId, openEditRate, removeRate, t],
  );

  return (
    <>
      <Button
        className={triggerClassName}
        disabled={budgetId === null}
        icon={<Scale size={14} />}
        onClick={openModal}
      >
        {t('budgetExchangeRates')}
      </Button>
      <Modal
        destroyOnClose
        footer={null}
        forceRender
        open={open}
        title={t('budgetExchangeRates')}
        width={1080}
        wrapClassName="budget-rate-modal"
        onCancel={closeModal}
      >
        <div className="budget-rate-manager">
          <Alert
            showIcon
            type="info"
            message={t('budgetExchangeRateHelp')}
          />
          {error ? <Alert showIcon type="error" message={error} /> : null}

          <div className="budget-rate-manager-grid">
            {canWriteBudgets ? (
              <section className="budget-rate-form-panel">
                <div className="budget-rate-panel-heading">
                  <div>
                    <strong>{editingRate === null ? t('addBudgetExchangeRate') : t('editBudgetExchangeRate')}</strong>
                    <span>{t('budgetExchangeRatePriorityHint')}</span>
                  </div>
                  <Tag color="red">{baseCurrency}</Tag>
                </div>
                <Form<BudgetExchangeRateFormValues>
                  form={form}
                  layout="vertical"
                  name="budget-exchange-rate"
                  preserve={false}
                  requiredMark={false}
                >
                  <div className="currency-reference-grid">
                    <Form.Item
                      label={t('fromCurrency')}
                      name="fromCurrency"
                      rules={[{ required: true, message: t('selectCurrency') }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="value"
                        optionRender={renderCurrencyOption}
                        options={currencyOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      label={t('toCurrency')}
                      name="toCurrency"
                      rules={[
                        { required: true, message: t('selectCurrency') },
                        {
                          validator: async (_, value: CurrencyCode | undefined) => {
                            if (value !== undefined && value === fromCurrency) {
                              throw new Error(t('exchangeRateCurrenciesMustDiffer'));
                            }
                          },
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="value"
                        optionRender={renderCurrencyOption}
                        options={currencyOptions}
                        status={fromCurrency !== undefined && fromCurrency === toCurrency ? 'error' : undefined}
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
                <Space wrap>
                  <Button type="primary" loading={saving} onClick={() => void saveRate()}>
                    {t('save')}
                  </Button>
                  <Button onClick={openCreateRate}>{t('newBudgetExchangeRate')}</Button>
                  <Button
                    icon={<RefreshCcw size={13} />}
                    loading={saving || loading}
                    onClick={() => void syncBasePairs()}
                  >
                    {t('syncGlobalRateToBudget')}
                  </Button>
                </Space>
              </section>
            ) : null}

            <section className="budget-rate-list-panel">
              <div className="budget-rate-panel-heading">
                <div>
                  <strong>{t('budgetExchangeRateList')}</strong>
                  <span>{t('budgetExchangeRateListHint')}</span>
                </div>
                <Button
                  icon={<RefreshCcw size={13} />}
                  loading={loading}
                  size="small"
                  onClick={() => void loadRates()}
                >
                  {t('reload')}
                </Button>
              </div>
              <Table<BudgetExchangeRate>
                columns={columns}
                dataSource={rates}
                loading={loading}
                locale={{ emptyText: t('noExchangeRates') }}
                pagination={{ hideOnSinglePage: true, pageSize: 8 }}
                rowKey="id"
                scroll={{ x: 520 }}
                size="small"
                tableLayout="fixed"
              />
            </section>
          </div>
        </div>
      </Modal>
    </>
  );
}

function compareBudgetRates(left: BudgetExchangeRate, right: BudgetExchangeRate): number {
  const pairCompare = `${left.from}-${left.to}`.localeCompare(`${right.from}-${right.to}`);
  if (pairCompare !== 0) {
    return pairCompare;
  }

  return right.rateDate.localeCompare(left.rateDate);
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

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}
