import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { BudgetProjectDashboard } from './components/budget/BudgetProjectDashboard';
import { BudgetProjectList } from './components/budget/BudgetProjectList';
import { BudgetEditorView } from './components/budget/BudgetEditorView';
import { AuthenticatedModals } from './components/layout/AuthenticatedModals';
import { AppShell } from './components/layout/AppShell';
import { GovernancePanel } from './components/workspace/GovernancePanel';
import { BudgetExportProgressModal } from './components/budget/BudgetExportProgressModal';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import {
  initialRouteFromLocation,
  navigationPaths,
  routeFromPath,
} from './appRoutes';
import { useAdminController } from './hooks/useAdminController';
import { useBookkeepingController } from './hooks/useBookkeepingController';
import { useBudgetController } from './hooks/useBudgetController';
import { useBudgetEntryController } from './hooks/useBudgetEntryController';
import { useOperationsController } from './hooks/useOperationsController';
import { useTemplateController } from './hooks/useTemplateController';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import { type AppLanguage, useI18n } from './i18n';
import type { AuthSession } from './types/auth';

const AdminPanel = lazy(() =>
  import('./components/admin/AdminPanel').then((module) => ({ default: module.AdminPanel })),
);
const BudgetBookkeepingPage = lazy(() =>
  import('./components/budget/BudgetBookkeepingPage')
    .then((module) => ({ default: module.BudgetBookkeepingPage })),
);
const ProfilePage = lazy(() =>
  import('./components/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);

interface AuthenticatedAppProps {
  session: AuthSession;
  setSession: Dispatch<SetStateAction<AuthSession | null>>;
  isAuthSubmitting: boolean;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onLogout: () => void;
}

function AuthenticatedApp({
  session,
  setSession,
  isAuthSubmitting,
  language,
  onLanguageChange,
  onLogout,
}: AuthenticatedAppProps) {
  const [route, setRoute] = useState(initialRouteFromLocation);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const { t } = useI18n();
  const activeKey = route.activeKey;
  const initialBudgetProjectId = route.budgetId;

  useEffect(() => {
    const handlePopState = () => {
      setRoute(routeFromPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToPath = (path: string, replace = false) => {
    if (
      window.location.pathname === path
      && window.location.search === ''
      && window.location.hash === ''
    ) {
      setRoute(routeFromPath(path));

      return;
    }

    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    setRoute(routeFromPath(path));
  };
  const handleLogout = () => {
    onLogout();
    navigateToPath('/', true);
  };
  const workspace = useWorkspaceController(session, setSession);
  const template = useTemplateController(session);
  const baseCurrency = session.workspace?.defaultCurrency ?? session.user.defaultCurrency ?? 'HKD';
  const budget = useBudgetController({
    activeWorkspaceId: workspace.activeWorkspaceId,
    baseCurrency,
    initialBudgetId: initialBudgetProjectId,
    session,
    onCreated: () => navigateToPath('/budgets'),
    onWorkspaceSelected: workspace.handleWorkspaceSwitch,
  });
  const budgetEntry = useBudgetEntryController({
    baseCurrency,
    selectedBudget: budget.selectedBudget,
    replaceBudgetDetail: budget.replaceBudgetDetail,
  });
  const bookkeeping = useBookkeepingController({
    baseCurrency,
    selectedBudget: budget.selectedBudget,
  });
  const workspaceRole = workspace.workspaceRole;
  const canManageWorkspaceMembers = workspaceRole === 'owner' || workspaceRole === 'admin';
  const canManageExchangeRates =
    workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'editor';
  const canWriteBudgets =
    workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'editor';
  const operations = useOperationsController({
    activeWorkspaceId: workspace.activeWorkspaceId,
    canManageBudgetShares: canManageWorkspaceMembers,
    loadPasskeys: activeKey === 'profile',
    selectedBudget: budget.selectedBudget,
    session,
  });
  const entryCategoryOptions = useMemo(() => {
    const optionMap = new Map<number, { label: string; value: number }>();

    operations.categoryOptions.forEach((option) => {
      optionMap.set(option.value, option);
    });

    budget.selectedBudget?.items.forEach((item) => {
      if (item.categoryId !== null && item.category !== null) {
        optionMap.set(item.categoryId, {
          label: item.category,
          value: item.categoryId,
        });
      }
    });

    return Array.from(optionMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [budget.selectedBudget?.items, operations.categoryOptions]);
  const budgetItemPresetCategoryOptions = useMemo(() => {
    const editingItemId = budgetEntry.editingBudgetItem?.id ?? null;
    const usedCategoryIds = new Set(
      budget.selectedBudget?.items
        .filter((item) => item.id !== editingItemId)
        .map((item) => item.categoryId)
        .filter((categoryId): categoryId is number => categoryId !== null) ?? [],
    );

    return operations.categoryOptions.filter((option) => !usedCategoryIds.has(option.value));
  }, [budget.selectedBudget?.items, budgetEntry.editingBudgetItem?.id, operations.categoryOptions]);
  const transactionCategoryOptions = useMemo(() => {
    const optionMap = new Map<number, { label: string; value: number }>();

    budget.selectedBudget?.items.forEach((item) => {
      if (item.categoryId !== null) {
        optionMap.set(item.categoryId, {
          label: item.category ?? item.label,
          value: item.categoryId,
        });
      }
    });

    return Array.from(optionMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [budget.selectedBudget?.items]);
  const bookkeepingCategoryOptions = useMemo(() => {
    const seenLabels = new Set<string>();
    const options: Array<{ label: string; value: string }> = [];

    budget.selectedBudget?.items.forEach((item) => {
      const label = (item.category ?? item.label).trim();
      if (label === '' || seenLabels.has(label)) {
        return;
      }

      seenLabels.add(label);
      options.push({ label, value: label });
    });

    return options;
  }, [budget.selectedBudget?.items]);
  const admin = useAdminController(session.user.isAdmin === true && activeKey === 'admin');
  const isStandaloneBudgetEditor = route.budgetId !== null;
  const currentUserId = session.user.id;
  const handleNavigate = (key: string) => {
    navigateToPath(navigationPaths[key] ?? '/');
  };
  const handleProfileOpen = () => navigateToPath('/profile');
  const openBudgetProjectInNewTab = (budgetId: number) => {
    const url = `${window.location.origin}/budgets/${budgetId}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openBudgetBookkeepingInNewTab = (budgetId: number) => {
    const url = `${window.location.origin}/budgets/${budgetId}/bookkeeping`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openBudgetModalWhenCurrencyReady = () => {
    if (operations.currencyOptions.length === 0) {
      operations.setOperationsError(t('currencyRequiredBeforeBudget'));
      return;
    }
    budget.openBudgetModal();
  };
  const governancePanel = (
    <GovernancePanel
      activeKey={activeKey}
      budget={budget}
      workspace={workspace}
      operations={operations}
      currentUserId={currentUserId}
      canManageWorkspaceMembers={canManageWorkspaceMembers}
      canManageExchangeRates={canManageExchangeRates}
    />
  );
  const budgetEditorContent = (
    <BudgetEditorView
      baseCurrency={baseCurrency}
      budget={budget}
      canManageWorkspaceMembers={canManageWorkspaceMembers}
      canWriteBudgets={canWriteBudgets}
      entry={budgetEntry}
      entryCategoryOptions={entryCategoryOptions}
      defaultPdfTheme={session.user.defaultPdfTheme}
      operations={operations}
      onOpenShare={() => setIsShareModalOpen(true)}
      pdfExportSettings={session.user.pdfExportSettings}
      template={template}
      transactionCategoryOptions={transactionCategoryOptions}
    />
  );
  const budgetBookkeepingContent = (
    <Suspense fallback={<div className="empty-line">{t('loadingBudget')}</div>}>
      <BudgetBookkeepingPage
        selectedBudget={budget.selectedBudget}
        baseCurrency={baseCurrency}
        canWriteBudgets={canWriteBudgets}
        loading={budget.isBudgetLoading || budget.isBudgetDetailLoading || bookkeeping.loading}
        error={budget.budgetError ?? bookkeeping.error ?? operations.operationsError}
        records={bookkeeping.records}
        saving={bookkeeping.saving}
        deletingRecordId={bookkeeping.deletingRecordId}
        defaultPdfTheme={session.user.defaultPdfTheme}
        exportingPdf={operations.creatingExportFormat === 'pdf'}
        pdfExportSettings={session.user.pdfExportSettings}
        recordModalOpen={bookkeeping.modalOpen}
        onBackToProjects={() => navigateToPath('/budgets')}
        onOpenEditor={openBudgetProjectInNewTab}
        onExportPdf={(exportOptions) => operations.createExport('pdf', {
          exportScope: 'bookkeeping',
          ...exportOptions,
        })}
        onNewRecord={bookkeeping.openCreateModal}
        onEditRecord={bookkeeping.openEditModal}
        onDeleteRecord={(recordId) => void bookkeeping.deleteRecord(recordId)}
      />
    </Suspense>
  );
  const modals = (
    <>
      <AuthenticatedModals
        baseCurrency={baseCurrency}
        bookkeeping={bookkeeping}
        bookkeepingCategoryOptions={bookkeepingCategoryOptions}
        budget={budget}
        budgetEntry={budgetEntry}
        budgetItemPresetCategoryOptions={budgetItemPresetCategoryOptions}
        canManageWorkspaceMembers={canManageWorkspaceMembers}
        canWriteBudgets={canWriteBudgets}
        isShareModalOpen={isShareModalOpen}
        onShareModalOpenChange={setIsShareModalOpen}
        operations={operations}
        transactionCategoryOptions={transactionCategoryOptions}
        workspace={workspace}
      />
      <BudgetExportProgressModal
        exportJob={operations.activeExport}
        onClose={operations.closeExportProgress}
      />
    </>
  );

  const renderMainContent = () => {
    if (activeKey === 'dashboard') {
      return (
        <BudgetProjectDashboard
          budgets={budget.budgets}
          selectedBudget={budget.selectedBudget}
          baseCurrency={baseCurrency}
          canWriteBudgets={canWriteBudgets}
          loading={budget.isBudgetLoading || budget.isBudgetDetailLoading}
          onNavigate={handleNavigate}
          onNewProject={openBudgetModalWhenCurrencyReady}
          onOpenBookkeeping={openBudgetBookkeepingInNewTab}
          onOpenProject={openBudgetProjectInNewTab}
        />
      );
    }

    if (activeKey === 'workspace') {
      return (
        <WorkspacePage
          workspace={workspace}
          currentUserId={currentUserId}
          canManageWorkspaceMembers={canManageWorkspaceMembers}
        />
      );
    }

    if (activeKey === 'budgets') {
      return (
        <BudgetProjectList
          budgets={budget.budgets}
          selectedBudgetId={budget.currentBudgetId}
          canWriteBudgets={canWriteBudgets}
          loading={budget.isBudgetLoading}
          onDeleteProject={(budgetId) => void budget.handleBudgetDelete(budgetId)}
          onEditProjectInfo={budget.openBudgetEditModal}
          onNewProject={openBudgetModalWhenCurrencyReady}
          onOpenBookkeeping={openBudgetBookkeepingInNewTab}
          onOpenProject={openBudgetProjectInNewTab}
          onSelectProject={(budgetId) => void budget.handleBudgetSelect(budgetId)}
          onStatusChange={(budgetSummary, status) =>
            void budget.handleBudgetStatusChange(budgetSummary, status)
          }
        />
      );
    }

    if (activeKey === 'budget-editor') {
      return budgetEditorContent;
    }

    if (activeKey === 'budget-bookkeeping') {
      return budgetBookkeepingContent;
    }

    if (['categories', 'rates'].includes(activeKey)) {
      return <div className="workspace-grid workspace-grid-panel-only">{governancePanel}</div>;
    }

    if (activeKey === 'profile') {
      return (
        <Suspense fallback={<div className="empty-line">{t('loadingProfile')}</div>}>
          <ProfilePage
            session={session}
            operations={operations}
            onSessionUpdate={setSession}
          />
        </Suspense>
      );
    }

    if (activeKey === 'admin' && session.user.isAdmin) {
      return (
        <Suspense fallback={<div className="empty-line">{t('loadingAdmin')}</div>}>
          <AdminPanel controller={admin} currentUserId={currentUserId} />
        </Suspense>
      );
    }

    return (
      <BudgetProjectDashboard
        budgets={budget.budgets}
        selectedBudget={budget.selectedBudget}
        baseCurrency={baseCurrency}
        canWriteBudgets={canWriteBudgets}
        loading={budget.isBudgetLoading || budget.isBudgetDetailLoading}
        onNavigate={handleNavigate}
        onNewProject={openBudgetModalWhenCurrencyReady}
        onOpenBookkeeping={openBudgetBookkeepingInNewTab}
        onOpenProject={openBudgetProjectInNewTab}
      />
    );
  };

  if (isStandaloneBudgetEditor) {
    return (
      <>
        <main className="standalone-budget-editor">
          {activeKey === 'budget-bookkeeping' ? budgetBookkeepingContent : budgetEditorContent}
        </main>
        {modals}
      </>
    );
  }

  return (
    <>
      <AppShell
        activeKey={activeKey}
        session={session}
        workspaceRole={workspaceRole}
        isAdmin={session.user.isAdmin}
        isAuthSubmitting={isAuthSubmitting}
        language={language}
        onNavigate={handleNavigate}
        onLanguageChange={onLanguageChange}
        onProfile={handleProfileOpen}
        onLogout={handleLogout}
      >
        {renderMainContent()}
      </AppShell>

      {modals}
    </>
  );
}

export default AuthenticatedApp;
