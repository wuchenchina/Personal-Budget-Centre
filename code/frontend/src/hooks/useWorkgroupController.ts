import { useEffect, useState } from 'react';
import { Form } from 'antd';
import {
  createWorkgroup,
  deleteWorkgroup,
  listWorkgroups,
  updateWorkgroup,
  type Workgroup,
} from '../api/workgroups';
import type { WorkgroupFormValues } from '../types/forms';

export function useWorkgroupController(activeWorkspaceId: number | null) {
  const [workgroupForm] = Form.useForm<WorkgroupFormValues>();
  const [workgroups, setWorkgroups] = useState<Workgroup[]>([]);
  const [editingWorkgroup, setEditingWorkgroup] = useState<Workgroup | null>(null);
  const [workgroupError, setWorkgroupError] = useState<string | null>(null);
  const [isWorkgroupModalOpen, setIsWorkgroupModalOpen] = useState(false);
  const [isWorkgroupLoading, setIsWorkgroupLoading] = useState(false);
  const [isWorkgroupSaving, setIsWorkgroupSaving] = useState(false);
  const [deletingWorkgroupId, setDeletingWorkgroupId] = useState<number | null>(null);

  useEffect(() => {
    if (activeWorkspaceId === null) {
      setWorkgroups([]);
      setWorkgroupError(null);
      setIsWorkgroupLoading(false);

      return;
    }

    let isMounted = true;
    setIsWorkgroupLoading(true);

    listWorkgroups(activeWorkspaceId)
      .then((nextWorkgroups) => {
        if (isMounted) {
          setWorkgroups(nextWorkgroups);
          setWorkgroupError(null);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setWorkgroupError(error instanceof Error ? error.message : '加载工作组失败。');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsWorkgroupLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  const openWorkgroupModal = (workgroup: Workgroup | null = null) => {
    setEditingWorkgroup(workgroup);
    setWorkgroupError(null);
    setIsWorkgroupModalOpen(true);

    if (workgroup === null) {
      workgroupForm.resetFields();
    } else {
      workgroupForm.setFieldsValue({
        name: workgroup.name,
        description: workgroup.description ?? undefined,
      });
    }
  };

  const handleWorkgroupSave = async () => {
    if (activeWorkspaceId === null) {
      setWorkgroupError('请先选择工作区，再创建工作组。');

      return;
    }

    try {
      const values = await workgroupForm.validateFields();
      setIsWorkgroupSaving(true);
      setWorkgroupError(null);

      const payload = {
        workspaceId: activeWorkspaceId,
        name: values.name.trim(),
        description: values.description?.trim() || null,
      };
      const savedWorkgroup =
        editingWorkgroup === null
          ? await createWorkgroup(payload)
          : await updateWorkgroup({
              ...payload,
              id: editingWorkgroup.id,
            });

      setWorkgroups((currentWorkgroups) =>
        editingWorkgroup === null
          ? [...currentWorkgroups, savedWorkgroup]
          : currentWorkgroups.map((workgroup) =>
              workgroup.id === savedWorkgroup.id ? savedWorkgroup : workgroup,
            ),
      );
      setIsWorkgroupModalOpen(false);
      setEditingWorkgroup(null);
      workgroupForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setWorkgroupError(error.message);
      }
    } finally {
      setIsWorkgroupSaving(false);
    }
  };

  const handleWorkgroupDelete = async (workgroupId: number) => {
    setDeletingWorkgroupId(workgroupId);
    setWorkgroupError(null);

    try {
      await deleteWorkgroup(workgroupId);
      setWorkgroups((currentWorkgroups) =>
        currentWorkgroups.filter((workgroup) => workgroup.id !== workgroupId),
      );
    } catch (error: unknown) {
      setWorkgroupError(error instanceof Error ? error.message : '删除工作组失败。');
    } finally {
      setDeletingWorkgroupId(null);
    }
  };

  return {
    workgroupForm,
    workgroups,
    editingWorkgroup,
    setEditingWorkgroup,
    workgroupError,
    isWorkgroupModalOpen,
    setIsWorkgroupModalOpen,
    isWorkgroupLoading,
    isWorkgroupSaving,
    deletingWorkgroupId,
    openWorkgroupModal,
    handleWorkgroupSave,
    handleWorkgroupDelete,
  };
}

export type WorkgroupController = ReturnType<typeof useWorkgroupController>;
