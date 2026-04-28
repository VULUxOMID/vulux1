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

function makeFindTable<T extends { id: string }>(rows: T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    id: {
      find: (id: string) => byId.get(id) ?? null,
    },
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

test('discovery rows without fresh hosting presence are filtered as ghosts', () => {
  const snapshot = createSnapshot([]);

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
  assert.deepEqual(lives, []);
});

test('findLiveById does not revive snapshot ghosts once discovery is authoritative and empty', () => {
  const snapshot = createSnapshot([
    {
      id: 'ghost-live',
      title: 'Ghost Snapshot',
      viewers: 42,
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
      liveItem: makeFindTable([
        {
          id: 'ghost-live',
          item: JSON.stringify({
            id: 'ghost-live',
            title: 'Ghost Detailed Row',
            viewers: 42,
            boosted: false,
            images: [],
            hosts: [],
            inviteOnly: false,
          }),
        },
      ]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  assert.equal(repo.findLiveById('ghost-live'), undefined);
});

test('findLiveById ignores detailed rows without fresh hosting presence', () => {
  const snapshot = createSnapshot([]);

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
      liveItem: makeFindTable([
        {
          id: 'ghost-live',
          item: JSON.stringify({
            id: 'ghost-live',
            title: 'Ghost Detailed Row',
            viewers: 1,
            boosted: false,
            images: [],
            hosts: [
              {
                id: 'ghost-host',
                name: 'ghost',
                avatar: 'https://example.com/ghost.png',
              },
            ],
            ownerUserId: 'ghost-host',
            inviteOnly: false,
          }),
        },
      ]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  assert.equal(repo.findLiveById('ghost-live'), undefined);
});

test('findLiveById returns detailed live data when discovery row is still authoritative', () => {
  const snapshot = createSnapshot([]);

  const repo = createRepo(snapshot, {
    dbView: {
      publicLiveDiscovery: makeIterTable([
        {
          liveId: 'live-1',
          hostUserId: 'host-1',
          hostUsername: 'host_one',
          hostAvatarUrl: 'https://example.com/h1.png',
          title: 'Discovery Title',
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
      liveItem: makeFindTable([
        {
          id: 'live-1',
          item: JSON.stringify({
            id: 'live-1',
            title: 'Detailed Title',
            viewers: 15,
            boosted: true,
            images: ['https://example.com/detail.png'],
            hosts: [
              {
                id: 'host-1',
                username: 'host_one',
                name: 'Host One',
                avatar: 'https://example.com/h1.png',
              },
            ],
            ownerUserId: 'host-1',
            inviteOnly: false,
            bannedUserIds: ['banned-1'],
          }),
        },
      ]),
    },
    isViewRequested: () => true,
    isViewActive: () => true,
  });

  const live = repo.findLiveById('live-1');
  assert.ok(live);
  assert.equal(live.id, 'live-1');
  assert.equal(live.title, 'Detailed Title');
  assert.equal((live as any).ownerUserId, 'host-1');
  assert.deepEqual((live as any).bannedUserIds, ['banned-1']);
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
    defaultLives.map((live: { id: string }) => live.id),
    ['public-live'],
  );

  const withInviteOnly = repo.listLives({ limit: 100, includeInviteOnly: true });
  assert.deepEqual(
    withInviteOnly.map((live: { id: string }) => live.id).sort(),
    ['invite-only-live', 'public-live'],
  );
});
