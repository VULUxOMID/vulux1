import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth as useSessionAuth } from '../auth/spacetimeSession';
import { useWallet } from './WalletContext';
import { useAuth } from './AuthContext';
import { useAppIsActive } from '../hooks/useAppIsActive';
import { useVideoRepo } from '../data/provider';
import { requestBackendRefresh } from '../data/adapters/backend/refreshBus';
import { createBackendHttpClientFromEnv } from '../data/adapters/backend/httpClient';
import { getBackendTokenTemplate } from '../config/backendToken';
import { getBackendToken } from '../utils/backendToken';

// --- Types ---

export interface Video {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  price: number; // 0 = Free
  currency: 'cash' | 'gems';
  contentType: VideoContentType;
  category: VideoCategory;
  tags: string[];
  duration?: string;
  seasons?: number;
  episodes?: number;
  views: number;
  likes: number;
  createdAt: number;
  isLocked: boolean; // For the current user
}

export type VideoCategory = 'Trending' | 'New' | 'Fantasy' | 'Action' | 'Educational' | 'Music' | 'Gaming' | 'Vlog';
export type VideoContentType = 'show' | 'movie' | 'anime';

type UploadVideoInput = Omit<
  Video,
  | 'id'
  | 'views'
  | 'likes'
  | 'createdAt'
  | 'isLocked'
  | 'creatorName'
  | 'creatorAvatar'
  | 'creatorId'
  | 'contentType'
  | 'duration'
  | 'seasons'
  | 'episodes'
> & {
  contentType?: VideoContentType;
  duration?: string;
  seasons?: number;
  episodes?: number;
};

export interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  subscribers: number;
  videos: string[]; // Video IDs
  bio: string;
}

interface VideoContextType {
  videos: Video[];
  featuredVideo: Video | null;
  trendingVideos: Video[];
  newReleases: Video[];
  categories: VideoCategory[];
  unlockVideo: (videoId: string) => Promise<boolean>;
  uploadVideo: (videoData: UploadVideoInput) => Promise<void>;
  toggleLike: (videoId: string) => void;
  isCreator: boolean;
  becomeCreator: () => Promise<void>;
  getVideosByCategory: (category: VideoCategory) => Video[];
  activeVideo: Video | null;
  isMinimized: boolean;
  playbackPosition: number;
  playVideo: (video: Video) => void;
  minimizeVideo: () => void;
  maximizeVideo: () => void;
  closeVideo: () => void;
  updatePlaybackPosition: (position: number) => void;
}

// --- Context ---

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useSessionAuth();
  const isAppActive = useAppIsActive();
  const videoRepo = useVideoRepo();
  const backendClient = useMemo(() => createBackendHttpClientFromEnv(), []);
  const backendTokenTemplate = getBackendTokenTemplate();
  const queriesEnabled =
    !initializing && !!user?.uid && isAuthLoaded && isSignedIn && isAppActive;
  const { balance, deductBalance } = useWallet();
  const repositoryVideos = useMemo(
    () => (queriesEnabled ? videoRepo.listVideos({ limit: 250 }) : []),
    [queriesEnabled, videoRepo],
  );
  const [videos, setVideos] = useState<Video[]>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(new Set());

  // Mini-player state
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  // Derived state
  const trendingVideos = useMemo(
    () => videos.slice().sort((a, b) => b.views - a.views),
    [videos],
  );
  const newReleases = useMemo(
    () => videos.slice().sort((a, b) => b.createdAt - a.createdAt),
    [videos],
  );
  const featuredVideo = useMemo(() => trendingVideos[0] || null, [trendingVideos]);
  const categories: VideoCategory[] = useMemo(
    () => Array.from(new Set(videos.map((video) => video.category))) as VideoCategory[],
    [videos],
  );

  // Effects
  useEffect(() => {
    // Creator status should come from backend role/flag, not email heuristic.
    // Use becomeCreator() for manual opt-in.
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setVideos([]);
      return;
    }
    if (!isAppActive) return;
    setVideos(repositoryVideos as Video[]);
  }, [isAppActive, repositoryVideos, user?.uid]);

  const unlockVideo = async (videoId: string): Promise<boolean> => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return false;
    if (!video.isLocked || video.price === 0) return true;

    // Check balance
    if (video.currency === 'cash' && balance.cash < video.price) {
      return false; // Not enough cash
    }
    if (video.currency === 'gems' && balance.gems < video.price) {
      return false; // Not enough gems
    }

    // Deduct
    const success = await deductBalance(video.price, video.currency);
    if (success) {
      // Unlock locally
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, isLocked: false } : v));
      return true;
    }
    return false;
  };

  const uploadVideo = async (videoData: UploadVideoInput) => {
    const contentType = videoData.contentType ?? 'movie';
    const hasShowMeta = contentType === 'show';
    const createdAt = Date.now();
    const optimisticId = `pending-video-${createdAt}`;
    const optimisticVideo: Video = {
      ...videoData,
      id: optimisticId,
      contentType,
      duration: videoData.duration ?? (contentType === 'show' ? undefined : '1h 20m'),
      seasons: hasShowMeta ? videoData.seasons ?? 1 : undefined,
      episodes: hasShowMeta ? videoData.episodes ?? 8 : undefined,
      views: 0,
      likes: 0,
      createdAt,
      isLocked: videoData.price > 0,
      creatorName: user?.displayName || 'Unknown Creator',
      creatorAvatar: user?.photoURL ?? undefined,
      creatorId: user?.uid || 'unknown',
    };

    setVideos((prev) => [optimisticVideo, ...prev]);

    try {
      if (!backendClient) {
        throw new Error('Backend client not configured');
      }

      const token = await getBackendToken(getToken, backendTokenTemplate);
      if (!token) {
        throw new Error('Not authenticated');
      }

      backendClient.setAuth(token);
      const response = await backendClient.post<{ id: string }>('/video/items', {
        title: videoData.title,
        description: videoData.description ?? '',
        videoUrl: videoData.videoUrl,
        thumbnailUrl: videoData.thumbnailUrl ?? '',
        category: videoData.category,
        contentType,
        tags: videoData.tags ?? [],
        price: videoData.price ?? 0,
        currency: videoData.currency ?? 'cash',
        durationSeconds: 0,
      });

      if (!response?.id) {
        throw new Error('Upload succeeded but no video id was returned');
      }

      setVideos((prev) =>
        prev.map((video) =>
          video.id === optimisticId
            ? {
              ...optimisticVideo,
              id: response.id,
            }
            : video,
        ),
      );

      requestBackendRefresh({
        scopes: ['videos'],
        source: 'manual',
        reason: 'video_uploaded',
      });
    } catch (error) {
      setVideos((prev) => prev.filter((video) => video.id !== optimisticId));
      throw error;
    }
  };

  const toggleLike = useCallback((videoId: string) => {
    const alreadyLiked = likedVideoIds.has(videoId);
    setLikedVideoIds((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
    setVideos(prev => prev.map(v => {
      if (v.id === videoId) {
        return { ...v, likes: v.likes + (alreadyLiked ? -1 : 1) };
      }
      return v;
    }));
  }, [likedVideoIds]);

  const becomeCreator = async () => {
    setIsCreator(true);
    // In real app, API call to update user role
  };

  const getVideosByCategory = (category: VideoCategory) => {
    if (category === 'Trending') return trendingVideos;
    if (category === 'New') return newReleases;
    return videos.filter(v => v.category === category);
  };

  const playVideo = (video: Video) => {
    setActiveVideo(video);
    setIsMinimized(false);
  };

  const minimizeVideo = () => {
    if (activeVideo) {
      setIsMinimized(true);
    }
  };

  const maximizeVideo = () => {
    if (activeVideo) {
      setIsMinimized(false);
    }
  };

  const closeVideo = () => {
    setActiveVideo(null);
    setIsMinimized(false);
  };

  const updatePlaybackPosition = (position: number) => {
    setPlaybackPosition(position);
  };

  return (
    <VideoContext.Provider value={{
      videos,
      featuredVideo,
      trendingVideos,
      newReleases,
      categories,
      unlockVideo,
      uploadVideo,
      toggleLike,
      isCreator,
      becomeCreator,
      getVideosByCategory,
      activeVideo,
      isMinimized,
      playbackPosition,
      playVideo,
      minimizeVideo,
      maximizeVideo,
      closeVideo,
      updatePlaybackPosition,
    }}>
      {children}
    </VideoContext.Provider>
  );
}

export const useVideo = () => {
  const context = useContext(VideoContext);
  if (context === undefined) {
    throw new Error('useVideo must be used within a VideoProvider');
  }
  return context;
};
