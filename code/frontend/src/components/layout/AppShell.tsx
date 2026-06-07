import type { ReactNode } from 'react';
import { Button, Layout, Menu, Select, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  Building2,
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Tags,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { iconSize, roleColors, roleLabels } from '../../config/appConfig';
import type { AppLanguage } from '../../i18n';
import { languageOptions } from '../../i18n';
import type { AuthSession } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

const { Header, Sider, Content } = Layout;

const shellCopy = {
  en: {
    admin: 'Admin',
    brandCaption: 'Personal finance',
    budgets: 'Budgets',
    categories: 'Categories',
    currentWorkspace: 'Current workspace',
    dashboard: 'Dashboard',
    logout: 'Sign out',
    rates: 'Rates',
    unset: 'Not set',
    workspace: 'Workspace',
    workspaceMissing: 'No workspace selected',
  },
  sc: {
    admin: '后台',
    brandCaption: '个人财务',
    budgets: '预算项目',
    categories: '分类',
    currentWorkspace: '当前工作区',
    dashboard: '仪表盘',
    logout: '退出',
    rates: '汇率',
    unset: '未设置',
    workspace: '工作区',
    workspaceMissing: '尚未选择工作区',
  },
  tc: {
    admin: '後台',
    brandCaption: '個人財務',
    budgets: '預算項目',
    categories: '分類',
    currentWorkspace: '當前工作區',
    dashboard: '儀表盤',
    logout: '登出',
    rates: '匯率',
    unset: '未設定',
    workspace: '工作區',
    workspaceMissing: '尚未選擇工作區',
  },
} satisfies Record<AppLanguage, Record<string, string>>;

interface AppShellProps {
  activeKey: string;
  session: AuthSession;
  workspaceRole: WorkspaceRole | undefined;
  isAdmin: boolean;
  isAuthSubmitting: boolean;
  language: AppLanguage;
  children: ReactNode;
  onNavigate: (key: string) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onProfile: () => void;
  onLogout: () => void;
}

export function AppShell({
  activeKey,
  session,
  workspaceRole,
  isAdmin,
  isAuthSubmitting,
  language,
  children,
  onNavigate,
  onLanguageChange,
  onProfile,
  onLogout,
}: AppShellProps) {
  const copy = shellCopy[language];
  const menuItems: MenuProps['items'] = [
    { key: 'dashboard', icon: <LayoutDashboard size={iconSize} />, label: copy.dashboard },
    { key: 'workspace', icon: <Building2 size={iconSize} />, label: copy.workspace },
    { key: 'budgets', icon: <WalletCards size={iconSize} />, label: copy.budgets },
    { key: 'categories', icon: <Tags size={iconSize} />, label: copy.categories },
    { key: 'rates', icon: <RefreshCcw size={iconSize} />, label: copy.rates },
  ];
  if (isAdmin) {
    menuItems.push({ key: 'admin', icon: <ShieldCheck size={iconSize} />, label: copy.admin });
  }
  const workspaceName = session.workspace?.name ?? copy.workspaceMissing;

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={232}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <WalletCards size={20} />
          </div>
          <div>
            <div className="brand-title">BudgetCentre</div>
            <div className="brand-caption">{copy.brandCaption}</div>
          </div>
        </div>
        <Menu
          className="app-menu"
          mode="inline"
          selectedKeys={[activeKey === 'budget-editor' ? 'budgets' : activeKey]}
          items={menuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="header-main">
            <div className="header-context">
              <span className="header-context-kicker">{copy.currentWorkspace}</span>
              <div className="header-context-row">
                <strong>{workspaceName}</strong>
                {workspaceRole ? (
                  <Tag color={roleColors[workspaceRole]}>{roleLabels[workspaceRole]}</Tag>
                ) : (
                  <Tag>{copy.unset}</Tag>
                )}
              </div>
            </div>
          </div>
          <Space className="header-actions" wrap>
            <Button type="text" onClick={() => onNavigate('workspace')}>
              {copy.workspace}
            </Button>
            <Select<AppLanguage>
              aria-label="Language"
              className="language-switcher"
              options={languageOptions}
              size="small"
              value={language}
              onChange={onLanguageChange}
            />
            <Button
              className="user-name-button"
              icon={<UserRound size={15} />}
              type="text"
              onClick={onProfile}
            >
              {session.user.displayName}
            </Button>
            <Button
              icon={<LogOut size={16} />}
              loading={isAuthSubmitting}
              size="small"
              onClick={onLogout}
            >
              {copy.logout}
            </Button>
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
