import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/currencies';
import { useI18n } from '../../i18n';
import type { AdminUserCreatePayload } from '../../types/admin';

interface AdminCreateUserModalProps {
  form: FormInstance<AdminUserCreatePayload>;
  open: boolean;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function AdminCreateUserModal({
  form,
  open,
  confirmLoading,
  onCancel,
  onOk,
}: AdminCreateUserModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={t('create')}
      open={open}
      title={t('createAccount')}
      onCancel={onCancel}
      onOk={onOk}
    >
      <Form<AdminUserCreatePayload>
        form={form}
        layout="vertical"
        name="budget-centre-admin-create-user"
        requiredMark={false}
        initialValues={{
          defaultCurrency: 'CNY',
          emailVerified: true,
          isAdmin: false,
        }}
      >
        <Form.Item
          label={t('email')}
          name="email"
          rules={[
            { required: true, message: t('emailRequired') },
            { type: 'email', message: t('emailValidRequired') },
          ]}
        >
          <Input autoComplete="email" placeholder="name@example.com" />
        </Form.Item>
        <Form.Item
          label={t('username')}
          name="username"
          rules={[
            { required: true, message: t('usernameRequired') },
            {
              pattern: /^[a-zA-Z0-9._-]{3,32}$/,
              message: t('usernamePattern'),
            },
          ]}
        >
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item
          label={t('displayName')}
          name="displayName"
          rules={[
            { required: true, message: t('displayNameRequired') },
            { max: 120, message: t('displayNameMax120') },
          ]}
        >
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item
          label={t('password')}
          name="password"
          rules={[
            { required: true, message: t('passwordRequired') },
            { min: 10, message: t('passwordMin') },
          ]}
        >
          <Input.Password autoComplete="new-password" />
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
        <div className="admin-create-switches">
          <Form.Item label={t('emailVerified')} name="emailVerified" valuePropName="checked">
            <Switch checkedChildren={t('yes')} unCheckedChildren={t('no')} />
          </Form.Item>
          <Form.Item label={t('administrator')} name="isAdmin" valuePropName="checked">
            <Switch checkedChildren={t('yes')} unCheckedChildren={t('no')} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
