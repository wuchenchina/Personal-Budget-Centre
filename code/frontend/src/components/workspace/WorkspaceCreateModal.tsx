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
      okText="创建"
      open={open}
      title="新建工作区"
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
          label="名称"
          name="name"
          rules={[
            { required: true, message: '请输入工作区名称。' },
            { max: 160, message: '工作区名称不能超过 160 个字符。' },
          ]}
        >
          <Input autoComplete="organization" />
        </Form.Item>
        <Form.Item
          label="类型"
          name="type"
          rules={[{ required: true, message: '请选择工作区类型。' }]}
        >
          <Select options={workspaceTypeOptions} />
        </Form.Item>
        <Form.Item
          label="默认货币"
          name="defaultCurrency"
          rules={[{ required: true, message: '请选择默认货币。' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
