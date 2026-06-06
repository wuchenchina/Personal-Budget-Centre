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
      okText={editingWorkgroup === null ? '创建' : '保存'}
      open={open}
      title={editingWorkgroup === null ? '新建工作组' : '编辑工作组'}
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
          label="名称"
          name="name"
          rules={[
            { required: true, message: '请输入工作组名称。' },
            { max: 160, message: '工作组名称不能超过 160 个字符。' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="描述"
          name="description"
          rules={[
            { max: 500, message: '工作组描述不能超过 500 个字符。' },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
