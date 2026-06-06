import { Alert, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { assignableWorkspaceRoleOptions } from '../../config/appConfig';
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
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText="Add"
      open={open}
      title="Add workspace member"
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
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Member email is required.' },
            { type: 'email', message: 'Email format is invalid.' },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item
          label="Role"
          name="role"
          rules={[{ required: true, message: 'Member role is required.' }]}
        >
          <Select options={assignableWorkspaceRoleOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
