import type { ReactNode } from 'react';
import { Button, Layout, Menu, Select, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCcw,
  Share2,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
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
  canWriteBudgets: boolean;
  isAdmin: boolean;
  isWorkspaceLoading: boolean;
  isWorkspaceSwitching: boolean;
  isAuthSubmitting: boolean;
  children: ReactNode;
  onNavigate: (key: string) => void;
  onWorkspaceSwitch: (workspaceId: number) => void;
  onNewBudget: () => void;
  onLogout: () => void;
}

export function AppShell({
  activeKey,
  session,
  workspaces,
  workspaceRole,
  workspaceOptions,
  activeWorkspaceId,
  canWriteBudgets,
  isAdmin,
  isWorkspaceLoading,
  isWorkspaceSwitching,
  isAuthSubmitting,
  children,
  onNavigate,
  onWorkspaceSwitch,
  onNewBudget,
  onLogout,
}: AppShellProps) {
  const menuItems: MenuProps['items'] = [
    { key: 'dashboard', icon: <LayoutDashboard size={iconSize} />, label: '仪表盘' },
    { key: 'budgets', icon: <WalletCards size={iconSize} />, label: '预算项目' },
    { key: 'sharing', icon: <Share2 size={iconSize} />, label: '共享' },
    { key: 'categories', icon: <Tags size={iconSize} />, label: '分类' },
    { key: 'rates', icon: <RefreshCcw size={iconSize} />, label: '汇率' },
    { key: 'workspace', icon: <Users size={iconSize} />, label: '协作工作区' },
    { key: 'security', icon: <KeyRound size={iconSize} />, label: '安全' },
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
            <span className="user-chip">
              <UserRound size={15} />
              {session.user.displayName}
            </span>
            <Button
              disabled={activeWorkspaceId === null}
              icon={<Share2 size={16} />}
              size="small"
              onClick={() => onNavigate('sharing')}
            >
              共享
            </Button>
            <Button
              type="primary"
              disabled={activeWorkspaceId === null || !canWriteBudgets}
              icon={<Plus size={16} />}
              size="small"
              onClick={onNewBudget}
            >
              新建预算项目
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
