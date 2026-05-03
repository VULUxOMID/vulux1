import type { PostItem, PostVote } from './types';

export type CreatePostInput = {
  text: string;
  imageUrl?: string;
};

export type UpdatePostInput = {
  text: string;
  imageUrl?: string;
};

export type CreatePostResult = {
  postId: string;
  posts: PostItem[];
};

export type UpdatePostsResult = {
  posts: PostItem[];
};

export type ReportPostInput = {
  reason: string;
  details?: string;
};

export interface PostsRepository {
  listPosts(posts: PostItem[]): PostItem[];
  getPostDetail(posts: PostItem[], postId: string): PostItem | null;
  hydratePosts(): Promise<PostItem[] | null>;
  persistPosts(posts: PostItem[]): Promise<void>;
  createPost(posts: PostItem[], input: CreatePostInput): Promise<CreatePostResult>;
  updatePost(posts: PostItem[], postId: string, input: UpdatePostInput): Promise<UpdatePostsResult>;
  deletePost(posts: PostItem[], postId: string): Promise<UpdatePostsResult>;
  toggleSavePost(posts: PostItem[], postId: string): UpdatePostsResult;
  recordPostShare(posts: PostItem[], postId: string): Promise<UpdatePostsResult>;
  reportPost(postId: string, input: ReportPostInput): Promise<void>;
  votePost(posts: PostItem[], postId: string, vote: PostVote): Promise<UpdatePostsResult>;
  addComment(posts: PostItem[], postId: string, text: string): Promise<UpdatePostsResult>;
  updateComment(posts: PostItem[], postId: string, commentId: string, text: string): Promise<UpdatePostsResult>;
  deleteComment(posts: PostItem[], postId: string, commentId: string): Promise<UpdatePostsResult>;
  voteComment(posts: PostItem[], postId: string, commentId: string, vote: PostVote): Promise<UpdatePostsResult>;
}
