import type { ReactNode } from 'react';
import { Button, Layout, Menu, Select, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  Download,
  FileText,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Plus,
  Share2,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';
import { iconSize, roleColors } from '../../config/appConfig';
import type { AuthSession, AuthWorkspace } from '../../types/auth';
import type { WorkspaceRole } from '../../types/budget';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

interface AppShellProps {
  activeKey: string;
  session: AuthSession;
  workspaces: AuthWorkspace[];
  workspaceRole: WorkspaceRole | undefined;
  workspaceOptions: { label: string; value: number }[];
  activeWorkspaceId: number | null;
  canWriteBudgets: boolean;
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
    { key: 'dashboard', icon: <LayoutDashboard size={iconSize} />, label: 'Dashboard' },
    { key: 'budgets', icon: <WalletCards size={iconSize} />, label: 'Budgets' },
    { key: 'workspace', icon: <Users size={iconSize} />, label: 'Workspace' },
    { key: 'currencies', icon: <Landmark size={iconSize} />, label: 'Currencies' },
    { key: 'security', icon: <KeyRound size={iconSize} />, label: 'Security' },
    { key: 'exports', icon: <Download size={iconSize} />, label: 'Exports' },
  ];

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={264}>
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
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="workspace-heading">
            <Text type="secondary">Workspace</Text>
            <Title level={3}>{session.workspace?.name ?? 'Personal Finance'}</Title>
            <Select
              aria-label="Switch workspace"
              className="workspace-switcher"
              disabled={workspaces.length === 0}
              loading={isWorkspaceLoading || isWorkspaceSwitching}
              optionFilterProp="label"
              options={workspaceOptions}
              placeholder="Select workspace"
              showSearch
              value={activeWorkspaceId ?? undefined}
              onChange={onWorkspaceSwitch}
            />
          </div>
          <Space wrap>
            <Tag>
              {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
            </Tag>
            {workspaceRole ? (
              <Tag color={roleColors[workspaceRole]}>{workspaceRole}</Tag>
            ) : (
              <Tag>no workspace</Tag>
            )}
            <span className="user-chip">
              <UserRound size={15} />
              {session.user.displayName}
            </span>
            <Button icon={<Share2 size={16} />}>Share</Button>
            <Button icon={<FileText size={16} />}>Export</Button>
            <Button
              type="primary"
              disabled={activeWorkspaceId === null || !canWriteBudgets}
              icon={<Plus size={16} />}
              onClick={onNewBudget}
            >
              New Budget
            </Button>
            <Button icon={<LogOut size={16} />} loading={isAuthSubmitting} onClick={onLogout}>
              Logout
            </Button>
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
