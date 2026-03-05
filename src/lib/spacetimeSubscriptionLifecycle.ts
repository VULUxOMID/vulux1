export type ScopedSubscriptionTeardownPlan =
  | 'unsubscribe_now'
  | 'defer_until_applied'
  | 'skip';

function normalizeReason(reason: string): string {
  return reason.trim().toLowerCase();
}

function isConnectionShutdownReason(reason: string): boolean {
  const normalized = normalizeReason(reason);
  return (
    normalized === 'disconnect' ||
    normalized === 'connect_error' ||
    normalized === 'manual_disconnect' ||
    normalized.startsWith('recovery:')
  );
}

export function planScopedSubscriptionTeardown(input: {
  reason: string;
  isActive: boolean;
  isEnded: boolean;
}): ScopedSubscriptionTeardownPlan {
  if (input.isEnded) {
    return 'skip';
  }

  if (isConnectionShutdownReason(input.reason)) {
    return 'skip';
  }

  if (!input.isActive) {
    return 'defer_until_applied';
  }

  return 'unsubscribe_now';
}
