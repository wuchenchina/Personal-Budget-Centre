import { Alert, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { roleLabelsByLanguage, useI18n } from '../../i18n';
import type { WorkspaceRole } from '../../types/budget';
import type { WorkspaceMemberFormValues } from '../../types/forms';

interface WorkspaceMemberModalProps {
  form: FormInstance<WorkspaceMemberFormValues>;
  open: boolean;
  error: string | null;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function WorkspaceMemberModal({
  form,
  open,
  error,
  confirmLoading,
  onCancel,
  onOk,
}: WorkspaceMemberModalProps) {
  const { language, t } = useI18n();
  const roleOptions: Array<{ label: string; value: WorkspaceRole }> = [
    { label: roleLabelsByLanguage[language].admin, value: 'admin' },
    { label: roleLabelsByLanguage[language].editor, value: 'editor' },
    { label: roleLabelsByLanguage[language].viewer, value: 'viewer' },
    { label: roleLabelsByLanguage[language].auditor, value: 'auditor' },
  ];

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={t('add')}
      open={open}
      title={t('addWorkspaceMember')}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<WorkspaceMemberFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-workspace-member"
        requiredMark={false}
        initialValues={{
          role: 'viewer',
        }}
      >
        <Form.Item
          label={t('email')}
          name="email"
          rules={[
            { required: true, message: t('memberEmailRequired') },
            { type: 'email', message: t('emailFormatInvalid') },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item
          label={t('role')}
          name="role"
          rules={[{ required: true, message: t('selectMemberRole') }]}
        >
          <Select options={roleOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
