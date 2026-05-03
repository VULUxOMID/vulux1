import { getConfiguredBackendBaseUrl } from '../../config/backendBaseUrl';
import { readCurrentAuthAccessToken } from '../../auth/currentAuthAccessToken';
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreatePostRequest,
  CreatePostResponse,
  DeleteEntityResponse,
  GetPostDetailResponse,
  ListPostsResponse,
  ReportPostRequest,
  ReportPostResponse,
  SharePostResponse,
  UpdateCommentRequest,
  UpdateCommentResponse,
  UpdatePostRequest,
  UpdatePostResponse,
  VoteCommentRequest,
  VoteCommentResponse,
  VotePostRequest,
  VotePostResponse,
} from './postsApiContract';

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getPostsApiBaseUrl(): string | null {
  const baseUrl = normalize(getConfiguredBackendBaseUrl());
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/api/posts`;
}

async function readBearerToken(): Promise<string | null> {
  return readCurrentAuthAccessToken();
}

async function parseJsonSafely(response: Response): Promise<unknown> {
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

async function requestPostsApi<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = getPostsApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Posts backend base URL is not configured.');
  }

  const token = await readBearerToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? '')
        : `Posts request failed (${response.status})`;
    throw new Error(message || `Posts request failed (${response.status})`);
  }

  return payload as T;
}

export function isPostsApiConfigured() {
  return !!getPostsApiBaseUrl();
}

export function listPostsRequest(): Promise<ListPostsResponse> {
  return requestPostsApi('GET', '');
}

export function getPostDetailRequest(postId: string): Promise<GetPostDetailResponse> {
  return requestPostsApi('GET', `/${encodeURIComponent(postId)}`);
}

export function createPostRequest(request: CreatePostRequest): Promise<CreatePostResponse> {
  return requestPostsApi('POST', '', request);
}

export function updatePostRequest(request: UpdatePostRequest): Promise<UpdatePostResponse> {
  return requestPostsApi('PATCH', `/${encodeURIComponent(request.postId)}`, request);
}

export function deletePostRequest(postId: string): Promise<DeleteEntityResponse> {
  return requestPostsApi('DELETE', `/${encodeURIComponent(postId)}`);
}

export function votePostRequest(request: VotePostRequest): Promise<VotePostResponse> {
  return requestPostsApi('POST', `/${encodeURIComponent(request.postId)}/vote`, request);
}

export function sharePostRequest(postId: string): Promise<SharePostResponse> {
  return requestPostsApi('POST', `/${encodeURIComponent(postId)}/share`);
}

export function reportPostRequest(request: ReportPostRequest): Promise<ReportPostResponse> {
  return requestPostsApi('POST', `/${encodeURIComponent(request.postId)}/report`, request);
}

export function createCommentRequest(request: CreateCommentRequest): Promise<CreateCommentResponse> {
  return requestPostsApi('POST', `/${encodeURIComponent(request.postId)}/comments`, request);
}

export function updateCommentRequest(request: UpdateCommentRequest): Promise<UpdateCommentResponse> {
  return requestPostsApi(
    'PATCH',
    `/${encodeURIComponent(request.postId)}/comments/${encodeURIComponent(request.commentId)}`,
    request,
  );
}

export function deleteCommentRequest(
  postId: string,
  commentId: string,
): Promise<DeleteEntityResponse> {
  return requestPostsApi(
    'DELETE',
    `/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
  );
}

export function voteCommentRequest(request: VoteCommentRequest): Promise<VoteCommentResponse> {
  return requestPostsApi(
    'POST',
    `/${encodeURIComponent(request.postId)}/comments/${encodeURIComponent(request.commentId)}/vote`,
    request,
  );
}
