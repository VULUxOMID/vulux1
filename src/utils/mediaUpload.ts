import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getBackendToken } from './backendToken';
import { getBackendTokenTemplate } from '../config/backendToken';
import { recordUploadedMediaAsset } from './spacetimePersistence';
import {
  readUploadBlob,
  resolveUploadSignerBaseUrl,
  shouldUseWebUploadFallback,
  uploadBlobToSignedUrl,
} from './webUploadFallback';

type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;

type UploadMediaKind =
  | 'profile'
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
  webUploadUrl?: string | null;
  objectKey: string;
  publicUrl?: string | null;
  requiredHeaders?: Record<string, string>;
};

const MEDIA_UPLOAD_TIMEOUT_MS = 60_000;

function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getUploadSignerBaseUrl(): string {
  const configured = trim(process.env.EXPO_PUBLIC_UPLOAD_SIGNER_URL) ?? '';
  const currentHostname =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : undefined;
  return resolveUploadSignerBaseUrl(configured, currentHostname);
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
  console.log('[upload] presign -> requesting');
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
      `Could not reach upload signer at ${presignUrl}. Start backend signer and confirm your phone can access your Mac on port 3000. (${reason})`,
    );
  }

  const payload = await parseSignerJson(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `Upload signer request failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload || typeof payload.url !== 'string' || typeof payload.objectKey !== 'string') {
    throw new Error('Upload signer returned an invalid response');
  }

  console.log('[upload] presign -> ready');

  return payload as UploadTargetResponse;
}

async function getFileSizeBytes(uri: string): Promise<number> {
  if (shouldUseWebUploadFallback(Platform.OS, FileSystem)) {
    const blob = await readUploadBlob(uri);
    return blob.size;
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

  if (shouldUseWebUploadFallback(Platform.OS, FileSystem)) {
    console.log('[upload] put -> uploading (web)');
    const blob = await readUploadBlob(fileUri);
    await uploadBlobToSignedUrl(url, blob, normalizedHeaders, onProgress);
    console.log('[upload] put -> uploaded');
    return;
  }

  console.log('[upload] put -> uploading');
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

  console.log('[upload] put -> uploaded');
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
  const useWebProxy = shouldUseWebUploadFallback(Platform.OS, FileSystem) && !!uploadTarget.webUploadUrl;
  const uploadUrl = useWebProxy ? uploadTarget.webUploadUrl ?? uploadTarget.url : uploadTarget.url;
  const uploadHeaders = useWebProxy
    ? {
        ...(uploadTarget.requiredHeaders ?? {}),
        Authorization: `Bearer ${token}`,
      }
    : uploadTarget.requiredHeaders;

  await uploadFileUriToSignedUrl(
    uploadUrl,
    uri,
    contentType,
    onProgress,
    uploadHeaders,
  );

  const publicUrl = uploadTarget.publicUrl ?? uploadTarget.url.split('?')[0];
  if (!publicUrl) {
    throw new Error('Storage upload succeeded without a public URL');
  }

  try {
    console.log('[upload] spacetime -> recording metadata');
    await recordUploadedMediaAsset({
      objectKey: uploadTarget.objectKey,
      publicUrl,
      contentType,
      mediaType,
      size,
    });
    console.log('[upload] spacetime -> metadata recorded');
  } catch (error) {
    console.warn('[upload] spacetime -> metadata recording failed', error);
    throw error instanceof Error ? error : new Error('Failed to record upload metadata');
  }

  return {
    objectKey: uploadTarget.objectKey,
    publicUrl,
  };
}
