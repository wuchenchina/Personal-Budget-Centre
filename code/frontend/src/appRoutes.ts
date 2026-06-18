export interface AppRoute {
  activeKey: string;
  budgetId: number | null;
}

export const navigationPaths: Record<string, string> = {
  dashboard: '/',
  workspace: '/workspaces',
  budgets: '/budgets',
  categories: '/categories',
  rates: '/rates',
  profile: '/profile',
  admin: '/admin',
};

export function routeFromPath(pathname: string): AppRoute {
  const budgetId = budgetProjectIdFromPath(pathname);
  if (budgetId !== null) {
    return {
      activeKey: pathname.replace(/\/+$/, '').endsWith('/bookkeeping')
        ? 'budget-bookkeeping'
        : 'budget-editor',
      budgetId,
    };
  }

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedEntry = Object.entries(navigationPaths).find(([, path]) => path === normalizedPath);

  return {
    activeKey: matchedEntry?.[0] ?? 'dashboard',
    budgetId: null,
  };
}

export function initialRouteFromLocation(): AppRoute {
  const legacyBudgetId = window.location.hash.match(/^#\/budgets\/(\d+)$/)?.[1];
  if (legacyBudgetId !== undefined) {
    const nextPath = `/budgets/${legacyBudgetId}`;
    window.history.replaceState(null, '', nextPath);

    return { activeKey: 'budget-editor', budgetId: Number(legacyBudgetId) };
  }

  return routeFromPath(window.location.pathname);
}

function budgetProjectIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/budgets\/(\d+)(?:\/bookkeeping)?\/?$/);
  if (match === null) {
    return null;
  }

  const budgetId = Number(match[1]);

  return Number.isInteger(budgetId) && budgetId > 0 ? budgetId : null;
}
