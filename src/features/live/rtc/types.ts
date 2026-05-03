export type RtcParticipantRole = 'host' | 'panel' | 'watcher';

export type RtcConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'
  | 'unknown';

export type RtcParticipantSnapshot = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  role: RtcParticipantRole;
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  isConnectedToRtc: boolean;
  connectionState: RtcConnectionState;
  isSpeaking: boolean;
  isLocal: boolean;
};

export type RtcRoomState = {
  liveId: string;
  hostUserId: string | null;
  roomVersion: number;
  activeScreenshareUserId: string | null;
  maxActivePublishers: number;
  participants: Array<{
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    role: 'panel' | 'watcher';
    micEnabled: boolean;
    cameraEnabled: boolean;
    hasAudioTrack: boolean;
    hasVideoTrack: boolean;
    isConnectedToRtc: boolean;
    connectionState: RtcConnectionState | 'connected';
    joinedAt: number;
  }>;
  pendingPanelInvites: Array<{
    targetUserId: string;
    sourceUserId: string;
    createdAt: number;
  }>;
  pendingPanelRequests: Array<{
    requesterUserId: string;
    createdAt: number;
  }>;
  iceServers: Array<{
    urls: string[] | string;
    username?: string;
    credential?: string;
  }>;
  topology: string;
};

export type RtcDebugState = {
  enabled: boolean;
  socketConnected: boolean;
  localRole: RtcParticipantRole;
  localAudioTrackPresent: boolean;
  localVideoTrackPresent: boolean;
  lastError: string | null;
  lastRenegotiationAt: number | null;
  lastCommandAck: {
    action: string;
    ok: boolean;
    code: string;
    roomVersion: number;
    at: number;
  } | null;
  peerStatesByUserId: Record<
    string,
    {
      connectionState: RtcConnectionState;
      iceConnectionState: string;
    }
  >;
};

export type RtcHookState = {
  connected: boolean;
  participantsByUserId: Record<string, RtcParticipantSnapshot>;
  remoteStreamsByUserId: Record<string, unknown>;
  localStream: unknown | null;
  currentRole: RtcParticipantRole;
  pendingInviteFromHostUserId: string | null;
  pendingRequestUserIds: string[];
  speakingUserIds: string[];
  debug: RtcDebugState;
};

export type RtcCommandAck = {
  ok: boolean;
  code: string;
  roomVersion: number;
  roomState?: RtcRoomState;
};

export type RtcSessionPayload = {
  liveId: string;
  participantId: string;
  sessionId: string;
  wsUrl: string;
  token: string;
  tokenType: 'Bearer';
  issuedAt: string;
  expiresAt: string;
  topology: string;
  iceServers: RtcRoomState['iceServers'];
  participant: {
    userId: string;
    authUserId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    roleHint: RtcParticipantRole;
  };
  roomState: RtcRoomState;
};

export type RtcSessionResponse = {
  ok: boolean;
  code: string;
  message?: string;
  session?: RtcSessionPayload;
};

export type RtcSignalKind = 'offer' | 'answer' | 'ice' | 'renegotiate';

export type RtcRealtimeEnvelope =
  | {
      type: 'ack';
      requestId: string;
      ok: boolean;
      code: string;
      roomVersion: number;
      roomState?: RtcRoomState;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      requestId?: string;
      roomVersion?: number;
      details?: Record<string, unknown>;
    }
  | {
      type: 'room_state';
      roomState: RtcRoomState;
    }
  | {
      type: 'participant_joined';
      participant: RtcRoomState['participants'][number];
      roomVersion: number;
    }
  | {
      type: 'participant_left';
      userId: string;
      roomVersion: number;
    }
  | {
      type: 'panel_request_received';
      requesterUserId: string;
      roomVersion: number;
    }
  | {
      type: 'panel_invited';
      sourceUserId: string;
      targetUserId: string;
      roomVersion: number;
    }
  | {
      type: 'panel_invite_resolved';
      sourceUserId: string;
      targetUserId: string;
      accepted: boolean;
      roomVersion: number;
    }
  | {
      type: 'panel_request_resolved';
      requesterUserId: string;
      accepted: boolean;
      removed?: boolean;
      roomVersion: number;
    }
  | {
      type: 'participant_media_state';
      userId: string;
      micEnabled: boolean;
      cameraEnabled: boolean;
      hasAudioTrack: boolean;
      hasVideoTrack: boolean;
      role: 'panel' | 'watcher';
      roomVersion: number;
    }
  | {
      type: 'signal';
      kind: RtcSignalKind;
      targetUserId: string;
      sourceUserId: string;
      roomVersion: number;
      sdp?: unknown;
      candidate?: unknown;
    }
  | {
      type: 'pong';
      ts: number;
    };
