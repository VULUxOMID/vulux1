import * as FileSystem from 'expo-file-system/legacy';
import { getConfiguredUploadSignerBaseUrl } from '../config/backendBaseUrl';
import { getBackendToken } from './backendToken';
import { getBackendTokenTemplate } from '../config/backendToken';
import { recordUploadedMediaAsset } from './railwayPersistence';

type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;

type UploadMediaKind =
  | 'profile'
  | 'verification'
  | 'chat'
  | 'image'
  | 'audio'
  | 'video'
  | 'music'
  | 'file'
  | 'media';

type UploadMediaOptions = {
  getToken: BackendGetToken;
  uri: string;
  contentType: string;
  mediaType?: UploadMediaKind;
  onProgress?: (progress: number) => void;
};

type UploadMediaResult = {
  objectKey: string;
  publicUrl: string;
};

type UploadTargetResponse = {
  url: string;
  objectKey: string;
  publicUrl?: string | null;
  requiredHeaders?: Record<string, string>;
};

const MEDIA_UPLOAD_TIMEOUT_MS = 60_000;
const isWebUploadRuntime =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function logUploadDiagnostic(message: string, details?: Record<string, unknown>): void {
  if (!isDevRuntime()) {
    return;
  }
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
}

function getUploadSignerBaseUrl(): string {
  return getConfiguredUploadSignerBaseUrl().trim();
}

async function parseSignerJson(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { text } : null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestSignedUploadTarget(
  token: string,
  contentType: string,
  mediaType: UploadMediaKind,
  size: number,
): Promise<UploadTargetResponse> {
  const baseUrl = getUploadSignerBaseUrl();
  if (!baseUrl) {
    throw new Error('Upload signer not configured');
  }

  const presignUrl = `${baseUrl.replace(/\/+$/, '')}/presign`;
  logUploadDiagnostic('[upload] presign -> requesting', { mediaType, size });
  let response: Response;
  try {
    response = await fetch(
      presignUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contentType,
          mediaType,
          size,
        }),
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    throw new Error(
      `Could not reach upload signer at ${presignUrl}. Confirm your backend upload route is reachable from this device. (${reason})`,
    );
  }

  const payload = await parseSignerJson(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : payload && typeof payload.message === 'string'
          ? payload.message
        : `Upload signer request failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload || typeof payload.url !== 'string' || typeof payload.objectKey !== 'string') {
    throw new Error('Upload signer returned an invalid response');
  }

  logUploadDiagnostic('[upload] presign -> ready', { objectKey: payload.objectKey });

  return payload as UploadTargetResponse;
}

async function getFileSizeBytes(uri: string): Promise<number> {
  if (isWebUploadRuntime) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Selected file is no longer available');
    }

    const blob = await response.blob();
    const normalizedSize = Math.max(0, Math.floor(blob.size));
    if (normalizedSize <= 0) {
      throw new Error('Could not determine upload size');
    }

    return normalizedSize;
  }

  const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
  if (!info.exists) {
    throw new Error('Selected file is no longer available');
  }

  const size = typeof (info as { size?: unknown }).size === 'number' ? (info as { size: number }).size : 0;
  const normalizedSize = Math.max(0, Math.floor(size));
  if (normalizedSize <= 0) {
    throw new Error('Could not determine upload size');
  }

  return normalizedSize;
}

async function uploadFileUriToSignedUrl(
  url: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
  requiredHeaders?: Record<string, string>,
): Promise<void> {
  const normalizedHeaders = {
    ...(requiredHeaders ?? {}),
    ...(!requiredHeaders?.['Content-Type'] ? { 'Content-Type': contentType } : {}),
  };

  if (isWebUploadRuntime) {
    onProgress?.(5);
    const fileResponse = await fetch(fileUri);
    if (!fileResponse.ok) {
      throw new Error('Selected file is no longer available');
    }

    const blob = await fileResponse.blob();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, MEDIA_UPLOAD_TIMEOUT_MS);

    try {
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        headers: normalizedHeaders,
        body: blob,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file to storage (${uploadResponse.status})`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Storage upload timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    onProgress?.(100);
    return;
  }

  logUploadDiagnostic('[upload] put -> uploading');
  const uploadTask = FileSystem.createUploadTask(
    url,
    fileUri,
    {
      headers: normalizedHeaders,
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (event) => {
      if (!onProgress || event.totalBytesExpectedToSend <= 0) {
        return;
      }

      const progress = Math.round((event.totalBytesSent / event.totalBytesExpectedToSend) * 100);
      onProgress(Math.max(0, Math.min(progress, 100)));
    },
  );

  const uploadPromise = uploadTask.uploadAsync();
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      void uploadTask.cancelAsync().catch(() => {
        // Ignore cancel errors after timeout.
      });
      reject(new Error('Storage upload timed out'));
    }, MEDIA_UPLOAD_TIMEOUT_MS);

    void uploadPromise.finally(() => {
      clearTimeout(timeoutId);
    });
  });

  const result = await Promise.race([uploadPromise, timeoutPromise]);

  if (!result) {
    throw new Error('Upload canceled');
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Failed to upload file to storage (${result.status})`);
  }

  logUploadDiagnostic('[upload] put -> uploaded');
  onProgress?.(100);
}

export async function uploadMediaAsset({
  getToken,
  uri,
  contentType,
  mediaType = 'media',
  onProgress,
}: UploadMediaOptions): Promise<UploadMediaResult> {
  const size = await getFileSizeBytes(uri);
  const token = await getBackendToken(getToken, getBackendTokenTemplate());
  if (!token) {
    throw new Error('Not authenticated');
  }

  const uploadTarget = await requestSignedUploadTarget(token, contentType, mediaType, size);

  await uploadFileUriToSignedUrl(
    uploadTarget.url,
    uri,
    contentType,
    onProgress,
    uploadTarget.requiredHeaders,
  );

  const publicUrl = uploadTarget.publicUrl ?? uploadTarget.url.split('?')[0];
  if (!publicUrl) {
    throw new Error('Storage upload succeeded without a public URL');
  }

  try {
    logUploadDiagnostic('[upload] metadata -> recording');
    await recordUploadedMediaAsset({
      objectKey: uploadTarget.objectKey,
      publicUrl,
      contentType,
      mediaType,
      size,
      authToken: token,
    });
    logUploadDiagnostic('[upload] metadata -> recorded', { objectKey: uploadTarget.objectKey });
  } catch (error) {
    console.warn('[upload] railway -> metadata recording failed', error);
  }

  return {
    objectKey: uploadTarget.objectKey,
    publicUrl,
  };
}
