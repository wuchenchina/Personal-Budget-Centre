import { useEffect, useState } from 'react';
import { getPersonalBudgetTemplate } from '../api/templates';
import type { AuthSession } from '../types/auth';
import type { BudgetTemplateDefinition } from '../types/budget';

export function useTemplateController(session: AuthSession | null) {
  const [template, setTemplate] = useState<BudgetTemplateDefinition | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (session === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setTemplate(null);
        setTemplateError(null);
        setIsTemplateLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setIsTemplateLoading(true);
      getPersonalBudgetTemplate()
        .then((nextTemplate) => {
          if (!isMounted) {
            return;
          }
          setTemplate(nextTemplate);
          setTemplateError(null);
        })
        .catch((error: unknown) => {
          if (!isMounted) {
            return;
          }
          setTemplateError(error instanceof Error ? error.message : '加载模板失败。');
        })
        .finally(() => {
          if (isMounted) {
            setIsTemplateLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  return {
    template,
    templateError,
    isTemplateLoading,
  };
}

export type TemplateController = ReturnType<typeof useTemplateController>;
