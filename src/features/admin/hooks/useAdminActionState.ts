import { useState } from 'react';

import { useAdminToast } from '../components/AdminToastProvider';

export type AsyncActionStatus = 'idle' | 'loading' | 'success' | 'error';

export type ActionState = {
  status: AsyncActionStatus;
  message?: string;
};

export function useAdminActionState() {
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const toast = useAdminToast();

  const setActionState = (key: string, nextState: ActionState) => {
    setActions((prev) => ({
      ...prev,
      [key]: nextState,
    }));
  };

  const clearActionState = (key: string) => {
    setActions((prev) => {
      if (!(key in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const runAction = async (
    key: string,
    action: () => Promise<void>,
    opts: { successMessage: string; errorMessage?: string }
  ) => {
    setActions((prev) => ({
      ...prev,
      [key]: { status: 'loading', message: 'Processing...' },
    }));

    try {
      await action();
      setActions((prev) => ({
        ...prev,
        [key]: { status: 'success', message: opts.successMessage },
      }));
      toast.success(opts.successMessage);
      return true;
    } catch (error) {
      const fallbackError = opts.errorMessage ?? 'Action failed. Please try again.';
      const message = error instanceof Error ? error.message : fallbackError;
      setActions((prev) => ({
        ...prev,
        [key]: { status: 'error', message },
      }));
      toast.error(message);
      return false;
    }
  };

  return {
    actions,
    setActionState,
    clearActionState,
    runAction,
  };
}
