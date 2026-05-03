import assert from 'node:assert/strict';
import test from 'node:test';

import { submitGoLiveStart } from './goLiveStartSubmission';

test('failed single tap clears pending state and allows a clean retry', async () => {
  const pendingRef = { current: false };
  const pendingTransitions: boolean[] = [];
  const startErrorTransitions: Array<string | null> = [];
  const toastMessages: string[] = [];
  const navigationIds: string[] = [];

  let startCallCount = 0;
  const startLive = async () => {
    startCallCount += 1;
    if (startCallCount === 1) {
      return {
        ok: false as const,
        code: 'unknown' as const,
        message: 'Start failed once',
      };
    }
    return {
      ok: true as const,
      liveId: 'live-retry-success',
    };
  };

  const params = {
    title: 'Retry Live',
    inviteOnly: false,
    pendingRef,
    startLive,
    setPendingStart: (pending: boolean) => {
      pendingTransitions.push(pending);
    },
    setStartError: (error: string | null) => {
      startErrorTransitions.push(error);
    },
    showStartErrorToast: (message: string) => {
      toastMessages.push(message);
    },
    navigateToLive: (liveId: string) => {
      navigationIds.push(liveId);
    },
  };

  await submitGoLiveStart(params);

  assert.equal(startCallCount, 1);
  assert.equal(pendingRef.current, false);
  assert.deepEqual(navigationIds, []);
  assert.equal(toastMessages.length, 1);
  assert.equal(toastMessages[0], 'Start failed once');

  await submitGoLiveStart(params);

  assert.equal(startCallCount, 2);
  assert.equal(pendingRef.current, false);
  assert.deepEqual(navigationIds, ['live-retry-success']);
  assert.deepEqual(pendingTransitions, [true, false, true, false]);
  assert.deepEqual(startErrorTransitions, [null, 'Start failed once', null, null]);
});

test('rapid double tap only triggers one in-flight start attempt', async () => {
  const pendingRef = { current: false };
  const pendingTransitions: boolean[] = [];
  const toastMessages: string[] = [];
  const navigationIds: string[] = [];

  let resolveStart!: (value: { ok: true; liveId: string }) => void;
  let startCallCount = 0;
  const startLive = async () => {
    startCallCount += 1;
    return await new Promise<{ ok: true; liveId: string }>((resolve) => {
      resolveStart = resolve;
    });
  };

  const params = {
    title: 'Single Flight',
    inviteOnly: true,
    pendingRef,
    startLive,
    setPendingStart: (pending: boolean) => {
      pendingTransitions.push(pending);
    },
    setStartError: () => {},
    showStartErrorToast: (message: string) => {
      toastMessages.push(message);
    },
    navigateToLive: (liveId: string) => {
      navigationIds.push(liveId);
    },
  };

  const firstTapPromise = submitGoLiveStart(params);
  const secondTapPromise = submitGoLiveStart(params);

  assert.equal(startCallCount, 1);
  assert.equal(pendingRef.current, true);

  resolveStart({ ok: true, liveId: 'live-single-flight' });
  await Promise.all([firstTapPromise, secondTapPromise]);

  assert.equal(startCallCount, 1);
  assert.equal(pendingRef.current, false);
  assert.deepEqual(navigationIds, ['live-single-flight']);
  assert.equal(toastMessages.length, 0);
  assert.deepEqual(pendingTransitions, [true, false]);
});
