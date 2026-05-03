import type { PostAuthor, PostComment, PostItem, PostVote } from './types';

export type PostsApiAuthor = PostAuthor;

export type PostsApiComment = PostComment;

export type PostsApiPostSummary = Pick<
  PostItem,
  'id' | 'createdAt' | 'updatedAt' | 'title' | 'text' | 'imageUrl' | 'score' | 'viewerVote' | 'shareCount'
> & {
  author: PostsApiAuthor;
  commentCount: number;
};

export type PostsApiPostDetail = Pick<
  PostItem,
  'id' | 'createdAt' | 'updatedAt' | 'title' | 'text' | 'imageUrl' | 'score' | 'viewerVote' | 'shareCount'
> & {
  author: PostsApiAuthor;
  comments: PostsApiComment[];
};

export type ListPostsResponse = {
  posts: PostsApiPostSummary[];
};

export type GetPostDetailResponse = {
  post: PostsApiPostDetail | null;
};

export type CreatePostRequest = {
  postId?: string;
  text: string;
  imageUrl?: string;
};

export type CreatePostResponse = {
  post: PostsApiPostDetail;
};

export type UpdatePostRequest = {
  postId: string;
  text: string;
  imageUrl?: string | null;
};

export type UpdatePostResponse = {
  post: PostsApiPostDetail | null;
};

export type VotePostRequest = {
  postId: string;
  vote: PostVote;
};

export type VotePostResponse = {
  post: PostsApiPostDetail | null;
};

export type SharePostRequest = {
  postId: string;
};

export type SharePostResponse = {
  post: PostsApiPostDetail | null;
};

export type ReportPostRequest = {
  postId: string;
  reason: string;
  details?: string | null;
};

export type ReportPostResponse = {
  success: boolean;
  reportId: string;
};

export type CreateCommentRequest = {
  postId: string;
  commentId?: string;
  text: string;
};

export type CreateCommentResponse = {
  post: PostsApiPostDetail | null;
  comment: PostsApiComment | null;
};

export type UpdateCommentRequest = {
  postId: string;
  commentId: string;
  text: string;
};

export type UpdateCommentResponse = {
  post: PostsApiPostDetail | null;
  comment: PostsApiComment | null;
};

export type DeleteEntityResponse = {
  success: boolean;
  deletedId: string;
};

export type VoteCommentRequest = {
  postId: string;
  commentId: string;
  vote: PostVote;
};

export type VoteCommentResponse = {
  post: PostsApiPostDetail | null;
  comment: PostsApiComment | null;
};

export function toPostsApiPostSummary(post: PostItem): PostsApiPostSummary {
  return {
    id: post.id,
    author: post.author,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    title: post.title,
    text: post.text,
    imageUrl: post.imageUrl,
    score: post.score,
    viewerVote: post.viewerVote,
    shareCount: post.shareCount,
    commentCount: post.comments.length,
  };
}

export function toPostsApiPostDetail(post: PostItem): PostsApiPostDetail {
  return {
    id: post.id,
    author: post.author,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    title: post.title,
    text: post.text,
    imageUrl: post.imageUrl,
    score: post.score,
    viewerVote: post.viewerVote,
    shareCount: post.shareCount,
    comments: post.comments,
  };
}
