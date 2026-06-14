import { useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Popconfirm, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { ArrowLeft, Download, Landmark, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { BookkeepingRecord, BudgetDetail, CurrencyCode, TransactionType } from '../../types/budget';
import { formatMoney } from '../../utils/currency';

interface BudgetBookkeepingPageProps {
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  loading: boolean;
  error: string | null;
  records: BookkeepingRecord[];
  saving: boolean;
  deletingRecordId: number | null;
  exportingPdf: boolean;
  onBackToProjects: () => void;
  onOpenEditor: (budgetId: number) => void;
  onExportPdf: () => void;
  onNewRecord: () => void;
  onEditRecord: (record: BookkeepingRecord) => void;
  onDeleteRecord: (recordId: number) => void;
}

type LedgerFilter = 'all' | 'orders' | 'transfers';

export function BudgetBookkeepingPage({
  selectedBudget,
  baseCurrency,
  canWriteBudgets,
  loading,
  error,
  records,
  saving,
  deletingRecordId,
  exportingPdf,
  onBackToProjects,
  onOpenEditor,
  onExportPdf,
  onNewRecord,
  onEditRecord,
  onDeleteRecord,
}: BudgetBookkeepingPageProps) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<LedgerFilter>('all');
  const [searchText, setSearchText] = useState('');
  const currency = selectedBudget?.baseCurrency ?? baseCurrency;
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRecords = useMemo(
    () => records.filter((record) => {
      const matchesFilter =
        activeFilter === 'all'
        || (activeFilter === 'orders' && isOrderTransaction(record.transactionType))
        || (activeFilter === 'transfers' && isTransferTransaction(record.transactionType));
      const matchesSearch =
        normalizedSearch.length === 0
        || record.details.toLowerCase().includes(normalizedSearch)
        || (record.orderReference ?? '').toLowerCase().includes(normalizedSearch)
        || (record.categoryLabel ?? '').toLowerCase().includes(normalizedSearch)
        || (record.sourceAccountName ?? '').toLowerCase().includes(normalizedSearch)
        || (record.destinationAccountName ?? '').toLowerCase().includes(normalizedSearch)
        || (record.remark ?? '').toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    }),
    [activeFilter, normalizedSearch, records],
  );
  const totals = useMemo(() => ledgerTotals(records, currency), [currency, records]);
  const columns = useMemo<TableProps<BookkeepingRecord>['columns']>(() => [
    {
      key: 'type',
      title: t('transactionType'),
      width: 150,
      render: (_value, row) => (
        <Tag color={transactionTypeColor(row.transactionType)}>
          {transactionTypeLabel(row.transactionType, t)}
        </Tag>
      ),
    },
    {
      key: 'date',
      title: t('date'),
      dataIndex: 'recordDate',
      width: 120,
      render: (value: BookkeepingRecord['recordDate']) => value ?? '-',
    },
    {
      key: 'order',
      title: t('orderReference'),
      dataIndex: 'orderReference',
      width: 150,
      render: (value: BookkeepingRecord['orderReference']) => value ?? '-',
    },
    {
      key: 'details',
      title: t('transactionDetails'),
      dataIndex: 'details',
      minWidth: 220,
      render: (_value, row) => (
        <div className="bookkeeping-detail-cell">
          <strong>{row.details}</strong>
          <span>{accountRouteText(row) ?? row.categoryLabel ?? '-'}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      title: t('amount'),
      align: 'right',
      width: 160,
      render: (_value, row) => (
        <div className="bookkeeping-money-cell">
          <strong>{formatMoney({ currency: row.currency, amount: row.amountOriginal })}</strong>
          {row.currency !== currency ? (
            <span>{formatMoney({ currency, amount: row.amountBase })}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'destination',
      title: t('destinationAmount'),
      align: 'right',
      width: 170,
      render: (_value, row) => (
        row.destinationCurrency && row.destinationAmountOriginal !== null
          ? formatMoney({
            currency: row.destinationCurrency,
            amount: row.destinationAmountOriginal,
          })
          : '-'
      ),
    },
    {
      key: 'remark',
      title: t('note'),
      dataIndex: 'remark',
      minWidth: 180,
      render: (value: BookkeepingRecord['remark']) => value ?? '-',
    },
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 82,
      render: (_value, row) => (
        canWriteBudgets ? (
          <Space size={2}>
            <Tooltip title={t('edit')}>
              <Button
                icon={<Pencil size={14} />}
                size="small"
                type="text"
                onClick={() => onEditRecord(row)}
              />
            </Tooltip>
            <Popconfirm
              title={t('deleteBookkeepingRecordTitle')}
              okText={t('delete')}
              cancelText={t('cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteRecord(row.id)}
            >
              <Tooltip title={t('delete')}>
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  loading={deletingRecordId === row.id}
                  size="small"
                  type="text"
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ) : null
      ),
    },
  ], [
    canWriteBudgets,
    currency,
    deletingRecordId,
    onDeleteRecord,
    onEditRecord,
    t,
  ]);

  return (
    <div className="bookkeeping-page">
      <section className="project-page-header bookkeeping-header">
        <div>
          <Tag color="blue">{t('bookkeeping')}</Tag>
          <h1>{selectedBudget?.title ?? t('bookkeeping')}</h1>
          <p>{t('bookkeepingPageDesc')}</p>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeft size={15} />} onClick={onBackToProjects}>
            {t('projectLibrary')}
          </Button>
          {selectedBudget ? (
            <Button onClick={() => onOpenEditor(selectedBudget.id)}>
              {t('newTabEdit')}
            </Button>
          ) : null}
          <Button
            disabled={selectedBudget === null}
            icon={<Download size={15} />}
            loading={exportingPdf}
            onClick={onExportPdf}
          >
            {t('exportPdf')}
          </Button>
          {canWriteBudgets ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={onNewRecord}>
              {t('addBookkeepingRecord')}
            </Button>
          ) : null}
        </Space>
      </section>

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <section className="project-overview-grid bookkeeping-overview-grid">
        <BookkeepingTile label={t('ledgerRecords')} value={records.length.toLocaleString('en-US')} />
        <BookkeepingTile label={t('transferRecords')} value={totals.transferCount.toLocaleString('en-US')} />
        <BookkeepingTile
          label={t('ledgerAmountBase')}
          value={formatMoney({ currency, amount: totals.baseAmount })}
        />
      </section>

      <section className="project-panel bookkeeping-ledger-panel">
        <div className="bookkeeping-toolbar">
          <Tabs
            activeKey={activeFilter}
            items={[
              { key: 'all', label: t('all') },
              { key: 'orders', label: t('orderRecords') },
              { key: 'transfers', label: t('transferRecords') },
            ]}
            onChange={(key) => setActiveFilter(key as LedgerFilter)}
          />
          <Input
            allowClear
            className="bookkeeping-search"
            placeholder={t('searchBookkeeping')}
            prefix={<Search size={15} />}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Table<BookkeepingRecord>
          bordered
          columns={columns}
          dataSource={filteredRecords}
          loading={loading || saving}
          locale={{ emptyText: <Empty image={<Landmark size={34} />} description={t('bookkeepingRecordsEmpty')} /> }}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          rowKey="id"
          scroll={{ x: 1180 }}
          size="small"
        />
      </section>
    </div>
  );
}

function BookkeepingTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ledgerTotals(records: BookkeepingRecord[], currency: CurrencyCode) {
  return records.reduce(
    (totals, record) => ({
      baseAmount: totals.baseAmount + (record.currency === currency
        ? record.amountOriginal
        : record.amountBase),
      transferCount: totals.transferCount + (isTransferTransaction(record.transactionType) ? 1 : 0),
    }),
    { baseAmount: 0, transferCount: 0 },
  );
}

function isOrderTransaction(type: TransactionType): boolean {
  return type === 'expense' || type === 'income';
}

function isTransferTransaction(type: TransactionType): boolean {
  return type === 'transfer' || type === 'fx_exchange' || type === 'cross_border_remittance';
}

function accountRouteText(record: BookkeepingRecord): string | null {
  const source = record.sourceAccountName;
  const destination = record.destinationAccountName;
  if (source && destination) {
    return `${source} -> ${destination}`;
  }

  return source ?? destination ?? null;
}

function transactionTypeColor(type: TransactionType): string {
  if (type === 'sof') {
    return 'gold';
  }

  if (isTransferTransaction(type)) {
    return 'geekblue';
  }

  return type === 'income' ? 'green' : 'default';
}

function transactionTypeLabel(
  type: TransactionType,
  t: (key: 'transactionTypeExpense'
    | 'transactionTypeIncome'
    | 'transactionTypeSof'
    | 'transactionTypeTransfer'
    | 'transactionTypeFxExchange'
    | 'transactionTypeCrossBorderRemittance') => string,
): string {
  switch (type) {
    case 'income':
      return t('transactionTypeIncome');
    case 'sof':
      return t('transactionTypeSof');
    case 'transfer':
      return t('transactionTypeTransfer');
    case 'fx_exchange':
      return t('transactionTypeFxExchange');
    case 'cross_border_remittance':
      return t('transactionTypeCrossBorderRemittance');
    case 'expense':
    default:
      return t('transactionTypeExpense');
  }
}
