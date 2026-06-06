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
      okText={isEditing ? '保存' : '创建'}
      open={open}
      title={isEditing ? '编辑预算' : '新建预算'}
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
          label="标题"
          name="title"
          rules={[
            { required: true, message: '请输入预算标题。' },
            { max: 255, message: '预算标题不能超过 255 个字符。' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="负责人"
          name="ownerName"
          rules={[
            { required: true, message: '请输入负责人。' },
            { max: 160, message: '负责人不能超过 160 个字符。' },
          ]}
        >
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item
          label="周期"
          name="dateRange"
          rules={[{ required: true, message: '请选择预算周期。' }]}
        >
          <RangePicker className="form-full-width" />
        </Form.Item>
        <Form.Item
          label="基准货币"
          name="baseCurrency"
          rules={[{ required: true, message: '请选择基准货币。' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label="显示货币"
          name="displayCurrency"
          rules={[{ required: true, message: '请选择显示货币。' }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label="可见性"
          name="visibility"
          rules={[{ required: true, message: '请选择可见性。' }]}
        >
          <Select
            options={[
              { label: '私有', value: 'private' },
              { label: '工作区', value: 'workspace' },
              { label: '自定义', value: 'custom' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="状态"
          name="status"
          rules={[{ required: true, message: '请选择状态。' }]}
        >
          <Select
            options={[
              { label: '草稿', value: 'draft' },
              { label: '启用', value: 'active' },
              { label: '关闭', value: 'closed' },
              { label: '归档', value: 'archived' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="备注"
          name="note"
          rules={[{ max: 20000, message: '备注不能超过 20000 个字符。' }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
