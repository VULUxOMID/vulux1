import { backendPostsRepository } from './backendPostsRepository';
import { localPostsRepository } from './localPostsRepository';
import type { PostsRepository } from './repository';

export type PostsRepositoryMode = 'local' | 'backend';

function resolvePostsRepositoryMode(): PostsRepositoryMode {
  const mode = process.env.EXPO_PUBLIC_POSTS_REPOSITORY_MODE;
  return mode === 'local' ? 'local' : 'backend';
}

export function selectPostsRepository(): PostsRepository {
  return resolvePostsRepositoryMode() === 'backend' ? backendPostsRepository : localPostsRepository;
}

export function getActivePostsRepositoryMode(): PostsRepositoryMode {
  return resolvePostsRepositoryMode();
}
