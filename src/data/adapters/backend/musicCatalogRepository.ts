import type { MusicCatalogRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';

function getSnapshotCatalog(snapshot: BackendSnapshot) {
  return {
    artists: snapshot.artists,
    tracks: snapshot.tracks,
    playlists: snapshot.playlists,
  };
}

export function createBackendMusicCatalogRepository(
  snapshot: BackendSnapshot,
): MusicCatalogRepository {
  return {
    listTracks(request) {
      const catalog = getSnapshotCatalog(snapshot);
      const searched = filterByQuery(catalog.tracks, request?.query, [
        (track) => track.title,
        (track) => track.artist,
      ]);
      return applyCursorPage(searched, request);
    },
    listPlaylists(request) {
      const catalog = getSnapshotCatalog(snapshot);
      const searched = filterByQuery(catalog.playlists, request?.query, [
        (playlist) => playlist.title,
        (playlist) => playlist.description,
      ]);
      return applyCursorPage(searched, request);
    },
    listArtists(request) {
      const catalog = getSnapshotCatalog(snapshot);
      const searched = filterByQuery(catalog.artists, request?.query, [
        (artist) => artist.name,
        (artist) => artist.bio,
      ]);
      return applyCursorPage(searched, request);
    },
  };
}
