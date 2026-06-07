import { Alert, Form, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
  const handleCategoryChange = (categoryId: number | null | undefined) => {
    if (categoryId === null || categoryId === undefined) {
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
      okText={editingItem === null ? t('create') : t('save')}
      open={open}
      title={editingItem === null ? t('budgetItem') : t('editBudgetItem')}
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
        <Form.Item hidden name="label">
          <input type="hidden" />
        </Form.Item>

        <Form.Item
          label={t('manageCategories')}
          name="categoryId"
          rules={[{ required: true, message: t('selectCategory') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            placeholder={t('selectCategory')}
            onChange={handleCategoryChange}
          />
        </Form.Item>

        <div className="modal-form-grid">
          <Form.Item
            label={t('budgetCurrency')}
            name="budgetCurrency"
            rules={[{ required: true, message: t('selectBaseCurrency') }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label={t('budgetAmount')}
            name="budgetAmount"
            rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
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
            label="Bank Fee (%)"
            name="bankFee"
            rules={[
              { type: 'number', min: 0, message: t('bankFeeMin') },
              { type: 'number', max: 100, message: t('bankFeeMax') },
            ]}
          >
            <InputNumber className="form-full-width" precision={2} step={0.1} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label={t('estimatedCurrency')}
            name="estimatedCurrency"
            rules={[{ required: true, message: t('selectDisplayCurrency') }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label={t('estimatedAmount')}
            name="estimatedAmount"
            rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
