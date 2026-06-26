import { Form, InputNumber, Select } from 'antd';
import type { RefObject } from 'react';
import { useI18n } from '../../i18n';
import type { CurrencyCode } from '../../types/budget';
import type { BudgetItemFormValues } from '../../types/forms';
import type { CurrencySelectOption } from '../../utils/currencyOptions';
import { renderCurrencyOption } from '../../utils/currencyOptions';
import {
  formatBudgetMoney,
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';
import { previewBaseAmount } from './budgetItemAmountMath';

export function MoneyLegCard({
  allowNegative = false,
  amount,
  amountName,
  baseCurrency,
  currency,
  currencyName,
  currencyOptions,
  help,
  focused,
  rate,
  rateName,
  title,
  wrapperRef,
}: {
  allowNegative?: boolean;
  amount?: number;
  amountName: keyof BudgetItemFormValues;
  baseCurrency: CurrencyCode;
  currency: CurrencyCode;
  currencyName: keyof BudgetItemFormValues;
  currencyOptions: CurrencySelectOption[];
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
          <Select
            showSearch
            optionFilterProp="label"
            optionLabelProp="value"
            optionRender={renderCurrencyOption}
            options={currencyOptions}
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
