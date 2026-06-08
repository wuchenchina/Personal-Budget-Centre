import { useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import { ModalFullscreenButton } from '../common/ModalFullscreenButton';
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
  const [fullscreen, setFullscreen] = useState(false);
  const { language, t } = useI18n();
  const dateRange = Form.useWatch('dateRange', form);
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
    const currentDateRange = form.getFieldValue('dateRange') ?? dateRange ?? null;
    form.setFieldValue('title', defaultBudgetTitle(currentDateRange));
  };

  return (
    <Modal
      destroyOnClose
      forceRender
      confirmLoading={confirmLoading}
      okText={isEditing ? t('save') : t('create')}
      open={open}
      title={
        <div className="modal-title-with-tools">
          <span>{isEditing ? t('editBudget') : t('createBudget')}</span>
          <ModalFullscreenButton fullscreen={fullscreen} setFullscreen={setFullscreen} />
        </div>
      }
      width={fullscreen ? 'calc(100vw - 24px)' : 'min(1120px, calc(100vw - 48px))'}
      style={{ top: 12 }}
      wrapClassName={`budget-info-modal large-form-modal${fullscreen ? ' modal-fullscreen' : ''}`}
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
        <div className="budget-info-form-grid">
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
            className="budget-info-title-field"
            label={t('title')}
          >
            <div className="budget-info-title-control">
              <Form.Item
                noStyle
                name="title"
                rules={[
                  { required: true, message: t('budgetTitleRequired') },
                  { max: 255, message: t('budgetTitleMax') },
                ]}
              >
                <Input.TextArea
                  autoComplete="off"
                  autoSize={{ maxRows: 3, minRows: 1 }}
                />
              </Form.Item>
              <Button htmlType="button" size="small" type="link" onClick={handleResetTitle}>
                {t('reset')}
              </Button>
            </div>
          </Form.Item>
          <Form.Item
            label={t('name')}
            name="ownerName"
            rules={[{ max: 160, message: t('displayNameMax') }]}
          >
            <Input autoComplete="name" />
          </Form.Item>
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
            className="budget-info-wide-field"
            label={t('note')}
            name="note"
            rules={[{ max: 20000, message: t('noteMax') }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
