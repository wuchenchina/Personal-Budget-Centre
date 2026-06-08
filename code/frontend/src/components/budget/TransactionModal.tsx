import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useState } from 'react';
import { Calculator, RefreshCcw } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import { useI18n } from '../../i18n';
import { ModalFullscreenButton } from '../common/ModalFullscreenButton';
import type { CurrencyCode, Transaction } from '../../types/budget';
import type { TransactionFormValues } from '../../types/forms';

interface TransactionModalProps {
  form: FormInstance<TransactionFormValues>;
  editingTransaction: Transaction | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  baseCurrency: CurrencyCode;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
  onRefreshRates: () => void;
  onReferenceConvert: () => void;
}

export function TransactionModal({
  form,
  editingTransaction,
  open,
  error,
  categoryOptions,
  baseCurrency,
  confirmLoading,
  onCancel,
  onOk,
  onRefreshRates,
  onReferenceConvert,
}: TransactionModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const { t } = useI18n();
  const currency = Form.useWatch('currency', form) ?? baseCurrency;
  const amount = Form.useWatch('amount', form);
  const rate = Form.useWatch('rate', form);
  const referenceCurrency = Form.useWatch('referenceCurrency', form);
  const referenceAmount = Form.useWatch('referenceAmount', form);
  const basePreview =
    typeof amount === 'number' && Number.isFinite(amount)
      ? amount * (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1)
      : null;
  const referencePreview =
    typeof referenceAmount === 'number' && Number.isFinite(referenceAmount) && referenceCurrency
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

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingTransaction === null ? t('create') : t('save')}
      open={open}
      title={
        <div className="modal-title-with-tools">
          <span>{editingTransaction === null ? t('transaction') : t('editTransaction')}</span>
          <ModalFullscreenButton fullscreen={fullscreen} setFullscreen={setFullscreen} />
        </div>
      }
      width={fullscreen ? 'calc(100vw - 24px)' : 'min(920px, calc(100vw - 40px))'}
      style={{ top: 24 }}
      wrapClassName={`large-form-modal${fullscreen ? ' modal-fullscreen' : ''}`}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<TransactionFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-transaction"
        requiredMark={false}
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
          />
        </Form.Item>

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
              {t('refreshBochkRates')}
            </Button>
          </div>
          <div className="currency-transaction-grid">
            <Form.Item
              label={t('currency')}
              name="currency"
              rules={[{ required: true, message: t('selectCurrency') }]}
            >
              <Select options={currencyOptions} />
            </Form.Item>
            <Form.Item
              label={t('amount')}
              name="amount"
              rules={[{ required: true, message: t('amountRequired') }]}
            >
              <InputNumber
                addonBefore={currency}
                className="form-full-width"
                precision={2}
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
              <Select allowClear options={currencyOptions} />
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
