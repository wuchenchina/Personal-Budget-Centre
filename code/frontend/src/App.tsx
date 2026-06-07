import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider } from 'antd';
import { AdminPanel } from './components/admin/AdminPanel';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
import { EmailVerificationScreen } from './components/auth/EmailVerificationScreen';
import { AuthScreen } from './components/auth/AuthScreen';
import { BudgetCreateModal } from './components/budget/BudgetCreateModal';
import { BudgetDocumentPreview } from './components/budget/BudgetDocumentPreview';
import { BudgetItemModal } from './components/budget/BudgetItemModal';
import { BudgetMetrics } from './components/budget/BudgetMetrics';
import { BudgetProjectDashboard } from './components/budget/BudgetProjectDashboard';
import { BudgetProjectList } from './components/budget/BudgetProjectList';
import { TransactionModal } from './components/budget/TransactionModal';
import { AppShell } from './components/layout/AppShell';
import { ProfilePage } from './components/profile/ProfilePage';
import { GovernancePanel } from './components/workspace/GovernancePanel';
import { WorkspaceCreateModal } from './components/workspace/WorkspaceCreateModal';
import { WorkspaceMemberModal } from './components/workspace/WorkspaceMemberModal';
import { appTheme } from './config/appConfig';
import { useAuthController } from './hooks/useAuthController';
import { useAdminController } from './hooks/useAdminController';
import { useBudgetController } from './hooks/useBudgetController';
import { useBudgetEntryController } from './hooks/useBudgetEntryController';
import { useOperationsController } from './hooks/useOperationsController';
import { useTemplateController } from './hooks/useTemplateController';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import './App.css';

interface AppRoute {
  activeKey: string;
  budgetId: number | null;
}

const navigationPaths: Record<string, string> = {
  dashboard: '/',
  budgets: '/budgets',
  categories: '/categories',
  rates: '/rates',
  profile: '/profile',
  admin: '/admin',
};

function budgetProjectIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/budgets\/(\d+)\/?$/);
  if (match === null) {
    return null;
  }

  const budgetId = Number(match[1]);

  return Number.isInteger(budgetId) && budgetId > 0 ? budgetId : null;
}

function routeFromPath(pathname: string): AppRoute {
  const budgetId = budgetProjectIdFromPath(pathname);
  if (budgetId !== null) {
    return { activeKey: 'budget-editor', budgetId };
  }

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedEntry = Object.entries(navigationPaths).find(([, path]) => path === normalizedPath);

  return {
    activeKey: matchedEntry?.[0] ?? 'dashboard',
    budgetId: null,
  };
}

function initialRouteFromLocation(): AppRoute {
  const legacyBudgetId = window.location.hash.match(/^#\/budgets\/(\d+)$/)?.[1];
  if (legacyBudgetId !== undefined) {
    const nextPath = `/budgets/${legacyBudgetId}`;
    window.history.replaceState(null, '', nextPath);

    return { activeKey: 'budget-editor', budgetId: Number(legacyBudgetId) };
  }

  return routeFromPath(window.location.pathname);
}

function App() {
  const [route, setRoute] = useState(initialRouteFromLocation);
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
    if (window.location.pathname === path && window.location.hash === '') {
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
  const auth = useAuthController({
    onLogout: () => navigateToPath('/', true),
  });
  const workspace = useWorkspaceController(auth.session, auth.setSession);
  const template = useTemplateController(auth.session);
  const baseCurrency = auth.session?.workspace?.defaultCurrency ?? 'CNY';
  const budget = useBudgetController({
    activeWorkspaceId: workspace.activeWorkspaceId,
    baseCurrency,
    initialBudgetId: initialBudgetProjectId,
    session: auth.session,
    onCreated: () => navigateToPath('/budgets'),
  });
  const budgetEntry = useBudgetEntryController({
    baseCurrency,
    selectedBudget: budget.selectedBudget,
    replaceBudgetDetail: budget.replaceBudgetDetail,
  });
  const workspaceRole = workspace.workspaceRole;
  const canManageWorkspaceMembers = workspaceRole === 'owner' || workspaceRole === 'admin';
  const canWriteBudgets =
    workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'editor';
  const operations = useOperationsController({
    activeWorkspaceId: workspace.activeWorkspaceId,
    canManageBudgetShares: canManageWorkspaceMembers,
    selectedBudget: budget.selectedBudget,
    session: auth.session,
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
  const admin = useAdminController(auth.session?.user.isAdmin === true && activeKey === 'admin');
  const isEmailVerificationRoute = window.location.pathname === '/email/verify';
  const isStandaloneBudgetEditor = route.budgetId !== null;

  if (isEmailVerificationRoute) {
    return (
      <ConfigProvider theme={appTheme}>
        <EmailVerificationScreen />
      </ConfigProvider>
    );
  }

  if (auth.isSessionLoading) {
    return (
      <ConfigProvider theme={appTheme}>
        <AuthLoadingScreen />
      </ConfigProvider>
    );
  }

  if (auth.session === null) {
    return (
      <ConfigProvider theme={appTheme}>
        <AuthScreen
          form={auth.authForm}
          mode={auth.authMode}
          error={auth.authError}
          notice={auth.authNotice}
          isSubmitting={auth.isAuthSubmitting}
          watchedPassword={auth.watchedPassword}
          onFinish={auth.handleAuthFinish}
          onModeChange={auth.switchAuthMode}
          onPasskeyLogin={auth.handlePasskeyLogin}
        />
      </ConfigProvider>
    );
  }

  const session = auth.session;
  const currentUserId = session.user.id;
  const handleNavigate = (key: string) => {
    navigateToPath(navigationPaths[key] ?? '/');
  };
  const handleProfileOpen = () => navigateToPath('/profile');
  const openBudgetProjectInNewTab = (budgetId: number) => {
    const url = `${window.location.origin}/budgets/${budgetId}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openSelectedBudgetSettings = () => {
    if (budget.selectedBudget !== null) {
      budget.openBudgetEditModal(budget.selectedBudget);
    }
  };
  const budgetMetrics = (
    <BudgetMetrics
      selectedBudget={budget.selectedBudget}
      baseCurrency={baseCurrency}
      loading={budget.isBudgetDetailLoading}
    />
  );
  const budgetPreview = (
    <BudgetDocumentPreview
      selectedBudget={budget.selectedBudget}
      template={template.template}
      templateError={template.templateError}
      budgetError={budget.budgetError}
      baseCurrency={baseCurrency}
      canWriteBudgets={canWriteBudgets}
      entry={budgetEntry}
      operations={operations}
      isBudgetLoading={budget.isBudgetLoading}
      isBudgetDetailLoading={budget.isBudgetDetailLoading}
      isTemplateLoading={template.isTemplateLoading}
      onEditBudget={budget.selectedBudget === null ? undefined : openSelectedBudgetSettings}
    />
  );
  const governancePanel = (
    <GovernancePanel
      activeKey={activeKey}
      budget={budget}
      workspace={workspace}
      operations={operations}
      currentUserId={currentUserId}
      canWriteBudgets={canWriteBudgets}
      canManageWorkspaceMembers={canManageWorkspaceMembers}
    />
  );
  const budgetEditorContent = (
    <div className="workspace-grid budget-editor-grid">
      <div className="view-stack">
        {budgetMetrics}
        {budgetPreview}
      </div>
      {governancePanel}
    </div>
  );
  const modals = (
    <>
      <BudgetCreateModal
        form={budget.budgetForm}
        open={budget.isBudgetModalOpen}
        isEditing={budget.editingBudgetId !== null}
        error={budget.budgetError}
        confirmLoading={budget.isBudgetSaving}
        onCancel={() => {
          budget.setIsBudgetModalOpen(false);
          budget.budgetForm.resetFields();
        }}
        onOk={budget.handleBudgetSave}
      />
      <BudgetItemModal
        form={budgetEntry.budgetItemForm}
        editingItem={budgetEntry.editingBudgetItem}
        open={budgetEntry.isBudgetItemModalOpen}
        error={budgetEntry.entryError}
        categoryOptions={entryCategoryOptions}
        confirmLoading={budgetEntry.isBudgetItemSaving}
        onCancel={budgetEntry.closeBudgetItemModal}
        onOk={budgetEntry.handleBudgetItemSave}
      />
      <TransactionModal
        form={budgetEntry.transactionForm}
        editingTransaction={budgetEntry.editingTransaction}
        open={budgetEntry.isTransactionModalOpen}
        error={budgetEntry.entryError}
        categoryOptions={entryCategoryOptions}
        confirmLoading={budgetEntry.isTransactionSaving}
        onCancel={budgetEntry.closeTransactionModal}
        onOk={budgetEntry.handleTransactionSave}
      />
      <WorkspaceCreateModal
        form={workspace.workspaceForm}
        open={workspace.isWorkspaceModalOpen}
        baseCurrency={baseCurrency}
        confirmLoading={workspace.isWorkspaceCreating}
        onCancel={() => {
          workspace.setIsWorkspaceModalOpen(false);
          workspace.workspaceForm.resetFields();
        }}
        onOk={workspace.handleWorkspaceCreate}
      />
      <WorkspaceMemberModal
        form={workspace.workspaceMemberForm}
        open={workspace.isWorkspaceMemberModalOpen}
        error={workspace.workspaceMemberError}
        confirmLoading={workspace.isWorkspaceMemberSaving}
        onCancel={() => {
          workspace.setIsWorkspaceMemberModalOpen(false);
          workspace.workspaceMemberForm.resetFields();
        }}
        onOk={workspace.handleWorkspaceMemberAdd}
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
          onNewProject={budget.openBudgetModal}
          onOpenProject={openBudgetProjectInNewTab}
        />
      );
    }

    if (activeKey === 'budgets') {
      return (
        <BudgetProjectList
          budgets={budget.budgets}
          selectedBudgetId={budget.selectedBudget?.id ?? null}
          canWriteBudgets={canWriteBudgets}
          loading={budget.isBudgetLoading}
          onEditProjectInfo={budget.openBudgetEditModal}
          onNewProject={budget.openBudgetModal}
          onOpenProject={openBudgetProjectInNewTab}
          onSelectProject={(budgetId) => void budget.handleBudgetSelect(budgetId)}
        />
      );
    }

    if (activeKey === 'budget-editor') {
      return budgetEditorContent;
    }

    if (['categories', 'rates'].includes(activeKey)) {
      return <div className="workspace-grid workspace-grid-panel-only">{governancePanel}</div>;
    }

    if (activeKey === 'profile') {
      return (
        <ProfilePage
          session={session}
          operations={operations}
          onSessionUpdate={auth.setSession}
        />
      );
    }

    if (activeKey === 'admin' && session.user.isAdmin) {
      return <AdminPanel controller={admin} currentUserId={currentUserId} />;
    }

    return (
      <BudgetProjectDashboard
        budgets={budget.budgets}
        selectedBudget={budget.selectedBudget}
        baseCurrency={baseCurrency}
        canWriteBudgets={canWriteBudgets}
        loading={budget.isBudgetLoading || budget.isBudgetDetailLoading}
        onNavigate={handleNavigate}
        onNewProject={budget.openBudgetModal}
        onOpenProject={openBudgetProjectInNewTab}
      />
    );
  };

  return (
    <ConfigProvider theme={appTheme}>
      {isStandaloneBudgetEditor ? (
        <>
          <main className="standalone-budget-editor">
            {budgetEditorContent}
          </main>
          {modals}
        </>
      ) : (
        <>
          <AppShell
            activeKey={activeKey}
            session={session}
            workspaces={workspace.workspaces}
            workspaceRole={workspaceRole}
            workspaceOptions={workspace.workspaceOptions}
            activeWorkspaceId={workspace.activeWorkspaceId}
            isAdmin={session.user.isAdmin}
            isWorkspaceLoading={workspace.isWorkspaceLoading}
            isWorkspaceSwitching={workspace.isWorkspaceSwitching}
            isAuthSubmitting={auth.isAuthSubmitting}
            onNavigate={handleNavigate}
            onWorkspaceSwitch={workspace.handleWorkspaceSwitch}
            onProfile={handleProfileOpen}
            onLogout={auth.handleLogout}
          >
            {renderMainContent()}
          </AppShell>

          {modals}
        </>
      )}
    </ConfigProvider>
  );
}

export default App;
