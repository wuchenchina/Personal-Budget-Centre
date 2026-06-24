import { Alert, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n, workspaceTypeLabelsByLanguage } from '../../i18n';
import type { AuthWorkspace } from '../../types/auth';
import type { CurrencyCode } from '../../types/budget';
import type { WorkspaceEditFormValues } from '../../types/forms';

interface WorkspaceEditModalProps {
  form: FormInstance<WorkspaceEditFormValues>;
  workspace: AuthWorkspace | null;
  open: boolean;
  error: string | null;
  currencyOptions: Array<{ label: string; value: CurrencyCode }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function WorkspaceEditModal({
  form,
  workspace,
  open,
  error,
  currencyOptions,
  confirmLoading,
  onCancel,
  onOk,
}: WorkspaceEditModalProps) {
  const { language, t } = useI18n();
  const typeOptions = [
    { label: workspaceTypeLabelsByLanguage[language].family, value: 'family' },
    { label: workspaceTypeLabelsByLanguage[language].team, value: 'team' },
    { label: workspaceTypeLabelsByLanguage[language].custom, value: 'custom' },
  ];
  const isPersonal = workspace?.type === 'personal';

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={t('save')}
      open={open}
      title={t('editWorkspace')}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<WorkspaceEditFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-edit-workspace"
        requiredMark={false}
      >
        <Form.Item
          label={t('name')}
          name="name"
          rules={[
            { required: true, message: t('workspaceNameRequired') },
            { max: 160, message: t('workspaceNameMax') },
          ]}
        >
          <Input autoComplete="organization" />
        </Form.Item>
        <Form.Item
          extra={isPersonal ? t('personalWorkspaceTypeLocked') : undefined}
          label={t('workspaceType')}
          name="type"
          rules={[{ required: true, message: t('selectWorkspaceType') }]}
        >
          <Select
            disabled={isPersonal}
            optionFilterProp="label"
            options={
              isPersonal
                ? [
                    {
                      label: workspaceTypeLabelsByLanguage[language].personal,
                      value: 'personal',
                    },
                  ]
                : typeOptions
            }
            showSearch={!isPersonal}
          />
        </Form.Item>
        <Form.Item
          label={t('defaultCurrency')}
          name="defaultCurrency"
          rules={[{ required: true, message: t('selectDefaultCurrency') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={currencyOptions}
            placeholder={t('defaultCurrencyPlaceholder')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
