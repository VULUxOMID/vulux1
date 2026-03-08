import test from 'node:test';
import assert from 'node:assert/strict';

import type { LeaderboardItem } from './types';
import {
  buildCurrentUserPreviewEntry,
  buildVisibleLeaderboardItems,
  deriveCurrentUserLabels,
  getMeScopeSummary,
} from './viewModel';

const currentUser = {
  uid: 'bbf4613b-2231-42de-96e7-5777e23ce970',
  email: 'misa@example.com',
  displayName: null,
  photoURL: 'https://cdn.example/avatar.png',
};

const currentUserProfile = {
  id: 'bbf4613b-2231-42de-96e7-5777e23ce970',
  name: '',
  username: '',
  avatarUrl: '',
};

test('deriveCurrentUserLabels avoids raw uuid fallbacks', () => {
  const labels = deriveCurrentUserLabels(currentUser, currentUserProfile);

  assert.equal(labels.displayName, 'misa');
  assert.equal(labels.username, 'misa');
  assert.equal(labels.avatarUrl, 'https://cdn.example/avatar.png');
});

test('me scope shows a local current-user preview when authoritative row is missing', () => {
  const currentUserPreview = buildCurrentUserPreviewEntry({
    currentUserEntry: null,
    user: currentUser,
    userProfile: currentUserProfile,
    cashAmount: 5500,
  });

  const items = buildVisibleLeaderboardItems({
    scope: 'me',
    isPublic: true,
    searchQuery: '',
    leaderboardData: [],
    currentUserPreview,
    currentUserId: currentUser.uid,
    acceptedFriendIds: new Set<string>(),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.displayName, 'misa');
  assert.equal(items[0]?.username, 'misa');
  assert.equal(items[0]?.cashAmount, 5500);
  assert.equal(items[0]?.rank, 0);
});

test('privacy toggle hides the self row outside me scope but keeps me scope useful', () => {
  const currentUserPreview = buildCurrentUserPreviewEntry({
    currentUserEntry: {
      id: currentUser.uid,
      rank: 3,
      displayName: currentUser.uid,
      username: currentUser.uid,
      avatarUrl: '',
      cashAmount: 5000,
      isCurrentUser: true,
    },
    user: currentUser,
    userProfile: currentUserProfile,
    cashAmount: 5000,
  });
  const leaderboardData: LeaderboardItem[] = [
    currentUserPreview!,
    {
      id: 'friend-user',
      rank: 2,
      displayName: 'dog',
      username: 'dog',
      avatarUrl: '',
      cashAmount: 7000,
      isFriend: true,
    },
  ];

  const hiddenFromAll = buildVisibleLeaderboardItems({
    scope: 'all',
    isPublic: false,
    searchQuery: '',
    leaderboardData,
    currentUserPreview,
    currentUserId: currentUser.uid,
    acceptedFriendIds: new Set(['friend-user']),
  });
  const visibleInMe = buildVisibleLeaderboardItems({
    scope: 'me',
    isPublic: false,
    searchQuery: '',
    leaderboardData,
    currentUserPreview,
    currentUserId: currentUser.uid,
    acceptedFriendIds: new Set(['friend-user']),
  });

  assert.deepEqual(hiddenFromAll.map((item) => item.id), ['friend-user']);
  assert.deepEqual(visibleInMe.map((item) => item.id), [currentUser.uid]);
  assert.match(getMeScopeSummary(currentUserPreview, false), /hidden from other players/i);
});
