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
      okText="添加"
      open={open}
      title="添加工作区成员"
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
          label="邮箱"
          name="email"
          rules={[
            { required: true, message: '请输入成员邮箱。' },
            { type: 'email', message: '邮箱格式不正确。' },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item
          label="角色"
          name="role"
          rules={[{ required: true, message: '请选择成员角色。' }]}
        >
          <Select options={assignableWorkspaceRoleOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
