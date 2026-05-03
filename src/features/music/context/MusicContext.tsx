import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo } from 'react';
import { useAuth as useSessionAuth } from '../../../auth/clerkSession';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Track, Playlist, Artist } from '../types';
import { useMusicCatalogRepo } from '../../../data/provider';
import {
  fetchAccountState as fetchBackendAccountState,
  upsertAccountState as upsertBackendAccountState,
} from '../../../data/adapters/backend/accountState';
import { formatPlaybackErrorForUser, resolveYoutubeTrackPlaybackUrl } from '../services/youtubeAudioApi';
import { recordRecentYoutubePlay } from '../searchHistory';
import { toast } from '../../../components/Toast';

const PLAYLISTS_STORAGE_KEY = '@vulu_music_playlists';
const LIKED_SONGS_STORAGE_KEY = '@vulu_music_liked_songs';
const OFFLINE_TRACKS_STORAGE_KEY = '@vulu_music_offline_tracks';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parsePlaylists(value: unknown): Playlist[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === 'string' ? item.id : '';
      const title = typeof item.title === 'string' ? item.title : '';
      if (!id || !title) return null;

      return {
        id,
        title,
        description: typeof item.description === 'string' ? item.description : '',
        cover: typeof item.cover === 'string' ? item.cover : '',
        tracks: toStringArray(item.tracks),
      } as Playlist;
    })
    .filter((playlist): playlist is Playlist => Boolean(playlist));
}

interface MusicContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  playTrack: (track: Track, contextQueue?: Track[]) => void;
  stopPlayback: () => void;
  togglePlayPause: () => void;
  playNext: (autoAdvance?: boolean) => void;
  playPrevious: () => void;
  seekTo: (positionMillis: number) => void;
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
  shuffleMode: boolean;
  toggleShuffle: () => void;
  repeatMode: 'off' | 'all' | 'one';
  toggleRepeat: () => void;
  // Action Menu
  actionTrack: Track | null;
  openActionMenu: (track: Track) => void;
  closeActionMenu: () => void;
  // Playlist Management
  playlists: Playlist[];
  createPlaylist: (title: string, description?: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  likedTrackIds: Set<string>;
  toggleLikeTrack: (trackId: string) => void;
  offlineTrackIds: Set<string>;
  toggleOfflineTrack: (trackId: string) => void;
  isTrackOffline: (trackId: string) => boolean;
  offlineTracks: Track[];
  addToQueue: (track: Track) => void;
  queue: Track[];
  currentIndex: number;
  // Artist Navigation
  selectedArtist: Artist | null;
  setSelectedArtist: (artist: Artist | null) => void;
  viewArtist: (artistName: string) => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider = ({ children }: { children: ReactNode }) => {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const musicCatalogRepo = useMusicCatalogRepo();
  const tracksCatalog = useMemo(() => musicCatalogRepo.listTracks({ limit: 300 }), [musicCatalogRepo]);
  const artistsCatalog = useMemo(() => musicCatalogRepo.listArtists({ limit: 300 }), [musicCatalogRepo]);
  const playlistsCatalog = useMemo(
    () => musicCatalogRepo.listPlaylists({ limit: 300 }),
    [musicCatalogRepo],
  );
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [minimized, setMinimized] = useState(true);
  
  // Queue State
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [originalQueue, setOriginalQueue] = useState<Track[]>([]); // For un-shuffling
  
  // Action Menu State
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  // Playlist State
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const playlists = useMemo(() => {
    // Merge backend/user playlists with global catalog playlists
    const all = [...userPlaylists];
    for (const p of playlistsCatalog) {
      if (!all.find(up => up.id === p.id)) {
        all.push(p);
      }
    }
    return all;
  }, [userPlaylists, playlistsCatalog]);

  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [offlineTrackIds, setOfflineTrackIds] = useState<Set<string>>(new Set());
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [backendHydrated, setBackendHydrated] = useState(false);
  const [hasPersistedPlaylists, setHasPersistedPlaylists] = useState(false);

  // Artist State
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  /** Bumps when starting new playback so overlapping async work cannot leave two players playing. */
  const playbackSessionRef = useRef(0);
  const backendPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginPlaybackSession = () => {
    playbackSessionRef.current += 1;
    return playbackSessionRef.current;
  };

  const isCurrentPlaybackSession = (session: number) => session === playbackSessionRef.current;

  const disposeCurrentPlayer = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.pause();
    } catch {
      // ignore
    }
    try {
      player.remove();
    } catch {
      // ignore
    }
    playerRef.current = null;
  };

  // Initialize Audio
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    });
    
    // Load persisted data
    const loadData = async () => {
      try {
        const playlistsJson = await AsyncStorage.getItem(PLAYLISTS_STORAGE_KEY);
        if (playlistsJson) {
          setUserPlaylists(JSON.parse(playlistsJson));
          setHasPersistedPlaylists(true);
        }
        
        const likedJson = await AsyncStorage.getItem(LIKED_SONGS_STORAGE_KEY);
        if (likedJson) {
          setLikedTrackIds(new Set(JSON.parse(likedJson)));
        }

        const offlineJson = await AsyncStorage.getItem(OFFLINE_TRACKS_STORAGE_KEY);
        if (offlineJson) {
          setOfflineTrackIds(new Set(JSON.parse(offlineJson)));
        }
      } catch (e) {
        if (__DEV__) {
          console.error('Failed to load music data:', e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        setStorageLoaded(true);
      }
    };
    loadData();

    return () => {
      disposeCurrentPlayer();
    };
  }, []);

  useEffect(() => {
    if (!storageLoaded || hasPersistedPlaylists) return;
    setUserPlaylists(playlistsCatalog);
  }, [hasPersistedPlaylists, playlistsCatalog, storageLoaded]);

  // Persist playlists whenever they change
  useEffect(() => {
    if (!storageLoaded) return;
    const savePlaylists = async () => {
      try {
        const serialized = JSON.stringify(userPlaylists);
        await AsyncStorage.setItem(PLAYLISTS_STORAGE_KEY, serialized);
      } catch (e) {
        if (__DEV__) {
          console.error('Failed to save playlists:', e instanceof Error ? e.message : 'Unknown error');
        }
        // Optionally show user feedback
      }
    };
    savePlaylists();
  }, [userPlaylists]);

  // Persist liked songs whenever they change
  useEffect(() => {
    if (!storageLoaded) return;
    const saveLiked = async () => {
      try {
        const likedArray = Array.from(likedTrackIds);
        const serialized = JSON.stringify(likedArray);
        await AsyncStorage.setItem(LIKED_SONGS_STORAGE_KEY, serialized);
      } catch (e) {
        if (__DEV__) {
          console.error('Failed to save liked songs:', e instanceof Error ? e.message : 'Unknown error');
        }
        // Optionally show user feedback
      }
    };
    saveLiked();
  }, [likedTrackIds]);

  useEffect(() => {
    if (!storageLoaded) return;
    const saveOfflineTracks = async () => {
      try {
        const offlineArray = Array.from(offlineTrackIds);
        const serialized = JSON.stringify(offlineArray);
        await AsyncStorage.setItem(OFFLINE_TRACKS_STORAGE_KEY, serialized);
      } catch (e) {
        if (__DEV__) {
          console.error('Failed to save offline tracks:', e instanceof Error ? e.message : 'Unknown error');
        }
      }
    };
    saveOfflineTracks();
  }, [offlineTrackIds]);

  useEffect(() => {
    let active = true;

    if (!storageLoaded) {
      return () => {
        active = false;
      };
    }

    if (!isAuthLoaded) {
      return () => {
        active = false;
      };
    }

    if (!isSignedIn || !userId) {
      setBackendHydrated(true);
      return () => {
        active = false;
      };
    }

    setBackendHydrated(false);

    const hydrateFromBackend = async () => {
      const accountState = await fetchBackendAccountState(null, getToken, userId);
      if (!active) return;

      const musicState =
        accountState?.music && typeof accountState.music === 'object'
          ? (accountState.music as Record<string, unknown>)
          : {};

      const backendPlaylists = parsePlaylists(musicState.playlists);
      if (backendPlaylists.length > 0) {
        setUserPlaylists(backendPlaylists);
        setHasPersistedPlaylists(true);
      }

      if (Array.isArray(musicState.likedTrackIds)) {
        setLikedTrackIds(new Set(toStringArray(musicState.likedTrackIds)));
      }

      if (Array.isArray(musicState.offlineTrackIds)) {
        setOfflineTrackIds(new Set(toStringArray(musicState.offlineTrackIds)));
      }

      setBackendHydrated(true);
    };

    void hydrateFromBackend();

    return () => {
      active = false;
    };
  }, [getToken, isAuthLoaded, isSignedIn, storageLoaded, userId]);

  useEffect(() => {
    if (
      !storageLoaded ||
      !backendHydrated ||
      !isAuthLoaded ||
      !isSignedIn ||
      !userId
    ) {
      return;
    }

    if (backendPersistTimerRef.current) {
      clearTimeout(backendPersistTimerRef.current);
    }

    backendPersistTimerRef.current = setTimeout(() => {
      void upsertBackendAccountState(null, getToken, {
        music: {
          playlists,
          likedTrackIds: Array.from(likedTrackIds),
          offlineTrackIds: Array.from(offlineTrackIds),
        },
      }, userId);
    }, 500);

    return () => {
      if (backendPersistTimerRef.current) {
        clearTimeout(backendPersistTimerRef.current);
        backendPersistTimerRef.current = null;
      }
    };
  }, [
    backendHydrated,
    getToken,
    isAuthLoaded,
    isSignedIn,
    likedTrackIds,
    offlineTrackIds,
    playlists,
    storageLoaded,
    userId,
  ]);

  const resolvePlayableTrack = async (track: Track): Promise<Track> => {
    if (track.url?.trim()) {
      return track;
    }
    if (track.source === 'youtube-audio' || track.id.startsWith('yt:')) {
      return resolveYoutubeTrackPlaybackUrl(track);
    }
    return track;
  };

  const loadAndPlaySound = async (track: Track, shouldPlay = true, session?: number): Promise<boolean> => {
    if (session !== undefined && !isCurrentPlaybackSession(session)) {
      return false;
    }
    try {
      disposeCurrentPlayer();

      // If track URL is missing, skip playback.
      if (!track.url) {
        if (__DEV__) {
          console.warn('No URL for track:', track.title);
        }
        setIsPlaying(false);
        return false;
      }

      // Check if track is offline
      let sourceUrl = track.url;
      const fs = FileSystem as any;
      if (offlineTrackIds.has(track.id) && fs.documentDirectory) {
        const fileUri = `${fs.documentDirectory}track_${track.id}.mp3`;
        const fileInfo = await fs.getInfoAsync(fileUri);
        if (session !== undefined && !isCurrentPlaybackSession(session)) {
          return false;
        }
        if (fileInfo.exists) {
          sourceUrl = fileUri;
        }
      }

      if (session !== undefined && !isCurrentPlaybackSession(session)) {
        return false;
      }

      const player = createAudioPlayer(sourceUrl);

      if (session !== undefined && !isCurrentPlaybackSession(session)) {
        try {
          player.remove();
        } catch {
          // ignore
        }
        return false;
      }

      playerRef.current = player;

      if (player) {
        player.loop = repeatMode === 'one';
        if (shouldPlay) {
          player.play();
        }
        setIsPlaying(shouldPlay);
        return true;
      }
      return false;
    } catch (error) {
      if (__DEV__) {
        console.error('Error loading sound:', error instanceof Error ? error.message : 'Unknown error');
      }
      setIsPlaying(false);
      return false;
    }
  };

  const playTrack = async (track: Track, contextQueue?: Track[]) => {
    const session = beginPlaybackSession();
    disposeCurrentPlayer();
    try {
      setIsBuffering(true);

      if (track.availability === 'region_blocked') {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'May be unavailable in your region',
            'YouTube data suggests this video might be blocked where you are. Try playing anyway?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Play', onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) {
          if (isCurrentPlaybackSession(session)) {
            setIsBuffering(false);
          }
          return;
        }
      }

      // Determine new queue
      let newQueue = queue;
      if (contextQueue) {
        newQueue = [...contextQueue];
        setOriginalQueue(contextQueue);
        if (shuffleMode) {
          // Fisher-Yates shuffle
          for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
          }
          // Move current track to index 0
          const idx = newQueue.findIndex(t => t.id === track.id);
          if (idx !== -1) {
            newQueue.splice(idx, 1);
            newQueue.unshift(track);
          }
        }
        setQueue(newQueue);
      } else if (queue.length === 0) {
        // Fallback: if no queue exists, use the catalog track list
        newQueue = [...tracksCatalog];
        setOriginalQueue(tracksCatalog);
        if (shuffleMode) {
          for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
          }
          const idx = newQueue.findIndex(t => t.id === track.id);
          if (idx !== -1) {
            newQueue.splice(idx, 1);
            newQueue.unshift(track);
          }
        }
        setQueue(newQueue);
      }

      // Find index in the (possibly new) queue
      const index = newQueue.findIndex(t => t.id === track.id);
      setCurrentIndex(index !== -1 ? index : 0);
      setCurrentTrack(track);
      setMinimized(false); // Open full player on new track

      const playableTrack = await resolvePlayableTrack(track);
      if (!isCurrentPlaybackSession(session)) {
        return;
      }
      if (playableTrack.id === track.id) {
        if (
          playableTrack.url &&
          playableTrack.url !== track.url &&
          (contextQueue || newQueue.length > 0)
        ) {
          const updatedQueue = (contextQueue ? [...newQueue] : [...newQueue]).map((item) =>
            item.id === track.id ? { ...item, ...playableTrack } : item,
          );
          setQueue(updatedQueue);
        }
      }
      setCurrentTrack(playableTrack);
      const started = await loadAndPlaySound(playableTrack, true, session);
      if (
        started &&
        isCurrentPlaybackSession(session) &&
        playableTrack.source === 'youtube-audio' &&
        playableTrack.videoId
      ) {
        void recordRecentYoutubePlay({
          videoId: playableTrack.videoId,
          title: playableTrack.title,
          artist: playableTrack.artist,
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error in playTrack:', error);
      }
      toast.error(formatPlaybackErrorForUser(error));
    } finally {
      if (isCurrentPlaybackSession(session)) {
        setIsBuffering(false);
      }
    }
  };

  const stopPlayback = () => {
    beginPlaybackSession();
    try {
      disposeCurrentPlayer();
      setCurrentTrack(null);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      setQueue([]);
      setCurrentIndex(-1);
      setMinimized(true);
    } catch (error) {
      if (__DEV__) {
        console.error('Error stopping playback:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  };

  const togglePlayPause = async () => {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = async (positionMillis: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(positionMillis / 1000); // Convert to seconds
    }
  };

  const playNext = async (autoAdvance = false) => {
    if (queue.length === 0) return;

    let nextIndex = currentIndex + 1;

    if (repeatMode === 'one' && autoAdvance) {
      // If repeat one is on, replay current track
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
      return;
    }

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // End of queue, stop
        setIsPlaying(false);
        return;
      }
    }

    const session = beginPlaybackSession();
    disposeCurrentPlayer();
    try {
      setIsBuffering(true);
      const nextTrack = queue[nextIndex];
      setCurrentIndex(nextIndex);
      const playableTrack = await resolvePlayableTrack(nextTrack);
      if (!isCurrentPlaybackSession(session)) {
        return;
      }
      setCurrentTrack(playableTrack);
      setQueue((prev) =>
        prev.map((item, idx) => (idx === nextIndex ? { ...item, ...playableTrack } : item)),
      );
      await loadAndPlaySound(playableTrack, true, session);
    } catch (error) {
      if (__DEV__) {
        console.error('Error in playNext:', error);
      }
      toast.error(formatPlaybackErrorForUser(error));
    } finally {
      if (isCurrentPlaybackSession(session)) {
        setIsBuffering(false);
      }
    }
  };

  const playPrevious = async () => {
    if (queue.length === 0) return;

    // If we are more than 3 seconds in, restart track
    if (position > 3000) {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
      }
      return;
    }

    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
       if (repeatMode === 'all') {
         prevIndex = queue.length - 1;
       } else {
         // Stop playback or go to start
         if (playerRef.current) {
           playerRef.current.seekTo(0);
         }
         return;
       }
    }

    const session = beginPlaybackSession();
    disposeCurrentPlayer();
    try {
      setIsBuffering(true);
      const prevTrack = queue[prevIndex];
      setCurrentIndex(prevIndex);
      const playableTrack = await resolvePlayableTrack(prevTrack);
      if (!isCurrentPlaybackSession(session)) {
        return;
      }
      setCurrentTrack(playableTrack);
      setQueue((prev) =>
        prev.map((item, idx) => (idx === prevIndex ? { ...item, ...playableTrack } : item)),
      );
      await loadAndPlaySound(playableTrack, true, session);
    } catch (error) {
      if (__DEV__) {
        console.error('Error in playPrevious:', error);
      }
      toast.error(formatPlaybackErrorForUser(error));
    } finally {
      if (isCurrentPlaybackSession(session)) {
        setIsBuffering(false);
      }
    }
  };

  const toggleShuffle = () => {
    const newMode = !shuffleMode;
    setShuffleMode(newMode);

    if (newMode) {
      // Shuffle existing queue but keep current track first or preserved?
      // Usually we reshuffle everything but current.
      // For simplicity: reshuffle originalQueue
      const shuffled = [...originalQueue].sort(() => Math.random() - 0.5);
      // Ensure current track is playing?
      // Just set queue to shuffled.
      // We need to find where currentTrack is in shuffled to update currentIndex.
      if (currentTrack) {
        // Move current track to front or just find it?
        // Let's just update currentIndex.
        const idx = shuffled.findIndex(t => t.id === currentTrack.id);
        // If not found (shouldn't happen), just keep current.
        if (idx !== -1) {
            // Swap to make current track match current index? No, just update index.
            setCurrentIndex(idx);
        }
      }
      setQueue(shuffled);
    } else {
      // Restore original order
      setQueue(originalQueue);
      if (currentTrack) {
        const idx = originalQueue.findIndex(t => t.id === currentTrack.id);
        setCurrentIndex(idx);
      }
    }
  };

  const toggleRepeat = () => {
    // off -> all -> one -> off
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const openActionMenu = (track: Track) => {
    setActionTrack(track);
  };

  const closeActionMenu = () => {
    setActionTrack(null);
  };

  const createPlaylist = (title: string, description: string = '') => {
    const newPlaylist: Playlist = {
      id: `p${Date.now()}`,
      title,
      description,
      cover: '',
      tracks: [],
    };
    setUserPlaylists(prev => [...prev, newPlaylist]);
  };

  const addTrackToPlaylist = (playlistId: string, trackId: string) => {
    setUserPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        // Avoid duplicates
        if (p.tracks.includes(trackId)) return p;
        return { ...p, tracks: [...p.tracks, trackId] };
      }
      return p;
    }));
  };

  const toggleLikeTrack = (trackId: string) => {
    setLikedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleOfflineTrack = async (trackId: string) => {
    try {
      const isCurrentlyOffline = offlineTrackIds.has(trackId);
      const track = tracksCatalog.find(t => t.id === trackId);
      const fs = FileSystem as any;
      
      if (!track || !track.url || !fs.documentDirectory) return;

      const fileUri = `${fs.documentDirectory}track_${trackId}.mp3`;

      if (isCurrentlyOffline) {
        // Remove from offline
        const fileInfo = await fs.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          await fs.deleteAsync(fileUri);
        }
        
        setOfflineTrackIds(prev => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      } else {
        // Add to offline (Download)
        const downloadRes = await fs.downloadAsync(track.url, fileUri);
        if (downloadRes.status === 200) {
          setOfflineTrackIds(prev => {
            const next = new Set(prev);
            next.add(trackId);
            return next;
          });
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error toggling offline track:', error);
      }
    }
  };

  const isTrackOffline = (trackId: string) => offlineTrackIds.has(trackId);

  const offlineTracks = useMemo(
    () => tracksCatalog.filter(track => offlineTrackIds.has(track.id)),
    [tracksCatalog, offlineTrackIds]
  );

  const addToQueue = (track: Track) => {
    setQueue(prev => {
      // Add to end of queue
      return [...prev, track];
    });
    // Also update original queue if we want to persist it through shuffles differently
    // For now simplistic approach
    setOriginalQueue(prev => [...prev, track]);
  };

  const viewArtist = (artistName: string) => {
    const artist = artistsCatalog.find(a => a.name === artistName);
    if (artist) {
      setSelectedArtist(artist);
    } else {
      setSelectedArtist({
        id: `temp-${Date.now()}`,
        name: artistName,
        bio: 'Artist bio not available.',
        image: '',
      });
    }
  };

  // Watch for repeat one changes to update looping status
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.loop = repeatMode === 'one';
    }
  }, [repeatMode]);

  return (
    <MusicContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isBuffering,
        position,
        duration,
        playTrack,
        stopPlayback,
        togglePlayPause,
        playNext,
        playPrevious,
        seekTo,
        minimized,
        setMinimized,
        shuffleMode,
        toggleShuffle,
        repeatMode,
        toggleRepeat,
        actionTrack,
        openActionMenu,
        closeActionMenu,
        playlists,
        createPlaylist,
        addTrackToPlaylist,
        likedTrackIds,
        toggleLikeTrack,
        offlineTrackIds,
        toggleOfflineTrack,
        isTrackOffline,
        offlineTracks,
        addToQueue,
        queue,
        currentIndex,
        selectedArtist,
        setSelectedArtist,
        viewArtist,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
