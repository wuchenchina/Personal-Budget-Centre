import { useState } from 'react';
import { Button, Form, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import { useI18n } from '../../i18n';
import type { BudgetCategory, CurrencyCode } from '../../types/budget';

interface CategorySideSectionProps {
  operations: OperationsController;
}

export function CategorySideSection({ operations }: CategorySideSectionProps) {
  const { t } = useI18n();
  const [draftName, setDraftName] = useState('');
  const [draftCurrency, setDraftCurrency] = useState<CurrencyCode | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCurrency, setEditingCurrency] = useState<CurrencyCode | null>(null);
  const [aliasDrafts, setAliasDrafts] = useState<Record<number, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

  const currencyOptions = operations.currencies.map((currency) => ({
    label: `${currency.code} ${currency.name}`,
    value: currency.code,
  }));

  const beginEdit = (category: BudgetCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingCurrency(category.defaultCurrency);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingCurrency(null);
  };

  const saveDraftCategory = () => {
    const nextName = draftName.trim();
    if (nextName.length === 0) {
      return;
    }

    void operations.saveCategory({
      name: nextName,
      defaultCurrency: draftCurrency,
    });
    setDraftName('');
    setDraftCurrency(null);
  };

  const saveEditingCategory = () => {
    const nextName = editingName.trim();
    if (editingId === null || nextName.length === 0) {
      return;
    }

    void operations.saveCategory({
      id: editingId,
      name: nextName,
      defaultCurrency: editingCurrency,
    });
    cancelEdit();
  };

  const saveAlias = (categoryId: number) => {
    const alias = aliasDrafts[categoryId]?.trim() ?? '';
    if (alias.length === 0) {
      return;
    }

    void operations.saveAlias(categoryId, alias);
    setAliasDrafts((current) => ({ ...current, [categoryId]: '' }));
  };
  const removeSelectedCategories = () => {
    void operations.removeCategories(selectedCategoryIds);
    setSelectedCategoryIds([]);
  };

  const columns: TableProps<BudgetCategory>['columns'] = [
    {
      title: t('category'),
      dataIndex: 'name',
      render: (_, category) =>
        editingId === category.id ? (
          <Input
            autoFocus
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
            onPressEnter={saveEditingCategory}
          />
        ) : (
          <Space direction="vertical" size={2}>
            <span>{category.name}</span>
            <Space size={4} wrap>
              <Tag>{t('preset')}</Tag>
              {category.isActive ? (
                <Tag color="green">{t('active')}</Tag>
              ) : (
                <Tag>{t('inactive')}</Tag>
              )}
            </Space>
          </Space>
        ),
    },
    {
      title: t('defaultCurrency'),
      dataIndex: 'defaultCurrency',
      width: 170,
      render: (_, category) =>
        editingId === category.id ? (
          <Select<CurrencyCode>
            allowClear
            className="form-full-width"
            options={currencyOptions}
            placeholder={t('noDefaultCurrency')}
            value={editingCurrency ?? undefined}
            onChange={(value) => setEditingCurrency(value ?? null)}
          />
        ) : (
          category.defaultCurrency ?? t('noDefaultCurrency')
        ),
    },
    {
      title: t('alias'),
      dataIndex: 'aliases',
      render: (_, category) => (
        <Space direction="vertical" size={8} className="category-alias-stack">
          <Space size={4} wrap>
            {category.aliases.length === 0 ? (
              <span className="muted-inline">{t('noAliases')}</span>
            ) : (
              category.aliases.map((alias) => (
                <Tag
                  closable
                  key={alias.id}
                  onClose={(event) => {
                    event.preventDefault();
                    void operations.removeAlias(alias.id);
                  }}
                >
                  {alias.alias}
                </Tag>
              ))
            )}
          </Space>
          <Space.Compact className="category-alias-input">
            <Input
              allowClear
              placeholder={t('categoryAliasPlaceholder')}
              value={aliasDrafts[category.id] ?? ''}
              onChange={(event) =>
                setAliasDrafts((current) => ({
                  ...current,
                  [category.id]: event.target.value,
                }))
              }
              onPressEnter={() => saveAlias(category.id)}
            />
            <Button
              icon={<Plus size={14} />}
              loading={operations.isCategorySaving}
              onClick={() => saveAlias(category.id)}
            />
          </Space.Compact>
        </Space>
      ),
    },
    {
      title: '',
      width: 140,
      render: (_, category) =>
        editingId === category.id ? (
          <Space size={4}>
            <Button
              icon={<Check size={14} />}
              loading={operations.isCategorySaving}
              size="small"
              type="primary"
              onClick={saveEditingCategory}
            />
            <Button icon={<X size={14} />} size="small" onClick={cancelEdit} />
          </Space>
        ) : (
          <Space size={4}>
            <Button icon={<Pencil size={14} />} size="small" onClick={() => beginEdit(category)} />
            <Popconfirm
              title={t('deleteCategory')}
              description={t('categoryDeleteDescription')}
              okText={t('delete')}
              cancelText={t('cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={() => operations.removeCategory(category.id)}
            >
              <Button
                danger
                icon={<Trash2 size={14} />}
                loading={operations.isCategorySaving}
                size="small"
              />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div className="side-section">
      <div className="side-title">
        <Tags size={16} />
        <span>{t('manageCategories')}</span>
      </div>
      <p className="side-description">{t('categoryManagementDesc')}</p>
      <Form layout="vertical" className="category-create-form">
        <div className="category-create-grid">
          <Form.Item label={t('categoryName')}>
            <Input
              allowClear
              placeholder={t('newCategory')}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onPressEnter={saveDraftCategory}
            />
          </Form.Item>
          <Form.Item label={t('defaultCurrency')}>
            <Select<CurrencyCode>
              allowClear
              options={currencyOptions}
              placeholder={t('noDefaultCurrency')}
              value={draftCurrency ?? undefined}
              onChange={(value) => setDraftCurrency(value ?? null)}
            />
          </Form.Item>
          <Button
            icon={<Plus size={15} />}
            loading={operations.isCategorySaving}
            type="primary"
            onClick={saveDraftCategory}
          >
            {t('addCategory')}
          </Button>
        </div>
      </Form>
      <div className="category-bulk-toolbar">
        <span className="muted-inline">
          {t('selectedCount', { count: selectedCategoryIds.length })}
        </span>
        <Popconfirm
          title={t('batchDelete')}
          description={t('batchDeleteCategoriesDescription', {
            count: selectedCategoryIds.length,
          })}
          okText={t('delete')}
          cancelText={t('cancel')}
          okButtonProps={{ danger: true }}
          disabled={selectedCategoryIds.length === 0}
          onConfirm={removeSelectedCategories}
        >
          <Button
            danger
            disabled={selectedCategoryIds.length === 0}
            icon={<Trash2 size={14} />}
            loading={operations.isCategorySaving}
            size="small"
          >
            {t('batchDelete')}
          </Button>
        </Popconfirm>
      </div>
      <Table<BudgetCategory>
        className="category-table"
        columns={columns}
        dataSource={operations.categories}
        loading={operations.isCategoryLoading}
        locale={{ emptyText: t('noCategories') }}
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedCategoryIds,
          onChange: (keys) => setSelectedCategoryIds(keys.map(Number)),
        }}
        rowKey="id"
        size="small"
        scroll={{ x: 760 }}
      />
    </div>
  );
}
