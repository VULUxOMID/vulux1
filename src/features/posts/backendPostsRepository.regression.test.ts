import test from 'node:test';
import assert from 'node:assert/strict';

import { backendPostsRepository } from './backendPostsRepository';
import { seedPosts } from './mockData';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

async function withMockFetch<T>(
  fetchImpl: typeof globalThis.fetch,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL;
  globalThis.fetch = fetchImpl;
  process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL = 'https://backend.example.test';
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL = originalBaseUrl;
    }
  }
}

test('backend hydrate surfaces list failure instead of falling back to mock posts', async () => {
  await withMockFetch(async () => jsonResponse({ message: 'posts backend unavailable' }, 503), async () => {
    await assert.rejects(
      () => backendPostsRepository.hydratePosts(),
      /posts backend unavailable/,
    );
  });
});

test('backend createPost rejects on backend failure and leaves caller state unchanged', async () => {
  const inputPosts = seedPosts.slice(0, 2);
  await withMockFetch(async () => jsonResponse({ message: 'create failed' }, 500), async () => {
    await assert.rejects(
      () => backendPostsRepository.createPost(inputPosts, { text: 'hello world' }),
      /create failed/,
    );
    assert.deepEqual(inputPosts, seedPosts.slice(0, 2));
  });
});
