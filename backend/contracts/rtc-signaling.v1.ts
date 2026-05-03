export const RTC_SESSION_CONTRACT_VERSION = "rtc-session.v1" as const;
export const RTC_SIGNAL_CONTRACT_VERSION = "rtc-signal.v1" as const;

export type RtcRoleHint = "host" | "panel" | "watcher";

export type RtcIceServer = {
  urls: string[] | string;
  username?: string;
  credential?: string;
};

export type RtcParticipantSnapshot = {
  userId: string;
  authUserId?: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  role: "panel" | "watcher";
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  isConnectedToRtc: boolean;
  connectionState:
    | "new"
    | "connecting"
    | "connected"
    | "disconnected"
    | "failed"
    | "closed"
    | "unknown";
  joinedAt: number;
};

export type RtcRoomState = {
  liveId: string;
  hostUserId: string | null;
  roomVersion: number;
  activeScreenshareUserId: string | null;
  maxActivePublishers: number;
  participants: RtcParticipantSnapshot[];
  pendingPanelInvites: Array<{
    targetUserId: string;
    sourceUserId: string;
    createdAt: number;
  }>;
  pendingPanelRequests: Array<{
    requesterUserId: string;
    createdAt: number;
  }>;
  iceServers: RtcIceServer[];
  topology: string;
};

export type RtcSessionRequest = {
  liveId: string;
  roleHint?: RtcRoleHint;
  knownVuluUserId?: string;
};

export type RtcSessionEnvelope = {
  ok: true;
  code: "ok";
  requestId: string;
  correlationId: string;
  contractVersion: typeof RTC_SESSION_CONTRACT_VERSION;
  session: {
    liveId: string;
    participantId: string;
    sessionId: string;
    wsUrl: string;
    token: string;
    tokenType: "Bearer";
    issuedAt: string;
    expiresAt: string;
    topology: string;
    iceServers: RtcIceServer[];
    participant: {
      userId: string;
      authUserId: string;
      displayName: string;
      username: string;
      avatarUrl: string;
      roleHint: RtcRoleHint;
    };
    roomState: RtcRoomState;
  };
};

export type RtcSignalKind = "offer" | "answer" | "ice" | "renegotiate";

export type RtcCommandAction =
  | "join"
  | "leave"
  | "request_panel"
  | "invite_panel"
  | "respond_panel_invite"
  | "respond_panel_request"
  | "remove_panel_member"
  | "leave_panel"
  | "toggle_mic"
  | "toggle_camera"
  | "start_screenshare"
  | "stop_screenshare"
  | "signal"
  | "ping";

export type RtcCommandEnvelope = {
  type: "command";
  requestId: string;
  action: RtcCommandAction;
  liveId: string;
  payload?: Record<string, unknown>;
};

export type RtcAckEnvelope = {
  type: "ack";
  requestId: string;
  ok: boolean;
  code: string;
  roomVersion: number;
  roomState?: RtcRoomState;
};

export type RtcErrorEnvelope = {
  type: "error";
  code: string;
  message: string;
  requestId?: string;
  roomVersion?: number;
  details?: Record<string, unknown>;
};

export type RtcRoomStateEnvelope = {
  type: "room_state";
  roomState: RtcRoomState;
};

export type RtcParticipantJoinedEnvelope = {
  type: "participant_joined";
  participant: RtcParticipantSnapshot;
  roomVersion: number;
};

export type RtcParticipantLeftEnvelope = {
  type: "participant_left";
  userId: string;
  roomVersion: number;
};

export type RtcPanelRequestReceivedEnvelope = {
  type: "panel_request_received";
  requesterUserId: string;
  roomVersion: number;
};

export type RtcPanelInvitedEnvelope = {
  type: "panel_invited";
  sourceUserId: string;
  targetUserId: string;
  roomVersion: number;
};

export type RtcPanelInviteResolvedEnvelope = {
  type: "panel_invite_resolved";
  sourceUserId: string;
  targetUserId: string;
  accepted: boolean;
  roomVersion: number;
};

export type RtcPanelRequestResolvedEnvelope = {
  type: "panel_request_resolved";
  requesterUserId: string;
  accepted: boolean;
  removed?: boolean;
  roomVersion: number;
};

export type RtcParticipantMediaStateEnvelope = {
  type: "participant_media_state";
  userId: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  role: "panel" | "watcher";
  roomVersion: number;
};

export type RtcSignalEventEnvelope = {
  type: "signal";
  kind: RtcSignalKind;
  targetUserId: string;
  sourceUserId: string;
  roomVersion: number;
  sdp?: unknown;
  candidate?: unknown;
};

export type RtcPongEnvelope = {
  type: "pong";
  ts: number;
};

export type RtcRealtimeEnvelope =
  | RtcAckEnvelope
  | RtcErrorEnvelope
  | RtcRoomStateEnvelope
  | RtcParticipantJoinedEnvelope
  | RtcParticipantLeftEnvelope
  | RtcPanelRequestReceivedEnvelope
  | RtcPanelInvitedEnvelope
  | RtcPanelInviteResolvedEnvelope
  | RtcPanelRequestResolvedEnvelope
  | RtcParticipantMediaStateEnvelope
  | RtcSignalEventEnvelope
  | RtcPongEnvelope;
