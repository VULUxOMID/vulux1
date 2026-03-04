import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveHostActiveLiveFallback, mergeHomeLiveNowList } from './liveNowList';

test('host active/minimized live remains visible on Home via fallback', () => {
  const hostFallback = deriveHostActiveLiveFallback({
    queriesEnabled: true,
    isHost: true,
    isLiveEnding: false,
    liveState: 'LIVE_MINIMIZED',
    activeLive: null,
    liveRoom: {
      id: 'live-room-1',
      title: 'Host Room',
      inviteOnly: false,
      hostUser: {
        id: 'host-1',
        name: 'Host One',
        username: 'host_one',
        age: 24,
        country: 'US',
        bio: '',
        avatarUrl: 'https://example.com/host.png',
      },
      streamers: [],
      watchers: [],
      chatMessages: [],
      boostRank: null,
      totalBoosts: 0,
      bannedUserIds: [],
      createdAt: Date.now(),
    },
  });

  assert.ok(hostFallback);
  assert.equal(hostFallback.id, 'live-room-1');

  const merged = mergeHomeLiveNowList([], hostFallback);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, 'live-room-1');
});

test('host fallback does not duplicate a live already in repository', () => {
  const repositoryLives = [
    {
      id: 'live-room-1',
      title: 'Existing',
      viewers: 2,
      boosted: false,
      images: [],
      hosts: [],
    },
  ];

  const merged = mergeHomeLiveNowList(repositoryLives, repositoryLives[0]!);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, 'live-room-1');
});
