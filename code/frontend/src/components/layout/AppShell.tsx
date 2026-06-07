import type { ReactNode } from 'react';
import { Button, Layout, Menu, Select, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  Download,
  FileText,
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
const { Title, Text } = Typography;

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
    { key: 'reconciliation', icon: <RefreshCcw size={iconSize} />, label: '对账' },
    { key: 'categories', icon: <Tags size={iconSize} />, label: '分类' },
    { key: 'workspace', icon: <Users size={iconSize} />, label: '协作工作区' },
    { key: 'security', icon: <KeyRound size={iconSize} />, label: '安全' },
    { key: 'exports', icon: <Download size={iconSize} />, label: '导出' },
  ];
  if (isAdmin) {
    menuItems.push({ key: 'admin', icon: <ShieldCheck size={iconSize} />, label: '后台' });
  }

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={264}>
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
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => onNavigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="workspace-heading">
            <Text type="secondary">工作区</Text>
            <Title level={3}>{session.workspace?.name ?? '个人财务'}</Title>
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
          </div>
          <Space wrap>
            <Tag>
              {workspaces.length} 个工作区
            </Tag>
            {workspaceRole ? (
              <Tag color={roleColors[workspaceRole]}>{roleLabels[workspaceRole]}</Tag>
            ) : (
              <Tag>无工作区</Tag>
            )}
            <span className="user-chip">
              <UserRound size={15} />
              {session.user.displayName}
            </span>
            <Button
              disabled={activeWorkspaceId === null}
              icon={<Share2 size={16} />}
              onClick={() => onNavigate('sharing')}
            >
              共享
            </Button>
            <Button icon={<FileText size={16} />} onClick={() => onNavigate('exports')}>
              导出
            </Button>
            <Button
              type="primary"
              disabled={activeWorkspaceId === null || !canWriteBudgets}
              icon={<Plus size={16} />}
              onClick={onNewBudget}
            >
              新建预算项目
            </Button>
            <Button icon={<LogOut size={16} />} loading={isAuthSubmitting} onClick={onLogout}>
              退出
            </Button>
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
