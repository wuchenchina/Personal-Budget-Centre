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
import { iconSize, roleColors } from '../../config/appConfig';
import type { AppLanguage } from '../../i18n';
import { languageOptions, roleLabelsByLanguage, useI18n } from '../../i18n';
import type { AuthSession } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

const { Header, Sider, Content } = Layout;

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
  const { t } = useI18n();
  const menuItems: MenuProps['items'] = [
    { key: 'dashboard', icon: <LayoutDashboard size={iconSize} />, label: t('dashboard') },
    { key: 'workspace', icon: <Building2 size={iconSize} />, label: t('workspace') },
    { key: 'budgets', icon: <WalletCards size={iconSize} />, label: t('budgetProjects') },
    { key: 'categories', icon: <Tags size={iconSize} />, label: t('categories') },
    { key: 'rates', icon: <RefreshCcw size={iconSize} />, label: t('rates') },
  ];
  if (isAdmin) {
    menuItems.push({ key: 'admin', icon: <ShieldCheck size={iconSize} />, label: 'Admin' });
  }
  const workspaceName = session.workspace?.name ?? t('selectWorkspace');

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={232}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <WalletCards size={20} />
          </div>
          <div>
            <div className="brand-title">BudgetCentre</div>
            <div className="brand-caption">Personal Finance</div>
          </div>
        </div>
        <Menu
          className="app-menu"
          mode="inline"
          selectedKeys={[['budget-editor', 'budget-bookkeeping'].includes(activeKey) ? 'budgets' : activeKey]}
          items={menuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="header-main">
            <div className="header-context">
              <span className="header-context-kicker">{t('currentWorkspace')}</span>
              <div className="header-context-row">
                <strong>{workspaceName}</strong>
                {workspaceRole ? (
                  <Tag color={roleColors[workspaceRole]}>
                    {roleLabelsByLanguage[language][workspaceRole]}
                  </Tag>
                ) : (
                  <Tag>-</Tag>
                )}
              </div>
            </div>
          </div>
          <Space className="header-actions" wrap>
            <Button type="text" onClick={() => onNavigate('workspace')}>
              {t('workspace')}
            </Button>
            <Select<AppLanguage>
              aria-label="Language"
              className="language-switcher"
              options={languageOptions}
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
              {t('logout')}
            </Button>
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
