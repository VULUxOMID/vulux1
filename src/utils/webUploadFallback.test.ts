import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readUploadBlob,
  shouldUseWebUploadFallback,
  uploadBlobToSignedUrl,
} from './webUploadFallback';

test('web fallback activates when platform is web', () => {
  assert.equal(
    shouldUseWebUploadFallback('web', {
      getInfoAsync: () => Promise.resolve({}),
      createUploadTask: () => ({}),
    }),
    true,
  );
});

test('web fallback activates when expo file-system APIs are unavailable', () => {
  assert.equal(shouldUseWebUploadFallback('ios', {}), true);
  assert.equal(shouldUseWebUploadFallback('android', { getInfoAsync: () => Promise.resolve({}) }), true);
});

test('readUploadBlob returns blob size from fetch source', async () => {
  const blob = await readUploadBlob(
    'blob:test-upload',
    async () => new Response(new Blob(['abc']), { status: 200 }),
  );

  assert.equal(blob.size, 3);
});

test('uploadBlobToSignedUrl PUTs blob payload and reports progress', async () => {
  const requests: Array<{ url: string; method?: string | undefined; bodySize?: number }> = [];
  const progress: number[] = [];

  await uploadBlobToSignedUrl(
    'https://uploads.example.com/object',
    new Blob(['hello']),
    { 'Content-Type': 'image/png' },
    (value) => progress.push(value),
    async (input, init) => {
      requests.push({
        url: typeof input === 'string' ? input : input.toString(),
        method: init?.method,
        bodySize: init?.body instanceof Blob ? init.body.size : undefined,
      });
      return new Response(null, { status: 200 });
    },
  );

  assert.deepEqual(requests, [
    {
      url: 'https://uploads.example.com/object',
      method: 'PUT',
      bodySize: 5,
    },
  ]);
  assert.deepEqual(progress, [10, 100]);
});
