import { useEffect, useState } from 'react';
import { getPersonalBudgetTemplate } from '../api/templates';
import type { AuthSession } from '../types/auth';
import type { BudgetTemplateDefinition } from '../types/budget';

export function useTemplateController(session: AuthSession | null) {
  const [template, setTemplate] = useState<BudgetTemplateDefinition | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);

  useEffect(() => {
    if (session === null) {
      setTemplate(null);
      setTemplateError(null);
      setIsTemplateLoading(false);

      return;
    }

    let isMounted = true;
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
        setTemplateError(error instanceof Error ? error.message : 'Failed to load template.');
      })
      .finally(() => {
        if (isMounted) {
          setIsTemplateLoading(false);
        }
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
