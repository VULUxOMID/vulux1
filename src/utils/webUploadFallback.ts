type FileSystemLike = {
  getInfoAsync?: unknown;
  createUploadTask?: unknown;
};

export function shouldUseWebUploadFallback(
  platformOs: string,
  fileSystem: FileSystemLike,
): boolean {
  return (
    platformOs === 'web' ||
    typeof fileSystem.getInfoAsync !== 'function' ||
    typeof fileSystem.createUploadTask !== 'function'
  );
}

export async function readUploadBlob(
  uri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchImpl(uri);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    throw new Error(`Could not read the selected file for upload. (${reason})`);
  }

  if (!response.ok) {
    throw new Error(`Could not read the selected file for upload (${response.status})`);
  }

  const blob = await response.blob();
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error('Could not determine upload size');
  }

  return blob;
}

export async function uploadBlobToSignedUrl(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  onProgress?.(10);
  const response = await fetchImpl(url, {
    method: 'PUT',
    headers,
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file to storage (${response.status})`);
  }

  onProgress?.(100);
}
