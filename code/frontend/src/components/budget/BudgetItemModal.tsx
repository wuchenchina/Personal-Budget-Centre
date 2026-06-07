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
  const handleCategoryChange = (categoryId: number | null | undefined) => {
    if (categoryId === null || categoryId === undefined || form.getFieldValue('label')) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined) {
      form.setFieldValue('label', selectedOption.label);
    }
  };

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingItem === null ? '创建' : '保存'}
      open={open}
      title={editingItem === null ? '新增预算项' : '编辑预算项'}
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
          label="分类名称"
          name="label"
          rules={[
            { required: true, message: '请输入分类名称。' },
            { max: 180, message: '分类名称不能超过 180 个字符。' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item label="已有分类" name="categoryId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            placeholder="可选分类"
            onChange={handleCategoryChange}
          />
        </Form.Item>

        <div className="modal-form-grid">
          <Form.Item
            label="预算货币"
            name="budgetCurrency"
            rules={[{ required: true, message: '请选择预算货币。' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label="预算金额"
            name="budgetAmount"
            rules={[{ required: true, message: '请输入预算金额。' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="预算兑基准汇率"
            name="budgetRate"
            rules={[{ type: 'number', min: 0, message: '汇率不能小于 0。' }]}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
          <Form.Item
            label="排序"
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: '排序不能小于 0。' }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="预计货币"
            name="estimatedCurrency"
            rules={[{ required: true, message: '请选择预计货币。' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label="预计金额"
            name="estimatedAmount"
            rules={[{ required: true, message: '请输入预计金额。' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
        </div>

        <Form.Item
          label="预计兑基准汇率"
          name="estimatedRate"
          rules={[{ type: 'number', min: 0, message: '汇率不能小于 0。' }]}
        >
          <InputNumber className="form-full-width" precision={6} step={0.01} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
