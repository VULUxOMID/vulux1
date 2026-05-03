import type { PostComment, PostItem } from './types';
import type {
  GetPostDetailResponse,
  ListPostsResponse,
  PostsApiComment,
  PostsApiPostDetail,
  PostsApiPostSummary,
} from './postsApiContract';

export function mapPostsApiCommentToDomain(comment: PostsApiComment): PostComment {
  return {
    id: comment.id,
    author: comment.author,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    score: comment.score,
    viewerVote: comment.viewerVote,
  };
}

export function mapPostsApiDetailToDomain(post: PostsApiPostDetail): PostItem {
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
    viewerSaved: false,
    shareCount: post.shareCount,
    commentCount: post.comments.length,
    comments: post.comments.map(mapPostsApiCommentToDomain),
  };
}

export function mapPostsApiSummaryToDomain(post: PostsApiPostSummary): PostItem {
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
    viewerSaved: false,
    shareCount: post.shareCount,
    commentCount: post.commentCount,
    comments: [],
  };
}

export function mapListPostsResponseToDomain(response: ListPostsResponse): PostItem[] {
  return response.posts.map(mapPostsApiSummaryToDomain);
}

export function mapGetPostDetailResponseToDomain(response: GetPostDetailResponse): PostItem | null {
  return response.post ? mapPostsApiDetailToDomain(response.post) : null;
}
