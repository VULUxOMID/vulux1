import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAuthRouteRedirect } from './authRouteRedirect';

test('redirects the legacy verify screen back to Apple sign-in without a session', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: false,
      isSignedIn: false,
      needsVerification: false,
      mode: 'verify',
    }),
    '/(auth)/login',
  );
});

test('redirects signed-in users back through the app root', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: false,
      isSignedIn: true,
      needsVerification: false,
      mode: 'login',
    }),
    '/',
  );
});

test('redirects unverified sessions onto the verify screen', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: true,
      mode: 'login',
    }),
    '/(auth)/login',
  );
});

test('keeps syncing sessions on auth screens until the app session is ready', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: false,
      mode: 'login',
    }),
    null,
  );
});

test('redirects unverified sessions away from the legacy verify screen', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: true,
      mode: 'verify',
    }),
    '/(auth)/login',
  );
});

test('redirects verified sessions away from the verify screen', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: false,
      needsVerification: false,
      mode: 'verify',
    }),
    '/(auth)/login',
  );
});

test('keeps update-password reachable for authenticated recovery flows', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: true,
      needsVerification: false,
      mode: 'update-password',
    }),
    null,
  );
});

test('keeps create-password reachable while a verified session is finishing signup', () => {
  assert.equal(
    resolveAuthRouteRedirect({
      isLoaded: true,
      hasSession: true,
      isSignedIn: true,
      needsVerification: false,
      mode: 'create-password',
    }),
    null,
  );
});
