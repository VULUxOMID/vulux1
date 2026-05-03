export type DemoRoomStatus = 'created' | 'live' | 'ended';

export type DemoRoom = {
  id: string;
  title: string;
  hostUsername: string;
  status: DemoRoomStatus;
  createdAt: number;
  startedAt: number | null;
  updatedAt: number;
  viewerCount: number;
  viewerUsernames: string[];
  invitedUsernames: string[];
  isHost: boolean;
  isViewer: boolean;
  canJoin: boolean;
  invitePending: boolean;
};

export type DemoInvite = {
  id: string;
  roomId: string;
  roomTitle: string;
  roomStatus: DemoRoomStatus;
  hostUsername: string;
  targetUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  updatedAt: number;
};

export type DemoStateSnapshot = {
  username: string;
  activeRooms: DemoRoom[];
  myRooms: DemoRoom[];
  pendingInvites: DemoInvite[];
};
