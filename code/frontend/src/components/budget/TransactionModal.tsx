import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { Calculator, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '../../i18n';
import type {
  BudgetItem,
  BudgetItemSplitType,
  BudgetParticipant,
  BudgetParticipantMode,
  CurrencyCode,
  Transaction,
} from '../../types/budget';
import type { TransactionFormValues } from '../../types/forms';
import type { CurrencySelectOption } from '../../utils/currencyOptions';
import { renderCurrencyOption } from '../../utils/currencyOptions';
import {
  syncCurrencyTriad,
  syncCurrencyTriadAfterProgrammaticChange,
} from '../../utils/currencyTriad';

interface TransactionModalProps {
  form: FormInstance<TransactionFormValues>;
  editingTransaction: Transaction | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  currencyOptions: CurrencySelectOption[];
  baseCurrency: CurrencyCode;
  pricingEnabled: boolean;
  participantMode: BudgetParticipantMode;
  participants: BudgetParticipant[];
  items: BudgetItem[];
  confirmLoading: boolean;
  onCancel: () => void;
  onCategoryChange: (categoryId: number | null | undefined) => void;
  onOk: () => void;
  onRefreshRates: () => void;
  onReferenceConvert: () => void;
  onValuesChange: () => void;
}

export function TransactionModal({
  form,
  editingTransaction,
  open,
  error,
  categoryOptions,
  currencyOptions,
  baseCurrency,
  pricingEnabled,
  participantMode,
  participants,
  items,
  confirmLoading,
  onCancel,
  onCategoryChange,
  onOk,
  onRefreshRates,
  onReferenceConvert,
  onValuesChange,
}: TransactionModalProps) {
  const { t } = useI18n();
  const currency = Form.useWatch('currency', form) ?? baseCurrency;
  const selectedCategoryId = Form.useWatch('categoryId', form);
  const amount = Form.useWatch('amount', form);
  const rate = Form.useWatch('rate', form);
  const referenceCurrency = Form.useWatch('referenceCurrency', form);
  const referenceAmount = Form.useWatch('referenceAmount', form);
  const hasReferenceAmount =
    typeof referenceAmount === 'number' && Number.isFinite(referenceAmount);
  const pricingUnitPrice = Form.useWatch(['pricingConfig', 'unitPrice'], form);
  const pricingQuantity = Form.useWatch(['pricingConfig', 'quantity'], form);
  const basePreview =
    typeof amount === 'number' && Number.isFinite(amount)
      ? amount * (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1)
      : null;
  const referencePreview =
    hasReferenceAmount && referenceCurrency
      ? `${referenceCurrency} ${referenceAmount.toFixed(2)}`
      : null;
  const impliedReferenceRate =
    typeof amount === 'number'
    && Number.isFinite(amount)
    && typeof referenceAmount === 'number'
    && Number.isFinite(referenceAmount)
    && referenceAmount > 0
      ? `${referenceCurrency ?? t('currency')} 1 = ${currency} ${(amount / referenceAmount).toFixed(6)}`
      : null;
  const selectedItem = items.find((item) => item.categoryId === selectedCategoryId) ?? null;
  const showPaymentPanel =
    participantMode === 'group'
    && participants.length > 0
    && selectedItem !== null
    && splitTypeSupportsTransactionPayments(selectedItem.split?.splitType ?? 'equal');
  const paymentMode = Form.useWatch('paymentMode', form) ?? 'single';
  const paymentRows = Form.useWatch('payments', form) ?? [];
  const paymentTotal = paymentRows.reduce((total, row) => (
    total + (typeof row?.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0)
  ), 0);
  const paymentRemaining =
    typeof amount === 'number' && Number.isFinite(amount)
      ? amount - paymentTotal
      : null;
  const participantOptions = participants.map((participant) => ({
    label: participant.name,
    value: participant.id,
  }));
  const pricingTotal =
    typeof pricingUnitPrice === 'number'
    && Number.isFinite(pricingUnitPrice)
    && pricingUnitPrice >= 0
    && typeof pricingQuantity === 'number'
    && Number.isFinite(pricingQuantity)
    && pricingQuantity >= 0
      ? roundMoney(pricingUnitPrice * pricingQuantity)
      : null;

  useEffect(() => {
    if (!open || !showPaymentPanel || paymentMode !== 'multiple') {
      return;
    }

    const currentRows = form.getFieldValue('payments') as TransactionPaymentFormRows | undefined;
    const nextRows = normalizePaymentRows(currentRows, participants);
    if (!paymentRowsEqual(currentRows, nextRows)) {
      form.setFieldValue('payments', nextRows);
    }
  }, [form, open, participants, paymentMode, showPaymentPanel]);

  useEffect(() => {
    if (!open || showPaymentPanel) {
      return;
    }

    form.setFieldsValue({
      paymentMode: 'single',
      paidByParticipantId: null,
      payments: [],
    });
  }, [form, open, showPaymentPanel]);

  useEffect(() => {
    if (!open || !pricingEnabled || pricingTotal === null) {
      return;
    }

    const nextAmount = Number(pricingTotal.toFixed(2));
    if (form.getFieldValue('amount') !== nextAmount) {
      const values = {
        ...form.getFieldsValue(),
        amount: nextAmount,
      } as TransactionFormValues;
      form.setFieldsValue({
        amount: nextAmount,
        ...syncCurrencyTriadAfterProgrammaticChange(values, transactionBaseTriadKeys),
      });
    }
  }, [form, open, pricingEnabled, pricingTotal]);

  const defaultPaidByParticipantId =
    selectedItem?.split?.paidByParticipantId ?? participants[0]?.id ?? null;
  const handlePaymentModeChange = (mode: 'single' | 'multiple') => {
    if (mode === 'single') {
      form.setFieldsValue({
        paymentMode: 'single',
        paidByParticipantId: form.getFieldValue('paidByParticipantId')
          ?? defaultPaidByParticipantId
          ?? undefined,
      });

      return;
    }

    form.setFieldsValue({
      paymentMode: 'multiple',
      paidByParticipantId: null,
      payments: normalizePaymentRows(
        form.getFieldValue('payments') as TransactionPaymentFormRows | undefined,
        participants,
        form.getFieldValue('paidByParticipantId') ?? defaultPaidByParticipantId,
        amount,
      ),
    });
  };
  const handleValuesChange = (
    changedValues: Partial<TransactionFormValues>,
    allValues: TransactionFormValues,
  ) => {
    const nextFields = syncCurrencyTriad(changedValues, allValues, transactionBaseTriadKeys);
    if (Object.keys(nextFields).length > 0) {
      form.setFieldsValue(nextFields);
    }
    onValuesChange();
  };

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingTransaction === null ? t('create') : t('save')}
      open={open}
      title={editingTransaction === null ? t('transaction') : t('editTransaction')}
      width="min(920px, calc(100vw - 40px))"
      style={{ top: 24 }}
      wrapClassName="large-form-modal"
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<TransactionFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-transaction"
        requiredMark={false}
        onValuesChange={handleValuesChange}
      >
        <div className="entry-basic-grid">
          <Form.Item
            label={t('transactionDetails')}
            name="details"
            rules={[
              { required: true, message: t('transactionDetailsRequired') },
              { max: 500, message: t('transactionDetailsMax') },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>

          <Form.Item label={t('date')} name="transactionDate">
            <DatePicker className="form-full-width" />
          </Form.Item>
        </div>

        <Form.Item
          label={t('category')}
          name="categoryId"
          extra={t('transactionCategoryFromHighlightsOnly')}
          rules={[{ required: true, message: t('transactionCategoryFromHighlightsOnly') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            placeholder={t('selectCategory')}
            onChange={onCategoryChange}
          />
        </Form.Item>

        {showPaymentPanel ? (
          <div className="group-split-panel transaction-payment-panel">
            <div className="group-split-header">
              <div>
                <strong>{t('transactionPaymentBreakdown')}</strong>
                <span>{t('transactionPaymentBreakdownHelp')}</span>
              </div>
            </div>
            <div className="modal-form-grid">
              <Form.Item
                label={t('paymentEntryMode')}
                name="paymentMode"
                rules={[{ required: true, message: t('paymentEntryModeRequired') }]}
              >
                <Select
                  options={[
                    { label: t('paymentSingle'), value: 'single' },
                    { label: t('paymentMultiple'), value: 'multiple' },
                  ]}
                  onChange={handlePaymentModeChange}
                />
              </Form.Item>
              {paymentMode === 'single' ? (
                <Form.Item
                  label={t('paidBy')}
                  name="paidByParticipantId"
                  rules={[{ required: true, message: t('selectPaidBy') }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={participantOptions}
                    placeholder={t('selectPaidBy')}
                  />
                </Form.Item>
              ) : null}
            </div>
            {paymentMode === 'multiple' ? (
              <Form.List name="payments">
                {(_, __, { errors }) => (
                  <div className="individual-split-list transaction-payment-list">
                    <div className="individual-split-list-head">
                      <div>
                        <strong>{t('paymentMultiple')}</strong>
                        <span>
                          {paymentRemaining === null
                            ? t('paymentTotal', { amount: `${currency} ${paymentTotal.toFixed(2)}` })
                            : t('paymentRemaining', {
                              amount: `${currency} ${paymentRemaining.toFixed(2)}`,
                            })}
                        </span>
                      </div>
                      <strong>{`${currency} ${paymentTotal.toFixed(2)}`}</strong>
                    </div>
                    {participants.map((participant, index) => (
                      <div className="individual-split-row" key={participant.id}>
                        <span>{participant.name}</span>
                        <Form.Item name={[index, 'participantId']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item
                          name={[index, 'amount']}
                          rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
                        >
                          <InputNumber
                            addonBefore={currency}
                            className="form-full-width"
                            min={0}
                            precision={2}
                            step={100}
                          />
                        </Form.Item>
                      </div>
                    ))}
                    <Form.ErrorList errors={errors} />
                  </div>
                )}
              </Form.List>
            ) : null}
          </div>
        ) : null}

        <div className="currency-config-panel">
          <div className="currency-config-header">
            <div>
              <div className="currency-config-title">{t('transactionAmountCurrency')}</div>
              <div className="currency-config-subtitle">
                {t('transactionAmountCurrencyHelp', { currency: baseCurrency })}
              </div>
            </div>
            <Button
              icon={<RefreshCcw size={14} />}
              loading={confirmLoading}
              size="small"
              onClick={onRefreshRates}
            >
              {t('refreshBankReferenceRates')}
            </Button>
          </div>
          <div className={`currency-transaction-grid${pricingEnabled ? ' currency-transaction-grid-pricing' : ''}`}>
            <Form.Item
              label={t('currency')}
              name="currency"
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
            {pricingEnabled ? (
              <Form.Item
                label={t('unitPrice')}
                name={['pricingConfig', 'unitPrice']}
                rules={[
                  { required: true, message: t('unitPriceRequired') },
                  { type: 'number', min: 0, message: t('unitPriceMin') },
                ]}
              >
                <InputNumber
                  addonBefore={currency ?? t('currency')}
                  className="form-full-width"
                  min={0}
                  precision={2}
                  step={100}
                />
              </Form.Item>
            ) : null}
            {pricingEnabled ? (
              <Form.Item
                label={t('quantity')}
                name={['pricingConfig', 'quantity']}
                rules={[
                  { required: true, message: t('quantityRequired') },
                  { type: 'number', min: 0, message: t('quantityMin') },
                ]}
              >
                <InputNumber
                  className="form-full-width"
                  min={0}
                  precision={2}
                  step={1}
                />
              </Form.Item>
            ) : null}
            <Form.Item
              label={t('amount')}
              name="amount"
              rules={[{ required: true, message: t('amountRequired') }]}
            >
              <InputNumber
                addonBefore={currency}
                className="form-full-width"
                precision={2}
                readOnly={pricingEnabled}
                step={100}
              />
            </Form.Item>
            <Form.Item
              label={t('rateToBaseCurrency', { currency: baseCurrency })}
              name="rate"
              extra={t('manualRateOptional')}
              rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
            >
              <InputNumber className="form-full-width" precision={6} step={0.01} />
            </Form.Item>
            <Form.Item
              label={t('targetBaseAmount', { currency: baseCurrency })}
              name="targetBaseAmount"
              extra={t('targetBaseAmountHelp')}
              rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
            >
              <InputNumber
                addonBefore={baseCurrency}
                className="form-full-width"
                precision={2}
                step={100}
              />
            </Form.Item>
          </div>
          <div className="currency-field-preview">
            <span>{t('baseCurrencyPreview')}</span>
            <strong>
              {basePreview === null
                ? `${baseCurrency} --`
              : `${baseCurrency} ${basePreview.toFixed(2)}`}
            </strong>
          </div>
          <div className="currency-reference-grid">
            <Form.Item
              label={t('referenceCurrency')}
              name="referenceCurrency"
              extra={t('referenceAmountHelp')}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                optionLabelProp="value"
                optionRender={renderCurrencyOption}
                options={currencyOptions}
              />
            </Form.Item>
            <Form.Item
              label={t('referenceAmount')}
              name="referenceAmount"
              rules={[
                { type: 'number', min: 0, message: t('referenceAmountMin') },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (typeof value !== 'number' || !Number.isFinite(value)) {
                      return Promise.resolve();
                    }

                    return getFieldValue('referenceCurrency')
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('selectReferenceCurrency')));
                  },
                }),
              ]}
            >
              <InputNumber
                addonBefore={referenceCurrency ?? t('currency')}
                className="form-full-width"
                precision={2}
                step={100}
              />
            </Form.Item>
          </div>
          <div className="currency-field-preview currency-reference-preview">
            <span>{t('referenceAmountPreview')}</span>
            <span className="currency-reference-preview-actions">
              <strong>
                {referencePreview ?? '--'}
                {impliedReferenceRate ? <small>{impliedReferenceRate}</small> : null}
              </strong>
              <Button
                disabled={referenceCurrency === undefined}
                icon={<Calculator size={14} />}
                loading={confirmLoading}
                size="small"
                onClick={onReferenceConvert}
              >
                {t('referenceConvert')}
              </Button>
            </span>
          </div>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label={t('sortOrder')}
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>

          <Form.Item
            label={t('note')}
            name="remark"
            rules={[{ max: 500, message: t('transactionRemarkMax') }]}
          >
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

type TransactionPaymentFormRows = NonNullable<TransactionFormValues['payments']>;

const transactionBaseTriadKeys = {
  amountKey: 'amount',
  rateKey: 'rate',
  targetKey: 'targetBaseAmount',
} as const;

function splitTypeSupportsTransactionPayments(splitType: BudgetItemSplitType): boolean {
  return splitType !== 'excluded' && splitType !== 'per_person';
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizePaymentRows(
  rows: TransactionPaymentFormRows | undefined,
  participants: BudgetParticipant[],
  paidByParticipantId?: number | null,
  amount?: number,
): TransactionPaymentFormRows {
  const amountByParticipantId = new Map<number, number | null>();
  rows?.forEach((row) => {
    if (typeof row?.participantId !== 'number') {
      return;
    }

    amountByParticipantId.set(
      row.participantId,
      typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null,
    );
  });

  if (
    typeof paidByParticipantId === 'number'
    && typeof amount === 'number'
    && Number.isFinite(amount)
    && !amountByParticipantId.has(paidByParticipantId)
  ) {
    amountByParticipantId.set(paidByParticipantId, amount);
  }

  return participants.map((participant) => ({
    participantId: participant.id,
    amount: amountByParticipantId.get(participant.id) ?? null,
  }));
}

function paymentRowsEqual(
  currentRows: TransactionPaymentFormRows | undefined,
  nextRows: TransactionPaymentFormRows,
): boolean {
  if (!Array.isArray(currentRows) || currentRows.length !== nextRows.length) {
    return false;
  }

  return nextRows.every((nextRow, index) => {
    const currentRow = currentRows[index];

    return currentRow?.participantId === nextRow.participantId
      && (currentRow?.amount ?? null) === (nextRow.amount ?? null);
  });
}
