import { useState } from 'react';
import { ConfigProvider } from 'antd';
import { AdminPanel } from './components/admin/AdminPanel';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
import { EmailVerificationScreen } from './components/auth/EmailVerificationScreen';
import { AuthScreen } from './components/auth/AuthScreen';
import { BudgetCreateModal } from './components/budget/BudgetCreateModal';
import { BudgetDocumentPreview } from './components/budget/BudgetDocumentPreview';
import { BudgetItemModal } from './components/budget/BudgetItemModal';
import { BudgetMetrics } from './components/budget/BudgetMetrics';
import { TransactionModal } from './components/budget/TransactionModal';
import { AppShell } from './components/layout/AppShell';
import { GovernancePanel } from './components/workspace/GovernancePanel';
import { WorkgroupModal } from './components/workspace/WorkgroupModal';
import { WorkspaceCreateModal } from './components/workspace/WorkspaceCreateModal';
import { WorkspaceMemberModal } from './components/workspace/WorkspaceMemberModal';
import { appTheme } from './config/appConfig';
import { useAuthController } from './hooks/useAuthController';
import { useAdminController } from './hooks/useAdminController';
import { useBudgetController } from './hooks/useBudgetController';
import { useBudgetEntryController } from './hooks/useBudgetEntryController';
import { useOperationsController } from './hooks/useOperationsController';
import { useTemplateController } from './hooks/useTemplateController';
import { useWorkgroupController } from './hooks/useWorkgroupController';
import { useWorkspaceController } from './hooks/useWorkspaceController';
import './App.css';

function App() {
  const [activeKey, setActiveKey] = useState('dashboard');
  const auth = useAuthController({
    onLogout: () => setActiveKey('dashboard'),
  });
  const workspace = useWorkspaceController(auth.session, auth.setSession);
  const template = useTemplateController(auth.session);
  const baseCurrency = auth.session?.workspace?.defaultCurrency ?? 'CNY';
  const budget = useBudgetController({
    activeWorkspaceId: workspace.activeWorkspaceId,
    baseCurrency,
    session: auth.session,
    onCreated: () => setActiveKey('budgets'),
  });
  const budgetEntry = useBudgetEntryController({
    baseCurrency,
    selectedBudget: budget.selectedBudget,
    replaceBudgetDetail: budget.replaceBudgetDetail,
  });
  const workgroup = useWorkgroupController(workspace.activeWorkspaceId);
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
  const admin = useAdminController(auth.session?.user.isAdmin === true && activeKey === 'admin');
  const isEmailVerificationRoute = window.location.pathname === '/email/verify';

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

  const currentUserId = auth.session.user.id;
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
      isBudgetLoading={budget.isBudgetLoading}
      isBudgetDetailLoading={budget.isBudgetDetailLoading}
      isTemplateLoading={template.isTemplateLoading}
    />
  );
  const governancePanel = (
    <GovernancePanel
      activeKey={activeKey}
      budget={budget}
      workspace={workspace}
      workgroup={workgroup}
      operations={operations}
      currentUserId={currentUserId}
      canWriteBudgets={canWriteBudgets}
      canManageWorkspaceMembers={canManageWorkspaceMembers}
    />
  );

  const renderMainContent = () => {
    if (activeKey === 'budgets') {
      return (
        <div className="view-stack">
          {budgetMetrics}
          {budgetPreview}
        </div>
      );
    }

    if (['workspace', 'currencies', 'security', 'exports'].includes(activeKey)) {
      return <div className="workspace-grid workspace-grid-panel-only">{governancePanel}</div>;
    }

    if (activeKey === 'admin' && auth.session?.user.isAdmin) {
      return <AdminPanel controller={admin} currentUserId={currentUserId} />;
    }

    return (
      <>
        {budgetMetrics}
        <div className="workspace-grid">
          {budgetPreview}
          {governancePanel}
        </div>
      </>
    );
  };

  return (
    <ConfigProvider theme={appTheme}>
      <AppShell
        activeKey={activeKey}
        session={auth.session}
        workspaces={workspace.workspaces}
        workspaceRole={workspaceRole}
        workspaceOptions={workspace.workspaceOptions}
        activeWorkspaceId={workspace.activeWorkspaceId}
        canWriteBudgets={canWriteBudgets}
        isAdmin={auth.session.user.isAdmin}
        isWorkspaceLoading={workspace.isWorkspaceLoading}
        isWorkspaceSwitching={workspace.isWorkspaceSwitching}
        isAuthSubmitting={auth.isAuthSubmitting}
        onNavigate={setActiveKey}
        onWorkspaceSwitch={workspace.handleWorkspaceSwitch}
        onNewBudget={budget.openBudgetModal}
        onLogout={auth.handleLogout}
      >
        {renderMainContent()}
      </AppShell>

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
        categoryOptions={operations.categoryOptions}
        confirmLoading={budgetEntry.isBudgetItemSaving}
        onCancel={budgetEntry.closeBudgetItemModal}
        onOk={budgetEntry.handleBudgetItemSave}
      />
      <TransactionModal
        form={budgetEntry.transactionForm}
        editingTransaction={budgetEntry.editingTransaction}
        open={budgetEntry.isTransactionModalOpen}
        error={budgetEntry.entryError}
        categoryOptions={operations.categoryOptions}
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
      <WorkgroupModal
        form={workgroup.workgroupForm}
        editingWorkgroup={workgroup.editingWorkgroup}
        open={workgroup.isWorkgroupModalOpen}
        confirmLoading={workgroup.isWorkgroupSaving}
        onCancel={() => {
          workgroup.setIsWorkgroupModalOpen(false);
          workgroup.setEditingWorkgroup(null);
          workgroup.workgroupForm.resetFields();
        }}
        onOk={workgroup.handleWorkgroupSave}
      />
    </ConfigProvider>
  );
}

export default App;
