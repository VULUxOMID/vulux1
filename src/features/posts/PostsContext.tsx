import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getInitialPostsState } from './localPostsRepository';
import type {
  CreatePostInput,
  PostsRepository,
  ReportPostInput,
  UpdatePostInput,
} from './repository';
import { selectPostsRepository } from './selectPostsRepository';
import type { PostItem, PostVote } from './types';

type PostsContextValue = {
  posts: PostItem[];
  isHydrating: boolean;
  hydrateError: string | null;
  reloadPosts: () => Promise<void>;
  getPost: (postId: string) => PostItem | null;
  createPost: (input: CreatePostInput) => Promise<string>;
  updatePost: (postId: string, input: UpdatePostInput) => Promise<void>;
  toggleSavePost: (postId: string) => void;
  recordPostShare: (postId: string) => Promise<void>;
  reportPost: (postId: string, input: ReportPostInput) => Promise<void>;
  addComment: (postId: string, text: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  updateComment: (postId: string, commentId: string, text: string) => Promise<void>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  votePost: (postId: string, vote: PostVote) => Promise<void>;
  voteComment: (postId: string, commentId: string, vote: PostVote) => Promise<void>;
};

const PostsContext = createContext<PostsContextValue | null>(null);
const postsRepository: PostsRepository = selectPostsRepository();

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<PostItem[]>(getInitialPostsState);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  const loadStoredPosts = useCallback(
    async (cancelled?: () => boolean) => {
      setHydrateError(null);
      try {
        const hydratedPosts = await postsRepository.hydratePosts();
        if (!hydratedPosts) return;

        if (!cancelled?.()) {
          setPosts(hydratedPosts);
          setHydrateError(null);
        }
      } catch (error) {
        if (!cancelled?.()) {
          setHydrateError(error instanceof Error ? error.message : 'Could not load posts right now.');
        }
      } finally {
        if (!cancelled?.()) {
          setHasHydrated(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void loadStoredPosts(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [loadStoredPosts]);

  useEffect(() => {
    if (!hasHydrated) return;
    void postsRepository.persistPosts(posts).catch(() => {
      // Ignore persistence failures; local state should still work in memory.
    });
  }, [hasHydrated, posts]);

  const value = useMemo<PostsContextValue>(
    () => ({
      posts: postsRepository.listPosts(posts),
      isHydrating: !hasHydrated,
      hydrateError,
      reloadPosts: async () => {
        setHasHydrated(false);
        await loadStoredPosts();
      },
      getPost: (postId) => postsRepository.getPostDetail(posts, postId),
      createPost: async (input) => {
        const result = await postsRepository.createPost(posts, input);
        setPosts(result.posts);
        return result.postId;
      },
      addComment: async (postId, text) => {
        const result = await postsRepository.addComment(posts, postId, text);
        setPosts(result.posts);
      },
      updatePost: async (postId, input) => {
        const result = await postsRepository.updatePost(posts, postId, input);
        setPosts(result.posts);
      },
      toggleSavePost: (postId) => {
        setPosts((current) => postsRepository.toggleSavePost(current, postId).posts);
      },
      recordPostShare: async (postId) => {
        const result = await postsRepository.recordPostShare(posts, postId);
        setPosts(result.posts);
      },
      reportPost: (postId, input) => postsRepository.reportPost(postId, input),
      deletePost: async (postId) => {
        const result = await postsRepository.deletePost(posts, postId);
        setPosts(result.posts);
      },
      updateComment: async (postId, commentId, text) => {
        const result = await postsRepository.updateComment(posts, postId, commentId, text);
        setPosts(result.posts);
      },
      deleteComment: async (postId, commentId) => {
        const result = await postsRepository.deleteComment(posts, postId, commentId);
        setPosts(result.posts);
      },
      votePost: async (postId, vote) => {
        const result = await postsRepository.votePost(posts, postId, vote);
        setPosts(result.posts);
      },
      voteComment: async (postId, commentId, vote) => {
        const result = await postsRepository.voteComment(posts, postId, commentId, vote);
        setPosts(result.posts);
      },
    }),
    [hasHydrated, hydrateError, loadStoredPosts, posts],
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const context = useContext(PostsContext);
  if (!context) {
    throw new Error('usePosts must be used within PostsProvider');
  }
  return context;
}
