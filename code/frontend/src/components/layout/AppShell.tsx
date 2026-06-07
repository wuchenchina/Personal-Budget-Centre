import type { ReactNode } from 'react';
import { Button, Layout, Menu, Select, Space, Tag } from 'antd';
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
import type { AuthSession, AuthWorkspace } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

const { Header, Sider, Content } = Layout;

interface AppShellProps {
  activeKey: string;
  session: AuthSession;
  workspaces: AuthWorkspace[];
  workspaceRole: WorkspaceRole | undefined;
  workspaceOptions: { label: string; value: number }[];
  activeWorkspaceId: number | null;
  isAdmin: boolean;
  isWorkspaceLoading: boolean;
  isWorkspaceSwitching: boolean;
  isAuthSubmitting: boolean;
  children: ReactNode;
  onNavigate: (key: string) => void;
  onWorkspaceSwitch: (workspaceId: number) => void;
  onProfile: () => void;
  onLogout: () => void;
}

export function AppShell({
  activeKey,
  session,
  workspaces,
  workspaceRole,
  workspaceOptions,
  activeWorkspaceId,
  isAdmin,
  isWorkspaceLoading,
  isWorkspaceSwitching,
  isAuthSubmitting,
  children,
  onNavigate,
  onWorkspaceSwitch,
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
            <Select
              aria-label="切换工作区"
              className="workspace-switcher"
              disabled={workspaces.length === 0}
              loading={isWorkspaceLoading || isWorkspaceSwitching}
              optionFilterProp="label"
              options={workspaceOptions}
              placeholder="选择工作区"
              showSearch
              value={activeWorkspaceId ?? undefined}
              onChange={onWorkspaceSwitch}
            />
            <div className="workspace-meta">
              {workspaceRole ? (
                <Tag color={roleColors[workspaceRole]}>{roleLabels[workspaceRole]}</Tag>
              ) : (
                <Tag>无工作区</Tag>
              )}
            </div>
          </div>
          <Space className="header-actions" wrap>
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
