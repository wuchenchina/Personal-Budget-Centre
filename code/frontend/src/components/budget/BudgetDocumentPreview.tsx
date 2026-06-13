import type { CSSProperties, KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  CalendarRange,
  Check,
  Download,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Signature,
  Trash2,
  X,
} from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import {
  budgetStatusLabelsByLanguage,
  useI18n,
  visibilityLabelsByLanguage,
} from '../../i18n';
import type {
  BudgetDetail,
  BudgetExportChineseLanguage,
  BudgetExportTableLanguageMode,
  BudgetItem,
  BudgetParticipant,
  BudgetSignatureConfig,
  BudgetSignatureRow,
  BudgetTemplateDefinition,
  CurrencyCode,
  Transaction,
} from '../../types/budget';
import {
  createBudgetItemColumns,
  createTransactionColumns,
  effectiveBudgetItemAmounts,
  effectiveBudgetTotals,
  formatBudgetMoney,
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';
import { formatBudgetPeriodEnglish } from '../../utils/budgetPeriod';
import { installmentSummary } from '../../utils/budgetInstallments';
import {
  signatureInfoLanguage,
  signatureLabelForConfig,
  signatureMetaLabelsForLanguage,
  signatureCustomFieldLabelForDisplay,
  signaturePositionForDisplay,
  signatureRoleForDisplay,
  signatureTitleForDisplay,
} from '../../utils/budgetSignature';

interface BudgetDocumentPreviewProps {
  selectedBudget: BudgetDetail | null;
  template: BudgetTemplateDefinition | null;
  templateError: string | null;
  budgetError: string | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  entry: BudgetEntryController;
  isBudgetLoading: boolean;
  isBudgetDetailLoading: boolean;
  isBudgetSaving: boolean;
  isTemplateLoading: boolean;
  onEditBudget?: () => void;
  onEditInstallments?: () => void;
  onEditSignature?: () => void;
  onInlineHeaderSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
  onOpenShare?: () => void;
  operations: OperationsController;
  categoryOptions: Array<{ label: string; value: number }>;
  transactionCategoryOptions: Array<{ label: string; value: number }>;
}

type BudgetTableLanguageMode = BudgetExportTableLanguageMode;
type BudgetTableChineseLanguage = BudgetExportChineseLanguage;
type BudgetColumnLabelStyle = 'single' | 'bilingual';
type BudgetTemplateSection = BudgetTemplateDefinition['sections'][number];
type BudgetTemplateColumn = BudgetTemplateSection['columns'][number];
type BudgetTableLabel = {
  primary: string;
  secondary?: string;
};

const documentTableText = {
  sc: {
    budgetHighlightsTitle: '预算摘要',
    columnLabels: {
      amount: { primary: '金额' },
      budget: { primary: '预算' },
      category: { primary: '类别' },
      estimated_actuals: { primary: '预估实际' },
      period: { primary: '期间' },
      progress: { primary: '进度' },
      remark: { primary: '备注' },
      sequence: { primary: '序号' },
      target: { primary: '目标' },
      transaction_details: { primary: '交易详情' },
      unit_price: { primary: '单价' },
      quantity: { primary: '数量' },
      variance: { primary: '差额' },
    },
    datePrefix: '日期：',
    installmentPeriodLabels: {
      day: '每日',
      month: '每月',
      week: '每周',
      year: '每年',
    },
    installmentsTitle: '分期明细',
    remainingLabel: '剩余',
    totalLabel: '总计',
    transactionBreakdownTitle: '交易明细',
  },
  tc: {
    budgetHighlightsTitle: '預算摘要',
    columnLabels: {
      amount: { primary: '金額' },
      budget: { primary: '預算' },
      category: { primary: '類別' },
      estimated_actuals: { primary: '預估實際' },
      period: { primary: '期間' },
      progress: { primary: '進度' },
      remark: { primary: '備註' },
      sequence: { primary: '序號' },
      target: { primary: '目標' },
      transaction_details: { primary: '交易詳情' },
      unit_price: { primary: '單價' },
      quantity: { primary: '數量' },
      variance: { primary: '差額' },
    },
    datePrefix: '日期：',
    installmentPeriodLabels: {
      day: '每日',
      month: '每月',
      week: '每週',
      year: '每年',
    },
    installmentsTitle: '分期明細',
    remainingLabel: '剩餘',
    totalLabel: '總計',
    transactionBreakdownTitle: '交易明細',
  },
} satisfies Record<
  BudgetTableChineseLanguage,
  {
    budgetHighlightsTitle: string;
    columnLabels: Record<string, BudgetTableLabel>;
    datePrefix: string;
    installmentPeriodLabels: Record<BudgetDetail['installmentPeriodUnit'], string>;
    installmentsTitle: string;
    remainingLabel: string;
    totalLabel: string;
    transactionBreakdownTitle: string;
  }
>;

function documentTableLabels(language: BudgetTableChineseLanguage) {
  return documentTableText[language];
}

function localizeTemplateSection(
  section: BudgetTemplateSection | undefined,
  mode: BudgetTableLanguageMode,
  chineseLanguage: BudgetTableChineseLanguage,
): BudgetTemplateSection | undefined {
  if (section === undefined || mode === 'en') {
    return section;
  }

  const labels = documentTableLabels(chineseLanguage);
  const sectionTitle =
    section.key === 'budget_highlights'
      ? labels.budgetHighlightsTitle
      : section.key === 'transaction_breakdown'
        ? labels.transactionBreakdownTitle
        : section.title;

  return {
    ...section,
    title: mode === 'bilingual' ? `${section.title} ${sectionTitle}` : sectionTitle,
    columns: section.columns.map((column) => localizeTemplateColumn(column, mode, labels)),
  };
}

function localizeTemplateColumn(
  column: BudgetTemplateColumn,
  mode: BudgetTableLanguageMode,
  labels: ReturnType<typeof documentTableLabels>,
): BudgetTemplateColumn {
  const columnLabels: Record<string, BudgetTableLabel> = labels.columnLabels;
  const localizedLabel = columnLabels[column.key]?.primary ?? column.label;

  return {
    ...column,
    label: mode === 'bilingual' ? `${column.label}\n${localizedLabel}` : localizedLabel,
  };
}

function tableLabel(
  english: string,
  chinese: string,
  mode: BudgetTableLanguageMode,
): BudgetTableLabel {
  if (mode === 'bilingual') {
    return { primary: english, secondary: chinese };
  }

  return { primary: mode === 'zh' ? chinese : english };
}

function documentText(
  english: string,
  chinese: string,
  mode: BudgetTableLanguageMode,
): string {
  if (mode === 'bilingual') {
    return `${english} ${chinese}`;
  }

  return mode === 'zh' ? chinese : english;
}

function documentDatePrefix(chinese: string, mode: BudgetTableLanguageMode): string {
  if (mode === 'bilingual') {
    return `Date: ${chinese}`;
  }

  return mode === 'zh' ? chinese : 'Date: ';
}

function renderBudgetColumnTitle(label: BudgetTableLabel, style: BudgetColumnLabelStyle) {
  if (style === 'bilingual' && label.secondary) {
    return (
      <span className="budget-column-title-stack">
        <span>{label.primary}</span>
        <small>{label.secondary}</small>
      </span>
    );
  }

  return label.primary;
}

export function BudgetDocumentPreview({
  selectedBudget,
  template,
  templateError,
  budgetError,
  baseCurrency,
  canWriteBudgets,
  entry,
  isBudgetLoading,
  isBudgetDetailLoading,
  isBudgetSaving,
  isTemplateLoading,
  onEditBudget,
  onEditInstallments,
  onEditSignature,
  onInlineHeaderSave,
  onOpenShare,
  operations,
  categoryOptions,
  transactionCategoryOptions,
}: BudgetDocumentPreviewProps) {
  const { language, t } = useI18n();
  const [tableLanguageMode, setTableLanguageMode] = useState<BudgetTableLanguageMode>('en');
  const [tableChineseLanguage, setTableChineseLanguage] = useState<BudgetTableChineseLanguage>(
    language === 'sc' ? 'sc' : 'tc',
  );
  const budgetHighlights = template?.sections.find(
    (section) => section.key === 'budget_highlights',
  );
  const transactionBreakdown = template?.sections.find(
    (section) => section.key === 'transaction_breakdown',
  );
  const localizedBudgetHighlights = useMemo(
    () => localizeTemplateSection(budgetHighlights, tableLanguageMode, tableChineseLanguage),
    [budgetHighlights, tableChineseLanguage, tableLanguageMode],
  );
  const localizedTransactionBreakdown = useMemo(
    () => localizeTemplateSection(transactionBreakdown, tableLanguageMode, tableChineseLanguage),
    [tableChineseLanguage, tableLanguageMode, transactionBreakdown],
  );
  const documentLabels = documentTableLabels(tableChineseLanguage);
  const datePrefix = documentDatePrefix(documentLabels.datePrefix, tableLanguageMode);
  const installmentsTitle = documentText(
    'Installments',
    documentLabels.installmentsTitle,
    tableLanguageMode,
  );
  const remainingLabel = documentText('Remaining', documentLabels.remainingLabel, tableLanguageMode);
  const totalLabel = documentText('Total', documentLabels.totalLabel, tableLanguageMode);
  const columnLabelStyle: BudgetColumnLabelStyle =
    tableLanguageMode === 'bilingual' ? 'bilingual' : 'single';
  const budgetColumns = useMemo(
    () => {
      const columns = createBudgetItemColumns(
        localizedBudgetHighlights?.columns ?? [],
        selectedBudget?.baseCurrency ?? baseCurrency,
        selectedBudget?.transactions ?? [],
        selectedBudget?.pricingEnabled ?? false,
      );

      return appendBudgetItemActions(
        appendQuickAmountEditors(
          appendBudgetItemCategoryEditors(columns, canWriteBudgets, entry, categoryOptions),
          selectedBudget?.transactions ?? [],
          canWriteBudgets,
          entry,
          selectedBudget?.baseCurrency ?? baseCurrency,
          t('edit'),
        ),
        canWriteBudgets,
        entry,
        {
        cancel: t('cancel'),
        delete: t('delete'),
        deleteTitle: t('deleteBudgetItemTitle'),
        edit: t('edit'),
        },
      );
    },
    [
      baseCurrency,
      canWriteBudgets,
      categoryOptions,
      entry,
      localizedBudgetHighlights,
      selectedBudget?.baseCurrency,
      selectedBudget?.pricingEnabled,
      selectedBudget?.transactions,
      t,
    ],
  );
  const transactionColumns = useMemo(
    () => {
      const transactionColumnLabels = documentTableLabels(tableChineseLanguage).columnLabels;

      return appendTransactionActions(
        appendTransactionPaymentColumn(
          appendTransactionQuickEditors(
            createTransactionColumns(localizedTransactionBreakdown?.columns ?? []),
            canWriteBudgets,
            entry,
            transactionCategoryOptions,
            selectedBudget?.baseCurrency ?? baseCurrency,
            t('referenceShort'),
            selectedBudget?.pricingEnabled ?? false,
            {
              unitPrice: tableLabel(
                'Unit Price',
                transactionColumnLabels.unit_price.primary,
                tableLanguageMode,
              ),
              quantity: tableLabel(
                'Quantity',
                transactionColumnLabels.quantity.primary,
                tableLanguageMode,
              ),
            },
            columnLabelStyle,
          ),
          selectedBudget?.participants ?? [],
          t('paidBy'),
        ),
        canWriteBudgets,
        entry,
        {
          cancel: t('cancel'),
          delete: t('delete'),
          deleteTitle: t('deleteTransactionTitle'),
          edit: t('edit'),
        },
      );
    },
    [
      baseCurrency,
      canWriteBudgets,
      entry,
      selectedBudget?.baseCurrency,
      selectedBudget?.participants,
      selectedBudget?.pricingEnabled,
      t,
      tableChineseLanguage,
      tableLanguageMode,
      columnLabelStyle,
      localizedTransactionBreakdown,
      transactionCategoryOptions,
    ],
  );
  const budgetTitle = selectedBudget?.title ?? t('noBudgetSelected');
  const budgetSubtitle = selectedBudget?.ownerName.trim() ?? '';
  const budgetDateText = selectedBudget ? formatBudgetPeriodEnglish(selectedBudget) : null;
  const canInlineEditHeader =
    selectedBudget !== null
    && canWriteBudgets
    && onInlineHeaderSave !== undefined
    && !isBudgetDetailLoading
    && !isBudgetSaving;
  const visibilityOptions = [
    { label: visibilityLabelsByLanguage[language].private, value: 'private' },
    { label: visibilityLabelsByLanguage[language].workspace, value: 'workspace' },
    { label: visibilityLabelsByLanguage[language].custom, value: 'custom' },
  ];
  const installmentRows =
    selectedBudget === null ? [] : createInstallmentPeriodRows(selectedBudget, remainingLabel);
  const showInstallmentCategory = selectedBudget?.installmentDisplayMode !== 'overall';
  const installmentColumns = createInstallmentPeriodColumns(
    showInstallmentCategory,
    {
      category: tableLabel('Category', documentLabels.columnLabels.category.primary, tableLanguageMode),
      sequence: tableLabel('No.', documentLabels.columnLabels.sequence.primary, tableLanguageMode),
      period: tableLabel('Period', documentLabels.columnLabels.period.primary, tableLanguageMode),
      periodAmount: tableLabel('Amount', documentLabels.columnLabels.amount.primary, tableLanguageMode),
      progress: tableLabel('Progress', documentLabels.columnLabels.progress.primary, tableLanguageMode),
      remark: tableLabel('Remark', documentLabels.columnLabels.remark.primary, tableLanguageMode),
      targetAmount: tableLabel('Target', documentLabels.columnLabels.target.primary, tableLanguageMode),
    },
    columnLabelStyle,
    canWriteBudgets,
    entry,
    t('edit'),
  );

  return (
    <main className="document-workbench">
      <div className="toolbar-row">
        <Space wrap>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<CalendarRange size={16} />}
            onClick={onEditBudget}
          >
            {t('projectInfo')}
          </Button>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<Signature size={16} />}
            onClick={onEditSignature}
          >
            {t('signatureSettings')}
          </Button>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<CalendarRange size={16} />}
            onClick={onEditInstallments}
          >
            {t('installmentOptions')}
          </Button>
          <Button
            disabled={selectedBudget === null || onOpenShare === undefined}
            icon={<Share2 size={16} />}
            onClick={onOpenShare}
          >
            {t('share')}
          </Button>
          <Segmented
            disabled
            value={selectedBudget?.visibility ?? 'private'}
            options={visibilityOptions}
          />
        </Space>
        <Space wrap>
          {selectedBudget ? (
            <Tag color={selectedBudget.status === 'active' ? 'blue' : 'default'}>
              {budgetStatusLabelsByLanguage[language][selectedBudget.status]}
            </Tag>
          ) : null}
        </Space>
      </div>

      <div className="budget-export-strip">
        <div className="budget-export-actions">
          <span className="budget-export-label">
            <FileText size={15} />
            {t('export')}
          </span>
          <Button
            disabled={selectedBudget === null}
            icon={<Download size={13} />}
            loading={operations.creatingExportFormat === 'pdf'}
            size="small"
            onClick={() => operations.createExport('pdf', {
              tableChineseLanguage,
              tableLanguageMode,
            })}
          >
            PDF
          </Button>
        </div>
        <div className="budget-table-language-controls">
          <span className="budget-export-label">{t('tableLanguage')}</span>
          <Segmented<BudgetTableLanguageMode>
            options={[
              { label: t('tableLanguageEnglish'), value: 'en' },
              { label: t('tableLanguageChinese'), value: 'zh' },
              { label: t('tableLanguageBilingual'), value: 'bilingual' },
            ]}
            size="small"
            value={tableLanguageMode}
            onChange={setTableLanguageMode}
          />
          {tableLanguageMode !== 'en' ? (
            <Segmented<BudgetTableChineseLanguage>
              options={[
                { label: t('tableChineseTraditional'), value: 'tc' },
                { label: t('tableChineseSimplified'), value: 'sc' },
              ]}
              size="small"
              value={tableChineseLanguage}
              onChange={setTableChineseLanguage}
            />
          ) : null}
        </div>
      </div>

      {operations.operationsError ? (
        <div className="state-panel state-panel-compact">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}

      {entry.entryError ? (
        <div className="state-panel state-panel-compact">
          <Alert type="error" showIcon message={entry.entryError} />
        </div>
      ) : null}

      {templateError || budgetError ? (
        <div className="state-panel">
          <Alert
            type="error"
            showIcon
            message={templateError ? t('templateApiUnavailable') : t('budgetApiUnavailable')}
            description={templateError ?? budgetError}
          />
        </div>
      ) : isBudgetLoading ? (
        <div className="state-panel">
          <Empty description={t('loadingBudget')} />
        </div>
      ) : selectedBudget === null ? (
        <div className="state-panel">
          <Empty description={t('noBudgetSelected')} />
        </div>
      ) : (
        <section className="budget-document-preview">
          <BudgetEditableHeader
            canEdit={canInlineEditHeader}
            labels={{
              cancel: t('cancel'),
              edit: t('edit'),
              save: t('save'),
            }}
            ownerName={budgetSubtitle}
            saving={isBudgetSaving}
            title={budgetTitle}
            onSave={onInlineHeaderSave}
          />

          <div className="budget-table-frame">
            <div className="budget-section-title budget-section-title-row">
              <span>{localizedBudgetHighlights?.title}</span>
              {canWriteBudgets ? (
                <Button
                  icon={<Plus size={14} />}
                  size="small"
                  type="text"
                  onClick={entry.openBudgetItemCreateModal}
                >
                  {t('add')}
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">
                {datePrefix}
                {budgetDateText}
              </div>
            ) : null}
            <Table<BudgetItem>
              bordered
              columns={budgetColumns}
              dataSource={selectedBudget.items}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description={t('budgetItemsEmpty')} /> }}
              pagination={false}
              rowKey="id"
              size="small"
              summary={() => renderBudgetSummary(
                budgetColumns,
                selectedBudget,
                totalLabel,
              )}
              tableLayout="fixed"
            />
          </div>

          <div className="budget-table-frame">
            <div className="budget-section-title budget-section-title-row">
              <span>{localizedTransactionBreakdown?.title}</span>
              {canWriteBudgets ? (
                <Button
                  icon={<Plus size={14} />}
                  size="small"
                  type="text"
                  onClick={entry.openTransactionCreateModal}
                >
                  {t('add')}
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">
                {datePrefix}
                {budgetDateText}
              </div>
            ) : null}
            <Table<Transaction>
              bordered
              columns={transactionColumns}
              dataSource={selectedBudget.transactions}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description={t('transactionsEmpty')} /> }}
              pagination={false}
              rowKey="id"
              size="small"
              tableLayout="fixed"
            />
          </div>

          {selectedBudget.budgetType === 'installment' ? (
            <div className="budget-table-frame">
              <div className="budget-section-title budget-section-title-row">
                <span>{installmentsTitle}</span>
              </div>
              {budgetDateText ? (
                <div className="budget-section-date">
                  {datePrefix}
                  {budgetDateText}
                </div>
              ) : null}
              <Table<InstallmentPeriodRow>
                bordered
                columns={installmentColumns}
                dataSource={installmentRows}
                loading={isTemplateLoading || isBudgetDetailLoading}
                locale={{ emptyText: <Empty description="No budget highlight items yet." /> }}
                pagination={false}
                rowKey="id"
                size="small"
                summary={() => renderInstallmentSummary(
                  createInstallmentSummaryValues(selectedBudget, installmentRows),
                  totalLabel,
                  showInstallmentCategory,
                )}
                tableLayout="fixed"
              />
            </div>
          ) : null}

          <BudgetSignatureSection
            config={selectedBudget.signatureConfig}
            fallbackTitle={t('signatureSectionTitle')}
            onEdit={canWriteBudgets ? onEditSignature : undefined}
          />
        </section>
      )}
    </main>
  );
}

interface InstallmentEstimateRow {
  id: string;
  category: string;
  currency: CurrencyCode;
  item?: BudgetItem;
  periodAmount: number;
  periodAmountBase: number;
  periodCount: number;
  periodIndex: number;
  periodLabel: string;
  progressChecked: boolean;
  progressMixed: boolean;
  remarkText: string;
  sequence: number;
  sourceRows: InstallmentItemPeriodRow[];
  targetAmountOriginal: number;
  targetAmount: string;
  targetAmountBase: number;
  targetProgress: string;
}

type InstallmentItemPeriodRow = Omit<InstallmentEstimateRow, 'item' | 'sourceRows'> & {
  item: BudgetItem;
  sourceRows: [];
};

type InstallmentPeriodRow = InstallmentEstimateRow;

interface InstallmentSummaryValues {
  currency: CurrencyCode;
  periodTotal: number;
  targetTotal: number;
}

function createInstallmentPeriodColumns(
  showCategory: boolean,
  labels: {
    category: BudgetTableLabel;
    sequence: BudgetTableLabel;
    period: BudgetTableLabel;
    periodAmount: BudgetTableLabel;
    progress: BudgetTableLabel;
    remark: BudgetTableLabel;
    targetAmount: BudgetTableLabel;
  },
  labelStyle: BudgetColumnLabelStyle,
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  editLabel: string,
): TableProps<InstallmentPeriodRow>['columns'] {
  const title = (label: BudgetTableLabel) => renderBudgetColumnTitle(label, labelStyle);
  const hasChineseLabels = labels.sequence.primary !== 'No.' || labels.sequence.secondary !== undefined;
  const sequenceWidth = hasChineseLabels ? '6%' : '4%';
  const categoryWidth = hasChineseLabels ? '14%' : '15%';
  const periodWidth = showCategory
    ? hasChineseLabels ? '14%' : '15%'
    : hasChineseLabels ? '17%' : '17%';
  const periodAmountWidth = showCategory
    ? hasChineseLabels ? '17%' : '19%'
    : hasChineseLabels ? '23%' : '21%';
  const targetAmountWidth = showCategory
    ? hasChineseLabels ? '17%' : '16%'
    : hasChineseLabels ? '19%' : '20%';
  const remarkWidth = showCategory
    ? hasChineseLabels ? '27%' : '26%'
    : hasChineseLabels ? '30%' : '33%';
  const columns: TableProps<InstallmentPeriodRow>['columns'] = [
    {
      align: 'center',
      dataIndex: 'sequence',
      key: 'sequence',
      title: title(labels.sequence),
      width: sequenceWidth,
    },
    {
      dataIndex: 'periodLabel',
      key: 'period',
      title: title(labels.period),
      width: periodWidth,
    },
    {
      align: 'right',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      title: title(labels.targetAmount),
      width: targetAmountWidth,
      render: (_value: string, row) => (
        <span className="budget-installment-target-cell">
          <span>{row.targetAmount}</span>
          <small>{row.targetProgress}</small>
        </span>
      ),
    },
    {
      align: 'right',
      dataIndex: 'periodAmount',
      key: 'periodAmount',
      title: title(labels.periodAmount),
      width: periodAmountWidth,
      render: (_value: number, row) => (
        <InlineInstallmentAmountCell
          currency={row.currency}
          disabled={entry.isBudgetItemSaving}
          editable={canWriteBudgets}
          editLabel={editLabel}
          value={row.periodAmount}
          onReset={() => {
            if (row.item !== undefined) {
              void entry.handleInstallmentPeriodReset(
                row.item,
                row.periodIndex,
                row.periodCount,
                row.targetAmountOriginal,
              );

              return;
            }
            void entry.handleOverallInstallmentPeriodReset(
              row.periodIndex,
              row.periodCount,
              row.targetAmountOriginal,
            );
          }}
          onCommit={(nextValue) => {
            if (row.item !== undefined) {
              void entry.handleInstallmentPeriodAmountSave(
                row.item,
                row.periodIndex,
                nextValue,
                row.periodCount,
                row.targetAmountOriginal,
              );

              return;
            }
            void entry.handleOverallInstallmentPeriodAmountSave(
              row.periodIndex,
              nextValue,
              row.periodCount,
              row.targetAmountOriginal,
            );
          }}
        />
      ),
    },
  ];

  if (showCategory) {
    columns.splice(1, 0, {
      dataIndex: 'category',
      key: 'category',
      title: title(labels.category),
      width: categoryWidth,
    });
  }

  columns.push(
    {
      align: 'center',
      dataIndex: 'progressChecked',
      key: 'progress',
      title: <Check aria-label={labels.progress.primary} size={12} />,
      width: '5%',
      render: (_value: boolean, row) => (
        <Checkbox
          checked={row.progressChecked}
          indeterminate={row.progressMixed}
          disabled={!canWriteBudgets || entry.isBudgetItemSaving}
          onChange={(event) => {
            if (row.item !== undefined) {
              void entry.handleInstallmentProgressSave(
                row.item,
                row.periodIndex,
                event.target.checked,
                row.periodCount,
                row.targetAmountOriginal,
              );

              return;
            }
            void entry.handleOverallInstallmentProgressSave(
              row.periodIndex,
              event.target.checked,
              row.periodCount,
              row.targetAmountOriginal,
            );
          }}
        />
      ),
    },
    {
      dataIndex: 'remarkText',
      key: 'remark',
      title: title(labels.remark),
      width: remarkWidth,
      render: (_value: string, row) => (
        <InlineTransactionRemarkCell
          disabled={entry.isBudgetItemSaving}
          editable={canWriteBudgets}
          value={row.remarkText}
          onCommit={(nextValue) => {
            if (row.item !== undefined) {
              void entry.handleInstallmentRemarkSave(
                row.item,
                row.periodIndex,
                nextValue,
                row.periodCount,
                row.targetAmountOriginal,
              );

              return;
            }
            void entry.handleOverallInstallmentRemarkSave(
              row.periodIndex,
              nextValue,
              row.periodCount,
              row.targetAmountOriginal,
            );
          }}
        />
      ),
    },
  );

  return columns;
}

function createInstallmentPeriodRows(
  budget: BudgetDetail,
  remainingLabel: string,
): InstallmentPeriodRow[] {
  if (budget.installmentDisplayMode === 'overall') {
    return createOverallInstallmentPeriodRows(budget, remainingLabel);
  }

  return createInstallmentItemPeriodRows(budget, remainingLabel);
}

function createInstallmentItemPeriodRows(
  budget: BudgetDetail,
  remainingLabel: string,
): InstallmentItemPeriodRow[] {
  return budget.items.flatMap((item) => {
    const configuredMonths = item.installmentConfig.enabled ? item.installmentConfig.months : null;
    const durationMonths =
      configuredMonths ?? budgetDurationMonths(budget.startDate, budget.endDate) ?? 1;
    const target = installmentTarget(item, budget);
    const periodCount = Math.max(1, Math.ceil(periodCountFromMonths(durationMonths, budget.installmentPeriodUnit)));
    const defaultPeriodAmount = target.original / periodCount;
    const startDate = installmentStartDate(item, budget);
    const periodAmounts = Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodAmounts[index] ?? defaultPeriodAmount,
    );
    const periodProgress = Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodProgress[index] === true,
    );
    let assignedAmount = 0;

    return Array.from({ length: periodCount }, (_, index) => {
      const periodAmount = periodAmounts[index] ?? 0;
      assignedAmount = roundMoney(assignedAmount + periodAmount);
      const progressChecked = periodProgress[index] === true;
      const remarkText = item.installmentConfig.periodRemarks[index] ?? '';
      const targetProgress = installmentTargetProgressText(
        item.budget.currency,
        Math.max(0, target.original - assignedAmount),
        remainingLabel,
      );

      return {
        id: `${item.id}-${index + 1}`,
        category: item.category ?? item.label,
        currency: item.budget.currency,
        item,
        periodAmount,
        periodAmountBase: periodAmount * item.budget.rateToBase,
        periodCount,
        periodIndex: index,
        periodLabel: formatInstallmentPeriodLabel(startDate, index, budget.installmentPeriodUnit),
        progressChecked,
        progressMixed: false,
        remarkText,
        sequence: index + 1,
        sourceRows: [],
        targetAmountOriginal: target.original,
        targetAmount: formatBudgetMoney(item.budget.currency, target.original),
        targetAmountBase: target.base,
        targetProgress,
      };
    });
  });
}

function createOverallInstallmentPeriodRows(
  budget: BudgetDetail,
  remainingLabel: string,
): InstallmentPeriodRow[] {
  const targetTotal = effectiveBudgetTotals(budget).totalBudgetBase;
  if (targetTotal <= 0) {
    return [];
  }

  const durationMonths = budgetDurationMonths(budget.startDate, budget.endDate) ?? 1;
  const periodCount = Math.max(1, Math.ceil(periodCountFromMonths(durationMonths, budget.installmentPeriodUnit)));
  const budgetStartDate = budget.startDate === null ? null : dayjs(budget.startDate);
  const defaultPeriodAmounts = splitMoneyAcrossPeriods(targetTotal, periodCount);
  const periodAmounts = Array.from({ length: periodCount }, (_, index) =>
    budget.overallInstallmentPlan.periodAmounts[index] ?? defaultPeriodAmounts[index] ?? 0,
  );
  const periodProgress = Array.from({ length: periodCount }, (_, index) =>
    budget.overallInstallmentPlan.periodProgress[index] === true,
  );
  const periodRemarks = Array.from({ length: periodCount }, (_, index) =>
    budget.overallInstallmentPlan.periodRemarks[index] ?? '',
  );
  let assignedAmount = 0;

  return Array.from({ length: periodCount }, (_, index) => {
    const periodAmount = periodAmounts[index] ?? 0;
    assignedAmount = roundMoney(assignedAmount + periodAmount);
    const targetProgress = installmentTargetProgressText(
      budget.baseCurrency,
      Math.max(0, targetTotal - assignedAmount),
      remainingLabel,
    );

    return {
      id: `overall-${index + 1}`,
      category: '',
      currency: budget.baseCurrency,
      periodAmount,
      periodAmountBase: periodAmount,
      periodCount,
      periodIndex: index,
      periodLabel: formatInstallmentPeriodLabel(budgetStartDate, index, budget.installmentPeriodUnit),
      progressChecked: periodProgress[index] === true,
      progressMixed: false,
      remarkText: periodRemarks[index] ?? '',
      sequence: index + 1,
      sourceRows: [],
      targetAmountOriginal: targetTotal,
      targetAmount: formatBudgetMoney(budget.baseCurrency, targetTotal),
      targetAmountBase: targetTotal,
      targetProgress,
    };
  });
}

function createInstallmentSummaryValues(
  budget: BudgetDetail,
  rows: InstallmentEstimateRow[],
): InstallmentSummaryValues | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    currency: budget.baseCurrency,
    targetTotal: budget.installmentDisplayMode === 'overall'
      ? effectiveBudgetTotals(budget).totalBudgetBase
      : budget.items.reduce(
        (total, item) => total + installmentTarget(item, budget).base,
        0,
      ),
    periodTotal: rows.reduce((total, row) => total + row.periodAmountBase, 0),
  };
}

function splitMoneyAcrossPeriods(totalAmount: number, periodCount: number): number[] {
  const averageAmount = roundMoney(totalAmount / periodCount);
  let assignedTotal = 0;

  return Array.from({ length: periodCount }, (_, index) => {
    const isLast = index === periodCount - 1;
    const amount = isLast ? roundMoney(totalAmount - assignedTotal) : averageAmount;
    assignedTotal = roundMoney(assignedTotal + amount);

    return amount;
  });
}

function installmentTarget(
  item: BudgetItem,
  budget: BudgetDetail,
): { base: number; original: number } {
  const summary = installmentSummary(item.installmentConfig);
  const rateToBase = item.budget.rateToBase > 0 ? item.budget.rateToBase : 1;

  if (item.installmentConfig.enabled && summary.totalAmount !== null && summary.totalAmount > 0) {
    return {
      original: summary.totalAmount,
      base: summary.totalAmount * rateToBase,
    };
  }

  const effective = effectiveBudgetItemAmounts(item, budget.transactions);

  return {
    original: effective.budgetAmountOriginal,
    base: effective.budgetAmountBase,
  };
}

function installmentTargetProgressText(
  currency: CurrencyCode,
  remainingAmount: number,
  remainingLabel: string,
): string {
  return `${remainingLabel} ${formatBudgetMoney(currency, roundMoney(remainingAmount))}`;
}

function renderInstallmentSummary(
  values: InstallmentSummaryValues | null,
  summaryLabel: string,
  showCategory: boolean,
) {
  if (values === null) {
    return null;
  }

  const targetIndex = showCategory ? 3 : 2;
  const amountIndex = showCategory ? 4 : 3;
  const trailingStartIndex = showCategory ? 5 : 4;

  return (
    <Table.Summary>
      <Table.Summary.Row className="budget-summary-row">
        <Table.Summary.Cell index={0} />
        <Table.Summary.Cell index={1}>{summaryLabel}</Table.Summary.Cell>
        {showCategory ? <Table.Summary.Cell index={2} /> : null}
        <Table.Summary.Cell className="budget-summary-number" index={targetIndex}>
          {formatBudgetMoney(values.currency, values.targetTotal)}
        </Table.Summary.Cell>
        <Table.Summary.Cell className="budget-summary-number" index={amountIndex}>
          {formatBudgetMoney(values.currency, values.periodTotal)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={trailingStartIndex} />
        <Table.Summary.Cell index={trailingStartIndex + 1} />
      </Table.Summary.Row>
    </Table.Summary>
  );
}

function InlineInstallmentAmountCell({
  currency,
  disabled,
  editable,
  editLabel,
  value,
  onReset,
  onCommit,
}: {
  currency: CurrencyCode;
  disabled: boolean;
  editable: boolean;
  editLabel: string;
  value: number;
  onReset: () => void;
  onCommit: (value: number) => void;
}) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [draftState, setDraftState] = useState<{ sourceValue: number; draftValue: number | null }>({
    sourceValue: value,
    draftValue: value,
  });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const setDraftValue = (nextValue: number | null) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };
  const beginEditing = () => {
    if (!editable || disabled) {
      return;
    }

    setDraftState({ sourceValue: value, draftValue: value });
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setDraftValue(value);
    setIsEditing(false);
  };
  const commit = () => {
    if (draftValue === null || !Number.isFinite(draftValue)) {
      cancelEditing();

      return;
    }

    if (Math.abs(draftValue - value) >= 0.005) {
      onCommit(draftValue);
    }
    setIsEditing(false);
  };

  if (!editable || !isEditing) {
    return (
      <span className="budget-installment-amount-readonly">
        <span className="budget-installment-period-amount">
          {formatBudgetMoney(currency, value)}
        </span>
        {editable ? (
          <Space size={2}>
            <Tooltip title={editLabel}>
              <Button
                disabled={disabled}
                icon={<Pencil size={12} />}
                size="small"
                type="text"
                onClick={beginEditing}
              />
            </Tooltip>
            <Tooltip title={t('reset')}>
              <Button
                disabled={disabled}
                icon={<RotateCcw size={12} />}
                size="small"
                type="text"
                onClick={onReset}
              />
            </Tooltip>
          </Space>
        ) : null}
      </span>
    );
  }

  return (
    <span className="budget-installment-amount-editor">
      <span className="budget-inline-money-cell">
        <span>{currency}</span>
        <InputNumber
          autoFocus
          changeOnWheel={false}
          className="budget-inline-money-input"
          controls={false}
          disabled={disabled}
          min={0}
          precision={2}
          size="small"
          value={draftValue}
          variant="borderless"
          onChange={(nextValue) => setDraftValue(typeof nextValue === 'number' ? nextValue : null)}
          onPressEnter={commit}
        />
      </span>
      <Space size={2}>
        <Tooltip title={t('save')}>
          <Button
            disabled={disabled}
            icon={<Check size={12} />}
            size="small"
            type="text"
            onClick={commit}
          />
        </Tooltip>
        <Tooltip title={t('cancel')}>
          <Button
            disabled={disabled}
            icon={<X size={12} />}
            size="small"
            type="text"
            onClick={cancelEditing}
          />
        </Tooltip>
      </Space>
    </span>
  );
}

function budgetDurationMonths(startDate: string | null, endDate: string | null): number | null {
  if (startDate === null || endDate === null) {
    return null;
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return null;
  }

  return Math.max(1, (end.diff(start, 'day') + 1) / 30.4375);
}

function periodCountFromMonths(months: number, unit: BudgetDetail['installmentPeriodUnit']): number {
  if (unit === 'day') {
    return months * (365 / 12);
  }

  if (unit === 'week') {
    return months * (52 / 12);
  }

  if (unit === 'year') {
    return months / 12;
  }

  return months;
}

function installmentStartDate(item: BudgetItem, budget: BudgetDetail): dayjs.Dayjs | null {
  if (item.installmentConfig.startMonth !== null) {
    const startMonth = dayjs(`${item.installmentConfig.startMonth}-01`);

    return startMonth.isValid() ? startMonth : null;
  }

  if (budget.startDate === null) {
    return null;
  }

  const budgetStart = dayjs(budget.startDate);

  return budgetStart.isValid() ? budgetStart : null;
}

function formatInstallmentPeriodLabel(
  startDate: dayjs.Dayjs | null,
  periodIndex: number,
  unit: BudgetDetail['installmentPeriodUnit'],
): string {
  if (startDate === null) {
    return `#${periodIndex + 1}`;
  }

  if (unit === 'day') {
    return startDate.add(periodIndex, 'day').format('D MMM YYYY');
  }

  if (unit === 'week') {
    return startDate.add(periodIndex, 'week').format('D MMM YYYY');
  }

  if (unit === 'year') {
    return startDate.add(periodIndex, 'year').format('YYYY');
  }

  return startDate.add(periodIndex, 'month').format('MMMM YYYY');
}

function BudgetEditableHeader({
  canEdit,
  labels,
  ownerName,
  saving,
  title,
  onSave,
}: {
  canEdit: boolean;
  labels: {
    cancel: string;
    edit: string;
    save: string;
  };
  ownerName: string;
  saving: boolean;
  title: string;
  onSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
}) {
  const [editingField, setEditingField] = useState<'title' | 'ownerName' | null>(null);
  const [titleDraft, setTitleDraft] = useState(title);
  const [ownerNameDraft, setOwnerNameDraft] = useState(ownerName);

  const startEditing = (field: 'title' | 'ownerName') => {
    if (!canEdit || saving) {
      return;
    }

    if (field === 'title') {
      setTitleDraft(title);
    } else {
      setOwnerNameDraft(ownerName);
    }
    setEditingField(field);
  };
  const cancelEditing = () => {
    setTitleDraft(title);
    setOwnerNameDraft(ownerName);
    setEditingField(null);
  };
  const saveField = async (field: 'title' | 'ownerName') => {
    if (onSave === undefined || saving) {
      return;
    }

    const value = field === 'title' ? titleDraft : ownerNameDraft;
    if (field === 'title' && value.trim() === '') {
      return;
    }

    await onSave(field === 'title' ? { title: value } : { ownerName: value });
    setEditingField(null);
  };
  const handleEditorKeyDown = (field: 'title' | 'ownerName') => (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();

      return;
    }
    if (event.key !== 'Enter' || event.altKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void saveField(field);
  };
  const renderEditActions = (field: 'title' | 'ownerName') => (
    <Space size={2} className="budget-document-edit-actions">
      <Tooltip title={labels.save}>
        <Button
          icon={<Check size={13} />}
          loading={saving}
          size="small"
          type="text"
          onClick={() => {
            void saveField(field);
          }}
        />
      </Tooltip>
      <Tooltip title={labels.cancel}>
        <Button
          disabled={saving}
          icon={<X size={13} />}
          size="small"
          type="text"
          onClick={cancelEditing}
        />
      </Tooltip>
    </Space>
  );

  return (
    <div className="budget-document-heading" aria-busy={saving}>
      {editingField === 'title' ? (
        <div className="budget-document-editor-row budget-document-title-editor-row">
          <Input.TextArea
            autoFocus
            autoSize={{ maxRows: 4, minRows: 1 }}
            className="budget-document-title-editor"
            maxLength={255}
            value={titleDraft}
            variant="borderless"
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown('title')}
          />
          {renderEditActions('title')}
        </div>
      ) : (
        <Typography.Title className="budget-document-title" level={1}>
          <span
            className="budget-document-text"
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={() => startEditing('title')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                startEditing('title');
              }
            }}
          >
            {title}
          </span>
          {canEdit ? (
            <Tooltip title={labels.edit}>
              <Button
                icon={<Pencil size={13} />}
                size="small"
                type="text"
                onClick={() => startEditing('title')}
              />
            </Tooltip>
          ) : null}
        </Typography.Title>
      )}
      {ownerName || canEdit ? (
        editingField === 'ownerName' ? (
          <div className="budget-document-editor-row budget-document-subtitle-editor-row">
            <Input.TextArea
              autoFocus
              autoSize={{ maxRows: 2, minRows: 1 }}
              className="budget-document-subtitle-editor"
              maxLength={160}
              value={ownerNameDraft}
              variant="borderless"
              onChange={(event) => setOwnerNameDraft(event.target.value)}
              onKeyDown={handleEditorKeyDown('ownerName')}
            />
            {renderEditActions('ownerName')}
          </div>
        ) : (
          <Typography.Paragraph className="budget-document-subtitle">
            <span
              className="budget-document-text"
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={() => startEditing('ownerName')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  startEditing('ownerName');
                }
              }}
            >
              {ownerName || ' '}
            </span>
            {canEdit ? (
              <Tooltip title={labels.edit}>
                <Button
                  icon={<Pencil size={13} />}
                  size="small"
                  type="text"
                  onClick={() => startEditing('ownerName')}
                />
              </Tooltip>
            ) : null}
          </Typography.Paragraph>
        )
      ) : null}
    </div>
  );
}

function BudgetSignatureSection({
  config,
  fallbackTitle,
  onEdit,
}: {
  config: BudgetSignatureConfig;
  fallbackTitle: string;
  onEdit?: () => void;
}) {
  if (!config.enabled || config.rows.length === 0) {
    return null;
  }

  const isSingleFullWidth = config.rows.length === 1 && config.sectionAlign !== 'right';
  const labels = signatureMetaLabelsForLanguage(signatureInfoLanguage(config));
  const signingRows = config.rows.filter((row) => row.showSignature !== false);
  const noteRows = config.rows.filter((row) => row.showSignature === false);
  const title = signatureTitleForDisplay(config, fallbackTitle);

  return (
    <div
      className={[
        'budget-signature-section',
        `budget-signature-section-${config.sectionAlign}`,
        isSingleFullWidth ? 'budget-signature-section-single' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="budget-signature-title">
        <span>{title}</span>
        {onEdit ? (
          <Tooltip title="Edit">
            <Button
              icon={<Pencil size={12} />}
              size="small"
              type="text"
              onClick={onEdit}
            />
          </Tooltip>
        ) : null}
      </div>
      <div className="budget-signature-grid">
        {signingRows.map((row) => (
          <BudgetSignatureCard
            config={config}
            key={row.id}
            labels={labels}
            row={row}
          />
        ))}
        {noteRows.length > 0 ? (
          <BudgetSignatureNotesBlock config={config} labels={labels} rows={noteRows} />
        ) : null}
      </div>
    </div>
  );
}

function appendQuickAmountEditors(
  columns: TableProps<BudgetItem>['columns'],
  transactions: Transaction[],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  baseCurrency: CurrencyCode,
  editLabel: string,
): TableProps<BudgetItem>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  return columns.map((column) => {
    const key = String(column.key ?? '');
    if (!['budget', 'estimated_actuals', 'variance'].includes(key)) {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: BudgetItem) => {
        const effective = effectiveBudgetItemAmounts(row, transactions);
        const editable = canWriteBudgets;
        const isEstimatedActuals = key === 'estimated_actuals';
        const currency = key === 'budget' ? row.budget.currency : baseCurrency;
        const value = key === 'budget'
          ? effective.budgetAmountOriginal
          : key === 'estimated_actuals'
            ? effective.estimatedAmountBase
            : effective.varianceBase;
        const editFocus = key === 'budget' ? 'budget' : key === 'variance' ? 'variance' : null;

        return (
          <InlineMoneyCell
            currency={currency}
            disabled={entry.isBudgetItemSaving}
            editable={editable && !isEstimatedActuals}
            editLabel={editLabel}
            secondaryText={secondaryTextForBudgetCell(row, key, effective, baseCurrency, value)}
            value={value}
            onEdit={isEstimatedActuals ? undefined : () => entry.openBudgetItemEditModal(row, editFocus)}
            onCommit={(nextValue) => {
              void entry.handleBudgetItemQuickAmountSave(row, key, nextValue);
            }}
          />
        );
      },
    };
  });
}

function appendBudgetItemCategoryEditors(
  columns: TableProps<BudgetItem>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  categoryOptions: Array<{ label: string; value: number }>,
): TableProps<BudgetItem>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  return columns.map((column) => {
    if (String(column.key ?? '') !== 'category') {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: BudgetItem) => (
        <InlineCategoryCell
          categoryOptions={categoryOptions}
          disabled={entry.isBudgetItemSaving}
          editable={canWriteBudgets}
          row={row}
          onEdit={() => entry.openBudgetItemEditModal(row, 'category')}
          onSave={(categoryId, label) => {
            void entry.handleBudgetItemCategoryQuickSave(row, categoryId, label);
          }}
        />
      ),
    };
  });
}

function InlineCategoryCell({
  categoryOptions,
  disabled,
  editable,
  row,
  onEdit,
  onSave,
}: {
  categoryOptions: Array<{ label: string; value: number }>;
  disabled: boolean;
  editable: boolean;
  row: BudgetItem;
  onEdit: () => void;
  onSave: (categoryId: number | null, label: string) => void;
}) {
  const { t } = useI18n();
  const label = row.category ?? row.label;

  if (!editable) {
    return (
      <div className="budget-item-category-cell">
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="budget-category-quick-cell">
      <Select
        allowClear
        className="budget-category-quick-select"
        disabled={disabled}
        optionFilterProp="label"
        options={categoryOptions}
        placeholder={t('selectCategory')}
        showSearch
        size="small"
        value={row.categoryId ?? undefined}
        variant="borderless"
        onChange={(value) => {
          const option = categoryOptions.find((item) => item.value === value);
          onSave(value ?? null, option?.label ?? row.label);
        }}
      />
      <Tooltip title={t('edit')}>
        <Button
          icon={<Pencil size={12} />}
          size="small"
          type="text"
          onClick={onEdit}
        />
      </Tooltip>
    </div>
  );
}

function InlineMoneyCell({
  currency,
  currencyOptions,
  disabled,
  editable,
  editLabel,
  secondaryText,
  value,
  onCurrencyCommit,
  onEdit,
  onCommit,
}: {
  currency: CurrencyCode;
  currencyOptions?: Array<{ label: string; value: CurrencyCode }>;
  disabled: boolean;
  editable: boolean;
  secondaryText?: string | null;
  value: number;
  onCurrencyCommit?: (currency: CurrencyCode) => void;
  onEdit?: () => void;
  editLabel?: string;
  onCommit: (value: number) => void;
}) {
  const [draftState, setDraftState] = useState<{ sourceValue: number; draftValue: number | null }>({
    sourceValue: value,
    draftValue: value,
  });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const setDraftValue = (nextValue: number | null) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

  if (!editable) {
    return (
      <span className="budget-inline-money-readonly">
        <span>{formatBudgetMoney(currency, value)}</span>
        {secondaryText ? <small>{secondaryText}</small> : null}
      </span>
    );
  }

  const commit = () => {
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value);

      return;
    }

    if (Math.abs(draftValue - value) >= 0.005) {
      onCommit(draftValue);
    }
  };

  return (
    <span className="budget-inline-money-wrap">
      <span className="budget-inline-money-cell">
        {currencyOptions && onCurrencyCommit ? (
          <Select<CurrencyCode>
            className="budget-inline-currency-select"
            disabled={disabled}
            options={currencyOptions}
            size="small"
            value={currency}
            variant="borderless"
            onChange={(nextCurrency) => onCurrencyCommit(nextCurrency)}
          />
        ) : (
          <span>{currency}</span>
        )}
        <InputNumber
          changeOnWheel={false}
          className="budget-inline-money-input"
          controls={false}
          disabled={disabled}
          precision={2}
          size="small"
          value={draftValue}
          variant="borderless"
          onBlur={commit}
          onChange={(nextValue) => setDraftValue(typeof nextValue === 'number' ? nextValue : null)}
          onPressEnter={commit}
        />
        {onEdit ? (
          <Tooltip title={editLabel ?? 'Edit'}>
            <Button
              icon={<Pencil size={12} />}
              size="small"
              type="text"
              onClick={onEdit}
            />
          </Tooltip>
        ) : null}
      </span>
      {secondaryText ? <small>{secondaryText}</small> : null}
    </span>
  );
}

function InlineCompactMoneyCell({
  currency,
  disabled,
  editable,
  value,
  onCommit,
}: {
  currency: CurrencyCode;
  disabled: boolean;
  editable: boolean;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draftState, setDraftState] = useState<{ sourceValue: number; draftValue: number | null }>({
    sourceValue: value,
    draftValue: value,
  });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const setDraftValue = (nextValue: number | null) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

  if (!editable) {
    return (
      <span className="budget-inline-compact-money-cell">
        <span className="budget-inline-compact-currency">{currency}</span>
        <span className="budget-inline-compact-money-readonly">{value.toFixed(2)}</span>
      </span>
    );
  }

  const commit = () => {
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value);

      return;
    }

    if (Math.abs(draftValue - value) >= 0.005) {
      onCommit(draftValue);
    }
  };

  return (
    <span className="budget-inline-compact-money-cell">
      <span className="budget-inline-compact-currency">{currency}</span>
      <InputNumber
        changeOnWheel={false}
        className="budget-inline-compact-money-input"
        controls={false}
        disabled={disabled}
        min={0}
        precision={2}
        size="small"
        value={draftValue}
        variant="borderless"
        onBlur={commit}
        onChange={(nextValue) => setDraftValue(typeof nextValue === 'number' ? nextValue : null)}
        onPressEnter={commit}
      />
    </span>
  );
}

function InlineNumberCell({
  disabled,
  editable,
  precision,
  value,
  onCommit,
}: {
  disabled: boolean;
  editable: boolean;
  precision?: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draftState, setDraftState] = useState<{ sourceValue: number; draftValue: number | null }>({
    sourceValue: value,
    draftValue: value,
  });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const setDraftValue = (nextValue: number | null) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

  if (!editable) {
    return <span className="budget-inline-number-readonly">{value.toFixed(precision ?? 2)}</span>;
  }

  const commit = () => {
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value);

      return;
    }

    if (Math.abs(draftValue - value) >= 0.005) {
      onCommit(draftValue);
    }
  };

  return (
    <InputNumber
      changeOnWheel={false}
      className="budget-inline-number-input"
      controls={false}
      disabled={disabled}
      min={0}
      precision={precision}
      size="small"
      value={draftValue}
      variant="borderless"
      onBlur={commit}
      onChange={(nextValue) => setDraftValue(typeof nextValue === 'number' ? nextValue : null)}
      onPressEnter={commit}
    />
  );
}

function secondaryTextForBudgetCell(
  row: BudgetItem,
  key: string,
  effective: ReturnType<typeof effectiveBudgetItemAmounts>,
  baseCurrency: CurrencyCode,
  value: number,
): string | null {
  if (key === 'variance') {
    return null;
  }

  if (key === 'estimated_actuals') {
    return transactionTotalsText(effective.estimatedTransactionTotals, baseCurrency);
  }

  const leg = key === 'budget' ? row.budget : row.estimatedActuals;
  if (leg.currency === baseCurrency) {
    return null;
  }

  const baseAmount = key === 'budget'
    ? effective.budgetAmountBase
    : effective.estimatedAmountBase;
  const expectedBase = roundMoney(value * leg.rateToBase);
  if (Math.abs(baseAmount - expectedBase) < 0.005) {
    return formatBudgetMoney(baseCurrency, expectedBase);
  }

  return formatBudgetMoney(baseCurrency, baseAmount);
}

function transactionTotalsText(
  totals: TransactionCurrencyTotal[],
  baseCurrency: CurrencyCode,
): string | null {
  if (totals.length === 0) {
    return null;
  }

  if (totals.length === 1 && totals[0].currency === baseCurrency) {
    return null;
  }

  return totals
    .map((total) => formatBudgetMoney(total.currency, total.amountOriginal))
    .join(' · ');
}

function transactionSecondaryText(
  row: Transaction,
  baseCurrency: CurrencyCode,
  referenceLabel: string,
): string | null {
  const lines: string[] = [];
  if (row.currency !== baseCurrency) {
    lines.push(formatBudgetMoney(baseCurrency, row.amountBase));
  }

  if (typeof row.referenceCurrency === 'string' && typeof row.referenceAmountOriginal === 'number') {
    lines.push(`${referenceLabel} ${formatBudgetMoney(row.referenceCurrency, row.referenceAmountOriginal)}`);
  }

  return lines.length === 0 ? null : lines.join(' · ');
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function transactionUnitPrice(row: Transaction): number {
  return row.pricingConfig.enabled && row.pricingConfig.unitPrice !== null
    ? row.pricingConfig.unitPrice
    : row.amountOriginal;
}

function transactionQuantity(row: Transaction): number {
  return row.pricingConfig.enabled && row.pricingConfig.quantity !== null
    ? row.pricingConfig.quantity
    : 1;
}

function appendTransactionQuickEditors(
  columns: TableProps<Transaction>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  categoryOptions: Array<{ label: string; value: number }>,
  baseCurrency: CurrencyCode,
  referenceLabel: string,
  pricingEnabled: boolean,
  pricingLabels: {
    unitPrice: BudgetTableLabel;
    quantity: BudgetTableLabel;
  },
  labelStyle: BudgetColumnLabelStyle,
): TableProps<Transaction>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  const editedColumns = columns.map((column) => {
    const key = String(column.key ?? '');
    if (key === 'category') {
      return {
        ...column,
        render: (_value: unknown, row: Transaction) => (
          <InlineTransactionCategoryCell
            categoryOptions={categoryOptions}
            disabled={entry.isTransactionSaving}
            editable={canWriteBudgets}
            row={row}
            onSave={(categoryId) => {
              void entry.handleTransactionCategoryQuickSave(row, categoryId);
            }}
          />
        ),
      };
    }

    if (key === 'remark') {
      return {
        ...column,
        render: (_value: unknown, row: Transaction) => (
          <InlineTransactionRemarkCell
            disabled={entry.isTransactionSaving}
            editable={canWriteBudgets}
            value={row.remark ?? ''}
            onCommit={(nextValue) => {
              void entry.handleTransactionQuickRemarkSave(row, nextValue);
            }}
          />
        ),
      };
    }

    if (key !== 'amount') {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: Transaction) => (
        <InlineMoneyCell
          currency={row.currency}
          currencyOptions={currencyOptions}
          disabled={entry.isTransactionSaving}
          editable={canWriteBudgets && !pricingEnabled}
          secondaryText={transactionSecondaryText(row, baseCurrency, referenceLabel)}
          value={row.amountOriginal}
          onCurrencyCommit={(nextCurrency) => {
            void entry.handleTransactionQuickCurrencySave(row, nextCurrency);
          }}
          onEdit={() => entry.openTransactionEditModal(row)}
          onCommit={(nextValue) => {
            void entry.handleTransactionQuickAmountSave(row, nextValue);
          }}
        />
      ),
    };
  });

  if (!pricingEnabled) {
    return editedColumns;
  }

  const pricingColumns: NonNullable<TableProps<Transaction>['columns']> = [
    {
      key: 'unit_price',
      title: renderBudgetColumnTitle(pricingLabels.unitPrice, labelStyle),
      align: 'right',
      width: '12%',
      render: (_value: unknown, row: Transaction) => (
        <InlineCompactMoneyCell
          currency={row.currency}
          disabled={entry.isTransactionSaving}
          editable={canWriteBudgets}
          value={transactionUnitPrice(row)}
          onCommit={(nextValue) => {
            void entry.handleTransactionQuickUnitPriceSave(row, nextValue);
          }}
        />
      ),
    },
    {
      key: 'quantity',
      title: renderBudgetColumnTitle(pricingLabels.quantity, labelStyle),
      align: 'right',
      width: '10%',
      render: (_value: unknown, row: Transaction) => (
        <InlineNumberCell
          disabled={entry.isTransactionSaving}
          editable={canWriteBudgets}
          precision={2}
          value={transactionQuantity(row)}
          onCommit={(nextValue) => {
            void entry.handleTransactionQuickQuantitySave(row, nextValue);
          }}
        />
      ),
    },
  ];
  const nextColumns: NonNullable<TableProps<Transaction>['columns']> = [];
  let inserted = false;
  editedColumns.forEach((column) => {
    if (!inserted && String(column.key ?? '') === 'amount') {
      nextColumns.push(...pricingColumns);
      inserted = true;
    }
    nextColumns.push(column);
  });

  return inserted ? nextColumns : [...editedColumns, ...pricingColumns];
}

function appendTransactionPaymentColumn(
  columns: TableProps<Transaction>['columns'],
  participants: BudgetParticipant[],
  title: string,
): TableProps<Transaction>['columns'] {
  if (columns === undefined || participants.length === 0) {
    return columns;
  }

  const paymentColumn: NonNullable<TableProps<Transaction>['columns']>[number] = {
    key: 'paid_by',
    title,
    align: 'left',
    width: '16%',
    render: (_value: unknown, row: Transaction) => transactionPaymentCell(row, participants),
  };
  if (columns.some((column) => String(column.key ?? '') === 'paid_by')) {
    return columns.map((column) =>
      String(column.key ?? '') === 'paid_by'
        ? { ...column, render: paymentColumn.render }
        : column,
    );
  }

  const nextColumns: NonNullable<TableProps<Transaction>['columns']> = [];
  let inserted = false;
  columns.forEach((column) => {
    nextColumns.push(column);
    if (!inserted && String(column.key ?? '') === 'category') {
      nextColumns.push(paymentColumn);
      inserted = true;
    }
  });

  if (!inserted) {
    nextColumns.splice(Math.min(1, nextColumns.length), 0, paymentColumn);
  }

  return nextColumns;
}

function transactionPaymentCell(transaction: Transaction, participants: BudgetParticipant[]) {
  const participantName = new Map(participants.map((participant) => [participant.id, participant.name]));
  if (transaction.payments.length > 0) {
    return (
      <div className="budget-money-stack">
        {transaction.payments.map((payment) => (
          <span key={payment.participantId} className="budget-money-secondary">
            {participantName.get(payment.participantId) ?? ''}
            {': '}
            {formatBudgetMoney(transaction.currency, payment.amountOriginal)}
          </span>
        ))}
      </div>
    );
  }

  if (transaction.paidByParticipantId !== null) {
    return participantName.get(transaction.paidByParticipantId) ?? '';
  }

  return '';
}

function InlineTransactionCategoryCell({
  categoryOptions,
  disabled,
  editable,
  row,
  onSave,
}: {
  categoryOptions: Array<{ label: string; value: number }>;
  disabled: boolean;
  editable: boolean;
  row: Transaction;
  onSave: (categoryId: number) => void;
}) {
  const { t } = useI18n();

  if (!editable) {
    return row.category ?? '';
  }

  return (
    <div className="budget-category-quick-cell">
      <Select
        className="budget-category-quick-select"
        disabled={disabled}
        optionFilterProp="label"
        options={categoryOptions}
        placeholder={t('selectCategory')}
        showSearch
        size="small"
        value={row.categoryId ?? undefined}
        variant="borderless"
        onChange={(value) => {
          if (typeof value === 'number') {
            onSave(value);
          }
        }}
      />
    </div>
  );
}

function InlineTransactionRemarkCell({
  disabled,
  editable,
  value,
  onCommit,
}: {
  disabled: boolean;
  editable: boolean;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  const [draftState, setDraftState] = useState({ sourceValue: value, draftValue: value });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const normalizedValue = value.trim();
  const setDraftValue = (nextValue: string) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

  if (!editable) {
    return <span className="budget-inline-remark-readonly">{value}</span>;
  }

  const commit = () => {
    const nextValue = draftValue.trim();
    if (nextValue !== normalizedValue) {
      onCommit(draftValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setDraftValue(value);
      event.currentTarget.blur();
    }
  };

  return (
    <Input.TextArea
      allowClear
      autoComplete="off"
      autoSize={{ maxRows: 3, minRows: 1 }}
      className="budget-inline-remark-input"
      disabled={disabled}
      maxLength={500}
      placeholder={t('remark')}
      value={draftValue}
      variant="borderless"
      onBlur={commit}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

function BudgetSignatureCard({
  config,
  labels,
  row,
}: {
  config: BudgetSignatureConfig;
  labels: SignatureMetaLabels;
  row: BudgetSignatureRow;
}) {
  const signatureLabel = signatureLabelForConfig(config);
  const signatureLabelLines = signatureLabel.split('\n');
  const metaRows = signatureMetaRows(row, labels, config);

  return (
    <div className="budget-signature-card">
      <div className="budget-signature-info">
        {metaRows.map((item, index) => (
          <div className="budget-signature-meta" key={`${item.label}-${index}`}>
            <span className="budget-signature-meta-label">{item.label}</span>
            <span className="budget-signature-meta-value">{item.value}</span>
          </div>
        ))}
      </div>
      <div className="budget-signature-sign">
        {row.showSignature ? (
          <div className={`budget-signature-box budget-signature-label-${config.labelAlign}`}>
            <span className="budget-signature-box-space" />
            <span className="budget-signature-rule" />
            <span className="budget-signature-box-label">
              {signatureLabelLines.map((line, index) => (
                <span key={`${line}-${index}`}>{line}</span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BudgetSignatureNotesBlock({
  config,
  labels,
  rows,
}: {
  config: BudgetSignatureConfig;
  labels: SignatureMetaLabels;
  rows: BudgetSignatureRow[];
}) {
  const noteItems = rows
    .map((row) => signatureCompactNoteItem(row, labels, config))
    .filter((item) => item.primaryValue || item.details.length > 0);
  const noteGridStyle = {
    '--signature-note-columns': String(signatureNoteColumnCount(noteItems)),
  } as CSSProperties;

  if (noteItems.length === 0) {
    return null;
  }

  return (
    <div className="budget-signature-notes-block" style={noteGridStyle}>
      {noteItems.map((item) => (
        <div className="budget-signature-note-row" key={item.id}>
          <BudgetSignatureNoteField
            className="budget-signature-note-primary"
            item={{ label: item.primaryLabel, value: item.primaryValue }}
          />
          {item.details.length > 0 ? (
            <span className="budget-signature-note-details">
              {item.details.map((detail, index) => (
                <BudgetSignatureNoteField item={detail} key={`${detail.label}-${index}`} />
              ))}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BudgetSignatureNoteField({
  className,
  item,
}: {
  className?: string;
  item: { label: string; value: string };
}) {
  const label = item.label.trim();
  const value = item.value.trim();

  return (
    <span className={['budget-signature-note-field', className].filter(Boolean).join(' ')}>
      {label ? <span className="budget-signature-note-label">{label}</span> : null}
      {value ? <span className="budget-signature-note-value">{value}</span> : null}
    </span>
  );
}

type SignatureNoteItem = {
  id: string;
  primaryLabel: string;
  primaryValue: string;
  details: Array<{ label: string; value: string }>;
  hasDateTime: boolean;
};

type SignatureMetaLabels = {
  name: string;
  capacity: string;
  dateTime: string;
  email: string;
  position: string;
  telephone: string;
  mobile: string;
};

function signatureMetaRows(
  row: BudgetSignatureRow,
  labels: SignatureMetaLabels,
  config: BudgetSignatureConfig,
): Array<{ label: string; value: string }> {
  const dateTimeText = row.signedAt ?? currentDateTimeText();

  return [
    row.showName && row.displayName
      ? { label: labels.name, value: row.displayName }
      : null,
    row.showRole && row.roleLabel
      ? { label: labels.capacity, value: signatureRoleForDisplay(config, row.roleLabel) }
      : null,
    row.showPosition && row.position
      ? { label: labels.position, value: signaturePositionForDisplay(config, row.position) }
      : null,
    row.showEmail && row.email
      ? { label: labels.email, value: row.email }
      : null,
    ...(row.customFields ?? [])
      .filter((field) => field.show !== false && (field.label.trim() !== '' || field.value.trim() !== ''))
      .map((field) => ({
        label: signatureCustomFieldLabelForDisplay(config, field.label),
        value: field.value,
      })),
    row.showDateTime
      ? { label: labels.dateTime, value: dateTimeText }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function signatureCompactNoteItem(
  row: BudgetSignatureRow,
  labels: SignatureMetaLabels,
  config: BudgetSignatureConfig,
): SignatureNoteItem {
  const role = row.showRole && row.roleLabel
    ? signatureRoleForDisplay(config, row.roleLabel)
    : '';
  const name = row.showName && row.displayName ? row.displayName : '';
  const details = [
    row.showPosition && row.position
      ? { label: labels.position, value: signaturePositionForDisplay(config, row.position) }
      : null,
    row.showEmail && row.email
      ? { label: labels.email, value: row.email }
      : null,
    ...(row.customFields ?? [])
      .filter((field) => field.show !== false && (field.label.trim() !== '' || field.value.trim() !== ''))
      .map((field) => ({
        label: signatureCustomFieldLabelForDisplay(config, field.label),
        value: field.value,
      })),
    row.showDateTime
      ? { label: labels.dateTime, value: row.signedAt ?? currentDateTimeText() }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (role && name) {
    return {
      id: row.id,
      primaryLabel: role,
      primaryValue: name,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  if (name) {
    return {
      id: row.id,
      primaryLabel: labels.name,
      primaryValue: name,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  if (role) {
    return {
      id: row.id,
      primaryLabel: '',
      primaryValue: role,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  const [firstDetail, ...restDetails] = details;

  return {
    id: row.id,
    primaryLabel: firstDetail?.label ?? '',
    primaryValue: firstDetail?.value ?? '',
    details: restDetails,
    hasDateTime: row.showDateTime,
  };
}

function signatureNoteColumnCount(items: SignatureNoteItem[]): number {
  const maxColumns = Math.min(4, Math.max(1, items.length));
  const hasDateTime = items.some((item) => item.hasDateTime);
  if (hasDateTime) {
    return Math.min(maxColumns, 2);
  }

  const longestTextLength = Math.max(
    0,
    ...items.map((item) => [
      item.primaryLabel,
      item.primaryValue,
      ...item.details.flatMap((detail) => [detail.label, detail.value]),
    ].join(' ').length),
  );

  if (longestTextLength <= 28) {
    return maxColumns;
  }
  if (longestTextLength <= 48) {
    return Math.min(maxColumns, 3);
  }

  return Math.min(maxColumns, 2);
}

function currentDateTimeText(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-')
    + ' '
    + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join(':');
}

function renderBudgetSummary(
  columns: TableProps<BudgetItem>['columns'],
  selectedBudget: BudgetDetail,
  summaryLabel: string,
) {
  if (columns === undefined || columns.length === 0) {
    return null;
  }

  return (
    <Table.Summary>
      <Table.Summary.Row className="budget-summary-row">
        {columns.map((column, index) => {
          const key = String(column.key ?? '');
          const isNumberColumn =
            key === 'budget' || key === 'estimated_actuals' || key === 'variance';

          return (
            <Table.Summary.Cell
              className={isNumberColumn ? 'budget-summary-number' : undefined}
              index={index}
              key={`${key}-${index}`}
            >
              {summaryCellContent(key, index, selectedBudget, summaryLabel)}
            </Table.Summary.Cell>
          );
        })}
      </Table.Summary.Row>
    </Table.Summary>
  );
}

function summaryCellContent(
  key: string,
  index: number,
  selectedBudget: BudgetDetail,
  summaryLabel: string,
): string {
  if (key === 'budget') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalBudgetBase,
    );
  }

  if (key === 'estimated_actuals') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalEstimatedBase,
    );
  }

  if (key === 'variance') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalVarianceBase,
    );
  }

  if (key === 'actions') {
    return '';
  }

  return index === 0 ? summaryLabel : '';
}

interface ActionLabels {
  cancel: string;
  delete: string;
  deleteTitle: string;
  edit: string;
}

function appendBudgetItemActions(
  columns: TableProps<BudgetItem>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  labels: ActionLabels,
): TableProps<BudgetItem>['columns'] {
  if (!canWriteBudgets) {
    return columns;
  }

  return [
    ...(columns ?? []),
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 72,
      render: (_: unknown, row: BudgetItem) => (
        <Space size={2}>
          <Tooltip title={labels.edit}>
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openBudgetItemEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title={labels.deleteTitle}
            okText={labels.delete}
            cancelText={labels.cancel}
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleBudgetItemDelete(row.id)}
          >
            <Tooltip title={labels.delete}>
              <Button
                danger
                icon={<Trash2 size={14} />}
                loading={entry.deletingBudgetItemId === row.id}
                size="small"
                type="text"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

function appendTransactionActions(
  columns: TableProps<Transaction>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  labels: ActionLabels,
): TableProps<Transaction>['columns'] {
  if (!canWriteBudgets) {
    return columns;
  }

  return [
    ...(columns ?? []),
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 72,
      render: (_: unknown, row: Transaction) => (
        <Space size={2}>
          <Tooltip title={labels.edit}>
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openTransactionEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title={labels.deleteTitle}
            okText={labels.delete}
            cancelText={labels.cancel}
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleTransactionDelete(row.id)}
          >
            <Tooltip title={labels.delete}>
              <Button
                danger
                icon={<Trash2 size={14} />}
                loading={entry.deletingTransactionId === row.id}
                size="small"
                type="text"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
