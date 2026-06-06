import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export interface Workgroup {
  id: number;
  workspaceId: number;
  name: string;
  description: string | null;
  memberCount: number;
}

export interface WorkgroupPayload {
  workspaceId: number;
  name: string;
  description?: string | null;
}

interface WorkgroupListResponse {
  workgroups: Workgroup[];
}

interface WorkgroupResponse {
  workgroup: Workgroup;
}

export function listWorkgroups(workspaceId: number): Promise<Workgroup[]> {
  return apiGet<WorkgroupListResponse>(`/api/workgroups?workspaceId=${workspaceId}`).then(
    (payload) => payload.workgroups,
  );
}

export function createWorkgroup(payload: WorkgroupPayload): Promise<Workgroup> {
  return apiPost<WorkgroupResponse>('/api/workgroups', payload).then(
    (response) => response.workgroup,
  );
}

export function updateWorkgroup(payload: WorkgroupPayload & { id: number }): Promise<Workgroup> {
  return apiPatch<WorkgroupResponse>('/api/workgroups', payload).then(
    (response) => response.workgroup,
  );
}

export function deleteWorkgroup(id: number): Promise<Record<string, never>> {
  return apiDelete<Record<string, never>>('/api/workgroups', { id });
}
