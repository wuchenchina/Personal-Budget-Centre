import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { ChangeEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import { useI18n } from '../../i18n';
import { ModalFullscreenButton } from '../common/ModalFullscreenButton';
import type { BudgetItem, CurrencyCode, Transaction } from '../../types/budget';
import type { BudgetItemFormValues } from '../../types/forms';
import type { BudgetItemModalFocus } from '../../hooks/useBudgetEntryController';
import {
  effectiveBudgetItemAmounts,
  formatBudgetMoney,
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';

interface BudgetItemModalProps {
  form: FormInstance<BudgetItemFormValues>;
  editingItem: BudgetItem | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  baseCurrency: CurrencyCode;
  focus: BudgetItemModalFocus;
  transactions: Transaction[];
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
  onRefreshRates: () => void;
}

export function BudgetItemModal({
  form,
  editingItem,
  open,
  error,
  categoryOptions,
  baseCurrency,
  focus,
  transactions,
  confirmLoading,
  onCancel,
  onOk,
  onRefreshRates,
}: BudgetItemModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const { t } = useI18n();
  const categoryRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDivElement>(null);
  const varianceRef = useRef<HTMLDivElement>(null);
  const budgetCurrency = Form.useWatch('budgetCurrency', form) ?? baseCurrency;
  const budgetAmount = Form.useWatch('budgetAmount', form);
  const budgetRate = Form.useWatch('budgetRate', form);
  const installmentEnabled = Form.useWatch(['installmentConfig', 'enabled'], form) === true;
  const installmentTotal = Form.useWatch(['installmentConfig', 'totalAmount'], form);
  const installmentMonths = Form.useWatch(['installmentConfig', 'months'], form);
  const installmentMonthly = Form.useWatch(['installmentConfig', 'monthlyAmount'], form);
  const calculatedMonthlyInstallment =
    typeof installmentMonthly === 'number' && installmentMonthly > 0
      ? installmentMonthly
      : null;
  const derivedMonthlyInstallment =
    calculatedMonthlyInstallment
    ?? (typeof installmentTotal === 'number'
      && typeof installmentMonths === 'number'
      && installmentTotal > 0
      && installmentMonths > 0
      ? installmentTotal / installmentMonths
      : null);
  const transactionActuals = editingItem === null
    ? null
    : effectiveBudgetItemAmounts(editingItem, transactions);
  const focusLabel =
    focus === 'category'
      ? t('category')
      : focus === 'budget'
        ? t('budget')
        : focus === 'estimated_actuals'
          ? t('estimatedActuals')
          : focus === 'variance'
            ? t('variance')
            : null;
  const budgetBasePreview = previewBaseAmount(budgetAmount, budgetRate);
  const estimatedBasePreview = transactionActuals?.estimatedAmountBase ?? 0;
  const computedVariance =
    budgetBasePreview !== null
      ? roundMoney(budgetBasePreview - estimatedBasePreview)
      : transactionActuals?.varianceBase ?? null;

  useEffect(() => {
    if (!open || focus === null) {
      return;
    }

    const target = focus === 'category'
      ? categoryRef.current
      : focus === 'variance'
        ? varianceRef.current
        : budgetRef.current;
    window.setTimeout(() => {
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }, [focus, open]);

  const handleCategoryChange = (categoryId: number | null | undefined) => {
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined) {
      form.setFieldValue('label', selectedOption.label);
    }
  };
  const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
    const categoryId = form.getFieldValue('categoryId');
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined && selectedOption.label !== event.target.value.trim()) {
      form.setFieldValue('categoryId', undefined);
    }
  };
  const applyInstallmentMonthlyAmount = () => {
    if (derivedMonthlyInstallment === null) {
      return;
    }

    form.setFieldsValue({
      budgetAmount: Number(derivedMonthlyInstallment.toFixed(2)),
      installmentConfig: {
        ...form.getFieldValue('installmentConfig'),
        monthlyAmount: Number(derivedMonthlyInstallment.toFixed(2)),
      },
    });
  };

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingItem === null ? t('create') : t('save')}
      open={open}
      title={
        <div className="modal-title-with-tools">
          <span>
            {editingItem === null ? t('budgetItem') : t('editBudgetItem')}
            {focusLabel === null ? null : <small className="modal-title-context">{focusLabel}</small>}
          </span>
          <ModalFullscreenButton fullscreen={fullscreen} setFullscreen={setFullscreen} />
        </div>
      }
      width={fullscreen ? 'calc(100vw - 24px)' : 'min(1040px, calc(100vw - 40px))'}
      style={{ top: 18 }}
      wrapClassName={`large-form-modal${fullscreen ? ' modal-fullscreen' : ''}`}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BudgetItemFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-budget-item"
        requiredMark={false}
      >
        <div
          className={`entry-basic-grid${focus === 'category' ? ' budget-modal-focus-target' : ''}`}
          ref={categoryRef}
        >
          <Form.Item
            label={t('presetCategory')}
            name="categoryId"
            extra={t('presetCategoryHelp')}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
              placeholder={t('selectCategory')}
              onChange={handleCategoryChange}
            />
          </Form.Item>

          <Form.Item
            label={t('categoryName')}
            name="label"
            rules={[
              { required: true, whitespace: true, message: t('categoryNameRequired') },
              { max: 160, message: t('categoryNameMax') },
            ]}
            extra={t('customCategoryHelp')}
          >
            <Input
              allowClear
              maxLength={160}
              placeholder={t('customCategoryPlaceholder')}
              onChange={handleLabelChange}
            />
          </Form.Item>
        </div>

        <div className="currency-config-panel currency-config-panel-wide">
          <div className="currency-config-header">
            <div>
              <div className="currency-config-title">{t('amountCurrencySettings')}</div>
              <div className="currency-config-subtitle">
                {t('amountCurrencySettingsHelp', { currency: baseCurrency })}
              </div>
            </div>
            <Button
              icon={<RefreshCcw size={14} />}
              loading={confirmLoading}
              size="small"
              onClick={onRefreshRates}
            >
              {t('refreshBochkRates')}
            </Button>
          </div>
          <div className="currency-field-grid">
            <MoneyLegCard
              amountName="budgetAmount"
              currencyName="budgetCurrency"
              rateName="budgetRate"
              amount={budgetAmount}
              baseCurrency={baseCurrency}
              currency={budgetCurrency}
              focused={focus === 'budget' || focus === 'variance'}
              help={t('budgetCurrencyLegHelp')}
              rate={budgetRate}
              title={t('budget')}
              wrapperRef={budgetRef}
            />
            <TransactionActualsCard
              baseCurrency={baseCurrency}
              totals={transactionActuals?.estimatedTransactionTotals ?? []}
              totalBase={estimatedBasePreview}
            />
            <SettlementPreviewCard
              baseCurrency={baseCurrency}
              budgetBase={budgetBasePreview}
              estimatedBase={estimatedBasePreview}
              focused={focus === 'variance'}
              varianceBase={computedVariance}
              wrapperRef={varianceRef}
            />
          </div>
        </div>

        <div className="installment-config-panel">
          <Form.Item name={['installmentConfig', 'enabled']} valuePropName="checked">
            <Checkbox>{t('enableInstallments')}</Checkbox>
          </Form.Item>
          {installmentEnabled ? (
            <>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentTotalAmount')}
                  name={['installmentConfig', 'totalAmount']}
                  rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
                <Form.Item
                  label={t('installmentMonths')}
                  name={['installmentConfig', 'months']}
                  rules={[
                    { type: 'number', min: 1, message: t('installmentMonthsMin') },
                    { type: 'number', max: 600, message: t('installmentMonthsMax') },
                  ]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
                <Form.Item
                  label={t('installmentMonthlyAmount')}
                  name={['installmentConfig', 'monthlyAmount']}
                  rules={[
                    { type: 'number', min: Number.MIN_VALUE, message: t('installmentMonthlyMin') },
                  ]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentPaidMonths')}
                  name={['installmentConfig', 'paidMonths']}
                  rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
                <Form.Item
                  label={t('installmentStartMonth')}
                  name={['installmentConfig', 'startMonth']}
                >
                  <DatePicker className="form-full-width" picker="month" />
                </Form.Item>
                <Form.Item label={t('installmentRemark')} name={['installmentConfig', 'remark']}>
                  <Input maxLength={500} />
                </Form.Item>
              </div>
              <Button
                block
                disabled={derivedMonthlyInstallment === null}
                type="dashed"
                onClick={applyInstallmentMonthlyAmount}
              >
                {derivedMonthlyInstallment === null
                  ? t('applyInstallmentMonthly')
                  : t('applyInstallmentMonthlyWithAmount', {
                    amount: `${budgetCurrency ?? t('currency')} ${derivedMonthlyInstallment.toFixed(2)}`,
                  })}
              </Button>
            </>
          ) : null}
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="Bank Fee (%)"
            name="bankFee"
            rules={[
              { type: 'number', min: 0, message: t('bankFeeMin') },
              { type: 'number', max: 100, message: t('bankFeeMax') },
            ]}
          >
            <InputNumber className="form-full-width" precision={2} step={0.1} />
          </Form.Item>
          <Form.Item
            label={t('sortOrder')}
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function MoneyLegCard({
  amount,
  amountName,
  baseCurrency,
  currency,
  currencyName,
  help,
  focused,
  rate,
  rateName,
  title,
  wrapperRef,
}: {
  amount?: number;
  amountName: keyof BudgetItemFormValues;
  baseCurrency: CurrencyCode;
  currency: CurrencyCode;
  currencyName: keyof BudgetItemFormValues;
  focused: boolean;
  help: string;
  rate?: number;
  rateName: keyof BudgetItemFormValues;
  title: string;
  wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const preview = previewBaseAmount(amount, rate);

  return (
    <div
      className={`currency-field-card${focused ? ' budget-modal-focus-target' : ''}`}
      ref={wrapperRef}
    >
      <div className="currency-field-card-head">
        <strong>{title}</strong>
        <span>{help}</span>
      </div>
      <div className="currency-field-inner-grid">
        <Form.Item
          label={t('currency')}
          name={currencyName}
          rules={[{ required: true, message: t('selectCurrency') }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label={t('amount')}
          name={amountName}
          rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
        >
          <InputNumber
            addonBefore={currency}
            className="form-full-width"
            precision={2}
            step={100}
          />
        </Form.Item>
      </div>
      <Form.Item
        label={t('rateToBaseCurrency', { currency: baseCurrency })}
        name={rateName}
        extra={t('manualRateOptional')}
        rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
      >
        <InputNumber className="form-full-width" precision={6} step={0.01} />
      </Form.Item>
      <div className="currency-field-preview">
        <span>{t('baseCurrencyPreview')}</span>
        <strong>
          {preview === null ? `${baseCurrency} --` : `${baseCurrency} ${preview.toFixed(2)}`}
        </strong>
      </div>
    </div>
  );
}

function TransactionActualsCard({
  baseCurrency,
  totalBase,
  totals,
}: {
  baseCurrency: CurrencyCode;
  totalBase: number;
  totals: TransactionCurrencyTotal[];
}) {
  const { t } = useI18n();

  return (
    <div className="currency-field-card currency-field-card-muted">
      <div className="currency-field-card-head">
        <strong>{t('estimatedActuals')}</strong>
        <span>{t('transactionDrivenEstimatedActuals')}</span>
      </div>
      <div className="currency-readonly-amount">
        <span>{t('baseCurrencyPreview')}</span>
        <strong>{formatBudgetMoney(baseCurrency, totalBase)}</strong>
      </div>
      <div className="currency-readonly-breakdown">
        <span>{t('transactionCurrencyBreakdown')}</span>
        {totals.length === 0 ? (
          <strong>{t('noTransactionActuals')}</strong>
        ) : (
          <div>
            {totals.map((total) => (
              <small key={total.currency}>{formatBudgetMoney(total.currency, total.amountOriginal)}</small>
            ))}
          </div>
        )}
      </div>
      <p className="currency-readonly-help">{t('transactionDrivenEstimatedActualsHelp')}</p>
    </div>
  );
}

function SettlementPreviewCard({
  baseCurrency,
  budgetBase,
  estimatedBase,
  focused,
  varianceBase,
  wrapperRef,
}: {
  baseCurrency: CurrencyCode;
  budgetBase: number | null;
  estimatedBase: number;
  focused: boolean;
  varianceBase: number | null;
  wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();

  return (
    <div
      className={`currency-field-card currency-field-card-muted${focused ? ' budget-modal-focus-target' : ''}`}
      ref={wrapperRef}
    >
      <div className="currency-field-card-head">
        <strong>{t('variance')}</strong>
        <span>{baseCurrency}</span>
      </div>
      <div className="currency-readonly-ledger">
        <span>{t('budget')}</span>
        <strong>{budgetBase === null ? `${baseCurrency} --` : formatBudgetMoney(baseCurrency, budgetBase)}</strong>
        <span>{t('estimatedActuals')}</span>
        <strong>{formatBudgetMoney(baseCurrency, estimatedBase)}</strong>
      </div>
      <div className="currency-field-preview">
        <span>{t('settlementPreview')}</span>
        <strong>
          {varianceBase === null ? `${baseCurrency} --` : formatBudgetMoney(baseCurrency, varianceBase)}
        </strong>
      </div>
      <p className="currency-readonly-help">{t('varianceAutoHelp')}</p>
    </div>
  );
}

function previewBaseAmount(amount: number | null | undefined, rate: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }

  const normalizedRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;

  return roundMoney(amount * normalizedRate);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
