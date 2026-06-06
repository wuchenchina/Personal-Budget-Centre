import { useState } from 'react';
import { ConfigProvider } from 'antd';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
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
import { useBudgetController } from './hooks/useBudgetController';
import { useBudgetEntryController } from './hooks/useBudgetEntryController';
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
          isSubmitting={auth.isAuthSubmitting}
          watchedPassword={auth.watchedPassword}
          onFinish={auth.handleAuthFinish}
          onModeChange={auth.switchAuthMode}
        />
      </ConfigProvider>
    );
  }

  const workspaceRole = workspace.workspaceRole;
  const currentUserId = auth.session.user.id;
  const canManageWorkspaceMembers = workspaceRole === 'owner' || workspaceRole === 'admin';
  const canWriteBudgets =
    workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'editor';

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
        isWorkspaceLoading={workspace.isWorkspaceLoading}
        isWorkspaceSwitching={workspace.isWorkspaceSwitching}
        isAuthSubmitting={auth.isAuthSubmitting}
        onNavigate={setActiveKey}
        onWorkspaceSwitch={workspace.handleWorkspaceSwitch}
        onNewBudget={budget.openBudgetModal}
        onLogout={auth.handleLogout}
      >
        <BudgetMetrics
          selectedBudget={budget.selectedBudget}
          baseCurrency={baseCurrency}
          loading={budget.isBudgetDetailLoading}
        />

        <div className="workspace-grid">
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
          <GovernancePanel
            budget={budget}
            workspace={workspace}
            workgroup={workgroup}
            currentUserId={currentUserId}
            canWriteBudgets={canWriteBudgets}
            canManageWorkspaceMembers={canManageWorkspaceMembers}
          />
        </div>
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
        confirmLoading={budgetEntry.isBudgetItemSaving}
        onCancel={budgetEntry.closeBudgetItemModal}
        onOk={budgetEntry.handleBudgetItemSave}
      />
      <TransactionModal
        form={budgetEntry.transactionForm}
        editingTransaction={budgetEntry.editingTransaction}
        open={budgetEntry.isTransactionModalOpen}
        error={budgetEntry.entryError}
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
