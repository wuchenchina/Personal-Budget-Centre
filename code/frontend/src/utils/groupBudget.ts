import type {
  BudgetDetail,
  BudgetItem,
  BudgetItemSplit,
  BudgetParticipant,
} from '../types/budget';
import { effectiveBudgetItemAmounts } from './budgetTemplate';

export interface GroupBudgetParticipantSummary {
  participant: BudgetParticipant;
  paidBase: number;
  shareBase: number;
  balanceBase: number;
}

export interface GroupBudgetSettlement {
  fromParticipantId: number;
  toParticipantId: number;
  amountBase: number;
}

export interface GroupBudgetSummary {
  sharedExpenseBase: number;
  personalExpenseBase: number;
  participantSummaries: GroupBudgetParticipantSummary[];
  settlements: GroupBudgetSettlement[];
}

export function groupBudgetSummary(budget: BudgetDetail): GroupBudgetSummary {
  if (budget.participantMode !== 'group' || budget.participants.length === 0) {
    return {
      sharedExpenseBase: 0,
      personalExpenseBase: 0,
      participantSummaries: [],
      settlements: [],
    };
  }

  const totals = new Map<number, { paidBase: number; shareBase: number }>();
  budget.participants.forEach((participant) => {
    totals.set(participant.id, { paidBase: 0, shareBase: 0 });
  });

  let sharedExpenseBase = 0;
  let personalExpenseBase = 0;

  budget.items.forEach((item) => {
    const amountBase = effectiveBudgetItemAmounts(item, budget.transactions).budgetAmountBase;
    const split = item.split ?? defaultEqualSplit(budget.participants);
    const includedParticipants = split.participants.filter(
      (participant) => participant.isIncluded && totals.has(participant.participantId),
    );

    if (split.splitType === 'excluded' || includedParticipants.length === 0) {
      return;
    }

    if (split.splitType === 'individual') {
      const shares = sharesForSplit(split, includedParticipants, amountBase);
      let individualTotalBase = 0;
      shares.forEach((shareAmount, participantId) => {
        const total = totals.get(participantId);
        if (total !== undefined) {
          total.paidBase = roundMoney(total.paidBase + shareAmount);
          total.shareBase = roundMoney(total.shareBase + shareAmount);
          individualTotalBase = roundMoney(individualTotalBase + shareAmount);
        }
      });
      personalExpenseBase = roundMoney(personalExpenseBase + individualTotalBase);

      return;
    }

    if (split.splitType === 'per_person') {
      const perPersonAmountBase = perPersonItemBase(item, includedParticipants.length, amountBase);
      let perPersonTotalBase = 0;
      includedParticipants.forEach((participant) => {
        const total = totals.get(participant.participantId);
        if (total !== undefined) {
          total.paidBase = roundMoney(total.paidBase + perPersonAmountBase);
          total.shareBase = roundMoney(total.shareBase + perPersonAmountBase);
          perPersonTotalBase = roundMoney(perPersonTotalBase + perPersonAmountBase);
        }
      });
      personalExpenseBase = roundMoney(personalExpenseBase + perPersonTotalBase);

      return;
    }

    if (split.paidByParticipantId !== null && totals.has(split.paidByParticipantId)) {
      const paidTotal = totals.get(split.paidByParticipantId);
      if (paidTotal !== undefined) {
        paidTotal.paidBase = roundMoney(paidTotal.paidBase + amountBase);
      }
    }

    const shares = sharesForSplit(split, includedParticipants, amountBase);
    shares.forEach((shareAmount, participantId) => {
      const total = totals.get(participantId);
      if (total !== undefined) {
        total.shareBase = roundMoney(total.shareBase + shareAmount);
      }
    });

    if (split.splitType === 'personal') {
      personalExpenseBase = roundMoney(personalExpenseBase + amountBase);
    } else {
      sharedExpenseBase = roundMoney(sharedExpenseBase + amountBase);
    }
  });

  const participantSummaries = budget.participants.map((participant) => {
    const total = totals.get(participant.id) ?? { paidBase: 0, shareBase: 0 };

    return {
      participant,
      paidBase: roundMoney(total.paidBase),
      shareBase: roundMoney(total.shareBase),
      balanceBase: roundMoney(total.paidBase - total.shareBase),
    };
  });

  return {
    sharedExpenseBase,
    personalExpenseBase,
    participantSummaries,
    settlements: settlementsFromSummaries(participantSummaries),
  };
}

function defaultEqualSplit(participants: BudgetParticipant[]): BudgetItemSplit {
  return {
    paidByParticipantId: participants[0]?.id ?? null,
    splitType: 'equal',
    note: null,
    participants: participants.map((participant) => ({
      participantId: participant.id,
      isIncluded: true,
      shareRatio: null,
      shareAmountBase: null,
    })),
  };
}

function sharesForSplit(
  split: BudgetItemSplit,
  participants: BudgetItemSplit['participants'],
  amountBase: number,
): Map<number, number> {
  if (split.splitType === 'custom_amount') {
    const fixedShares = new Map<number, number>();
    participants.forEach((participant) => {
      fixedShares.set(participant.participantId, roundMoney(participant.shareAmountBase ?? 0));
    });

    return fixedShares;
  }

  if (split.splitType === 'individual') {
    const individualShares = new Map<number, number>();
    const explicitTotal = roundMoney(participants.reduce(
      (total, participant) => total + (participant.shareAmountBase === null
        ? 0
        : Math.max(0, participant.shareAmountBase)),
      0,
    ));
    const flexibleCount = participants.filter((participant) => participant.shareAmountBase === null).length;
    const fallbackShare = flexibleCount === 0
      ? 0
      : roundMoney(Math.max(0, amountBase - explicitTotal) / flexibleCount);
    participants.forEach((participant) => {
      individualShares.set(
        participant.participantId,
        participant.shareAmountBase === null
          ? fallbackShare
          : roundMoney(Math.max(0, participant.shareAmountBase)),
      );
    });

    return individualShares;
  }

  if (split.splitType === 'per_person') {
    return new Map(participants.map((participant) => [participant.participantId, amountBase]));
  }

  if (split.splitType === 'custom_share') {
    const totalRatio = participants.reduce(
      (total, participant) => total + Math.max(0, participant.shareRatio ?? 0),
      0,
    );

    if (totalRatio > 0) {
      return new Map(
        participants.map((participant) => [
          participant.participantId,
          roundMoney(amountBase * Math.max(0, participant.shareRatio ?? 0) / totalRatio),
        ]),
      );
    }
  }

  const equalShare = participants.length === 0 ? 0 : roundMoney(amountBase / participants.length);

  return new Map(participants.map((participant) => [participant.participantId, equalShare]));
}

function settlementsFromSummaries(
  summaries: GroupBudgetParticipantSummary[],
): GroupBudgetSettlement[] {
  const debtors = summaries
    .filter((summary) => summary.balanceBase < -0.004)
    .map((summary) => ({
      participantId: summary.participant.id,
      amount: roundMoney(Math.abs(summary.balanceBase)),
    }));
  const creditors = summaries
    .filter((summary) => summary.balanceBase > 0.004)
    .map((summary) => ({
      participantId: summary.participant.id,
      amount: roundMoney(summary.balanceBase),
    }));
  const settlements: GroupBudgetSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = roundMoney(Math.min(debtor.amount, creditor.amount));
    if (amount > 0) {
      settlements.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amountBase: amount,
      });
    }

    debtor.amount = roundMoney(debtor.amount - amount);
    creditor.amount = roundMoney(creditor.amount - amount);
    if (debtor.amount <= 0.004) {
      debtorIndex += 1;
    }
    if (creditor.amount <= 0.004) {
      creditorIndex += 1;
    }
  }

  return settlements;
}

function perPersonItemBase(item: BudgetItem, participantCount: number, effectiveAmountBase: number): number {
  if (item.budget.amountOriginal !== 0 || item.budget.amountBase !== 0) {
    return item.budget.amountBase;
  }

  return participantCount <= 0
    ? effectiveAmountBase
    : roundMoney(effectiveAmountBase / participantCount);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
