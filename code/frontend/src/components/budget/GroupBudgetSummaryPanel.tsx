import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import type { BudgetDetail, CurrencyCode } from '../../types/budget';
import { formatMoney } from '../../utils/currency';
import { groupBudgetSummary } from '../../utils/groupBudget';

interface GroupBudgetSummaryPanelProps {
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
}

interface ParticipantRow {
  key: number;
  name: string;
  paidBase: number;
  shareBase: number;
  balanceBase: number;
}

export function GroupBudgetSummaryPanel({
  selectedBudget,
  baseCurrency,
}: GroupBudgetSummaryPanelProps) {
  const { t } = useI18n();
  const activeCurrency = selectedBudget?.baseCurrency ?? baseCurrency;
  const summary = useMemo(
    () => (selectedBudget === null ? null : groupBudgetSummary(selectedBudget)),
    [selectedBudget],
  );

  if (
    selectedBudget === null
    || selectedBudget.participantMode !== 'group'
    || summary === null
    || summary.participantSummaries.length === 0
  ) {
    return null;
  }

  const participantName = new Map(
    summary.participantSummaries.map((item) => [item.participant.id, item.participant.name]),
  );
  const rows = summary.participantSummaries.map((item) => ({
    key: item.participant.id,
    name: item.participant.name,
    paidBase: item.paidBase,
    shareBase: item.shareBase,
    balanceBase: item.balanceBase,
  }));
  const columns: ColumnsType<ParticipantRow> = [
    {
      title: t('participants'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('groupPaid'),
      dataIndex: 'paidBase',
      key: 'paidBase',
      align: 'right',
      render: (value: number) => formatMoney({ currency: activeCurrency, amount: value }),
    },
    {
      title: t('groupShare'),
      dataIndex: 'shareBase',
      key: 'shareBase',
      align: 'right',
      render: (value: number) => formatMoney({ currency: activeCurrency, amount: value }),
    },
    {
      title: t('balance'),
      dataIndex: 'balanceBase',
      key: 'balanceBase',
      align: 'right',
      render: (value: number) => (
        <Tag color={value > 0 ? 'green' : value < 0 ? 'orange' : 'default'}>
          {formatMoney({ currency: activeCurrency, amount: value })}
        </Tag>
      ),
    },
  ];

  return (
    <section className="group-budget-panel">
      <div className="group-budget-panel-head">
        <div>
          <span>{t('groupBudgetSummary')}</span>
          <strong>{selectedBudget.title}</strong>
        </div>
        <div className="group-budget-totals">
          <Metric label={t('sharedExpense')} value={formatMoney({
            currency: activeCurrency,
            amount: summary.sharedExpenseBase,
          })} />
          <Metric label={t('personalExpense')} value={formatMoney({
            currency: activeCurrency,
            amount: summary.personalExpenseBase,
          })} />
        </div>
      </div>
      <Table<ParticipantRow>
        columns={columns}
        dataSource={rows}
        pagination={false}
        rowKey="key"
        size="small"
      />
      <div className="group-settlement-list">
        <span>{t('groupSettlement')}</span>
        {summary.settlements.length === 0 ? (
          <strong>{t('noSettlementNeeded')}</strong>
        ) : (
          <div>
            {summary.settlements.map((settlement) => (
              <Tag key={`${settlement.fromParticipantId}-${settlement.toParticipantId}`}>
                {participantName.get(settlement.fromParticipantId)}
                {' -> '}
                {participantName.get(settlement.toParticipantId)}
                {' '}
                {formatMoney({ currency: activeCurrency, amount: settlement.amountBase })}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
