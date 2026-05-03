import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendVideoRepository } from './videoRepository';
import { createBackendMusicCatalogRepository } from './musicCatalogRepository';
import { railwayDb } from '../../../lib/railwayRuntime';

function makeIterTable<T>(rows: T[]) {
  return {
    iter: () => rows[Symbol.iterator](),
  };
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function' &&
    typeof (value as { finally?: unknown }).finally === 'function'
  );
}

function withMockRailway<T>(dbView: any, run: () => T): T {
  const originalDb = Object.getOwnPropertyDescriptor(railwayDb, 'db');

  Object.defineProperty(railwayDb, 'db', {
    configurable: true,
    get: () => dbView,
  });

  const restore = () => {
    if (originalDb) {
      Object.defineProperty(railwayDb, 'db', originalDb);
    }
  };

  try {
    const result = run();
    if (isPromiseLike(result)) {
      return result.finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('video repository ignores stale railway compatibility rows and returns backend snapshot only', () => {
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    mediaReadLoaded: true,
    videos: [
      {
        id: 'video-backend-1',
        creatorId: 'creator-1',
        creatorName: 'Backend Creator',
        creatorAvatar: '',
        title: 'Backend Video',
        description: 'from snapshot',
        thumbnailUrl: '',
        videoUrl: 'https://cdn.example/video.mp4',
        price: 0,
        currency: 'cash' as const,
        contentType: 'movie' as const,
        category: 'Gaming' as const,
        tags: ['backend'],
        duration: '3m',
        seasons: undefined,
        episodes: undefined,
        views: 0,
        likes: 0,
        createdAt: 200,
        isLocked: false,
      },
    ],
  };
  const repo = createBackendVideoRepository(snapshot);

  const videos = withMockRailway(
    {
      videoItem: makeIterTable([
        {
          id: 'video-stale-1',
          item: JSON.stringify({
            id: 'video-stale-1',
            title: 'Stale Railway Video',
          }),
        },
      ]),
      globalMessageItem: makeIterTable([
        {
          id: 'video-stale-event',
          item: JSON.stringify({
            eventType: 'video_catalog_item',
            id: 'video-stale-event',
            title: 'Stale Event Video',
          }),
        },
      ]),
    },
    () => repo.listVideos(),
  );

  assert.deepEqual(videos.map((video) => video.id), ['video-backend-1']);
});

test('music catalog repository ignores stale railway compatibility rows and returns backend snapshot only', () => {
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    mediaReadLoaded: true,
    artists: [
      {
        id: 'artist-backend-1',
        name: 'Backend Artist',
        bio: '',
        image: '',
      },
    ],
    tracks: [
      {
        id: 'track-backend-1',
        title: 'Backend Track',
        artist: 'Backend Artist',
        artwork: '',
        duration: 120,
        url: 'https://cdn.example/track.mp3',
      },
    ],
    playlists: [
      {
        id: 'playlist-backend-1',
        title: 'Backend Playlist',
        description: '',
        cover: '',
        tracks: ['track-backend-1'],
      },
    ],
  };
  const repo = createBackendMusicCatalogRepository(snapshot);

  const tracks = withMockRailway(
    {
      artist: makeIterTable([{ id: 'artist-stale-1', name: 'Stale Artist' }]),
      track: makeIterTable([{ id: 'track-stale-1', title: 'Stale Track' }]),
      playlist: makeIterTable([{ id: 'playlist-stale-1', title: 'Stale Playlist' }]),
      playlistTrack: makeIterTable([
        { playlistId: 'playlist-stale-1', trackId: 'track-stale-1', position: 0 },
      ]),
      globalMessageItem: makeIterTable([
        {
          id: 'track-stale-event',
          item: JSON.stringify({
            eventType: 'music_track_item',
            id: 'track-stale-event',
            title: 'Stale Event Track',
          }),
        },
      ]),
    },
    () => repo.listTracks(),
  );
  const playlists = withMockRailway(
    {
      artist: makeIterTable([{ id: 'artist-stale-1', name: 'Stale Artist' }]),
      track: makeIterTable([{ id: 'track-stale-1', title: 'Stale Track' }]),
      playlist: makeIterTable([{ id: 'playlist-stale-1', title: 'Stale Playlist' }]),
      playlistTrack: makeIterTable([
        { playlistId: 'playlist-stale-1', trackId: 'track-stale-1', position: 0 },
      ]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listPlaylists(),
  );

  assert.deepEqual(tracks.map((track) => track.id), ['track-backend-1']);
  assert.deepEqual(playlists.map((playlist) => playlist.id), ['playlist-backend-1']);
});
