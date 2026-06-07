import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { ChangeEvent } from 'react';
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
  const budgetCurrency = Form.useWatch('budgetCurrency', form);
  const estimatedCurrency = Form.useWatch('estimatedCurrency', form);
  const installmentEnabled = Form.useWatch(['installmentConfig', 'enabled'], form) === true;
  const installmentTotal = Form.useWatch(['installmentConfig', 'totalAmount'], form);
  const installmentMonths = Form.useWatch(['installmentConfig', 'months'], form);
  const installmentMonthly = Form.useWatch(['installmentConfig', 'monthlyAmount'], form);
  const calculatedMonthlyInstallment =
    typeof installmentMonthly === 'number' && installmentMonthly > 0
      ? installmentMonthly
      : null;
  const derivedMonthlyInstallment =
    calculatedMonthlyInstallment
    ?? (typeof installmentTotal === 'number'
      && typeof installmentMonths === 'number'
      && installmentTotal > 0
      && installmentMonths > 0
      ? installmentTotal / installmentMonths
      : null);
  const handleCategoryChange = (categoryId: number | null | undefined) => {
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined) {
      form.setFieldValue('label', selectedOption.label);
    }
  };
  const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
    const categoryId = form.getFieldValue('categoryId');
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined && selectedOption.label !== event.target.value.trim()) {
      form.setFieldValue('categoryId', undefined);
    }
  };
  const applyInstallmentMonthlyAmount = () => {
    if (derivedMonthlyInstallment === null) {
      return;
    }

    form.setFieldsValue({
      budgetAmount: Number(derivedMonthlyInstallment.toFixed(2)),
      installmentConfig: {
        ...form.getFieldValue('installmentConfig'),
        monthlyAmount: Number(derivedMonthlyInstallment.toFixed(2)),
      },
    });
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
        <Form.Item
          label={t('presetCategory')}
          name="categoryId"
          extra={t('presetCategoryHelp')}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={categoryOptions}
            placeholder={t('selectCategory')}
            onChange={handleCategoryChange}
          />
        </Form.Item>

        <Form.Item
          label={t('categoryName')}
          name="label"
          rules={[
            { required: true, whitespace: true, message: t('categoryNameRequired') },
            { max: 160, message: t('categoryNameMax') },
          ]}
          extra={t('customCategoryHelp')}
        >
          <Input
            allowClear
            maxLength={160}
            placeholder={t('customCategoryPlaceholder')}
            onChange={handleLabelChange}
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
            <InputNumber
              addonBefore={budgetCurrency ?? t('currency')}
              className="form-full-width"
              precision={2}
              step={100}
            />
          </Form.Item>
        </div>

        <div className="installment-config-panel">
          <Form.Item name={['installmentConfig', 'enabled']} valuePropName="checked">
            <Checkbox>{t('enableInstallments')}</Checkbox>
          </Form.Item>
          {installmentEnabled ? (
            <>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentTotalAmount')}
                  name={['installmentConfig', 'totalAmount']}
                  rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
                <Form.Item
                  label={t('installmentMonths')}
                  name={['installmentConfig', 'months']}
                  rules={[
                    { type: 'number', min: 1, message: t('installmentMonthsMin') },
                    { type: 'number', max: 600, message: t('installmentMonthsMax') },
                  ]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentMonthlyAmount')}
                  name={['installmentConfig', 'monthlyAmount']}
                  rules={[
                    { type: 'number', min: Number.MIN_VALUE, message: t('installmentMonthlyMin') },
                  ]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
                <Form.Item
                  label={t('installmentPaidMonths')}
                  name={['installmentConfig', 'paidMonths']}
                  rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentStartMonth')}
                  name={['installmentConfig', 'startMonth']}
                >
                  <DatePicker className="form-full-width" picker="month" />
                </Form.Item>
                <Form.Item label={t('installmentRemark')} name={['installmentConfig', 'remark']}>
                  <Input maxLength={500} />
                </Form.Item>
              </div>
              <Button
                block
                disabled={derivedMonthlyInstallment === null}
                type="dashed"
                onClick={applyInstallmentMonthlyAmount}
              >
                {derivedMonthlyInstallment === null
                  ? t('applyInstallmentMonthly')
                  : t('applyInstallmentMonthlyWithAmount', {
                    amount: `${budgetCurrency ?? t('currency')} ${derivedMonthlyInstallment.toFixed(2)}`,
                  })}
              </Button>
            </>
          ) : null}
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label={t('budgetRateToBase')}
            name="budgetRate"
            rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
            extra={t('manualRateOptional')}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
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
            <InputNumber
              addonBefore={estimatedCurrency ?? t('currency')}
              className="form-full-width"
              precision={2}
              step={100}
            />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label={t('estimatedRateToBase')}
            name="estimatedRate"
            rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
            extra={t('manualRateOptional')}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
          <Form.Item
            label={t('sortOrder')}
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
