import type { LiveItem } from '../features/home/LiveSection';
import type { LiveUser } from '../features/liveroom/types';
import type { MentionUser } from '../features/home/chat/GlobalChatSheet';
import type { Notification } from '../features/notifications/types';
import type { LeaderboardItem } from '../features/leaderboard/types';
import type { Video } from '../context/VideoContext';
import type { Artist, Playlist, Track, MusicGenre } from '../features/music/types';

export type LiveLeaderboardEntry = {
  id: string;
  title: string;
  boostCount: number;
  rank: number;
  hostAvatars: string[];
  isYourLive?: boolean;
};

export type SocialUser = {
  id: string;
  username: string;
  avatarUrl: string;
  isOnline: boolean;
  isLive?: boolean;
  status?: 'live' | 'online' | 'busy' | 'offline' | 'recent';
  statusText?: string;
  lastSeen?: string;
  friendshipStatus?: 'pending' | 'accepted' | 'declined' | 'blocked' | 'removed';
  blockedByViewer?: boolean;
  blockedByOther?: boolean;
};

export type LivePresenceActivity = 'hosting' | 'watching' | 'blocked';

export type LivePresence = {
  userId: string;
  activity: LivePresenceActivity;
  liveId: string;
  liveTitle?: string;
  updatedAt: number;
};

export type ConversationMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  deliveredAt?: number;
  readAt?: number;
};

export type Conversation = {
  id: string;
  otherUserId: string;
  lastMessage: ConversationMessage;
  unreadCount: number;
  streak?: number;
  lastMessageDate?: string;
  streakExpiresAt?: string;
  pinned?: boolean;
  muted?: boolean;
};

export type GlobalChatMessage = {
  id: string;
  user: string;
  text: string;
  createdAt: number;
  roomId?: string;
  senderId?: string;
  replyTo?: null | { id: string; user: string; text: string; senderId?: string };
  edited?: boolean;
  type?: 'user' | 'system';
};

export type ThreadSeedMessage = {
  id: string;
  user: string;
  senderId: string;
  text: string;
  createdAt: number;
  deliveredAt?: number;
  readAt?: number;
  edited?: boolean;
  type?: 'user' | 'system' | 'cash' | 'voice';
  amount?: number;
  audioUrl?: string;
  duration?: number;
  media?: {
    type: 'image' | 'audio';
    url: string;
    aspectRatio?: number;
    duration?: number;
  };
  replyTo?: null | { id: string; user: string; text: string; senderId?: string };
  reactions?: { emoji: string; count: number; isMine: boolean }[];
};

export type SearchIndex = {
  users: SocialUser[];
  conversations: Conversation[];
  lives: LiveItem[];
};

export type CursorPageRequest = {
  limit?: number;
  cursor?: string;
};

export type SearchRequest = {
  query?: string;
};

export type ListLivesRequest = CursorPageRequest &
  SearchRequest & {
    includeInviteOnly?: boolean;
    allowUnconfirmedDiscovery?: boolean;
  };
export type ListLivesResponse = LiveItem[];

export type FindLiveByIdRequest = {
  liveId: string;
};
export type FindLiveByIdResponse = LiveItem | undefined;

export type ListBoostLeaderboardRequest = CursorPageRequest;
export type ListBoostLeaderboardResponse = LiveLeaderboardEntry[];

export type ListKnownLiveUsersRequest = CursorPageRequest;
export type ListKnownLiveUsersResponse = LiveUser[];

export type ListLivePresenceRequest = CursorPageRequest & {
  userIds?: string[];
  activities?: LivePresenceActivity[];
  liveId?: string;
};
export type ListLivePresenceResponse = LivePresence[];

export type ListSocialUsersRequest = CursorPageRequest &
  SearchRequest & {
    statuses?: Array<'online' | 'offline' | 'live' | 'busy'>;
  };
export type ListSocialUsersResponse = SocialUser[];

export type ListAcceptedFriendIdsResponse = string[];

export type UpdateSocialUserStatusRequest = {
  userId: string;
  status: 'live' | 'online' | 'busy' | 'offline' | 'recent';
  statusText?: string;
};

export type SetSocialUserLiveRequest = {
  userId: string;
  isLive: boolean;
};

export type ListConversationsRequest = CursorPageRequest & SearchRequest;
export type ListConversationsResponse = Conversation[];

export type ListGlobalMessagesRequest = CursorPageRequest & {
  roomId?: string;
};
export type ListGlobalMessagesResponse = GlobalChatMessage[];

export type ListMentionUsersRequest = CursorPageRequest & SearchRequest;
export type ListMentionUsersResponse = MentionUser[];

export type ListThreadSeedMessagesRequest = {
  userId: string;
  limit?: number;
  before?: number;
};
export type ListThreadSeedMessagesResponse = ThreadSeedMessage[];

export type SendThreadMessageRequest = {
  userId: string;
  fromUserId?: string;
  clientMessageId?: string;
  message: ThreadSeedMessage;
};

export type MarkConversationReadRequest = {
  userId: string;
  readerUserId?: string;
};

export type SendGlobalMessageRequest = {
  clientMessageId?: string;
  message: GlobalChatMessage;
  roomId?: string;
};

export type EditGlobalMessageRequest = {
  messageId: string;
  text: string;
};

export type DeleteGlobalMessageRequest = {
  messageId: string;
};

export type ListNotificationsRequest = CursorPageRequest & {
  unreadOnly?: boolean;
  types?: Notification['type'][];
  userId?: string;
};
export type ListNotificationsResponse = Notification[];

export type MarkNotificationReadRequest = {
  notificationId: string;
  userId?: string;
};

export type DeleteNotificationRequest = {
  notificationId: string;
  userId?: string;
};

export type RespondToFriendRequestRequest = {
  notificationId: string;
  status: 'accepted' | 'declined';
  userId?: string;
};

export type SendFriendRequestRequest = {
  toUserId: string;
  fromUserId?: string;
};

export type RemoveFriendRelationshipRequest = {
  otherUserId: string;
  userId?: string;
};

export type ListLeaderboardItemsRequest = CursorPageRequest & {
  query?: string;
  includeCurrentUser?: boolean;
};
export type ListLeaderboardItemsResponse = LeaderboardItem[];

export type ListVideosRequest = CursorPageRequest & {
  query?: string;
  categories?: string[];
  includeLocked?: boolean;
};
export type ListVideosResponse = Video[];

export type ListTracksRequest = CursorPageRequest & {
  query?: string;
  genres?: MusicGenre[];
};
export type ListTracksResponse = Track[];

export type ListPlaylistsRequest = CursorPageRequest & SearchRequest;
export type ListPlaylistsResponse = Playlist[];

export type ListArtistsRequest = CursorPageRequest & SearchRequest;
export type ListArtistsResponse = Artist[];

export type ListSearchIndexRequest = SearchRequest;
export type ListSearchIndexResponse = SearchIndex;

export interface LiveRepository {
  listLives(request?: ListLivesRequest): ListLivesResponse;
  findLiveById(liveId: FindLiveByIdRequest['liveId']): FindLiveByIdResponse;
  listBoostLeaderboard(request?: ListBoostLeaderboardRequest): ListBoostLeaderboardResponse;
  listKnownLiveUsers(request?: ListKnownLiveUsersRequest): ListKnownLiveUsersResponse;
  listPresence(request?: ListLivePresenceRequest): ListLivePresenceResponse;
}

export interface SocialRepository {
  listUsers(request?: ListSocialUsersRequest): ListSocialUsersResponse;
  updateUserStatus(request: UpdateSocialUserStatusRequest): Promise<void>;
  setUserLive(request: SetSocialUserLiveRequest): Promise<void>;
}

export interface FriendshipsRepository {
  listAcceptedFriendIds(): ListAcceptedFriendIdsResponse;
}

export interface MessagesRepository {
  listConversations(request?: ListConversationsRequest): ListConversationsResponse;
  listGlobalMessages(request?: ListGlobalMessagesRequest): ListGlobalMessagesResponse;
  listMentionUsers(request?: ListMentionUsersRequest): ListMentionUsersResponse;
  listThreadSeedMessages(
    userId: ListThreadSeedMessagesRequest['userId'],
  ): ListThreadSeedMessagesResponse;
  sendThreadMessage(request: SendThreadMessageRequest): Promise<void>;
  markConversationRead(request: MarkConversationReadRequest): Promise<void>;
  sendGlobalMessage(request: SendGlobalMessageRequest): Promise<void>;
  editGlobalMessage(request: EditGlobalMessageRequest): Promise<void>;
  deleteGlobalMessage(request: DeleteGlobalMessageRequest): Promise<void>;
}

export interface NotificationsRepository {
  listNotifications(request?: ListNotificationsRequest): ListNotificationsResponse;
  markRead(request: MarkNotificationReadRequest): Promise<void>;
  markAllRead(): Promise<void>;
  deleteNotification(request: DeleteNotificationRequest): Promise<void>;
  respondToFriendRequest(request: RespondToFriendRequestRequest): Promise<void>;
  sendFriendRequest(request: SendFriendRequestRequest): Promise<void>;
  removeFriendRelationship(request: RemoveFriendRelationshipRequest): Promise<void>;
}

export interface LeaderboardRepository {
  listLeaderboardItems(request?: ListLeaderboardItemsRequest): ListLeaderboardItemsResponse;
}

export interface VideoRepository {
  listVideos(request?: ListVideosRequest): ListVideosResponse;
}

export interface MusicCatalogRepository {
  listTracks(request?: ListTracksRequest): ListTracksResponse;
  listPlaylists(request?: ListPlaylistsRequest): ListPlaylistsResponse;
  listArtists(request?: ListArtistsRequest): ListArtistsResponse;
}

export interface SearchRepository {
  listIndex(request?: ListSearchIndexRequest): ListSearchIndexResponse;
}

export interface Repositories {
  live: LiveRepository;
  social: SocialRepository;
  friendships: FriendshipsRepository;
  messages: MessagesRepository;
  notifications: NotificationsRepository;
  leaderboard: LeaderboardRepository;
  video: VideoRepository;
  musicCatalog: MusicCatalogRepository;
  search: SearchRepository;
}
