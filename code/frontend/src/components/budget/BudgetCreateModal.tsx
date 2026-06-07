import { Alert, Button, Checkbox, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import {
  budgetStatusLabelsByLanguage,
  useI18n,
  visibilityLabelsByLanguage,
} from '../../i18n';
import type { BudgetStatus, Visibility } from '../../types/budget';
import type { BudgetFormValues } from '../../types/forms';
import { defaultBudgetTitle } from '../../utils/budgetTitle';

const { RangePicker } = DatePicker;

interface BudgetCreateModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  isEditing: boolean;
  error: string | null;
  workspaceOptions: Array<{ label: string; value: number }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetCreateModal({
  form,
  open,
  isEditing,
  error,
  workspaceOptions,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetCreateModalProps) {
  const { language, t } = useI18n();
  const dateRange = Form.useWatch('dateRange', form);
  const ownerNameHidden = Form.useWatch('ownerNameHidden', form) === true;
  const visibilityOptions: Array<{ label: string; value: Visibility }> = [
    { label: visibilityLabelsByLanguage[language].private, value: 'private' },
    { label: visibilityLabelsByLanguage[language].workspace, value: 'workspace' },
    { label: visibilityLabelsByLanguage[language].custom, value: 'custom' },
  ];
  const statusOptions: Array<{ label: string; value: BudgetStatus }> = [
    { label: budgetStatusLabelsByLanguage[language].draft, value: 'draft' },
    { label: budgetStatusLabelsByLanguage[language].active, value: 'active' },
    { label: budgetStatusLabelsByLanguage[language].closed, value: 'closed' },
    { label: budgetStatusLabelsByLanguage[language].archived, value: 'archived' },
  ];
  const handleResetTitle = () => {
    form.setFieldValue('title', defaultBudgetTitle(dateRange ?? null));
  };

  return (
    <Modal
      destroyOnClose
      forceRender
      confirmLoading={confirmLoading}
      okText={isEditing ? t('save') : t('create')}
      open={open}
      title={isEditing ? t('editBudget') : t('createBudget')}
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
          label={t('workspace')}
          name="workspaceId"
          extra={isEditing ? t('workspaceBudgetMoveLocked') : undefined}
          rules={[{ required: true, message: t('selectWorkspaceFirst') }]}
        >
          <Select
            disabled={isEditing}
            optionFilterProp="label"
            options={workspaceOptions}
            placeholder={t('selectWorkspace')}
            showSearch
          />
        </Form.Item>
        <Form.Item
          label={t('title')}
          name="title"
          rules={[
            { required: true, message: t('budgetTitleRequired') },
            { max: 255, message: t('budgetTitleMax') },
          ]}
        >
          <Input
            autoComplete="off"
            addonAfter={
              <Button size="small" type="link" onClick={handleResetTitle}>
                {t('reset')}
              </Button>
            }
          />
        </Form.Item>
        <Form.Item name="ownerNameHidden" valuePropName="checked">
          <Checkbox>{t('hideDisplayName')}</Checkbox>
        </Form.Item>
        {ownerNameHidden ? null : (
          <Form.Item
            label={t('displayName')}
            name="ownerName"
            rules={[{ max: 160, message: t('displayNameMax') }]}
          >
            <Input autoComplete="name" addonBefore="(" addonAfter=")" />
          </Form.Item>
        )}
        <Form.Item
          label={t('period')}
          name="dateRange"
        >
          <RangePicker allowClear className="form-full-width" />
        </Form.Item>
        <Form.Item
          label={t('baseCurrency')}
          name="baseCurrency"
          rules={[{ required: true, message: t('selectBaseCurrency') }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label={t('displayCurrency')}
          name="displayCurrency"
          rules={[{ required: true, message: t('selectDisplayCurrency') }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label={t('visibility')}
          name="visibility"
          rules={[{ required: true, message: t('selectVisibility') }]}
        >
          <Select options={visibilityOptions} />
        </Form.Item>
        <Form.Item
          label={t('status')}
          name="status"
          rules={[{ required: true, message: t('selectStatus') }]}
        >
          <Select options={statusOptions} />
        </Form.Item>
        <Form.Item
          label={t('note')}
          name="note"
          rules={[{ max: 20000, message: t('noteMax') }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
