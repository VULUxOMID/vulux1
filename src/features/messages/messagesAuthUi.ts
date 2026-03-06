import type { SessionGateState } from '../../auth/sessionGate';

export type MessagesEmptyState = {
  title: string;
  subtitle: string;
};

const SIGNED_OUT_EMPTY_STATE: MessagesEmptyState = {
  title: 'Sign in to view DMs',
  subtitle: 'Authentication is required to load your messages.',
};

const RESOLVING_EMPTY_STATE: MessagesEmptyState = {
  title: 'Loading DMs...',
  subtitle: 'Syncing your session and conversations...',
};

const AUTHENTICATED_EMPTY_STATE: MessagesEmptyState = {
  title: 'No DMs yet',
  subtitle: 'Open a profile or a friend to start your first conversation.',
};

export function resolveMessagesEmptyState(
  hasAuthenticatedSession: boolean,
  sessionGate: SessionGateState,
): MessagesEmptyState {
  if (hasAuthenticatedSession) {
    return AUTHENTICATED_EMPTY_STATE;
  }

  if (sessionGate.shouldShowSignInRequired) {
    return SIGNED_OUT_EMPTY_STATE;
  }

  return RESOLVING_EMPTY_STATE;
}
