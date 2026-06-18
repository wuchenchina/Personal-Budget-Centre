import type { BudgetDetail, BudgetItem, BudgetItemSplit } from '../types/budget';
import type { BudgetItemFormValues } from '../types/forms';
import { roundMoney } from './budgetEntryMath';

export function defaultSplitFormValue(budget: BudgetDetail): BudgetItemFormValues['split'] {
  if (budget.participantMode !== 'group' || budget.participants.length === 0) {
    return undefined;
  }

  return {
    paidByParticipantId: budget.participants[0].id,
    splitType: 'equal',
    participantIds: budget.participants.map((participant) => participant.id),
    individualAmounts: budget.participants.map((participant) => ({
      participantId: participant.id,
      amountBase: null,
    })),
    note: null,
  };
}

export function splitToFormValue(
  item: BudgetItem,
  budget: BudgetDetail | null,
): BudgetItemFormValues['split'] {
  if (budget === null || budget.participantMode !== 'group' || budget.participants.length === 0) {
    return undefined;
  }

  if (item.split === null) {
    return defaultSplitFormValue(budget);
  }

  return {
    paidByParticipantId: item.split.paidByParticipantId,
    splitType: item.split.splitType,
    participantIds: item.split.participants
      .filter((participant) => participant.isIncluded)
      .map((participant) => participant.participantId),
    individualAmounts: budget.participants.map((participant) => {
      const splitParticipant = item.split?.participants.find(
        (itemParticipant) => itemParticipant.participantId === participant.id,
      );

      return {
        participantId: participant.id,
        amountBase: splitParticipant?.shareAmountBase ?? null,
      };
    }),
    note: item.split.note,
  };
}

export function splitPayloadFromForm(
  values: BudgetItemFormValues,
  budget: BudgetDetail,
): BudgetItemSplit | null {
  if (budget.participantMode !== 'group' || budget.participants.length === 0) {
    return null;
  }

  const split = values.split ?? defaultSplitFormValue(budget);
  if (split === undefined) {
    return null;
  }

  const splitType = split.splitType ?? 'equal';
  if (splitType === 'individual') {
    const amountByParticipantId = new Map<number, number | null>();
    (split.individualAmounts ?? []).forEach((row) => {
      if (typeof row?.participantId !== 'number') {
        return;
      }

      amountByParticipantId.set(
        row.participantId,
        typeof row.amountBase === 'number' && Number.isFinite(row.amountBase) && row.amountBase > 0
          ? roundMoney(row.amountBase)
          : null,
      );
    });

    return {
      paidByParticipantId: null,
      splitType,
      note: split.note?.trim() || null,
      participants: budget.participants.map((participant) => ({
        participantId: participant.id,
        isIncluded: true,
        shareRatio: null,
        shareAmountBase: amountByParticipantId.get(participant.id) ?? null,
      })),
    };
  }

  const selectedParticipantIds = new Set(
    splitType === 'excluded'
      ? []
      : (split.participantIds ?? budget.participants.map((participant) => participant.id)),
  );

  return {
    paidByParticipantId: splitType === 'per_person' ? null : split.paidByParticipantId ?? null,
    splitType,
    note: split.note?.trim() || null,
    participants: budget.participants
      .filter((participant) => selectedParticipantIds.has(participant.id))
      .map((participant) => ({
        participantId: participant.id,
        isIncluded: true,
        shareRatio: null,
        shareAmountBase: null,
      })),
  };
}
