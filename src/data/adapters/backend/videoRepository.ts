import type { VideoRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';

export function createBackendVideoRepository(snapshot: BackendSnapshot): VideoRepository {
  return {
    listVideos(request) {
      let videos = snapshot.videos;

      if (request?.categories?.length) {
        videos = videos.filter((video) => request.categories?.includes(video.category));
      }
      if (request?.includeLocked === false) {
        videos = videos.filter((video) => !video.isLocked);
      }

      const searched = filterByQuery(videos, request?.query, [
        (video) => video.title,
        (video) => video.description,
        (video) => video.creatorName,
        (video) => video.tags,
      ]);

      return applyCursorPage(searched, request);
    },
  };
}
