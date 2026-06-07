import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Form } from 'antd';
import {
  addWorkspaceMember,
  createWorkspace,
  deleteWorkspaceMember,
  listWorkspaceMembers,
  listWorkspaces,
  switchWorkspace,
  updateWorkspaceMember,
} from '../api/workspaces';
import type { AuthSession, AuthWorkspace, WorkspaceMember } from '../types/auth';
import type { WorkspaceMemberFormValues, WorkspaceFormValues } from '../types/forms';
import type { WorkspaceRole } from '../types/budget';
import { toCurrencyCode } from '../utils/budgetTemplate';
import { translateCurrent } from '../i18n';

export function useWorkspaceController(
  session: AuthSession | null,
  setSession: Dispatch<SetStateAction<AuthSession | null>>,
) {
  const [workspaceForm] = Form.useForm<WorkspaceFormValues>();
  const [workspaceMemberForm] = Form.useForm<WorkspaceMemberFormValues>();
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceMemberError, setWorkspaceMemberError] = useState<string | null>(null);
  const [isWorkspaceMemberModalOpen, setIsWorkspaceMemberModalOpen] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isWorkspaceCreating, setIsWorkspaceCreating] = useState(false);
  const [isWorkspaceSwitching, setIsWorkspaceSwitching] = useState(false);
  const [isWorkspaceMemberLoading, setIsWorkspaceMemberLoading] = useState(false);
  const [isWorkspaceMemberSaving, setIsWorkspaceMemberSaving] = useState(false);
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<number | null>(null);
  const [deletingMemberUserId, setDeletingMemberUserId] = useState<number | null>(null);
  const activeWorkspaceId = session?.workspace?.id ?? null;
  const workspaceRole = session?.workspace?.role;

  useEffect(() => {
    let isMounted = true;

    if (session === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setWorkspaces([]);
        setWorkspaceError(null);
        setIsWorkspaceLoading(false);
        setIsWorkspaceSwitching(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (isMounted) {
        setIsWorkspaceLoading(true);
        listWorkspaces()
          .then((nextWorkspaces) => {
            if (isMounted) {
              setWorkspaces(nextWorkspaces);
              setWorkspaceError(null);
            }
          })
          .catch((error: unknown) => {
            if (isMounted) {
              setWorkspaceError(
                error instanceof Error ? error.message : translateCurrent('loadingWorkspaces'),
              );
            }
          })
          .finally(() => {
            if (isMounted) {
              setIsWorkspaceLoading(false);
            }
          });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    if (activeWorkspaceId === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setWorkspaceMembers([]);
        setWorkspaceMemberError(null);
        setIsWorkspaceMemberLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (isMounted) {
        setIsWorkspaceMemberLoading(true);
        listWorkspaceMembers(activeWorkspaceId)
          .then((nextMembers) => {
            if (isMounted) {
              setWorkspaceMembers(nextMembers);
              setWorkspaceMemberError(null);
            }
          })
          .catch((error: unknown) => {
            if (isMounted) {
              setWorkspaceMemberError(
                error instanceof Error ? error.message : translateCurrent('loadingMembers'),
              );
            }
          })
          .finally(() => {
            if (isMounted) {
              setIsWorkspaceMemberLoading(false);
            }
          });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  const workspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => ({
        label: workspace.name,
        value: workspace.id,
      })),
    [workspaces],
  );

  const handleWorkspaceCreate = async () => {
    try {
      const values = await workspaceForm.validateFields();
      setIsWorkspaceCreating(true);
      setWorkspaceError(null);

      const nextWorkspace = await createWorkspace({
        name: values.name.trim(),
        type: values.type,
        defaultCurrency: toCurrencyCode(values.defaultCurrency),
      });

      setWorkspaces((currentWorkspaces) => [...currentWorkspaces, nextWorkspace]);
      if (session?.workspace === null) {
        setSession({
          ...session,
          workspace: nextWorkspace,
        });
      }
      setIsWorkspaceModalOpen(false);
      workspaceForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setWorkspaceError(error.message);
      }
    } finally {
      setIsWorkspaceCreating(false);
    }
  };

  const handleWorkspaceSwitch = async (workspaceId: number) => {
    if (session === null || workspaceId === activeWorkspaceId) {
      return;
    }

    setIsWorkspaceSwitching(true);
    setWorkspaceError(null);

    try {
      const nextWorkspace = await switchWorkspace(workspaceId);
      setSession((currentSession) =>
        currentSession === null
          ? currentSession
          : {
              ...currentSession,
              workspace: nextWorkspace,
            },
      );
    } catch (error: unknown) {
      setWorkspaceError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsWorkspaceSwitching(false);
    }
  };

  const openWorkspaceModal = () => {
    setWorkspaceError(null);
    setIsWorkspaceModalOpen(true);
  };

  const openWorkspaceMemberModal = () => {
    setWorkspaceMemberError(null);
    workspaceMemberForm.resetFields();
    workspaceMemberForm.setFieldValue('role', 'viewer');
    setIsWorkspaceMemberModalOpen(true);
  };

  const handleWorkspaceMemberAdd = async () => {
    if (activeWorkspaceId === null) {
      setWorkspaceMemberError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    try {
      const values = await workspaceMemberForm.validateFields();
      setIsWorkspaceMemberSaving(true);
      setWorkspaceMemberError(null);

      const nextMember = await addWorkspaceMember({
        workspaceId: activeWorkspaceId,
        email: values.email.trim(),
        role: values.role,
      });

      setWorkspaceMembers((currentMembers) => {
        const existing = currentMembers.some((member) => member.userId === nextMember.userId);

        return existing
          ? currentMembers.map((member) =>
              member.userId === nextMember.userId ? nextMember : member,
            )
          : [...currentMembers, nextMember];
      });
      setIsWorkspaceMemberModalOpen(false);
      workspaceMemberForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setWorkspaceMemberError(error.message);
      }
    } finally {
      setIsWorkspaceMemberSaving(false);
    }
  };

  const handleWorkspaceMemberRoleChange = async (
    member: WorkspaceMember,
    role: WorkspaceRole,
  ) => {
    if (activeWorkspaceId === null || member.role === role) {
      return;
    }

    setUpdatingMemberUserId(member.userId);
    setWorkspaceMemberError(null);

    try {
      const updatedMember = await updateWorkspaceMember({
        workspaceId: activeWorkspaceId,
        userId: member.userId,
        role,
      });
      setWorkspaceMembers((currentMembers) =>
        currentMembers.map((currentMember) =>
          currentMember.userId === updatedMember.userId ? updatedMember : currentMember,
        ),
      );
    } catch (error: unknown) {
      setWorkspaceMemberError(
        error instanceof Error ? error.message : translateCurrent('authFailed'),
      );
    } finally {
      setUpdatingMemberUserId(null);
    }
  };

  const handleWorkspaceMemberDelete = async (member: WorkspaceMember) => {
    if (activeWorkspaceId === null) {
      return;
    }

    setDeletingMemberUserId(member.userId);
    setWorkspaceMemberError(null);

    try {
      await deleteWorkspaceMember(activeWorkspaceId, member.userId);
      setWorkspaceMembers((currentMembers) =>
        currentMembers.filter((currentMember) => currentMember.userId !== member.userId),
      );
    } catch (error: unknown) {
      setWorkspaceMemberError(
        error instanceof Error ? error.message : translateCurrent('authFailed'),
      );
    } finally {
      setDeletingMemberUserId(null);
    }
  };

  return {
    workspaceForm,
    workspaceMemberForm,
    workspaces,
    workspaceError,
    setWorkspaceError,
    isWorkspaceModalOpen,
    setIsWorkspaceModalOpen,
    workspaceMembers,
    workspaceMemberError,
    isWorkspaceMemberModalOpen,
    setIsWorkspaceMemberModalOpen,
    isWorkspaceLoading,
    isWorkspaceCreating,
    isWorkspaceSwitching,
    isWorkspaceMemberLoading,
    isWorkspaceMemberSaving,
    updatingMemberUserId,
    deletingMemberUserId,
    activeWorkspaceId,
    workspaceRole,
    workspaceOptions,
    handleWorkspaceCreate,
    handleWorkspaceSwitch,
    openWorkspaceModal,
    openWorkspaceMemberModal,
    handleWorkspaceMemberAdd,
    handleWorkspaceMemberRoleChange,
    handleWorkspaceMemberDelete,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
