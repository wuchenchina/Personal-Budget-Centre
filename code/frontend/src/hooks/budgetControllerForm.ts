import type { AuthSession } from '../types/auth';
import type { BudgetDetail, BudgetParticipant, BudgetSummary } from '../types/budget';
import type { BudgetFormValues } from '../types/forms';

export function defaultParticipants(session: AuthSession | null): Array<Partial<BudgetParticipant>> {
  if (session === null) {
    return [];
  }

  return [
    {
      memberUserId: session.user.id,
      name: session.user.displayName,
      email: session.user.email,
      sortOrder: 1,
    },
  ];
}

export function participantsForBudgetForm(
  budget: BudgetSummary,
  selectedBudget: BudgetDetail | null,
  session: AuthSession | null,
): Array<Partial<BudgetParticipant>> {
  if (selectedBudget?.id === budget.id && selectedBudget.participants.length > 0) {
    return selectedBudget.participants;
  }

  return defaultParticipants(session);
}

export function normalizedParticipants(
  participants: BudgetFormValues['participants'],
): Array<Partial<BudgetParticipant>> {
  return (participants ?? [])
    .map((participant, index) => ({
      id: participant.id,
      memberUserId: participant.memberUserId ?? null,
      name: participant.name?.trim() ?? '',
      email: participant.email?.trim() || null,
      sortOrder: participant.sortOrder ?? index + 1,
    }))
    .filter((participant) => participant.name !== '');
}
