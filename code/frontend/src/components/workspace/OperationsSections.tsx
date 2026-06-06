import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Tag } from 'antd';
import {
  Download,
  FileText,
  KeyRound,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Tags,
  Trash2,
} from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type {
  BudgetCategory,
  BudgetDetail,
  BudgetExportFormat,
  CurrencyCode,
} from '../../types/budget';
import { formatMoney } from '../../utils/currency';

interface OperationsSectionsProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
  canWriteBudgets: boolean;
}

const exportFormats: Array<{ label: string; value: BudgetExportFormat }> = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'DOCX', value: 'docx' },
  { label: 'PDF', value: 'pdf' },
];

export function OperationsSections({
  operations,
  selectedBudget,
  canWriteBudgets,
}: OperationsSectionsProps) {
  return (
    <>
      {operations.operationsError ? (
        <div className="side-section">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}
      <CategorySideSection operations={operations} canWriteBudgets={canWriteBudgets} />
      <ReconciliationSideSection operations={operations} selectedBudget={selectedBudget} />
      <ExportSideSection operations={operations} selectedBudget={selectedBudget} />
      <PasskeySideSection operations={operations} />
    </>
  );
}

function CategorySideSection({
  operations,
  canWriteBudgets,
}: {
  operations: OperationsController;
  canWriteBudgets: boolean;
}) {
  const [categoryName, setCategoryName] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode | undefined>();

  const handleCreate = () => {
    if (!categoryName.trim()) {
      return;
    }

    void operations.saveCategory({
      name: categoryName,
      defaultCurrency: defaultCurrency ?? null,
    });
    setCategoryName('');
    setDefaultCurrency(undefined);
  };

  return (
    <div className="side-section">
      <div className="side-title">
        <Tags size={16} />
        <span>Categories</span>
      </div>
      <Space className="side-tag-cloud" wrap>
        {operations.currencies.map((currency) => (
          <Tag key={currency.code}>{currency.code}</Tag>
        ))}
      </Space>
      {canWriteBudgets ? (
        <Space.Compact className="side-compact-row" block>
          <Input
            allowClear
            disabled={operations.isCategorySaving}
            placeholder="New category"
            size="small"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            onPressEnter={handleCreate}
          />
          <Select<CurrencyCode>
            allowClear
            className="side-currency-select"
            disabled={operations.isCategorySaving}
            options={operations.currencyOptions}
            placeholder="Currency"
            size="small"
            value={defaultCurrency}
            onChange={setDefaultCurrency}
          />
          <Button
            disabled={!categoryName.trim()}
            icon={<Plus size={13} />}
            loading={operations.isCategorySaving}
            size="small"
            onClick={handleCreate}
          />
        </Space.Compact>
      ) : null}
      <div className="operation-list">
        {operations.isReferenceLoading ? (
          <div className="empty-line">Loading categories...</div>
        ) : operations.categories.length === 0 ? (
          <div className="empty-line">No categories configured.</div>
        ) : (
          operations.categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              operations={operations}
              canWriteBudgets={canWriteBudgets}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  operations,
  canWriteBudgets,
}: {
  category: BudgetCategory;
  operations: OperationsController;
  canWriteBudgets: boolean;
}) {
  const [alias, setAlias] = useState('');

  const handleAliasCreate = () => {
    if (!alias.trim()) {
      return;
    }

    void operations.saveAlias(category.id, alias);
    setAlias('');
  };

  return (
    <div className="operation-list-item">
      <div className="operation-list-main">
        <span>{category.name}</span>
        <small>{category.defaultCurrency ?? 'No default currency'}</small>
      </div>
      {canWriteBudgets ? (
        <Popconfirm
          title="Delete category"
          description="Existing budget rows will keep their data but lose this category link."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => operations.removeCategory(category.id)}
        >
          <Button
            danger
            icon={<Trash2 size={13} />}
            loading={operations.isCategorySaving}
            size="small"
          />
        </Popconfirm>
      ) : null}
      <div className="alias-row">
        {category.aliases.map((item) => (
          <Tag
            closeIcon={canWriteBudgets}
            key={item.id}
            onClose={(event) => {
              event.preventDefault();
              void operations.removeAlias(item.id);
            }}
          >
            {item.alias}
          </Tag>
        ))}
      </div>
      {canWriteBudgets ? (
        <Space.Compact className="side-compact-row" block>
          <Input
            allowClear
            disabled={operations.isCategorySaving}
            placeholder="Alias"
            size="small"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            onPressEnter={handleAliasCreate}
          />
          <Button
            disabled={!alias.trim()}
            icon={<Plus size={13} />}
            loading={operations.isCategorySaving}
            size="small"
            onClick={handleAliasCreate}
          />
        </Space.Compact>
      ) : null}
    </div>
  );
}

function ReconciliationSideSection({
  operations,
  selectedBudget,
}: {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
}) {
  const currency = selectedBudget?.baseCurrency ?? 'CNY';

  return (
    <div className="side-section">
      <div className="side-title">
        <RefreshCcw size={16} />
        <span>Reconciliation</span>
      </div>
      <div className="operation-list">
        {selectedBudget === null ? (
          <div className="empty-line">Select a budget to compare rows.</div>
        ) : operations.isReconciliationLoading ? (
          <div className="empty-line">Loading reconciliation...</div>
        ) : operations.reconciliation.length === 0 ? (
          <div className="empty-line">No reconciliation difference.</div>
        ) : (
          operations.reconciliation.slice(0, 6).map((row) => (
            <div className="operation-list-item" key={`${row.budgetId}-${row.label}`}>
              <div className="operation-list-main">
                <span>{row.category ?? row.label}</span>
                <small>{row.label}</small>
              </div>
              <div className="reconciliation-grid">
                <small>Est. {formatMoney({ currency, amount: row.estimatedAmountBase })}</small>
                <small>Tx {formatMoney({ currency, amount: row.transactionTotalBase })}</small>
                <Tag color={Math.abs(row.differenceBase) < 0.01 ? 'green' : 'orange'}>
                  {formatMoney({ currency, amount: row.differenceBase })}
                </Tag>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExportSideSection({
  operations,
  selectedBudget,
}: {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
}) {
  return (
    <div className="side-section">
      <div className="side-title">
        <FileText size={16} />
        <span>Exports</span>
      </div>
      <Space wrap>
        {exportFormats.map((format) => (
          <Button
            disabled={selectedBudget === null}
            icon={<Download size={13} />}
            key={format.value}
            loading={operations.creatingExportFormat === format.value}
            size="small"
            onClick={() => operations.createExport(format.value)}
          >
            {format.label}
          </Button>
        ))}
      </Space>
      <div className="operation-list operation-list-spaced">
        {selectedBudget === null ? (
          <div className="empty-line">Select a budget to export.</div>
        ) : operations.isExportLoading ? (
          <div className="empty-line">Loading export history...</div>
        ) : operations.exports.length === 0 ? (
          <div className="empty-line">No export history.</div>
        ) : (
          operations.exports.slice(0, 5).map((item) => (
            <div className="operation-list-item operation-list-item-row" key={item.id}>
              <div className="operation-list-main">
                <span>{item.fileName}</span>
                <small>{item.createdAt}</small>
              </div>
              <Button
                icon={<Download size={13} />}
                size="small"
                onClick={() => operations.downloadExport(item)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PasskeySideSection({ operations }: { operations: OperationsController }) {
  const [deviceName, setDeviceName] = useState('');

  const handleRegister = () => {
    void operations.registerPasskey(deviceName);
    setDeviceName('');
  };

  return (
    <div className="side-section">
      <div className="side-title">
        <KeyRound size={16} />
        <span>Passkey</span>
      </div>
      <Space.Compact className="side-compact-row" block>
        <Input
          allowClear
          disabled={operations.isPasskeyRegistering}
          placeholder="Device name"
          size="small"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          onPressEnter={handleRegister}
        />
        <Button
          icon={<ShieldCheck size={13} />}
          loading={operations.isPasskeyRegistering}
          size="small"
          onClick={handleRegister}
        >
          Add
        </Button>
      </Space.Compact>
      <div className="operation-list">
        {operations.isPasskeyLoading ? (
          <div className="empty-line">Loading passkeys...</div>
        ) : operations.passkeys.length === 0 ? (
          <div className="empty-line">No passkey registered.</div>
        ) : (
          operations.passkeys.map((passkey) => (
            <div className="operation-list-item operation-list-item-row" key={passkey.id}>
              <div className="operation-list-main">
                <span>{passkey.deviceName ?? 'Passkey'}</span>
                <small>{passkey.lastUsedAt ? `Last used ${passkey.lastUsedAt}` : passkey.createdAt}</small>
              </div>
              <Space size={4}>
                <Button
                  icon={<Pencil size={13} />}
                  size="small"
                  onClick={() => {
                    const nextName = window.prompt('Device name', passkey.deviceName ?? '');
                    if (nextName !== null) {
                      void operations.renamePasskey(passkey.id, nextName.trim() || null);
                    }
                  }}
                />
                <Popconfirm
                  title="Delete passkey"
                  description="This device will no longer be able to login with passkey."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => operations.removePasskey(passkey.id)}
                >
                  <Button danger icon={<Trash2 size={13} />} size="small" />
                </Popconfirm>
              </Space>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
