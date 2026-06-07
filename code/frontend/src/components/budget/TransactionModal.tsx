import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import { useI18n } from '../../i18n';
import type { Transaction } from '../../types/budget';
import type { TransactionFormValues } from '../../types/forms';

interface TransactionModalProps {
  form: FormInstance<TransactionFormValues>;
  editingTransaction: Transaction | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function TransactionModal({
  form,
  editingTransaction,
  open,
  error,
  categoryOptions,
  confirmLoading,
  onCancel,
  onOk,
}: TransactionModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingTransaction === null ? t('create') : t('save')}
      open={open}
      title={editingTransaction === null ? t('transaction') : t('editTransaction')}
      width={720}
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

        <div className="modal-form-grid">
          <Form.Item label={t('date')} name="transactionDate">
            <DatePicker className="form-full-width" />
          </Form.Item>
          <Form.Item
            label={t('budgetCurrency')}
            name="currency"
            rules={[{ required: true, message: t('selectBaseCurrency') }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label={t('amount')}
            name="amount"
            rules={[{ required: true, message: t('amountRequired') }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
          <Form.Item
            label={t('toBaseRate')}
            name="rate"
            rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
        </div>

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
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
