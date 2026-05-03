// Backend-backed posts repository.
import type { PostItem, PostVote } from './types';
import { CURRENT_POST_USER, seedPosts } from './mockData';
import {
  loadSavedPostIds,
  readCachedSavedPostIds,
  toggleSavedPostId,
} from './postLocalMetadata';
import type {
  CreatePostInput,
  CreatePostResult,
  PostsRepository,
  ReportPostInput,
  UpdatePostsResult,
} from './repository';
import {
  mapGetPostDetailResponseToDomain,
  mapListPostsResponseToDomain,
  mapPostsApiDetailToDomain,
} from './postsApiMappers';
import {
  createCommentRequest,
  createPostRequest,
  deleteCommentRequest,
  deletePostRequest,
  getPostDetailRequest,
  listPostsRequest,
  reportPostRequest,
  sharePostRequest,
  updateCommentRequest,
  updatePostRequest,
  voteCommentRequest,
  votePostRequest,
} from './postsApiRequests';
import {
  type CreateCommentRequest,
  type CreateCommentResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeleteEntityResponse,
  type GetPostDetailResponse,
  type ListPostsResponse,
  type SharePostResponse,
  type UpdateCommentRequest,
  type UpdateCommentResponse,
  type UpdatePostRequest,
  type UpdatePostResponse,
  type VoteCommentRequest,
  type VoteCommentResponse,
  type VotePostRequest,
  type VotePostResponse,
  toPostsApiPostDetail,
  toPostsApiPostSummary,
} from './postsApiContract';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clonePosts(posts: PostItem[]) {
  return JSON.parse(JSON.stringify(posts)) as PostItem[];
}

function updateVoteScore(score: number, current: PostVote, next: PostVote) {
  return score - current + next;
}

let backendMockPostsState: PostItem[] = clonePosts(seedPosts);
let backendDomainCache: PostItem[] = clonePosts(seedPosts);
let savedPostIdsCache = new Set<string>();

function updatePostsResult(posts: PostItem[]) {
  return { posts };
}

function findPost(postId: string) {
  return backendMockPostsState.find((post) => post.id === postId) ?? null;
}

function findDomainPost(posts: PostItem[], postId: string) {
  return posts.find((post) => post.id === postId) ?? null;
}

function applySavedState(posts: PostItem[]) {
  return posts.map((post) => ({
    ...post,
    viewerSaved: savedPostIdsCache.has(post.id),
  }));
}

function syncDomainCacheFromListResponse(response: ListPostsResponse) {
  backendDomainCache = applySavedState(mapListPostsResponseToDomain(response));
}

function mergeDetailIntoDomainCache(post: PostItem | null) {
  if (!post) return;
  const nextPost = {
    ...post,
    viewerSaved: savedPostIdsCache.has(post.id),
  };
  const existing = backendDomainCache.some((item) => item.id === post.id);
  backendDomainCache = existing
    ? backendDomainCache.map((item) => (item.id === post.id ? nextPost : item))
    : [nextPost, ...backendDomainCache];
}

function removeFromDomainCache(postId: string) {
  backendDomainCache = backendDomainCache.filter((post) => post.id !== postId);
}

function replaceOrPrependPost(posts: PostItem[], nextPost: PostItem) {
  const existing = posts.some((post) => post.id === nextPost.id);
  if (existing) {
    return posts.map((post) => (post.id === nextPost.id ? nextPost : post));
  }
  return [nextPost, ...posts];
}

async function listPosts(): Promise<ListPostsResponse> {
  return {
    posts: backendMockPostsState.map(toPostsApiPostSummary),
  };
}

async function getPostDetail(postId: string): Promise<GetPostDetailResponse> {
  const post = findPost(postId);
  return {
    post: post ? toPostsApiPostDetail(post) : null,
  };
}

async function createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
  const nextPost: PostItem = {
    id: request.postId ?? createId('post'),
    author: CURRENT_POST_USER,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    text: request.text.trim(),
    imageUrl: request.imageUrl,
    score: 1,
    viewerVote: 1,
    viewerSaved: false,
    shareCount: 0,
    comments: [],
  };
  backendMockPostsState = [nextPost, ...backendMockPostsState];
  return {
    post: toPostsApiPostDetail(nextPost),
  };
}

async function updatePost(request: UpdatePostRequest): Promise<UpdatePostResponse> {
  backendMockPostsState = backendMockPostsState.map((post) =>
    post.id === request.postId
      ? {
          ...post,
          text: request.text.trim(),
          imageUrl: request.imageUrl?.trim() || undefined,
          updatedAt: Date.now(),
        }
      : post,
  );
  const post = findPost(request.postId);
  return {
    post: post ? toPostsApiPostDetail(post) : null,
  };
}

async function deletePost(postId: string): Promise<DeleteEntityResponse> {
  backendMockPostsState = backendMockPostsState.filter((post) => post.id !== postId);
  return {
    success: true,
    deletedId: postId,
  };
}

async function votePost(request: VotePostRequest): Promise<VotePostResponse> {
  backendMockPostsState = backendMockPostsState.map((post) =>
    post.id === request.postId
      ? {
          ...post,
          score: updateVoteScore(
            post.score,
            post.viewerVote,
            post.viewerVote === request.vote ? 0 : request.vote,
          ),
          viewerVote: post.viewerVote === request.vote ? 0 : request.vote,
        }
      : post,
  );
  const post = findPost(request.postId);
  return {
    post: post ? toPostsApiPostDetail(post) : null,
  };
}

async function createComment(request: CreateCommentRequest): Promise<CreateCommentResponse> {
  let createdCommentId: string | null = request.commentId ?? null;
  backendMockPostsState = backendMockPostsState.map((post) => {
    if (post.id !== request.postId) return post;
    const nextComment = {
      id: request.commentId ?? createId('comment'),
      author: CURRENT_POST_USER,
      text: request.text.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      score: 1,
      viewerVote: 1 as PostVote,
    };
    createdCommentId = nextComment.id;
    return {
      ...post,
      comments: [...post.comments, nextComment],
    };
  });
  const post = findPost(request.postId);
  const comment = post?.comments.find((item) => item.id === createdCommentId) ?? null;
  return {
    post: post ? toPostsApiPostDetail(post) : null,
    comment,
  };
}

async function updateComment(request: UpdateCommentRequest): Promise<UpdateCommentResponse> {
  backendMockPostsState = backendMockPostsState.map((post) => {
    if (post.id !== request.postId) return post;
    return {
      ...post,
      comments: post.comments.map((comment) =>
        comment.id === request.commentId
          ? { ...comment, text: request.text.trim(), updatedAt: Date.now() }
          : comment,
      ),
    };
  });
  const post = findPost(request.postId);
  const comment = post?.comments.find((item) => item.id === request.commentId) ?? null;
  return {
    post: post ? toPostsApiPostDetail(post) : null,
    comment,
  };
}

async function deleteComment(postId: string, commentId: string): Promise<DeleteEntityResponse> {
  backendMockPostsState = backendMockPostsState.map((post) => {
    if (post.id !== postId) return post;
    return {
      ...post,
      comments: post.comments.filter((comment) => comment.id !== commentId),
    };
  });
  return {
    success: true,
    deletedId: commentId,
  };
}

async function voteComment(request: VoteCommentRequest): Promise<VoteCommentResponse> {
  backendMockPostsState = backendMockPostsState.map((post) => {
    if (post.id !== request.postId) return post;
    return {
      ...post,
      comments: post.comments.map((comment) =>
        comment.id === request.commentId
          ? {
              ...comment,
              score: updateVoteScore(
                comment.score,
                comment.viewerVote,
                comment.viewerVote === request.vote ? 0 : request.vote,
              ),
              viewerVote: comment.viewerVote === request.vote ? 0 : request.vote,
            }
          : comment,
      ),
    };
  });
  const post = findPost(request.postId);
  const comment = post?.comments.find((item) => item.id === request.commentId) ?? null;
  return {
    post: post ? toPostsApiPostDetail(post) : null,
    comment,
  };
}

async function sharePost(postId: string): Promise<SharePostResponse> {
  backendMockPostsState = backendMockPostsState.map((post) =>
    post.id === postId
      ? {
          ...post,
          shareCount: post.shareCount + 1,
        }
      : post,
  );
  const post = findPost(postId);
  return {
    post: post ? toPostsApiPostDetail(post) : null,
  };
}

export const backendPostsApiMock = {
  listPosts,
  getPostDetail,
  createPost,
  updatePost,
  deletePost,
  sharePost,
  votePost,
  createComment,
  updateComment,
  deleteComment,
  voteComment,
};

export const backendPostsRepository: PostsRepository = {
  listPosts(posts) {
    return posts;
  },

  getPostDetail(posts, postId) {
    const post = findDomainPost(posts, postId) ?? findDomainPost(backendDomainCache, postId);
    if (!post) return null;

    void getPostDetailRequest(postId)
      .then((response) => {
        const detail = mapGetPostDetailResponseToDomain(response);
        mergeDetailIntoDomainCache(detail);
      })
      .catch(() => {});

    return post;
  },

  async hydratePosts() {
    savedPostIdsCache = await loadSavedPostIds();
    const response = await listPostsRequest();
    syncDomainCacheFromListResponse(response);
    return clonePosts(backendDomainCache);
  },

  async persistPosts(posts) {
    backendDomainCache = clonePosts(posts);
  },

  async createPost(posts, input: CreatePostInput): Promise<CreatePostResult> {
    const postId = createId('post');
    const response = await createPostRequest({
      postId,
      text: input.text,
      imageUrl: input.imageUrl,
    });
    const nextPost = mapPostsApiDetailToDomain(response.post);
    const nextPosts = replaceOrPrependPost(posts, {
      ...nextPost,
      viewerSaved: savedPostIdsCache.has(nextPost.id),
    });
    backendDomainCache = clonePosts(nextPosts);
    return { postId: nextPost.id, posts: nextPosts };
  },

  async updatePost(posts, postId, input) {
    const trimmed = input.text.trim();
    if (!trimmed) return updatePostsResult(posts);

    const response = await updatePostRequest({ postId, text: input.text, imageUrl: input.imageUrl ?? null });
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async deletePost(posts, postId) {
    await deletePostRequest(postId);
    const nextPosts = posts.filter((post) => post.id !== postId);
    backendDomainCache = clonePosts(nextPosts);
    removeFromDomainCache(postId);
    return updatePostsResult(nextPosts);
  },

  toggleSavePost(posts, postId) {
    const nextSaved = !readCachedSavedPostIds().has(postId);
    const nextPosts = posts.map((post) =>
      post.id === postId
        ? {
            ...post,
            viewerSaved: nextSaved,
          }
        : post,
    );
    backendDomainCache = clonePosts(nextPosts);

    void toggleSavedPostId(postId).then((isSaved) => {
      savedPostIdsCache = readCachedSavedPostIds();
      backendDomainCache = backendDomainCache.map((post) =>
        post.id === postId ? { ...post, viewerSaved: isSaved } : post,
      );
    });

    return updatePostsResult(nextPosts);
  },

  async recordPostShare(posts, postId) {
    const response = await sharePostRequest(postId);
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async reportPost(postId: string, input: ReportPostInput) {
    await reportPostRequest({
      postId,
      reason: input.reason,
      details: input.details,
    });
  },

  async votePost(posts, postId, vote: PostVote) {
    const response = await votePostRequest({ postId, vote });
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async addComment(posts, postId, text) {
    const trimmed = text.trim();
    if (!trimmed) return updatePostsResult(posts);
    const commentId = createId('comment');
    const response = await createCommentRequest({ postId, commentId, text });
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async updateComment(posts, postId, commentId, text) {
    const trimmed = text.trim();
    if (!trimmed) return updatePostsResult(posts);
    const response = await updateCommentRequest({ postId, commentId, text });
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async deleteComment(posts, postId, commentId) {
    await deleteCommentRequest(postId, commentId);
    const response = await getPostDetailRequest(postId);
    const detail = mapGetPostDetailResponseToDomain(response);
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },

  async voteComment(posts, postId, commentId, vote: PostVote) {
    const response = await voteCommentRequest({ postId, commentId, vote });
    const detail = response.post ? mapPostsApiDetailToDomain(response.post) : null;
    const nextPosts = detail
      ? posts.map((post) =>
          post.id === postId
            ? { ...detail, viewerSaved: savedPostIdsCache.has(detail.id) }
            : post,
        )
      : posts;
    backendDomainCache = clonePosts(nextPosts);
    return updatePostsResult(nextPosts);
  },
};
