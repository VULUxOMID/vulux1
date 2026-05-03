import AsyncStorage from '@react-native-async-storage/async-storage';

import { CURRENT_POST_USER, seedPosts } from './mockData';
import { recordReportedPostStub } from './postLocalMetadata';
import type { PostComment, PostItem, PostVote } from './types';
import type {
  CreatePostInput,
  PostsRepository,
  ReportPostInput,
  UpdatePostInput,
} from './repository';

const POSTS_STORAGE_KEY = '@vulu_posts_state';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateVoteScore(score: number, current: PostVote, next: PostVote) {
  return score - current + next;
}

function updatePostsResult(posts: PostItem[]) {
  return { posts };
}

function normalizePosts(posts: PostItem[]) {
  return posts.map((post) => ({
    ...post,
    viewerSaved: Boolean(post.viewerSaved),
  }));
}

export const localPostsRepository: PostsRepository = {
  listPosts(posts) {
    return posts;
  },

  getPostDetail(posts, postId) {
    return posts.find((post) => post.id === postId) ?? null;
  },

  async hydratePosts() {
    try {
      const stored = await AsyncStorage.getItem(POSTS_STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? normalizePosts(parsed as PostItem[]) : null;
    } catch {
      return null;
    }
  },

  async persistPosts(posts) {
    await AsyncStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts));
  },

  async createPost(posts, input: CreatePostInput) {
    const nextPost: PostItem = {
      id: createId('post'),
      author: CURRENT_POST_USER,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      text: input.text.trim(),
      imageUrl: input.imageUrl,
      score: 1,
      viewerVote: 1,
      viewerSaved: false,
      shareCount: 0,
      comments: [],
    };

    return {
      postId: nextPost.id,
      posts: [nextPost, ...posts],
    };
  },

  async updatePost(posts, postId, input: UpdatePostInput) {
    const trimmed = input.text.trim();
    if (!trimmed) return updatePostsResult(posts);

    return updatePostsResult(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              text: trimmed,
              imageUrl: input.imageUrl?.trim() || undefined,
              updatedAt: Date.now(),
            }
          : post,
      ),
    );
  },

  async deletePost(posts, postId) {
    return updatePostsResult(posts.filter((post) => post.id !== postId));
  },

  toggleSavePost(posts, postId) {
    const now = Date.now();
    return updatePostsResult(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              viewerSaved: !post.viewerSaved,
              updatedAt: now,
            }
          : post,
      ),
    );
  },

  async recordPostShare(posts, postId) {
    const now = Date.now();
    return updatePostsResult(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              shareCount: post.shareCount + 1,
              updatedAt: now,
            }
          : post,
      ),
    );
  },

  async reportPost(postId: string, input: ReportPostInput) {
    await recordReportedPostStub({
      postId,
      reason: input.reason,
      details: input.details,
    });
  },

  async votePost(posts, postId, vote) {
    return updatePostsResult(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              score: updateVoteScore(post.score, post.viewerVote, post.viewerVote === vote ? 0 : vote),
              viewerVote: post.viewerVote === vote ? 0 : vote,
            }
          : post,
      ),
    );
  },

  async addComment(posts, postId, text) {
    const trimmed = text.trim();
    if (!trimmed) return updatePostsResult(posts);

    const now = Date.now();
    return updatePostsResult(
      posts.map((post) => {
        if (post.id !== postId) return post;

        const nextComment: PostComment = {
          id: createId('comment'),
          author: CURRENT_POST_USER,
          text: trimmed,
          createdAt: now,
          updatedAt: now,
          score: 1,
          viewerVote: 1,
        };

        return {
          ...post,
          comments: [...post.comments, nextComment],
          commentCount: (post.commentCount ?? post.comments.length) + 1,
          updatedAt: now,
        };
      }),
    );
  },

  async updateComment(posts, postId, commentId, text) {
    const trimmed = text.trim();
    if (!trimmed) return updatePostsResult(posts);

    const now = Date.now();
    return updatePostsResult(
      posts.map((post) => {
        if (post.id !== postId) return post;

        return {
          ...post,
          comments: post.comments.map((comment) =>
            comment.id === commentId ? { ...comment, text: trimmed, updatedAt: now } : comment,
          ),
          updatedAt: now,
        };
      }),
    );
  },

  async deleteComment(posts, postId, commentId) {
    const now = Date.now();
    return updatePostsResult(
      posts.map((post) => {
        if (post.id !== postId) return post;

        return {
          ...post,
          comments: post.comments.filter((comment) => comment.id !== commentId),
          commentCount: Math.max(0, (post.commentCount ?? post.comments.length) - 1),
          updatedAt: now,
        };
      }),
    );
  },

  async voteComment(posts, postId, commentId, vote) {
    return updatePostsResult(
      posts.map((post) => {
        if (post.id !== postId) return post;

        return {
          ...post,
          comments: post.comments.map((comment) =>
            comment.id === commentId
              ? {
                  ...comment,
                  score: updateVoteScore(
                    comment.score,
                    comment.viewerVote,
                    comment.viewerVote === vote ? 0 : vote,
                  ),
                  viewerVote: comment.viewerVote === vote ? 0 : vote,
                }
              : comment,
          ),
        };
      }),
    );
  },
};

export function getInitialPostsState() {
  return seedPosts;
}
