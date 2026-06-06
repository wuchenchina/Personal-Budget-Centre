import { Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions, workspaceTypeOptions } from '../../config/appConfig';
import type { CurrencyCode } from '../../types/budget';
import type { WorkspaceFormValues } from '../../types/forms';

interface WorkspaceCreateModalProps {
  form: FormInstance<WorkspaceFormValues>;
  open: boolean;
  baseCurrency: CurrencyCode;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function WorkspaceCreateModal({
  form,
  open,
  baseCurrency,
  confirmLoading,
  onCancel,
  onOk,
}: WorkspaceCreateModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText="Create"
      open={open}
      title="New workspace"
      onCancel={onCancel}
      onOk={onOk}
    >
      <Form<WorkspaceFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-create-workspace"
        requiredMark={false}
        initialValues={{
          type: 'team',
          defaultCurrency: baseCurrency,
        }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Workspace name is required.' },
            { max: 160, message: 'Workspace name must be 160 characters or less.' },
          ]}
        >
          <Input autoComplete="organization" />
        </Form.Item>
        <Form.Item
          label="Type"
          name="type"
          rules={[{ required: true, message: 'Workspace type is required.' }]}
        >
          <Select options={workspaceTypeOptions} />
        </Form.Item>
        <Form.Item
          label="Default currency"
          name="defaultCurrency"
          rules={[{ required: true, message: 'Default currency is required.' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
