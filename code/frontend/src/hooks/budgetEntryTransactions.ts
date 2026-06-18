import type { SaveTransactionPayload } from '../api/budgetEntries';
import { translateCurrent } from '../i18n';
import type { BudgetDetail, BudgetItem, BudgetItemSplit, Transaction } from '../types/budget';
import type { TransactionFormValues } from '../types/forms';
import { roundMoney } from './budgetEntryMath';

export function defaultTransactionPaidByParticipantId(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): number | null {
  if (!transactionCategorySupportsTransactionPayments(budget, categoryId)) {
    return null;
  }

  const item = transactionItemForCategory(budget, categoryId);
  if (item === null) {
    return null;
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  const paidByParticipantId = item.split?.paidByParticipantId ?? null;
  if (paidByParticipantId !== null && participantIds.has(paidByParticipantId)) {
    return paidByParticipantId;
  }

  return budget.participants[0]?.id ?? null;
}

export function transactionPaidByParticipantIdFromForm(
  values: TransactionFormValues,
  budget: BudgetDetail | null,
): number | null {
  if ((values.paymentMode ?? 'single') === 'multiple') {
    return null;
  }

  const fallbackPaidByParticipantId = defaultTransactionPaidByParticipantId(
    budget,
    values.categoryId,
  );
  if (fallbackPaidByParticipantId === null || budget === null) {
    return null;
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  return typeof values.paidByParticipantId === 'number'
    && participantIds.has(values.paidByParticipantId)
    ? values.paidByParticipantId
    : fallbackPaidByParticipantId;
}

export function defaultTransactionPaymentRows(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): NonNullable<TransactionFormValues['payments']> {
  if (!transactionCategorySupportsTransactionPayments(budget, categoryId)) {
    return [];
  }

  return budget.participants.map((participant) => ({
    participantId: participant.id,
    amount: null,
  }));
}

export function transactionPaymentRowsToForm(
  transaction: Transaction,
  budget: BudgetDetail | null,
): NonNullable<TransactionFormValues['payments']> {
  const rows = defaultTransactionPaymentRows(budget, transaction.categoryId);
  if (rows.length === 0) {
    return [];
  }

  const amountByParticipantId = new Map(
    transaction.payments.map((payment) => [payment.participantId, payment.amountOriginal]),
  );
  if (amountByParticipantId.size === 0 && transaction.paidByParticipantId !== null) {
    amountByParticipantId.set(transaction.paidByParticipantId, transaction.amountOriginal);
  }

  return rows.map((row) => ({
    participantId: row.participantId,
    amount: row.participantId === undefined
      ? null
      : amountByParticipantId.get(row.participantId) ?? null,
  }));
}

export function transactionPaymentsFromForm(
  values: TransactionFormValues,
  budget: BudgetDetail | null,
  amount: number,
): SaveTransactionPayload['payments'] {
  if (
    (values.paymentMode ?? 'single') !== 'multiple'
    || !transactionCategorySupportsTransactionPayments(budget, values.categoryId)
  ) {
    return [];
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  const payments = (values.payments ?? [])
    .filter((row): row is { participantId: number; amount: number } =>
      typeof row?.participantId === 'number'
      && participantIds.has(row.participantId)
      && typeof row.amount === 'number'
      && Number.isFinite(row.amount)
      && row.amount > 0,
    )
    .map((row) => ({
      participantId: row.participantId,
      amount: roundMoney(row.amount),
    }));

  const paymentTotal = roundMoney(payments.reduce((total, payment) => total + payment.amount, 0));
  if (Math.abs(paymentTotal - roundMoney(amount)) > 0.01) {
    throw new Error(translateCurrent('transactionPaymentTotalMismatch'));
  }

  return payments;
}

export function transactionPaidByParticipantIdForQuickSave(
  transaction: Transaction,
  budget: BudgetDetail | null,
): number | null {
  return transactionCategorySupportsTransactionPayments(budget, transaction.categoryId ?? undefined)
    ? transaction.paidByParticipantId
    : null;
}

export function transactionPaymentPayloadForQuickSave(
  transaction: Transaction,
  budget: BudgetDetail | null,
  nextAmount?: number,
): SaveTransactionPayload['payments'] {
  if (!transactionCategorySupportsTransactionPayments(budget, transaction.categoryId ?? undefined)) {
    return [];
  }

  if (transaction.payments.length === 0) {
    return [];
  }

  if (typeof nextAmount !== 'number' || !Number.isFinite(nextAmount)) {
    return transaction.payments.map((payment) => ({
      participantId: payment.participantId,
      amount: payment.amountOriginal,
    }));
  }

  const currentTotal = roundMoney(transaction.payments.reduce(
    (total, payment) => total + payment.amountOriginal,
    0,
  ));
  if (currentTotal <= 0) {
    return [];
  }

  let distributedTotal = 0;
  return transaction.payments.map((payment, index) => {
    const isLast = index === transaction.payments.length - 1;
    const amount = isLast
      ? roundMoney(nextAmount - distributedTotal)
      : roundMoney(nextAmount * payment.amountOriginal / currentTotal);
    distributedTotal = roundMoney(distributedTotal + amount);

    return {
      participantId: payment.participantId,
      amount: Math.max(0, amount),
    };
  }).filter((payment) => payment.amount > 0);
}

export function transactionCategorySupportsTransactionPayments(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): budget is BudgetDetail {
  if (budget === null || budget.participantMode !== 'group' || budget.participants.length === 0) {
    return false;
  }

  const item = transactionItemForCategory(budget, categoryId);

  return item !== null && splitTypeSupportsTransactionPayments(item.split?.splitType ?? 'equal');
}

function transactionItemForCategory(
  budget: BudgetDetail,
  categoryId: number | null | undefined,
): BudgetItem | null {
  if (typeof categoryId !== 'number') {
    return null;
  }

  return budget.items.find((item) => item.categoryId === categoryId) ?? null;
}

function splitTypeSupportsTransactionPayments(splitType: BudgetItemSplit['splitType']): boolean {
  return splitType !== 'excluded' && splitType !== 'per_person';
}
