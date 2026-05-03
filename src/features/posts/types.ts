export type PostVote = -1 | 0 | 1;

export type PostAuthor = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  avatarColor: string;
};

export type PostComment = {
  id: string;
  author: PostAuthor;
  text: string;
  createdAt: number;
  updatedAt: number;
  score: number;
  viewerVote: PostVote;
};

export type PostItem = {
  id: string;
  author: PostAuthor;
  createdAt: number;
  updatedAt: number;
  title?: string;
  text: string;
  imageUrl?: string;
  score: number;
  viewerVote: PostVote;
  viewerSaved: boolean;
  shareCount: number;
  commentCount?: number;
  comments: PostComment[];
};
