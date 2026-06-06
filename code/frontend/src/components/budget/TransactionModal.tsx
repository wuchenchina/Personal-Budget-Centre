import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { currencyOptions } from '../../config/appConfig';
import type { Transaction } from '../../types/budget';
import type { TransactionFormValues } from '../../types/forms';

interface TransactionModalProps {
  form: FormInstance<TransactionFormValues>;
  editingTransaction: Transaction | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function TransactionModal({
  form,
  editingTransaction,
  open,
  error,
  categoryOptions,
  confirmLoading,
  onCancel,
  onOk,
}: TransactionModalProps) {
  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingTransaction === null ? '创建' : '保存'}
      open={open}
      title={editingTransaction === null ? '新增交易' : '编辑交易'}
      width={720}
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<TransactionFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-transaction"
        requiredMark={false}
      >
        <Form.Item
          label="交易详情"
          name="details"
          rules={[
            { required: true, message: '请输入交易详情。' },
            { max: 500, message: '交易详情不能超过 500 个字符。' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item label="分类" name="categoryId">
          <Select allowClear options={categoryOptions} placeholder="可选分类" />
        </Form.Item>

        <div className="modal-form-grid">
          <Form.Item label="日期" name="transactionDate">
            <DatePicker className="form-full-width" />
          </Form.Item>
          <Form.Item
            label="货币"
            name="currency"
            rules={[{ required: true, message: '请选择货币。' }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="金额"
            name="amount"
            rules={[{ required: true, message: '请输入金额。' }]}
          >
            <InputNumber className="form-full-width" precision={2} step={100} />
          </Form.Item>
          <Form.Item
            label="兑基准汇率"
            name="rate"
            rules={[{ type: 'number', min: 0, message: '汇率不能小于 0。' }]}
          >
            <InputNumber className="form-full-width" precision={6} step={0.01} />
          </Form.Item>
        </div>

        <Form.Item
          label="排序"
          name="sortOrder"
          rules={[{ type: 'number', min: 0, message: '排序不能小于 0。' }]}
        >
          <InputNumber className="form-full-width" precision={0} step={1} />
        </Form.Item>

        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注不能超过 500 个字符。' }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
