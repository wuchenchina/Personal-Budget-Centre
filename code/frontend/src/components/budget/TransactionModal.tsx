import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import type { Transaction } from '../../types/budget';
import type { TransactionFormValues } from '../../types/forms';

interface TransactionModalProps {
  form: FormInstance<TransactionFormValues>;
  editingTransaction: Transaction | null;
  open: boolean;
  error: string | null;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function TransactionModal({
  form,
  editingTransaction,
  open,
  error,
  confirmLoading,
  onCancel,
  onOk,
}: TransactionModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingTransaction === null ? 'Create' : 'Save'}
      open={open}
      title={editingTransaction === null ? 'New transaction' : 'Edit transaction'}
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
          label="Details"
          name="details"
          rules={[
            { required: true, message: 'Transaction details are required.' },
            { max: 500, message: 'Transaction details must be 500 characters or less.' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <div className="modal-form-grid">
          <Form.Item label="Date" name="transactionDate">
            <DatePicker className="form-full-width" />
          </Form.Item>
          <Form.Item
            label="Currency"
            name="currency"
            rules={[{ required: true, message: 'Currency is required.' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="Amount"
            name="amount"
            rules={[{ required: true, message: 'Amount is required.' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
          <Form.Item
            label="Rate to base"
            name="rate"
            rules={[{ type: 'number', min: 0, message: 'Rate must be 0 or greater.' }]}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
        </div>

        <Form.Item
          label="Sort order"
          name="sortOrder"
          rules={[{ type: 'number', min: 0, message: 'Sort order must be 0 or greater.' }]}
        >
          <InputNumber className="form-full-width" precision={0} step={1} />
        </Form.Item>

        <Form.Item
          label="Remark"
          name="remark"
          rules={[{ max: 500, message: 'Remark must be 500 characters or less.' }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
