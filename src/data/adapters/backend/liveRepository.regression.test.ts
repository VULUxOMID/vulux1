import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import type { ListLivesResponse } from '../../contracts';
import {
  createBackendLiveRepository,
  resetLiveDiscoveryVisibilityStateForTests,
} from './liveRepository';
import { EMPTY_BACKEND_SNAPSHOT, type BackendSnapshot } from './snapshot';

function makeIterTable<T>(rows: T[]) {
  return {
    iter: () => rows[Symbol.iterator](),
  };
}

function createSnapshot(lives: ListLivesResponse): BackendSnapshot {
  return {
    ...EMPTY_BACKEND_SNAPSHOT,
    lives,
  };
}

function createRepo(snapshot: BackendSnapshot, runtime: unknown) {
  return (createBackendLiveRepository as any)(snapshot, runtime);
}

const originalDateNow = Date.now;

beforeEach(() => {
  resetLiveDiscoveryVisibilityStateForTests();
  Date.now = originalDateNow;
});

afterEach(() => {
  resetLiveDiscoveryVisibilityStateForTests();
  Date.now = originalDateNow;
});

test('discovery rows present -> Home uses discovery list', () => {
  const snapshot = createSnapshot([
    {
      id: 'snapshot-ghost',
      title: 'Ghost Snapshot',
      viewers: 99,
      boosted: false,
      images: [],
      hosts: [],
      inviteOnly: false,
    } as any,
  ]);

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([
        {
          liveId: 'live-1',
          hostUserId: 'host-1',
          hostUsername: 'host_one',
          hostAvatarUrl: 'https://example.com/h1.png',
          title: 'Live One',
          viewerCount: 12,
        },
      ]),
      publicLivePresenceItem: makeIterTable([
        {
          userId: 'host-1',
          liveId: 'live-1',
          activity: 'hosting',
          updatedAt: Date.now(),
        },
      ]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const lives = repo.listLives({ limit: 100 });
  assert.equal(lives.length, 1);
  assert.equal(lives[0]?.id, 'live-1');
  assert.equal(lives[0]?.title, 'Live One');
});

test('discovery requested/active + empty -> stale snapshot ghosts do not reappear', () => {
  const snapshot = createSnapshot([
    {
      id: 'snapshot-ghost',
      title: 'Ghost Snapshot',
      viewers: 88,
      boosted: false,
      images: [],
      hosts: [],
      inviteOnly: false,
    } as any,
  ]);

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const lives = repo.listLives({ limit: 100 });
  assert.deepEqual(lives, []);
});

test('new discovery rows stay visible briefly before ghost filtering resumes', () => {
  const snapshot = createSnapshot([]);
  const startedAtMs = 1_700_000_000_000;
  Date.now = () => startedAtMs;

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([
        {
          liveId: 'ghost-live',
          hostUserId: 'ghost-host',
          hostUsername: 'ghost',
          hostAvatarUrl: 'https://example.com/ghost.png',
          title: 'Ghost Live',
          viewerCount: 1,
        },
      ]),
      publicLivePresenceItem: makeIterTable([]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const lives = repo.listLives({ limit: 100 });
  assert.deepEqual(
    lives.map((live: any) => live.id),
    ['ghost-live'],
  );

  Date.now = () => startedAtMs + 60_000;
  const livesAfterGraceWindow = repo.listLives({ limit: 100 });
  assert.deepEqual(livesAfterGraceWindow, []);
});

test('home can opt out of unconfirmed discovery rows during startup', () => {
  const snapshot = createSnapshot([]);
  Date.now = () => 1_700_000_000_000;

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([
        {
          liveId: 'ghost-live',
          hostUserId: 'ghost-host',
          hostUsername: 'ghost',
          hostAvatarUrl: 'https://example.com/ghost.png',
          title: 'Ghost Live',
          viewerCount: 1,
        },
      ]),
      publicLivePresenceItem: makeIterTable([]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const lives = repo.listLives({ limit: 100, allowUnconfirmedDiscovery: false });
  assert.deepEqual(lives, []);
});

test('discovery rows with fresh hosting presence stay visible after the grace window', () => {
  const snapshot = createSnapshot([]);
  const startedAtMs = 1_700_000_000_000;
  Date.now = () => startedAtMs;
  const discoveryRows = [
    {
      liveId: 'active-live',
      hostUserId: 'host-1',
      hostUsername: 'host_one',
      hostAvatarUrl: 'https://example.com/host.png',
      title: 'Active Live',
      viewerCount: 2,
    },
  ];
  const presenceRows: Array<{
    userId: string;
    liveId: string;
    activity: string;
    updatedAt: number;
  }> = [];

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable(discoveryRows),
      publicLivePresenceItem: makeIterTable(presenceRows),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  assert.deepEqual(
    repo.listLives({ limit: 100 }).map((live: any) => live.id),
    ['active-live'],
  );

  presenceRows.push({
    userId: 'host-1',
    liveId: 'active-live',
    activity: 'hosting',
    updatedAt: startedAtMs + 55_000,
  });

  Date.now = () => startedAtMs + 60_000;
  const lives = repo.listLives({ limit: 100 });
  assert.deepEqual(
    lives.map((live: any) => live.id),
    ['active-live'],
  );
});

test('fallback remains available before discovery is requested/active', () => {
  const snapshot = createSnapshot([
    {
      id: 'snapshot-live',
      title: 'Snapshot Live',
      viewers: 3,
      boosted: false,
      images: [],
      hosts: [],
      inviteOnly: false,
    } as any,
  ]);

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([]),
    },
    isViewRequested: () => false,
    isViewActive: () => false,
  });

  const lives = repo.listLives({ limit: 100 });
  assert.equal(lives.length, 1);
  assert.equal(lives[0]?.id, 'snapshot-live');
});

test('invite-only filtering behavior is unchanged', () => {
  const snapshot = createSnapshot([
    {
      id: 'invite-only-live',
      title: 'Invite Only',
      viewers: 10,
      boosted: false,
      images: [],
      hosts: [],
      inviteOnly: true,
    } as any,
    {
      id: 'public-live',
      title: 'Public Live',
      viewers: 8,
      boosted: false,
      images: [],
      hosts: [],
      inviteOnly: false,
    } as any,
  ]);

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([]),
    },
    isViewRequested: () => false,
    isViewActive: () => false,
  });

  const defaultLives = repo.listLives({ limit: 100 });
  assert.deepEqual(
    defaultLives.map((live: any) => live.id),
    ['public-live'],
  );

  const withInviteOnly = repo.listLives({ limit: 100, includeInviteOnly: true });
  assert.deepEqual(
    withInviteOnly.map((live: any) => live.id).sort(),
    ['invite-only-live', 'public-live'],
  );
});
