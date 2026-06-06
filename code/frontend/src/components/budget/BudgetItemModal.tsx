import { Alert, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import type { BudgetItem } from '../../types/budget';
import type { BudgetItemFormValues } from '../../types/forms';

interface BudgetItemModalProps {
  form: FormInstance<BudgetItemFormValues>;
  editingItem: BudgetItem | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetItemModal({
  form,
  editingItem,
  open,
  error,
  categoryOptions,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetItemModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingItem === null ? 'Create' : 'Save'}
      open={open}
      title={editingItem === null ? 'New budget highlight' : 'Edit budget highlight'}
      width={720}
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
        <Form.Item
          label="Label"
          name="label"
          rules={[
            { required: true, message: 'Highlight label is required.' },
            { max: 180, message: 'Highlight label must be 180 characters or less.' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item label="Category" name="categoryId">
          <Select allowClear options={categoryOptions} placeholder="Optional category" />
        </Form.Item>

        <div className="modal-form-grid">
          <Form.Item
            label="Budget currency"
            name="budgetCurrency"
            rules={[{ required: true, message: 'Budget currency is required.' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label="Budget amount"
            name="budgetAmount"
            rules={[{ required: true, message: 'Budget amount is required.' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="Budget rate to base"
            name="budgetRate"
            rules={[{ type: 'number', min: 0, message: 'Rate must be 0 or greater.' }]}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
          <Form.Item
            label="Sort order"
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: 'Sort order must be 0 or greater.' }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="Estimated currency"
            name="estimatedCurrency"
            rules={[{ required: true, message: 'Estimated currency is required.' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label="Estimated amount"
            name="estimatedAmount"
            rules={[{ required: true, message: 'Estimated amount is required.' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
        </div>

        <Form.Item
          label="Estimated rate to base"
          name="estimatedRate"
          rules={[{ type: 'number', min: 0, message: 'Rate must be 0 or greater.' }]}
        >
          <InputNumber className="form-full-width" precision={6} step={0.01} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
