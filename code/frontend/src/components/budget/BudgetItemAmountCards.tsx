import { Form, InputNumber, Radio } from 'antd';
import type { RefObject } from 'react';
import { useEffect } from 'react';
import { useI18n } from '../../i18n';
import type { Currency, CurrencyCode } from '../../types/budget';
import type { BudgetItemFormValues } from '../../types/forms';
import type { CurrencySelectOption } from '../../utils/currencyOptions';
import {
  formatBudgetMoney,
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';
import { CurrencySelectWithQuickAdd } from './CurrencySelectWithQuickAdd';

export function MoneyLegCard({
  allowNegative = false,
  amount,
  amountName,
  baseCurrency,
  currency,
  currencyName,
  currencyOptions,
  currencyPresets,
  currencies,
  help,
  focused,
  rate,
  rateName,
  title,
  wrapperRef,
  onSaveCurrency,
}: {
  allowNegative?: boolean;
  amount?: number;
  amountName: keyof BudgetItemFormValues;
  baseCurrency: CurrencyCode;
  currency: CurrencyCode;
  currencyName: keyof BudgetItemFormValues;
  currencyOptions: CurrencySelectOption[];
  currencyPresets: Currency[];
  currencies: Currency[];
  focused: boolean;
  help: string;
  rate?: number;
  rateName: keyof BudgetItemFormValues;
  title: string;
  wrapperRef?: RefObject<HTMLDivElement | null>;
  onSaveCurrency: (input: {
    code: string;
    name: string;
    symbol?: string;
    decimalPlaces: number;
    source?: 'catalog' | 'manual';
  }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const form = Form.useFormInstance<BudgetItemFormValues>();
  const preview = previewBaseAmount(amount, rate);
  const targetBaseAmount = Form.useWatch('budgetTargetBaseAmount', form);

  useEffect(() => {
    if (amountName !== 'budgetAmount') {
      return;
    }
    if (
      typeof amount !== 'number'
      || !Number.isFinite(amount)
      || amount <= 0
      || typeof targetBaseAmount !== 'number'
      || !Number.isFinite(targetBaseAmount)
      || targetBaseAmount < 0
    ) {
      return;
    }

    const nextRate = Number((targetBaseAmount / amount).toFixed(6));
    if (nextRate > 0 && form.getFieldValue(rateName) !== nextRate) {
      form.setFieldValue(rateName, nextRate);
    }
  }, [amount, amountName, form, rateName, targetBaseAmount]);

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
          <CurrencySelectWithQuickAdd
            currencies={currencies}
            currencyPresets={currencyPresets}
            options={currencyOptions}
            onSaveCurrency={onSaveCurrency}
          />
        </Form.Item>
        <Form.Item
          label={t('amount')}
          name={amountName}
          rules={
            allowNegative
              ? [{ type: 'number' }]
              : [{ type: 'number', min: 0, message: t('amountMin') }]
          }
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
      {amountName === 'budgetAmount' ? (
        <Form.Item
          label={t('targetBaseAmount', { currency: baseCurrency })}
          name="budgetTargetBaseAmount"
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
      ) : null}
      <Form.Item
        label={t('rateSaveScope')}
        name="rateScope"
        initialValue="item"
      >
        <Radio.Group
          block
          optionType="button"
          options={[
            { label: t('rateScopeItem'), value: 'item' },
            { label: t('rateScopeBudget'), value: 'budget_default' },
          ]}
          size="small"
        />
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

export function TransactionActualsCard({
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

export function SettlementPreviewCard({
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

export function previewBaseAmount(amount: number | null | undefined, rate: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }

  const normalizedRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;

  return roundMoney(amount * normalizedRate);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
