import { useEffect, useMemo, useState } from 'react';
import { Alert, ConfigProvider, Modal } from 'antd';
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
import { ShareSideSection } from './components/workspace/ShareSideSection';
import { WorkspaceCreateModal } from './components/workspace/WorkspaceCreateModal';
import { WorkspaceMemberModal } from './components/workspace/WorkspaceMemberModal';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import { appTheme } from './config/appConfig';
import { useAuthController } from './hooks/useAuthController';
import { useAdminController } from './hooks/useAdminController';
import { useBudgetController } from './hooks/useBudgetController';
import { useBudgetEntryController } from './hooks/useBudgetEntryController';
import { useOperationsController } from './hooks/useOperationsController';
import { useTemplateController } from './hooks/useTemplateController';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import type { AppLanguage, I18nKey, I18nValues } from './i18n';
import { I18nContext, antdLocales, normalizeLanguage, translate } from './i18n';
import './App.css';

interface AppRoute {
  activeKey: string;
  budgetId: number | null;
}

const navigationPaths: Record<string, string> = {
  dashboard: '/',
  workspace: '/workspaces',
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

function initialLanguage(): AppLanguage {
  return normalizeLanguage(
    window.localStorage.getItem('budgetCentre.language') ?? window.navigator.language,
  );
}

function App() {
  const [route, setRoute] = useState(initialRouteFromLocation);
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const i18nValue = useMemo(
    () => ({
      language,
      t: (key: I18nKey, values?: I18nValues) => translate(language, key, values),
    }),
    [language],
  );
  const { t } = i18nValue;
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

  useEffect(() => {
    window.localStorage.setItem('budgetCentre.language', language);
    document.documentElement.lang =
      language === 'en' ? 'en' : language === 'sc' ? 'zh-Hans' : 'zh-Hant';
  }, [language]);

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
    onWorkspaceSelected: workspace.handleWorkspaceSwitch,
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
  const admin = useAdminController(auth.session?.user.isAdmin === true && activeKey === 'admin');
  const isEmailVerificationRoute = window.location.pathname === '/email/verify';
  const isStandaloneBudgetEditor = route.budgetId !== null;

  if (isEmailVerificationRoute) {
    return (
      <ConfigProvider locale={antdLocales[language]} theme={appTheme}>
        <I18nContext.Provider value={i18nValue}>
          <EmailVerificationScreen />
        </I18nContext.Provider>
      </ConfigProvider>
    );
  }

  if (auth.isSessionLoading) {
    return (
      <ConfigProvider locale={antdLocales[language]} theme={appTheme}>
        <I18nContext.Provider value={i18nValue}>
          <AuthLoadingScreen />
        </I18nContext.Provider>
      </ConfigProvider>
    );
  }

  if (auth.session === null) {
    return (
      <ConfigProvider locale={antdLocales[language]} theme={appTheme}>
        <I18nContext.Provider value={i18nValue}>
          <AuthScreen
            form={auth.authForm}
            mode={auth.authMode}
            error={auth.authError}
            notice={auth.authNotice}
            isSubmitting={auth.isAuthSubmitting}
            language={language}
            watchedPassword={auth.watchedPassword}
            onFinish={auth.handleAuthFinish}
            onLanguageChange={setLanguage}
            onModeChange={auth.switchAuthMode}
            onPasskeyLogin={auth.handlePasskeyLogin}
          />
        </I18nContext.Provider>
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
      isBudgetSaving={budget.isBudgetSaving}
      isTemplateLoading={template.isTemplateLoading}
      onEditBudget={budget.selectedBudget === null ? undefined : openSelectedBudgetSettings}
      onInlineHeaderSave={budget.handleBudgetHeaderSave}
      onOpenShare={canManageWorkspaceMembers ? () => setIsShareModalOpen(true) : undefined}
    />
  );
  const governancePanel = (
    <GovernancePanel
      activeKey={activeKey}
      budget={budget}
      workspace={workspace}
      operations={operations}
      currentUserId={currentUserId}
      canManageWorkspaceMembers={canManageWorkspaceMembers}
    />
  );
  const budgetEditorContent = (
    <div className="budget-editor-shell">
      {budgetMetrics}
      {budgetPreview}
    </div>
  );
  const modals = (
    <>
      <BudgetCreateModal
        form={budget.budgetForm}
        open={budget.isBudgetModalOpen}
        isEditing={budget.editingBudgetId !== null}
        error={budget.budgetError}
        workspaceOptions={workspace.workspaceOptions}
        workspaceMembers={workspace.workspaceMembers}
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
        categoryOptions={transactionCategoryOptions}
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
      <Modal
        destroyOnClose
        footer={null}
        open={isShareModalOpen}
        title={t('shareBudget')}
        width={760}
        onCancel={() => setIsShareModalOpen(false)}
      >
        {operations.operationsError ? (
          <Alert
            className="modal-error"
            type="error"
            showIcon
            message={operations.operationsError}
          />
        ) : null}
        <ShareSideSection
          operations={operations}
          selectedBudget={budget.selectedBudget}
          canManageBudgetShares={canManageWorkspaceMembers}
        />
      </Modal>
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
          selectedBudgetId={budget.selectedBudget?.id ?? null}
          canWriteBudgets={canWriteBudgets}
          loading={budget.isBudgetLoading}
          onDeleteProject={(budgetId) => void budget.handleBudgetDelete(budgetId)}
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
    <ConfigProvider locale={antdLocales[language]} theme={appTheme}>
      <I18nContext.Provider value={i18nValue}>
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
              workspaceRole={workspaceRole}
              isAdmin={session.user.isAdmin}
              isAuthSubmitting={auth.isAuthSubmitting}
              language={language}
              onNavigate={handleNavigate}
              onLanguageChange={setLanguage}
              onProfile={handleProfileOpen}
              onLogout={auth.handleLogout}
            >
              {renderMainContent()}
            </AppShell>

            {modals}
          </>
        )}
      </I18nContext.Provider>
    </ConfigProvider>
  );
}

export default App;
