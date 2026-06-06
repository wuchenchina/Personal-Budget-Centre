import { useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Tag } from 'antd';
import { Plus, Tags, Trash2 } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { BudgetCategory, CurrencyCode } from '../../types/budget';

interface CategorySideSectionProps {
  operations: OperationsController;
  canWriteBudgets: boolean;
}

export function CategorySideSection({
  operations,
  canWriteBudgets,
}: CategorySideSectionProps) {
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
