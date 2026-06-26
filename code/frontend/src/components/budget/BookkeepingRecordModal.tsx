import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '../../i18n';
import type { BookkeepingRecord, CurrencyCode, TransactionType } from '../../types/budget';
import type { BookkeepingRecordFormValues } from '../../types/forms';
import type { CurrencySelectOption } from '../../utils/currencyOptions';
import { renderCurrencyOption } from '../../utils/currencyOptions';
import { syncCurrencyTriad } from '../../utils/currencyTriad';

interface BookkeepingRecordModalProps {
  form: FormInstance<BookkeepingRecordFormValues>;
  editingRecord: BookkeepingRecord | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: string }>;
  currencyOptions: CurrencySelectOption[];
  baseCurrency: CurrencyCode;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
  onValuesChange: () => void;
}

export function BookkeepingRecordModal({
  form,
  editingRecord,
  open,
  error,
  categoryOptions,
  currencyOptions,
  baseCurrency,
  confirmLoading,
  onCancel,
  onOk,
  onValuesChange,
}: BookkeepingRecordModalProps) {
  const { t } = useI18n();
  const transactionType = Form.useWatch('transactionType', form) ?? 'expense';
  const currency = Form.useWatch('currency', form) ?? baseCurrency;
  const amount = Form.useWatch('amount', form);
  const rate = Form.useWatch('rate', form);
  const destinationCurrency = Form.useWatch('destinationCurrency', form);
  const destinationAmount = Form.useWatch('destinationAmount', form);
  const showTargetBaseAmount = currency !== baseCurrency;
  const showDestinationFields =
    transactionType === 'transfer'
    || transactionType === 'fx_exchange'
    || transactionType === 'cross_border_remittance';
  const effectiveRate = showTargetBaseAmount
    ? typeof rate === 'number' && Number.isFinite(rate) && rate > 0
      ? rate
      : null
    : 1;
  const basePreview =
    typeof amount === 'number' && Number.isFinite(amount) && effectiveRate !== null
      ? amount * effectiveRate
      : null;
  const destinationPreview =
    typeof destinationAmount === 'number' && Number.isFinite(destinationAmount) && destinationCurrency
      ? `${destinationCurrency} ${destinationAmount.toFixed(2)}`
      : null;
  const handleValuesChange = (
    changedValues: Partial<BookkeepingRecordFormValues>,
    allValues: BookkeepingRecordFormValues,
  ) => {
    const sourceCurrency = allValues.currency ?? baseCurrency;
    const sourceFields = sourceCurrency === baseCurrency
      ? fixedBaseCurrencySourceFields(allValues)
      : Object.prototype.hasOwnProperty.call(changedValues, 'currency')
        ? resetForeignCurrencySourceFields(allValues)
        : syncCurrencyTriad(changedValues, allValues, bookkeepingSourceTriadKeys);
    const destinationFields = showDestinationFields
      ? syncCurrencyTriad(changedValues, allValues, bookkeepingDestinationTriadKeys)
      : {};
    const nextFields = {
      ...sourceFields,
      ...destinationFields,
    };
    if (Object.keys(nextFields).length > 0) {
      form.setFieldsValue(nextFields);
    }
    onValuesChange();
  };

  return (
    <Modal
      forceRender
      confirmLoading={confirmLoading}
      okText={editingRecord === null ? t('create') : t('save')}
      open={open}
      title={editingRecord === null ? t('addBookkeepingRecord') : t('editBookkeepingRecord')}
      width="min(840px, calc(100vw - 40px))"
      style={{ top: 24 }}
      wrapClassName="large-form-modal"
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BookkeepingRecordFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-bookkeeping-record"
        requiredMark={false}
        onValuesChange={handleValuesChange}
      >
        <div className="modal-form-grid">
          <Form.Item
            label={t('transactionType')}
            name="transactionType"
            rules={[{ required: true, message: t('selectTransactionType') }]}
          >
            <Select options={transactionTypeOptions(t)} />
          </Form.Item>
          <Form.Item label={t('date')} name="recordDate">
            <DatePicker className="form-full-width" />
          </Form.Item>
        </div>

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
          <Form.Item
            label={t('orderReference')}
            name="orderReference"
            rules={[{ max: 120, message: t('orderReferenceMax') }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </div>

        <Form.Item
          label={t('category')}
          name="categoryLabel"
          extra={t('bookkeepingCategoryFromHighlightsOnly')}
          rules={[{ max: 160, message: t('categoryNameMax') }]}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            placeholder={t('selectCategory')}
          />
        </Form.Item>

        <Form.Item
          label={t('sourceOfFunds')}
          name="sourceAccountName"
          rules={[{ max: 160, message: t('accountNameMax') }]}
        >
          <Input autoComplete="off" placeholder={t('sourceAccountPlaceholder')} />
        </Form.Item>

        {showDestinationFields ? (
          <div className="modal-form-grid">
            <Form.Item
              label={t('destinationAccount')}
              name="destinationAccountName"
              rules={[{ max: 160, message: t('accountNameMax') }]}
            >
              <Input autoComplete="off" placeholder={t('destinationAccountPlaceholder')} />
            </Form.Item>
          </div>
        ) : null}

        <div className="currency-config-panel">
          <div className="currency-config-header">
            <div>
              <div className="currency-config-title">{t('amountCurrencySettings')}</div>
              <div className="currency-config-subtitle">
                {t('transactionAmountCurrencyHelp', { currency: baseCurrency })}
              </div>
            </div>
          </div>
          <div className="currency-transaction-grid">
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
            <Form.Item
              label={t('amount')}
              name="amount"
              rules={[
                { required: true, message: t('amountRequired') },
                { type: 'number', min: 0, message: t('amountMin') },
              ]}
            >
              <InputNumber addonBefore={currency} className="form-full-width" precision={2} step={100} />
            </Form.Item>
            <Form.Item
              label={t('rateToBaseCurrency', { currency: baseCurrency })}
              name="rate"
              rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
            >
              <InputNumber
                className="form-full-width"
                disabled={!showTargetBaseAmount}
                precision={6}
                step={0.01}
              />
            </Form.Item>
            {showTargetBaseAmount ? (
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
            ) : null}
          </div>
          <div className="currency-field-preview">
            <span>{t('baseCurrencyPreview')}</span>
            <strong>{basePreview === null ? `${baseCurrency} --` : `${baseCurrency} ${basePreview.toFixed(2)}`}</strong>
          </div>
        </div>

        {showDestinationFields ? (
          <div className="transaction-bookkeeping-panel">
            <div className="currency-reference-grid">
              <Form.Item
                label={t('destinationCurrency')}
                name="destinationCurrency"
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return typeof getFieldValue('destinationAmount') === 'number' && !value
                        ? Promise.reject(new Error(t('selectDestinationCurrency')))
                        : Promise.resolve();
                    },
                  }),
                ]}
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
                label={t('destinationAmount')}
                name="destinationAmount"
                rules={[
                  { type: 'number', min: 0, message: t('destinationAmountMin') },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (typeof value !== 'number' || !Number.isFinite(value)) {
                        return Promise.resolve();
                      }

                      return getFieldValue('destinationCurrency')
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('selectDestinationCurrency')));
                    },
                  }),
                ]}
              >
                <InputNumber
                  addonBefore={destinationCurrency ?? t('currency')}
                  className="form-full-width"
                  precision={2}
                  step={100}
                />
              </Form.Item>
            </div>
            <div className="currency-reference-grid">
              <Form.Item
                label={t('destinationRate')}
                name="destinationRate"
                extra={t('destinationRateHelp')}
                rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
              >
                <InputNumber className="form-full-width" precision={6} step={0.01} />
              </Form.Item>
              <div className="currency-field-preview transaction-destination-preview">
                <span>{t('destinationPreview')}</span>
                <strong>{destinationPreview ?? '--'}</strong>
              </div>
            </div>
          </div>
        ) : null}

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

function transactionTypeOptions(
  t: (key: 'transactionTypeExpense'
    | 'transactionTypeIncome'
    | 'transactionTypeTransfer'
    | 'transactionTypeFxExchange'
    | 'transactionTypeCrossBorderRemittance') => string,
): Array<{ label: string; value: TransactionType }> {
  return [
    { label: t('transactionTypeExpense'), value: 'expense' },
    { label: t('transactionTypeIncome'), value: 'income' },
    { label: t('transactionTypeTransfer'), value: 'transfer' },
    { label: t('transactionTypeFxExchange'), value: 'fx_exchange' },
    { label: t('transactionTypeCrossBorderRemittance'), value: 'cross_border_remittance' },
  ];
}

const bookkeepingSourceTriadKeys = {
  amountKey: 'amount',
  rateKey: 'rate',
  targetKey: 'targetBaseAmount',
} as const;

const bookkeepingDestinationTriadKeys = {
  amountKey: 'amount',
  rateKey: 'destinationRate',
  targetKey: 'destinationAmount',
} as const;

function fixedBaseCurrencySourceFields(
  allValues: BookkeepingRecordFormValues,
): Partial<BookkeepingRecordFormValues> {
  const nextFields: Partial<BookkeepingRecordFormValues> = {};

  if (allValues.rate !== 1) {
    nextFields.rate = 1;
  }

  if (typeof allValues.amount === 'number' && Number.isFinite(allValues.amount)) {
    const nextTargetBaseAmount = Math.round((allValues.amount + Number.EPSILON) * 100) / 100;

    if (allValues.targetBaseAmount !== nextTargetBaseAmount) {
      nextFields.targetBaseAmount = nextTargetBaseAmount;
    }
  } else if (allValues.targetBaseAmount !== undefined) {
    nextFields.targetBaseAmount = undefined;
  }

  return nextFields;
}

function resetForeignCurrencySourceFields(
  allValues: BookkeepingRecordFormValues,
): Partial<BookkeepingRecordFormValues> {
  const nextFields: Partial<BookkeepingRecordFormValues> = {};

  if (allValues.rate !== undefined) {
    nextFields.rate = undefined;
  }

  if (allValues.targetBaseAmount !== undefined) {
    nextFields.targetBaseAmount = undefined;
  }

  return nextFields;
}
