import { apiClient } from '../../data/api';

export type GroupChatMembershipState = 'invited' | 'active' | 'left';
export type GroupChatRole = 'owner' | 'member';

export type GroupChatRoom = {
  id: string;
  title: string;
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
  membershipState: GroupChatMembershipState;
  role: GroupChatRole;
  memberCount: number;
  activeMemberCount: number;
  memberPreview: Array<{
    userId: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  }>;
};

export type GroupChatMember = {
  userId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  membershipState: GroupChatMembershipState;
  role: GroupChatRole;
  invitedAt: number;
  joinedAt?: number;
  leftAt?: number;
};

export type GroupChatRoomMessage = {
  id: string;
  roomId: string;
  user: string;
  text: string;
  createdAt: number;
  senderId?: string;
  type?: 'user' | 'system';
  media?: Record<string, unknown>;
  replyTo?: {
    id: string;
    user?: string;
    text?: string;
    senderId?: string;
  } | null;
};

type GroupChatListResponse = {
  rooms?: GroupChatRoom[];
};

type GroupChatDetailResponse = {
  room?: GroupChatRoom;
  members?: GroupChatMember[];
};

type GroupChatMessagesResponse = {
  messages?: GroupChatRoomMessage[];
  message?: GroupChatRoomMessage | null;
};

type CreateGroupChatRoomInput = {
  title?: string;
  creatorDisplayName?: string;
  creatorUsername?: string;
  creatorAvatarUrl?: string;
  members: Array<{
    userId: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  }>;
};

export async function listGroupChatRooms(): Promise<GroupChatRoom[]> {
  const response = await apiClient.get<GroupChatListResponse>('/api/messages/groups');
  return Array.isArray(response.rooms) ? response.rooms : [];
}

export async function createGroupChatRoom(input: CreateGroupChatRoomInput): Promise<GroupChatRoom> {
  const response = await apiClient.post<GroupChatDetailResponse>('/api/messages/groups', input);
  if (!response.room) {
    throw new Error('Group room creation did not return a room.');
  }
  return response.room;
}

export async function fetchGroupChatRoom(
  roomId: string,
): Promise<{ room: GroupChatRoom; members: GroupChatMember[] }> {
  const response = await apiClient.get<GroupChatDetailResponse>(
    `/api/messages/groups/${encodeURIComponent(roomId)}`,
  );
  if (!response.room) {
    throw new Error('Group room was not found.');
  }
  return {
    room: response.room,
    members: Array.isArray(response.members) ? response.members : [],
  };
}

export async function joinGroupChatRoom(roomId: string): Promise<void> {
  await apiClient.post(`/api/messages/groups/${encodeURIComponent(roomId)}/join`);
}

export async function leaveGroupChatRoom(roomId: string): Promise<void> {
  await apiClient.post(`/api/messages/groups/${encodeURIComponent(roomId)}/leave`);
}

export async function listGroupChatRoomMessages(roomId: string): Promise<GroupChatRoomMessage[]> {
  const response = await apiClient.get<GroupChatMessagesResponse>(
    `/api/messages/groups/${encodeURIComponent(roomId)}/messages`,
  );
  return Array.isArray(response.messages) ? response.messages : [];
}

export async function sendGroupChatRoomMessage(
  roomId: string,
  input: {
    id: string;
    user: string;
    senderId?: string;
    text: string;
    createdAt: number;
    type?: 'user' | 'system';
    media?: Record<string, unknown>;
    replyTo?: {
      id: string;
      user?: string;
      text?: string;
      senderId?: string;
    } | null;
  },
): Promise<GroupChatRoomMessage | null> {
  const response = await apiClient.post<GroupChatMessagesResponse>(
    `/api/messages/groups/${encodeURIComponent(roomId)}/messages`,
    {
      id: input.id,
      createdAt: input.createdAt,
      message: input,
    },
  );
  return response.message ?? null;
}
