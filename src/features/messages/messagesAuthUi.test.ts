import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSessionGate } from '../../auth/sessionGate';
import { resolveMessagesEmptyState } from './messagesAuthUi';

function legacyResolveMessagesEmptyState(queriesEnabled: boolean) {
  return {
    title: queriesEnabled ? 'No DMs yet' : 'Sign in to view DMs',
    subtitle: queriesEnabled
      ? 'Open a profile or a friend to start your first conversation.'
      : 'Authentication is required to load your messages.',
  };
}

test('before fix: legacy messages empty state incorrectly reports signed-out during session sync', () => {
  const legacyState = legacyResolveMessagesEmptyState(false);
  assert.equal(legacyState.title, 'Sign in to view DMs');
  assert.equal(legacyState.subtitle, 'Authentication is required to load your messages.');
});

test('messages empty state stays loading during session sync (no false signed-out)', () => {
  const sessionGate = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: true,
    isSignedIn: false,
    userId: null,
  });

  const emptyState = resolveMessagesEmptyState(false, sessionGate);
  assert.equal(emptyState.title, 'Loading DMs...');
  assert.equal(emptyState.subtitle, 'Syncing your session and conversations...');
});

test('messages empty state shows sign-in required only when no session exists', () => {
  const sessionGate = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: false,
    isSignedIn: false,
    userId: null,
  });

  const emptyState = resolveMessagesEmptyState(false, sessionGate);
  assert.equal(emptyState.title, 'Sign in to view DMs');
  assert.equal(emptyState.subtitle, 'Authentication is required to load your messages.');
});

test('messages empty state shows DM onboarding for authenticated users', () => {
  const sessionGate = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: true,
    isSignedIn: true,
    userId: 'user-1',
  });

  const emptyState = resolveMessagesEmptyState(true, sessionGate);
  assert.equal(emptyState.title, 'No DMs yet');
  assert.equal(emptyState.subtitle, 'Open a profile or a friend to start your first conversation.');
});
