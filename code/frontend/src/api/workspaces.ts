import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { AuthWorkspace, WorkspaceMember } from '../types/auth';

interface WorkspaceListPayload {
  workspaces: AuthWorkspace[];
}

interface WorkspaceCreatePayload {
  workspace: AuthWorkspace;
}

interface WorkspaceUpdatePayload {
  workspace: AuthWorkspace;
}

interface WorkspaceDeletePayload {
  workspace: AuthWorkspace | null;
}

interface WorkspaceSwitchPayload {
  workspace: AuthWorkspace;
}

interface WorkspaceMemberListPayload {
  members: WorkspaceMember[];
}

interface WorkspaceMemberPayload {
  member: WorkspaceMember;
}

export interface CreateWorkspacePayload {
  name: string;
  type: 'family' | 'team' | 'custom';
  defaultCurrency: string;
}

export interface UpdateWorkspacePayload {
  workspaceId: number;
  name: string;
  type: AuthWorkspace['type'];
  defaultCurrency: string;
}

export interface AddWorkspaceMemberPayload {
  workspaceId: number;
  email: string;
  role: WorkspaceMember['role'];
}

export interface UpdateWorkspaceMemberPayload {
  workspaceId: number;
  userId: number;
  role: WorkspaceMember['role'];
}

export function listWorkspaces(): Promise<AuthWorkspace[]> {
  return apiGet<WorkspaceListPayload>('/api/workspaces').then(
    (payload) => payload.workspaces,
  );
}

export function createWorkspace(payload: CreateWorkspacePayload): Promise<AuthWorkspace> {
  return apiPost<WorkspaceCreatePayload>('/api/workspaces', payload).then(
    (response) => response.workspace,
  );
}

export function updateWorkspace(payload: UpdateWorkspacePayload): Promise<AuthWorkspace> {
  return apiPatch<WorkspaceUpdatePayload>('/api/workspaces', payload).then(
    (response) => response.workspace,
  );
}

export function deleteWorkspace(workspaceId: number): Promise<AuthWorkspace | null> {
  return apiDelete<WorkspaceDeletePayload>('/api/workspaces', { workspaceId }).then(
    (response) => response.workspace,
  );
}

export function switchWorkspace(workspaceId: number): Promise<AuthWorkspace> {
  return apiPost<WorkspaceSwitchPayload>('/api/workspaces/switch', { workspaceId }).then(
    (response) => response.workspace,
  );
}

export function listWorkspaceMembers(workspaceId: number): Promise<WorkspaceMember[]> {
  return apiGet<WorkspaceMemberListPayload>(
    `/api/workspace-members?workspaceId=${workspaceId}`,
  ).then((payload) => payload.members);
}

export function addWorkspaceMember(payload: AddWorkspaceMemberPayload): Promise<WorkspaceMember> {
  return apiPost<WorkspaceMemberPayload>('/api/workspace-members', payload).then(
    (response) => response.member,
  );
}

export function updateWorkspaceMember(
  payload: UpdateWorkspaceMemberPayload,
): Promise<WorkspaceMember> {
  return apiPatch<WorkspaceMemberPayload>('/api/workspace-members', payload).then(
    (response) => response.member,
  );
}

export function deleteWorkspaceMember(
  workspaceId: number,
  userId: number,
): Promise<Record<string, never>> {
  return apiDelete<Record<string, never>>('/api/workspace-members', {
    workspaceId,
    userId,
  });
}
