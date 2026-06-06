import { Alert, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import type { BudgetFormValues } from '../../types/forms';

const { RangePicker } = DatePicker;

interface BudgetCreateModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  isEditing: boolean;
  error: string | null;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetCreateModal({
  form,
  open,
  isEditing,
  error,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetCreateModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={isEditing ? 'Save' : 'Create'}
      open={open}
      title={isEditing ? 'Edit budget' : 'New budget'}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BudgetFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-budget"
        requiredMark={false}
      >
        <Form.Item
          label="Title"
          name="title"
          rules={[
            { required: true, message: 'Budget title is required.' },
            { max: 255, message: 'Budget title must be 255 characters or less.' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Owner name"
          name="ownerName"
          rules={[
            { required: true, message: 'Owner name is required.' },
            { max: 160, message: 'Owner name must be 160 characters or less.' },
          ]}
        >
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item
          label="Period"
          name="dateRange"
          rules={[{ required: true, message: 'Budget period is required.' }]}
        >
          <RangePicker className="form-full-width" />
        </Form.Item>
        <Form.Item
          label="Base currency"
          name="baseCurrency"
          rules={[{ required: true, message: 'Base currency is required.' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label="Display currency"
          name="displayCurrency"
          rules={[{ required: true, message: 'Display currency is required.' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label="Visibility"
          name="visibility"
          rules={[{ required: true, message: 'Visibility is required.' }]}
        >
          <Select
            options={[
              { label: 'Private', value: 'private' },
              { label: 'Workspace', value: 'workspace' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="Status"
          name="status"
          rules={[{ required: true, message: 'Status is required.' }]}
        >
          <Select
            options={[
              { label: 'Draft', value: 'draft' },
              { label: 'Active', value: 'active' },
              { label: 'Closed', value: 'closed' },
              { label: 'Archived', value: 'archived' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="Note"
          name="note"
          rules={[{ max: 20000, message: 'Budget note must be 20000 characters or less.' }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
