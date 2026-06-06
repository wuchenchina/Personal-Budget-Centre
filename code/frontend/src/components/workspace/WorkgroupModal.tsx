import { Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { Workgroup } from '../../api/workgroups';
import type { WorkgroupFormValues } from '../../types/forms';

interface WorkgroupModalProps {
  form: FormInstance<WorkgroupFormValues>;
  editingWorkgroup: Workgroup | null;
  open: boolean;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function WorkgroupModal({
  form,
  editingWorkgroup,
  open,
  confirmLoading,
  onCancel,
  onOk,
}: WorkgroupModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingWorkgroup === null ? 'Create' : 'Save'}
      open={open}
      title={editingWorkgroup === null ? 'New workgroup' : 'Edit workgroup'}
      onCancel={onCancel}
      onOk={onOk}
    >
      <Form<WorkgroupFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-workgroup"
        requiredMark={false}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Workgroup name is required.' },
            { max: 160, message: 'Workgroup name must be 160 characters or less.' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Description"
          name="description"
          rules={[
            { max: 500, message: 'Workgroup description must be 500 characters or less.' },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
