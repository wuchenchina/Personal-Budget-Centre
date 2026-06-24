import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Form } from 'antd';
import {
  addWorkspaceMember,
  createWorkspace,
  deleteWorkspace,
  deleteWorkspaceMember,
  listWorkspaceMembers,
  listWorkspaces,
  switchWorkspace,
  updateWorkspace,
  updateWorkspaceMember,
} from '../api/workspaces';
import { listCurrencies } from '../api/referenceData';
import type { AuthSession, AuthWorkspace, WorkspaceMember } from '../types/auth';
import type { CurrencyCode, WorkspaceRole } from '../types/budget';
import type {
  WorkspaceEditFormValues,
  WorkspaceMemberFormValues,
  WorkspaceFormValues,
} from '../types/forms';
import { toCurrencyCode } from '../utils/currencyCode';
import { translateCurrent } from '../i18n';

export function useWorkspaceController(
  session: AuthSession | null,
  setSession: Dispatch<SetStateAction<AuthSession | null>>,
) {
  const [workspaceForm] = Form.useForm<WorkspaceFormValues>();
  const [workspaceEditForm] = Form.useForm<WorkspaceEditFormValues>();
  const [workspaceMemberForm] = Form.useForm<WorkspaceMemberFormValues>();
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isWorkspaceEditModalOpen, setIsWorkspaceEditModalOpen] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceMemberError, setWorkspaceMemberError] = useState<string | null>(null);
  const [isWorkspaceMemberModalOpen, setIsWorkspaceMemberModalOpen] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isWorkspaceCreating, setIsWorkspaceCreating] = useState(false);
  const [isWorkspaceUpdating, setIsWorkspaceUpdating] = useState(false);
  const [isWorkspaceDeleting, setIsWorkspaceDeleting] = useState(false);
  const [isWorkspaceSwitching, setIsWorkspaceSwitching] = useState(false);
  const [isWorkspaceMemberLoading, setIsWorkspaceMemberLoading] = useState(false);
  const [isWorkspaceMemberSaving, setIsWorkspaceMemberSaving] = useState(false);
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<number | null>(null);
  const [deletingMemberUserId, setDeletingMemberUserId] = useState<number | null>(null);
  const activeWorkspaceId = session?.workspace?.id ?? null;
  const workspaceRole = session?.workspace?.role;
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

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
      const defaultCurrency = await validatedWorkspaceCurrency(values.defaultCurrency);

      const nextWorkspace = await createWorkspace({
        name: values.name.trim(),
        type: values.type,
        defaultCurrency,
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

  const openWorkspaceEditModal = () => {
    if (activeWorkspace === null) {
      setWorkspaceError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    setWorkspaceError(null);
    workspaceEditForm.setFieldsValue({
      name: activeWorkspace.name,
      type: activeWorkspace.type,
      defaultCurrency: activeWorkspace.defaultCurrency ?? 'CNY',
    });
    setIsWorkspaceEditModalOpen(true);
  };

  const handleWorkspaceUpdate = async () => {
    if (activeWorkspaceId === null || activeWorkspace === null) {
      setWorkspaceError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    try {
      const values = await workspaceEditForm.validateFields();
      setIsWorkspaceUpdating(true);
      setWorkspaceError(null);
      const defaultCurrency = await validatedWorkspaceCurrency(values.defaultCurrency);

      const updatedWorkspace = await updateWorkspace({
        workspaceId: activeWorkspaceId,
        name: values.name.trim(),
        type: activeWorkspace.type === 'personal' ? 'personal' : values.type,
        defaultCurrency,
      });

      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) =>
          workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace,
        ),
      );
      setSession((currentSession) =>
        currentSession === null
          ? currentSession
          : {
              ...currentSession,
              workspace:
                currentSession.workspace?.id === updatedWorkspace.id
                  ? updatedWorkspace
                  : currentSession.workspace,
            },
      );
      setIsWorkspaceEditModalOpen(false);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setWorkspaceError(error.message);
      }
    } finally {
      setIsWorkspaceUpdating(false);
    }
  };

  const handleWorkspaceDelete = async () => {
    if (activeWorkspaceId === null || activeWorkspace === null) {
      setWorkspaceError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    setIsWorkspaceDeleting(true);
    setWorkspaceError(null);

    try {
      const nextWorkspace = await deleteWorkspace(activeWorkspaceId);
      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.filter((workspace) => workspace.id !== activeWorkspaceId),
      );
      setWorkspaceMembers([]);
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
      setIsWorkspaceDeleting(false);
    }
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
    workspaceEditForm,
    workspaceMemberForm,
    workspaces,
    activeWorkspace,
    workspaceError,
    setWorkspaceError,
    isWorkspaceModalOpen,
    setIsWorkspaceModalOpen,
    isWorkspaceEditModalOpen,
    setIsWorkspaceEditModalOpen,
    workspaceMembers,
    workspaceMemberError,
    isWorkspaceMemberModalOpen,
    setIsWorkspaceMemberModalOpen,
    isWorkspaceLoading,
    isWorkspaceCreating,
    isWorkspaceUpdating,
    isWorkspaceDeleting,
    isWorkspaceSwitching,
    isWorkspaceMemberLoading,
    isWorkspaceMemberSaving,
    updatingMemberUserId,
    deletingMemberUserId,
    activeWorkspaceId,
    workspaceRole,
    workspaceOptions,
    handleWorkspaceCreate,
    handleWorkspaceUpdate,
    handleWorkspaceDelete,
    handleWorkspaceSwitch,
    openWorkspaceModal,
    openWorkspaceEditModal,
    openWorkspaceMemberModal,
    handleWorkspaceMemberAdd,
    handleWorkspaceMemberRoleChange,
    handleWorkspaceMemberDelete,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;

async function validatedWorkspaceCurrency(value: string | undefined): Promise<CurrencyCode> {
  const currency = toCurrencyCode(value);

  try {
    const currencies = await listCurrencies();
    if (currencies.length > 0 && !currencies.some((item) => item.code === currency)) {
      throw new Error(translateCurrent('supportedCurrencyOnly'));
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === translateCurrent('supportedCurrencyOnly')) {
      throw error;
    }
  }

  return currency;
}
