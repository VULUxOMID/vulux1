import test from 'node:test';
import assert from 'node:assert/strict';

import type { ListLivesResponse } from '../../contracts';
import { createBackendLiveRepository } from './liveRepository';
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
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const lives = repo.listLives({ limit: 100 });
  assert.deepEqual(lives, []);
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
    defaultLives.map((live) => live.id),
    ['public-live'],
  );

  const withInviteOnly = repo.listLives({ limit: 100, includeInviteOnly: true });
  assert.deepEqual(
    withInviteOnly.map((live) => live.id).sort(),
    ['invite-only-live', 'public-live'],
  );
});
