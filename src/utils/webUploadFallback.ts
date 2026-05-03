type FileSystemLike = {
  getInfoAsync?: unknown;
  createUploadTask?: unknown;
};

function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  return normalized === 'localhost' || normalized === '127.0.0.1';
}

function isPrivateNetworkHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  return (
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

export function resolveUploadSignerBaseUrl(
  baseUrl: string,
  currentHostname?: string | null,
): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const resolved = new URL(trimmed);
    const current = currentHostname ? normalizeHost(currentHostname) : '';
    if (
      current &&
      isLoopbackHost(current) &&
      isPrivateNetworkHost(resolved.hostname) &&
      normalizeHost(resolved.hostname) !== current
    ) {
      resolved.hostname = current;
    }
    return resolved.toString().replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

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
