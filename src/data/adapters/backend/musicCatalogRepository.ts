import type { MusicCatalogRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';

export function createBackendMusicCatalogRepository(
  snapshot: BackendSnapshot,
): MusicCatalogRepository {
  return {
    listTracks(request) {
      const searched = filterByQuery(snapshot.tracks, request?.query, [
        (track) => track.title,
        (track) => track.artist,
      ]);
      return applyCursorPage(searched, request);
    },
    listPlaylists(request) {
      const searched = filterByQuery(snapshot.playlists, request?.query, [
        (playlist) => playlist.title,
        (playlist) => playlist.description,
      ]);
      return applyCursorPage(searched, request);
    },
    listArtists(request) {
      const searched = filterByQuery(snapshot.artists, request?.query, [
        (artist) => artist.name,
        (artist) => artist.bio,
      ]);
      return applyCursorPage(searched, request);
    },
  };
}
