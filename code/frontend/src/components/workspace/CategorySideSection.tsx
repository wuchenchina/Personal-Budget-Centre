import { Tag } from 'antd';
import { Tags } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { BudgetCategory } from '../../types/budget';

interface CategorySideSectionProps {
  operations: OperationsController;
}

export function CategorySideSection({ operations }: CategorySideSectionProps) {
  return (
    <div className="side-section">
      <div className="side-title">
        <Tags size={16} />
        <span>预设分类</span>
      </div>
      <div className="operation-list">
        {operations.isCategoryLoading ? (
          <div className="empty-line">正在加载分类...</div>
        ) : operations.categories.length === 0 ? (
          <div className="empty-line">暂无分类。</div>
        ) : (
          operations.categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
}: {
  category: BudgetCategory;
}) {
  return (
    <div className="operation-list-item">
      <div className="operation-list-main">
        <span>{category.name}</span>
        <small>{category.defaultCurrency ? `默认货币 ${category.defaultCurrency}` : '无默认货币'}</small>
      </div>
      <div className="alias-row">
        <Tag color="blue">Preset</Tag>
        {category.aliases.map((item) => (
          <Tag key={item.id}>{item.alias}</Tag>
        ))}
      </div>
    </div>
  );
}
