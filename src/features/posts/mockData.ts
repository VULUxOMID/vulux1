import type { PostAuthor, PostItem } from './types';

export const DEFAULT_POST_IMAGE_URL =
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80';

export const CURRENT_POST_USER: PostAuthor = {
  id: 'viewer',
  displayName: 'You',
  username: '@you',
  avatarColor: '#00E676',
};

const authors: PostAuthor[] = [
  {
    id: 'a1',
    displayName: 'Team Vulu',
    username: '@teamvulu',
    avatarColor: '#00E676',
  },
  {
    id: 'a2',
    displayName: 'Nadia Hale',
    username: '@nadia',
    avatarColor: '#5B5BD6',
  },
  {
    id: 'a3',
    displayName: 'Jiro Lane',
    username: '@jiro',
    avatarColor: '#FF7A59',
  },
];

export const seedPosts: PostItem[] = [
  {
    id: 'post-1',
    author: authors[0],
    createdAt: Date.now() - 1000 * 60 * 12,
    updatedAt: Date.now() - 1000 * 60 * 12,
    text: 'Posts is the new place for quick updates, hot takes, and community drops. We kept it cleaner than the usual chaos.',
    score: 128,
    viewerVote: 1,
    viewerSaved: false,
    shareCount: 9,
    comments: [
      {
        id: 'comment-1',
        author: authors[1],
        text: 'This feels a lot calmer than the usual feed apps. Keep the comments simple like this.',
        createdAt: Date.now() - 1000 * 60 * 8,
        updatedAt: Date.now() - 1000 * 60 * 8,
        score: 22,
        viewerVote: 0,
      },
      {
        id: 'comment-2',
        author: authors[2],
        text: 'The voting row is the right move. Likes would have felt too generic here.',
        createdAt: Date.now() - 1000 * 60 * 3,
        updatedAt: Date.now() - 1000 * 60 * 3,
        score: 11,
        viewerVote: 1,
      },
    ],
  },
  {
    id: 'post-2',
    author: authors[1],
    createdAt: Date.now() - 1000 * 60 * 42,
    updatedAt: Date.now() - 1000 * 60 * 42,
    text: 'Mocking up a creator diary format here. One image, short note, comments underneath. That is enough for V1.',
    imageUrl:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
    score: 94,
    viewerVote: 0,
    viewerSaved: false,
    shareCount: 6,
    comments: [
      {
        id: 'comment-3',
        author: authors[0],
        text: 'Exactly the level of complexity we want. Strong visual cards, no repost clutter.',
        createdAt: Date.now() - 1000 * 60 * 27,
        updatedAt: Date.now() - 1000 * 60 * 27,
        score: 17,
        viewerVote: 0,
      },
    ],
  },
  {
    id: 'post-3',
    author: authors[2],
    createdAt: Date.now() - 1000 * 60 * 90,
    updatedAt: Date.now() - 1000 * 60 * 90,
    text: 'Hot / New / Top is enough. We do not need five timelines before the feature even has a voice.',
    score: 61,
    viewerVote: -1,
    viewerSaved: false,
    shareCount: 3,
    comments: [],
  },
];
