import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSessionGate } from './sessionGate';

function legacyQueriesEnabled({
  isAuthLoaded,
  isSignedIn,
  userId,
  isFocused,
  isAppActive,
}: {
  isAuthLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  isFocused: boolean;
  isAppActive: boolean;
}): boolean {
  return isAuthLoaded && isSignedIn && Boolean(userId) && isFocused && isAppActive;
}

test('resolveSessionGate marks authenticated foreground access when session is ready', () => {
  const state = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: true,
    isSignedIn: true,
    userId: 'user-1',
    isFocused: true,
    isAppActive: true,
  });

  assert.equal(state.hasAuthenticatedSession, true);
  assert.equal(state.canRunForegroundQueries, true);
  assert.equal(state.shouldShowSignInRequired, false);
  assert.equal(state.isSessionResolving, false);
});

test('resolveSessionGate treats hasSession+not-ready as resolving (not signed out)', () => {
  const state = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: true,
    isSignedIn: false,
    userId: null,
    isFocused: true,
    isAppActive: true,
  });

  assert.equal(state.hasAuthenticatedSession, false);
  assert.equal(state.canRunForegroundQueries, false);
  assert.equal(state.shouldShowSignInRequired, false);
  assert.equal(state.isSessionResolving, true);
});

test('resolveSessionGate shows sign-in required only when no session exists', () => {
  const state = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: false,
    isSignedIn: false,
    userId: null,
  });

  assert.equal(state.hasAuthenticatedSession, false);
  assert.equal(state.canRunForegroundQueries, false);
  assert.equal(state.shouldShowSignInRequired, true);
  assert.equal(state.isSessionResolving, false);
});

test('before fix: legacy gate collapsed authenticated state when screen focus/app-active toggled', () => {
  const enabled = legacyQueriesEnabled({
    isAuthLoaded: true,
    isSignedIn: true,
    userId: 'user-legacy',
    isFocused: false,
    isAppActive: false,
  });

  assert.equal(enabled, false);
});

test('resolveSessionGate keeps authenticated truth when off-focus/off-app', () => {
  const state = resolveSessionGate({
    isAuthLoaded: true,
    hasSession: true,
    isSignedIn: true,
    userId: 'user-2',
    isFocused: false,
    isAppActive: false,
  });

  assert.equal(state.hasAuthenticatedSession, true);
  assert.equal(state.canRunForegroundQueries, false);
  assert.equal(state.shouldShowSignInRequired, false);
  assert.equal(state.isSessionResolving, false);
});
