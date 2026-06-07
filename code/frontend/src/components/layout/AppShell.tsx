import type { ReactNode } from 'react';
import { Button, Layout, Menu, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Tags,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { iconSize, roleColors, roleLabels } from '../../config/appConfig';
import type { AuthSession } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

const { Header, Sider, Content } = Layout;

interface AppShellProps {
  activeKey: string;
  session: AuthSession;
  workspaceRole: WorkspaceRole | undefined;
  isAdmin: boolean;
  isAuthSubmitting: boolean;
  children: ReactNode;
  onNavigate: (key: string) => void;
  onProfile: () => void;
  onLogout: () => void;
}

export function AppShell({
  activeKey,
  session,
  workspaceRole,
  isAdmin,
  isAuthSubmitting,
  children,
  onNavigate,
  onProfile,
  onLogout,
}: AppShellProps) {
  const menuItems: MenuProps['items'] = [
    { key: 'dashboard', icon: <LayoutDashboard size={iconSize} />, label: '仪表盘' },
    { key: 'budgets', icon: <WalletCards size={iconSize} />, label: '预算项目' },
    { key: 'categories', icon: <Tags size={iconSize} />, label: '分类' },
    { key: 'rates', icon: <RefreshCcw size={iconSize} />, label: '汇率' },
  ];
  if (isAdmin) {
    menuItems.push({ key: 'admin', icon: <ShieldCheck size={iconSize} />, label: '后台' });
  }
  const workspaceName = session.workspace?.name ?? '尚未選擇工作區';

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={232}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <WalletCards size={20} />
          </div>
          <div>
            <div className="brand-title">BudgetCentre</div>
            <div className="brand-caption">个人财务</div>
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
              <span className="header-context-kicker">當前工作區</span>
              <div className="header-context-row">
                <strong>{workspaceName}</strong>
                {workspaceRole ? (
                  <Tag color={roleColors[workspaceRole]}>{roleLabels[workspaceRole]}</Tag>
                ) : (
                  <Tag>未設定</Tag>
                )}
              </div>
            </div>
          </div>
          <Space className="header-actions" wrap>
            <Button type="text" onClick={() => onNavigate('dashboard')}>
              工作台
            </Button>
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
              退出
            </Button>
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
