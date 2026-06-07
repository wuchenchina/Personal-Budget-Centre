import { Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import { useI18n, workspaceTypeLabelsByLanguage } from '../../i18n';
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
  const { language, t } = useI18n();
  const workspaceTypeOptions = [
    { label: workspaceTypeLabelsByLanguage[language].family, value: 'family' },
    { label: workspaceTypeLabelsByLanguage[language].team, value: 'team' },
    { label: workspaceTypeLabelsByLanguage[language].custom, value: 'custom' },
  ];

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={t('create')}
      open={open}
      title={t('createWorkspace')}
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
          label={t('workspaceType')}
          name="type"
          rules={[{ required: true, message: t('selectWorkspaceType') }]}
        >
          <Select options={workspaceTypeOptions} />
        </Form.Item>
        <Form.Item
          label={t('defaultCurrency')}
          name="defaultCurrency"
          rules={[{ required: true, message: t('selectDefaultCurrency') }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
