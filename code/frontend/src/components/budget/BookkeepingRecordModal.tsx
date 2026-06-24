import { Alert, DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '../../i18n';
import type { BookkeepingRecord, Currency, CurrencyCode, TransactionType } from '../../types/budget';
import type { BookkeepingRecordFormValues } from '../../types/forms';
import { CurrencySelectWithQuickAdd } from './CurrencySelectWithQuickAdd';

interface BookkeepingRecordModalProps {
  form: FormInstance<BookkeepingRecordFormValues>;
  editingRecord: BookkeepingRecord | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: string }>;
  currencies: Currency[];
  currencyOptions: Array<{ label: string; value: CurrencyCode }>;
  baseCurrency: CurrencyCode;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
  onSaveCurrency: (input: {
    code: string;
    name: string;
    symbol?: string;
    decimalPlaces: number;
  }) => Promise<boolean>;
  onValuesChange: () => void;
}

export function BookkeepingRecordModal({
  form,
  editingRecord,
  open,
  error,
  categoryOptions,
  currencies,
  currencyOptions,
  baseCurrency,
  confirmLoading,
  onCancel,
  onOk,
  onSaveCurrency,
  onValuesChange,
}: BookkeepingRecordModalProps) {
  const { t } = useI18n();
  const transactionType = Form.useWatch('transactionType', form) ?? 'expense';
  const currency = Form.useWatch('currency', form) ?? baseCurrency;
  const amount = Form.useWatch('amount', form);
  const rate = Form.useWatch('rate', form);
  const destinationCurrency = Form.useWatch('destinationCurrency', form);
  const destinationAmount = Form.useWatch('destinationAmount', form);
  const showDestinationFields =
    transactionType === 'transfer'
    || transactionType === 'fx_exchange'
    || transactionType === 'cross_border_remittance';
  const basePreview =
    typeof amount === 'number' && Number.isFinite(amount)
      ? amount * (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1)
      : null;
  const destinationPreview =
    typeof destinationAmount === 'number' && Number.isFinite(destinationAmount) && destinationCurrency
      ? `${destinationCurrency} ${destinationAmount.toFixed(2)}`
      : null;

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
        onValuesChange={onValuesChange}
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
              <CurrencySelectWithQuickAdd
                currencies={currencies}
                options={currencyOptions}
                onSaveCurrency={onSaveCurrency}
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
              <InputNumber className="form-full-width" precision={6} step={0.01} />
            </Form.Item>
            <Form.Item label={t('rateSaveScope')} name="rateScope" initialValue="item">
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
                <CurrencySelectWithQuickAdd
                  allowClear
                  currencies={currencies}
                  options={currencyOptions}
                  onSaveCurrency={onSaveCurrency}
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
