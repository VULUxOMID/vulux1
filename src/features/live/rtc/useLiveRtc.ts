import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { getBackendTokenTemplate } from '../../../config/backendToken';
import { getBackendToken } from '../../../utils/backendToken';
import { getRtcBackendBaseUrl, isRtcDebugOverlayEnabled, isRtcEnabled } from './config';
import {
  createEmptyMediaStream,
  getMediaDevices,
  getRTCIceCandidateImpl,
  getRTCPeerConnectionImpl,
  getRTCSessionDescriptionImpl,
  isRtcSupported,
} from './platform';
import type {
  RtcCommandAck,
  RtcConnectionState,
  RtcHookState,
  RtcParticipantRole,
  RtcParticipantSnapshot,
  RtcRealtimeEnvelope,
  RtcRoomState,
  RtcSessionResponse,
} from './types';

type GetTokenFn = (options?: { template?: string }) => Promise<string | null>;

type UseLiveRtcOptions = {
  liveId: string | null;
  userId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string;
  isHost: boolean;
  getToken: GetTokenFn;
};

type PeerRecord = {
  pc: any;
  remoteUserId: string;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  sendersByKind: Map<string, any>;
  remoteStream: any;
  statsTimer: ReturnType<typeof setInterval> | null;
};

type ParticipantRoomMember = RtcRoomState['participants'][number];

const RTC_ACK_TIMEOUT_MS = 12_000;
const RTC_RECONNECT_MAX_DELAY_MS = 15_000;
const RTC_SESSION_TIMEOUT_MS = 12_000;
const RTC_SOCKET_OPEN_TIMEOUT_MS = 10_000;
const RTC_COMMAND_RETRY_READY_TIMEOUT_MS = 5_000;

function normalizeConnectionState(value: unknown): RtcConnectionState {
  if (
    value === 'new' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'disconnected' ||
    value === 'failed' ||
    value === 'closed'
  ) {
    return value;
  }
  return 'unknown';
}

function resolveParticipantRole(
  participant: ParticipantRoomMember | undefined,
  hostUserId: string | null,
  userId: string,
): RtcParticipantRole {
  if (hostUserId && userId === hostUserId) {
    return 'host';
  }
  if (participant?.role === 'panel') {
    return 'panel';
  }
  return 'watcher';
}

function stopStream(stream: any | null | undefined) {
  if (!stream || typeof stream.getTracks !== 'function') {
    return;
  }
  const tracks = stream.getTracks();
  tracks.forEach((track: any) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
}

function createRtcRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rtc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseRtcEnvelope(data: unknown): RtcRealtimeEnvelope | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as RtcRealtimeEnvelope;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildRtcWebSocketUrl(session: { wsUrl: string; sessionId: string; token: string }) {
  const url = new URL(session.wsUrl);
  url.searchParams.set('sessionId', session.sessionId);
  url.searchParams.set('token', session.token);
  return url.toString();
}

export function useLiveRtc({
  liveId,
  userId,
  displayName,
  username,
  avatarUrl,
  isHost,
  getToken,
}: UseLiveRtcOptions) {
  const enabled = isRtcEnabled() && isRtcSupported();
  const debugEnabled = isRtcDebugOverlayEnabled();
  const backendBaseUrl = getRtcBackendBaseUrl();

  const [connected, setConnected] = useState(false);
  const [currentRole, setCurrentRole] = useState<RtcParticipantRole>(isHost ? 'host' : 'watcher');
  const [participantsByUserId, setParticipantsByUserId] = useState<
    Record<string, RtcParticipantSnapshot>
  >({});
  const [remoteStreamsByUserId, setRemoteStreamsByUserId] = useState<Record<string, unknown>>({});
  const [localStream, setLocalStream] = useState<unknown | null>(null);
  const [pendingInviteFromHostUserId, setPendingInviteFromHostUserId] = useState<string | null>(null);
  const [pendingRequestUserIds, setPendingRequestUserIds] = useState<string[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastRenegotiationAt, setLastRenegotiationAt] = useState<number | null>(null);
  const [lastCommandAck, setLastCommandAck] = useState<{
    action: string;
    ok: boolean;
    code: string;
    roomVersion: number;
    at: number;
  } | null>(null);
  const [peerStatesByUserId, setPeerStatesByUserId] = useState<
    Record<string, { connectionState: RtcConnectionState; iceConnectionState: string }>
  >({});

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const emitCommandRef = useRef<
    (action: string, payload?: Record<string, unknown>) => Promise<RtcCommandAck>
  >(async () => ({
    ok: false,
    code: 'socket_unavailable',
    roomVersion: 0,
  }));
  const pendingAcksRef = useRef<
    Map<string, { resolve: (ack: RtcCommandAck) => void; timeoutId: ReturnType<typeof setTimeout> }>
  >(new Map());
  const sessionRef = useRef<NonNullable<RtcSessionResponse['session']> | null>(null);
  const connectingRef = useRef(false);
  const closedManuallyRef = useRef(false);
  const peersRef = useRef<Map<string, PeerRecord>>(new Map());
  const roomVersionRef = useRef(0);
  const iceServersRef = useRef<any[]>([]);
  const joinedLiveIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<any | null>(null);
  const localMicEnabledRef = useRef(true);
  const localCameraEnabledRef = useRef(true);
  const currentRoleRef = useRef<RtcParticipantRole>(isHost ? 'host' : 'watcher');
  const mountedRef = useRef(true);
  const connectedRef = useRef(false);
  const peerStatesRef = useRef<
    Record<string, { connectionState: RtcConnectionState; iceConnectionState: string }>
  >({});
  const speakingUserIdsRef = useRef<string[]>([]);
  const participantsByUserIdRef = useRef<Record<string, RtcParticipantSnapshot>>({});

  const resolvePendingAcks = useCallback(
    (action: string, code: RtcCommandAck['code']) => {
      if (pendingAcksRef.current.size === 0) {
        return;
      }
      for (const pending of pendingAcksRef.current.values()) {
        clearTimeout(pending.timeoutId);
        pending.resolve({
          ok: false,
          code,
          roomVersion: roomVersionRef.current,
        });
      }
      pendingAcksRef.current.clear();
      setLastCommandAck({
        action,
        ok: false,
        code,
        roomVersion: roomVersionRef.current,
        at: Date.now(),
      });
    },
    [],
  );

  const applyParticipantState = useCallback(
    (roomState: RtcRoomState) => {
      if (!userId) {
        return;
      }

      roomVersionRef.current = roomState.roomVersion;
      iceServersRef.current = Array.isArray(roomState.iceServers) ? roomState.iceServers : [];
      setPendingInviteFromHostUserId(
        roomState.pendingPanelInvites.find((entry) => entry.targetUserId === userId)?.sourceUserId ?? null,
      );
      setPendingRequestUserIds(roomState.pendingPanelRequests.map((entry) => entry.requesterUserId));

      const nextParticipants: Record<string, RtcParticipantSnapshot> = {};
      roomState.participants.forEach((participant) => {
        const role = resolveParticipantRole(participant, roomState.hostUserId, participant.userId);
        nextParticipants[participant.userId] = {
          userId: participant.userId,
          displayName: participant.displayName,
          username: participant.username,
          avatarUrl: participant.avatarUrl,
          role,
          micEnabled: participant.micEnabled,
          cameraEnabled: participant.cameraEnabled,
          hasAudioTrack: participant.hasAudioTrack,
          hasVideoTrack: participant.hasVideoTrack,
          isConnectedToRtc: participant.isConnectedToRtc,
          connectionState:
            participant.userId === userId
              ? connectedRef.current
                ? 'connected'
                : 'connecting'
              : peerStatesRef.current[participant.userId]?.connectionState ??
                normalizeConnectionState(participant.connectionState),
          isSpeaking: speakingUserIdsRef.current.includes(participant.userId),
          isLocal: participant.userId === userId,
        };
      });

      setParticipantsByUserId(nextParticipants);
      const selfParticipant = roomState.participants.find((participant) => participant.userId === userId);
      const nextRole = resolveParticipantRole(selfParticipant, roomState.hostUserId, userId);
      currentRoleRef.current = nextRole;
      setCurrentRole(nextRole);
    },
    [userId],
  );

  const sendSignal = useCallback(
    (targetUserId: string, kind: string, payload: Record<string, unknown>) => {
      void emitCommandRef.current('signal', {
        targetUserId,
        kind,
        roomVersion: roomVersionRef.current,
        ...payload,
      });
    },
    [],
  );

  const updatePeerState = useCallback(
    (remoteUserId: string, state: { connectionState?: RtcConnectionState; iceConnectionState?: string }) => {
      setPeerStatesByUserId((current) => {
        const next = {
          ...current,
          [remoteUserId]: {
            connectionState: state.connectionState ?? current[remoteUserId]?.connectionState ?? 'new',
            iceConnectionState: state.iceConnectionState ?? current[remoteUserId]?.iceConnectionState ?? 'new',
          },
        };
        peerStatesRef.current = next;
        return next;
      });
    },
    [],
  );

  const upsertParticipantSnapshot = useCallback(
    (
      nextParticipant: Partial<RtcParticipantSnapshot> &
        Pick<RtcParticipantSnapshot, 'userId' | 'displayName' | 'username' | 'avatarUrl' | 'role'>,
    ) => {
      const existingParticipant = participantsByUserIdRef.current[nextParticipant.userId];
      const normalizedRole =
        nextParticipant.userId === userId && isHost
          ? 'host'
          : existingParticipant?.role === 'host'
          ? 'host'
          : nextParticipant.role;
      setParticipantsByUserId((current) => {
        const existing = current[nextParticipant.userId];
        const next: RtcParticipantSnapshot = {
          userId: nextParticipant.userId,
          displayName: nextParticipant.displayName,
          username: nextParticipant.username,
          avatarUrl: nextParticipant.avatarUrl,
          role: normalizedRole,
          micEnabled: nextParticipant.micEnabled ?? existing?.micEnabled ?? false,
          cameraEnabled: nextParticipant.cameraEnabled ?? existing?.cameraEnabled ?? false,
          hasAudioTrack: nextParticipant.hasAudioTrack ?? existing?.hasAudioTrack ?? false,
          hasVideoTrack: nextParticipant.hasVideoTrack ?? existing?.hasVideoTrack ?? false,
          isConnectedToRtc: nextParticipant.isConnectedToRtc ?? existing?.isConnectedToRtc ?? true,
          connectionState:
            nextParticipant.connectionState ?? existing?.connectionState ?? 'connecting',
          isSpeaking: nextParticipant.isSpeaking ?? existing?.isSpeaking ?? false,
          isLocal: nextParticipant.userId === userId,
        };
        return {
          ...current,
          [nextParticipant.userId]: next,
        };
      });

      if (nextParticipant.userId === userId) {
        currentRoleRef.current = normalizedRole;
        setCurrentRole(normalizedRole);
      }
    },
    [isHost, userId],
  );

  const syncSpeakingState = useCallback(async (peer: PeerRecord) => {
    if (!mountedRef.current) {
      return;
    }

    try {
      const stats = await peer.pc.getStats();
      let detected = false;
      stats.forEach((report: any) => {
        const kind = report.kind ?? report.mediaType;
        const audioLevel = typeof report.audioLevel === 'number' ? report.audioLevel : null;
        if (kind === 'audio' && audioLevel !== null && audioLevel > 0.03) {
          detected = true;
        }
      });

      setSpeakingUserIds((current) => {
        const hasCurrent = current.includes(peer.remoteUserId);
        if (detected === hasCurrent) {
          return current;
        }
        if (detected) {
          const next = [...current.filter((entry) => entry !== peer.remoteUserId), peer.remoteUserId];
          speakingUserIdsRef.current = next;
          return next;
        }
        const next = current.filter((entry) => entry !== peer.remoteUserId);
        speakingUserIdsRef.current = next;
        return next;
      });
    } catch {
      // Ignore stats failures.
    }
  }, []);

  const closePeer = useCallback((remoteUserId: string) => {
    const peer = peersRef.current.get(remoteUserId);
    if (!peer) {
      return;
    }
    if (peer.statsTimer) {
      clearInterval(peer.statsTimer);
    }
    try {
      peer.pc.close();
    } catch {
      // ignore
    }
    peersRef.current.delete(remoteUserId);
    setRemoteStreamsByUserId((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
    setPeerStatesByUserId((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
    setSpeakingUserIds((current) => current.filter((entry) => entry !== remoteUserId));
    speakingUserIdsRef.current = speakingUserIdsRef.current.filter((entry) => entry !== remoteUserId);
  }, []);

  const removeLocalTracksFromPeers = useCallback(async () => {
    const peers = Array.from(peersRef.current.values());
    await Promise.all(
      peers.map(async (peer) => {
        for (const [kind, sender] of peer.sendersByKind.entries()) {
          try {
            peer.pc.removeTrack(sender);
          } catch {
            // ignore
          }
          peer.sendersByKind.delete(kind);
        }
      }),
    );
  }, []);

  const syncLocalTracks = useCallback(async () => {
    const stream = localStreamRef.current;
    const shouldPublish = currentRoleRef.current === 'host' || currentRoleRef.current === 'panel';
    const peers = Array.from(peersRef.current.values());

    await Promise.all(
      peers.map(async (peer) => {
        if (!shouldPublish || !stream || typeof stream.getTracks !== 'function') {
          for (const [kind, sender] of peer.sendersByKind.entries()) {
            try {
              peer.pc.removeTrack(sender);
            } catch {
              // ignore
            }
            peer.sendersByKind.delete(kind);
          }
          return;
        }

        const tracks = stream.getTracks() as any[];
        const nextKinds = new Set<string>();
        for (const track of tracks) {
          nextKinds.add(track.kind);
          const existingSender = peer.sendersByKind.get(track.kind);
          if (existingSender) {
            if (existingSender.track !== track) {
              await existingSender.replaceTrack(track);
            }
            continue;
          }
          const sender = peer.pc.addTrack(track, stream);
          peer.sendersByKind.set(track.kind, sender);
        }

        for (const [kind, sender] of peer.sendersByKind.entries()) {
          if (nextKinds.has(kind)) continue;
          try {
            peer.pc.removeTrack(sender);
          } catch {
            // ignore
          }
          peer.sendersByKind.delete(kind);
        }
      }),
    );
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const rtcMediaDevices = getMediaDevices();
    if (!rtcMediaDevices?.getUserMedia) {
      setLastError('RTC media capture is unavailable on this device.');
      return null;
    }

    try {
      const stream = await rtcMediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: 720,
          height: 1280,
        },
      });

      const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
      tracks.forEach((track: any) => {
        if (track.kind === 'audio') {
          track.enabled = localMicEnabledRef.current;
        }
        if (track.kind === 'video') {
          track.enabled = localCameraEnabledRef.current;
        }
      });

      localStreamRef.current = stream;
      if (mountedRef.current) {
        setLocalStream(stream);
      }
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not access microphone/camera.';
      setLastError(message);
      localMicEnabledRef.current = false;
      localCameraEnabledRef.current = false;
      return null;
    }
  }, []);

  const restartIce = useCallback(
    async (targetUserId?: string) => {
      const targets = targetUserId ? [targetUserId] : Array.from(peersRef.current.keys());
      await Promise.all(
        targets.map(async (remoteUserId) => {
          const peer = peersRef.current.get(remoteUserId);
          if (!peer) return;
          try {
            const offer = await peer.pc.createOffer({ iceRestart: true });
            await peer.pc.setLocalDescription(offer);
            sendSignal(remoteUserId, 'offer', { sdp: peer.pc.localDescription });
            setLastRenegotiationAt(Date.now());
          } catch {
            closePeer(remoteUserId);
          }
        }),
      );
    },
    [closePeer, sendSignal],
  );

  const ensurePeer = useCallback(
    (remoteUserId: string) => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) {
        return existing;
      }

      const PeerConnectionImpl = getRTCPeerConnectionImpl();
      if (!PeerConnectionImpl) {
        setLastError('RTC peer connections are unavailable on this device.');
        return null;
      }

      const pc = new PeerConnectionImpl({
        iceServers: iceServersRef.current,
      });
      const peer: PeerRecord = {
        pc,
        remoteUserId,
        polite: !isHost,
        makingOffer: false,
        ignoreOffer: false,
        sendersByKind: new Map(),
        remoteStream: createEmptyMediaStream(),
        statsTimer: null,
      };

      pc.onicecandidate = (event: { candidate?: any | null }) => {
        if (!event.candidate) return;
        sendSignal(remoteUserId, 'ice', { candidate: event.candidate });
      };

      pc.ontrack = (event: { streams?: any[]; track?: any }) => {
        const incomingStream =
          Array.isArray(event.streams) && event.streams[0] ? event.streams[0] : peer.remoteStream;
        if (!Array.isArray(event.streams) || !event.streams[0]) {
          incomingStream.addTrack?.(event.track);
        }
        peer.remoteStream = incomingStream;
        setRemoteStreamsByUserId((current) => ({
          ...current,
          [remoteUserId]: incomingStream,
        }));
      };

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') {
            return;
          }
          await pc.setLocalDescription(offer);
          sendSignal(remoteUserId, 'offer', { sdp: pc.localDescription });
          setLastRenegotiationAt(Date.now());
        } catch (error) {
          setLastError(error instanceof Error ? error.message : 'Renegotiation failed.');
        } finally {
          peer.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        const connectionState = normalizeConnectionState(pc.connectionState);
        updatePeerState(remoteUserId, {
          connectionState,
        });
        if (connectionState === 'failed') {
          void restartIce(remoteUserId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        updatePeerState(remoteUserId, {
          iceConnectionState: String(pc.iceConnectionState ?? 'unknown'),
        });
      };

      peer.statsTimer = setInterval(() => {
        void syncSpeakingState(peer);
      }, 1_250);

      peersRef.current.set(remoteUserId, peer);
      void syncLocalTracks();
      return peer;
    },
    [isHost, restartIce, sendSignal, syncLocalTracks, syncSpeakingState, updatePeerState],
  );

  const handleSignal = useCallback(
    async (payload: any) => {
      const remoteUserId = String(payload?.sourceUserId ?? '').trim();
      if (!remoteUserId || remoteUserId === userId) {
        return;
      }

      const peer = ensurePeer(remoteUserId);
      if (!peer) {
        return;
      }
      const pc = peer.pc;
      const SessionDescriptionImpl = getRTCSessionDescriptionImpl();
      const IceCandidateImpl = getRTCIceCandidateImpl();
      const description = payload?.sdp
        ? SessionDescriptionImpl
          ? new SessionDescriptionImpl(payload.sdp)
          : null
        : null;

      try {
        if (payload?.kind === 'offer' && description) {
          const readyForOffer = !peer.makingOffer && pc.signalingState === 'stable';
          const offerCollision = !readyForOffer;
          peer.ignoreOffer = !peer.polite && offerCollision;
          if (peer.ignoreOffer) {
            return;
          }

          await pc.setRemoteDescription(description);
          if ((currentRoleRef.current === 'host' || currentRoleRef.current === 'panel') && !localStreamRef.current) {
            await ensureLocalStream();
          }
          await syncLocalTracks();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(remoteUserId, 'answer', { sdp: pc.localDescription });
          return;
        }

        if (payload?.kind === 'answer' && description) {
          await pc.setRemoteDescription(description);
          return;
        }

        if (payload?.kind === 'ice' && payload?.candidate) {
          if (!IceCandidateImpl) {
            setLastError('RTC ICE candidates are unavailable on this device.');
            return;
          }
          try {
            await pc.addIceCandidate(new IceCandidateImpl(payload.candidate));
          } catch (error) {
            if (!peer.ignoreOffer) {
              throw error;
            }
          }
          return;
        }

        if (payload?.kind === 'renegotiate') {
          await restartIce(remoteUserId);
        }
      } catch (error) {
        setLastError(error instanceof Error ? error.message : 'RTC signaling failed.');
      }
    },
    [ensureLocalStream, ensurePeer, restartIce, sendSignal, syncLocalTracks, userId],
  );

  const emitCommand = useCallback(
    async (action: string, payload: Record<string, unknown> = {}): Promise<RtcCommandAck> => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !liveId) {
        setLastCommandAck({
          action,
          ok: false,
          code: 'socket_unavailable',
          roomVersion: roomVersionRef.current,
          at: Date.now(),
        });
        return {
          ok: false,
          code: 'socket_unavailable',
          roomVersion: roomVersionRef.current,
        };
      }

      return new Promise<RtcCommandAck>((resolve) => {
        const requestId = createRtcRequestId();
        const timeoutId = setTimeout(() => {
          pendingAcksRef.current.delete(requestId);
          setLastCommandAck({
            action,
            ok: false,
            code: 'ack_timeout',
            roomVersion: roomVersionRef.current,
            at: Date.now(),
          });
          resolve({
            ok: false,
            code: 'ack_timeout',
            roomVersion: roomVersionRef.current,
          });
        }, RTC_ACK_TIMEOUT_MS);

        pendingAcksRef.current.set(requestId, {
          resolve: (ack) => {
            clearTimeout(timeoutId);
            if (ack?.roomState) {
              applyParticipantState(ack.roomState);
            }
            setLastCommandAck({
              action,
              ok: Boolean(ack?.ok),
              code: ack?.code ?? 'missing_ack',
              roomVersion: ack?.roomVersion ?? roomVersionRef.current,
              at: Date.now(),
            });
            resolve(
              ack ?? {
                ok: false,
                code: 'missing_ack',
                roomVersion: roomVersionRef.current,
              },
            );
          },
          timeoutId,
        });

        try {
          socket.send(
            JSON.stringify({
              type: 'command',
              requestId,
              action,
              liveId,
              payload,
            }),
          );
        } catch {
          clearTimeout(timeoutId);
          pendingAcksRef.current.delete(requestId);
          setLastCommandAck({
            action,
            ok: false,
            code: 'socket_send_failed',
            roomVersion: roomVersionRef.current,
            at: Date.now(),
          });
          resolve({
            ok: false,
            code: 'socket_send_failed',
            roomVersion: roomVersionRef.current,
          });
        }
      });
    },
    [applyParticipantState, liveId],
  );

  useEffect(() => {
    emitCommandRef.current = emitCommand;
  }, [emitCommand]);

  const forceSocketReconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    try {
      socket.close(4001, 'rtc_command_retry');
    } catch {
      // ignore
    }
  }, []);

  const waitForSocketReady = useCallback(async (timeoutMs = RTC_COMMAND_RETRY_READY_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socket = socketRef.current;
      if (connectedRef.current && socket && socket.readyState === WebSocket.OPEN) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }, []);

  const emitCommandWithRetry = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      let lastAck: RtcCommandAck = {
        ok: false,
        code: 'socket_unavailable',
        roomVersion: roomVersionRef.current,
      };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ack = await emitCommand(action, payload);
        lastAck = ack;
        if (ack.ok) {
          return ack;
        }

        const shouldRetry =
          ack.code === 'ack_timeout' ||
          ack.code === 'socket_unavailable' ||
          ack.code === 'socket_closed' ||
          ack.code === 'socket_send_failed';
        if (!shouldRetry || attempt === 2) {
          return ack;
        }

        forceSocketReconnect();
        await waitForSocketReady();
      }
      return lastAck;
    },
    [emitCommand, forceSocketReconnect, waitForSocketReady],
  );

  const publishAsPanel = useCallback(async () => {
    const stream = await ensureLocalStream();
    if (!stream) {
      return false;
    }
    await syncLocalTracks();
    await emitCommandWithRetry('toggle_mic', {
      enabled: localMicEnabledRef.current,
    });
    await emitCommandWithRetry('toggle_camera', {
      enabled: localCameraEnabledRef.current,
    });
    return true;
  }, [emitCommandWithRetry, ensureLocalStream, syncLocalTracks]);

  const unpublishAsPanel = useCallback(async () => {
    await removeLocalTracksFromPeers();
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    localMicEnabledRef.current = false;
    localCameraEnabledRef.current = false;
  }, [removeLocalTracksFromPeers]);

  const syncPeersForRoomState = useCallback(
    async (roomState: RtcRoomState) => {
      applyParticipantState(roomState);
      const remoteUserIds = roomState.participants
        .map((participant) => participant.userId)
        .filter((participantId) => participantId !== userId);
      remoteUserIds.forEach((remoteUserId) => {
        ensurePeer(remoteUserId);
      });
      Array.from(peersRef.current.keys()).forEach((remoteUserId) => {
        if (!remoteUserIds.includes(remoteUserId)) {
          closePeer(remoteUserId);
        }
      });

      if (!userId) {
        return;
      }

      const selfParticipant = roomState.participants.find((participant) => participant.userId === userId);
      const nextRole = resolveParticipantRole(selfParticipant, roomState.hostUserId, userId);
      if (nextRole === 'host' || nextRole === 'panel') {
        await publishAsPanel();
      } else {
        await unpublishAsPanel();
      }
    },
    [applyParticipantState, closePeer, ensurePeer, publishAsPanel, unpublishAsPanel, userId],
  );

  const joinRoom = useCallback(async () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !liveId || !userId) {
      return;
    }

    if (isHost) {
      await ensureLocalStream();
    }

    const ack = await emitCommand('join', {
      micEnabled: isHost ? localMicEnabledRef.current : false,
      cameraEnabled: isHost ? localCameraEnabledRef.current : false,
    });
    if (!ack?.ok || !ack.roomState) {
      setLastError(ack?.code ?? 'join_failed');
      return;
    }

    joinedLiveIdRef.current = liveId;
    await syncPeersForRoomState(ack.roomState);
  }, [
    ensureLocalStream,
    emitCommand,
    isHost,
    liveId,
    syncPeersForRoomState,
    userId,
  ]);

  const disconnect = useCallback(async () => {
    closedManuallyRef.current = true;
    joinedLiveIdRef.current = null;
    sessionRef.current = null;
    connectingRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    resolvePendingAcks('disconnect', 'socket_closed');
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN && liveId) {
      try {
        socket.send(
          JSON.stringify({
            type: 'command',
            requestId: createRtcRequestId(),
            action: 'leave',
            liveId,
          }),
        );
      } catch {
        // ignore
      }
    }
    try {
      socket?.close(1000, 'client_disconnect');
    } catch {
      // ignore
    }
    Array.from(peersRef.current.keys()).forEach((remoteUserId) => {
      closePeer(remoteUserId);
    });
    await unpublishAsPanel();
    setConnected(false);
    connectedRef.current = false;
    setParticipantsByUserId({});
    setPendingInviteFromHostUserId(null);
    setPendingRequestUserIds([]);
    setSpeakingUserIds([]);
    peerStatesRef.current = {};
    speakingUserIdsRef.current = [];
  }, [closePeer, liveId, resolvePendingAcks, unpublishAsPanel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    participantsByUserIdRef.current = participantsByUserId;
  }, [participantsByUserId]);

  useEffect(() => {
    speakingUserIdsRef.current = speakingUserIds;
  }, [speakingUserIds]);

  useEffect(() => {
    localMicEnabledRef.current = true;
    localCameraEnabledRef.current = true;
  }, [liveId]);

  useEffect(() => {
    if (!enabled || !backendBaseUrl || !liveId || !userId) {
      void disconnect();
      return;
    }

    let cancelled = false;

    const scheduleReconnect = () => {
      if (closedManuallyRef.current || reconnectTimerRef.current) {
        return;
      }
      const delayMs = Math.min(
        1000 * Math.pow(2, reconnectAttemptRef.current),
        RTC_RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (connectingRef.current) {
        return;
      }
      connectingRef.current = true;
      const token = await getBackendToken(getToken, getBackendTokenTemplate());
      if (cancelled) {
        connectingRef.current = false;
        return;
      }
      if (!token) {
        connectingRef.current = false;
        setLastError('Missing backend auth token for RTC.');
        scheduleReconnect();
        return;
      }

      let sessionPayload: RtcSessionResponse | null = null;
      const abortController =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const sessionTimeoutId =
        abortController !== null
          ? setTimeout(() => {
              abortController.abort();
            }, RTC_SESSION_TIMEOUT_MS)
          : null;
      try {
        const response = await fetch(`${backendBaseUrl}/api/rtc/session`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          signal: abortController?.signal,
          body: JSON.stringify({
            liveId,
            roleHint: isHost ? 'host' : 'watcher',
            knownVuluUserId: userId,
          }),
        });
        sessionPayload = (await response.json()) as RtcSessionResponse;
        if (!response.ok || !sessionPayload?.ok || !sessionPayload.session) {
          throw new Error(sessionPayload?.message || sessionPayload?.code || `rtc_session_${response.status}`);
        }
      } catch (error) {
        connectingRef.current = false;
        const message =
          error instanceof Error && error.name === 'AbortError'
            ? 'RTC session bootstrap timed out.'
            : error instanceof Error
            ? error.message
            : 'RTC session bootstrap failed.';
        setLastError(message);
        scheduleReconnect();
        return;
      } finally {
        if (sessionTimeoutId) {
          clearTimeout(sessionTimeoutId);
        }
      }

      if (cancelled) {
        connectingRef.current = false;
        return;
      }

      sessionRef.current = sessionPayload.session;
      const socket = new WebSocket(buildRtcWebSocketUrl(sessionPayload.session));
      socketRef.current = socket;
      const socketOpenTimeoutId = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          setLastError('RTC websocket handshake timed out.');
          try {
            socket.close();
          } catch {
            // ignore
          }
        }
      }, RTC_SOCKET_OPEN_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(socketOpenTimeoutId);
        if (cancelled) {
          return;
        }
        connectingRef.current = false;
        reconnectAttemptRef.current = 0;
        setConnected(true);
        connectedRef.current = true;
        void syncPeersForRoomState(sessionPayload.session!.roomState);
        void joinRoom();
      };

      socket.onclose = () => {
        clearTimeout(socketOpenTimeoutId);
        connectingRef.current = false;
        resolvePendingAcks('socket_close', 'socket_closed');
        setConnected(false);
        connectedRef.current = false;
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        Array.from(peersRef.current.keys()).forEach((remoteUserId) => {
          closePeer(remoteUserId);
        });
        if (!closedManuallyRef.current && !cancelled) {
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        clearTimeout(socketOpenTimeoutId);
        setLastError('RTC websocket transport error.');
        // onclose handles retries
      };

      socket.onmessage = (event) => {
        const envelope = parseRtcEnvelope(event.data);
        if (!envelope) {
          return;
        }

        if (envelope.type === 'ack') {
          const pending = pendingAcksRef.current.get(envelope.requestId);
          if (pending) {
            pendingAcksRef.current.delete(envelope.requestId);
            pending.resolve({
              ok: envelope.ok,
              code: envelope.code,
              roomVersion: envelope.roomVersion,
              roomState: envelope.roomState,
            });
          }
          return;
        }

        if (envelope.type === 'room_state') {
          void syncPeersForRoomState(envelope.roomState);
          return;
        }

        if (envelope.type === 'participant_left') {
          const remoteUserId = String(envelope.userId ?? '').trim();
          if (remoteUserId) {
            closePeer(remoteUserId);
          }
          return;
        }

        if (envelope.type === 'participant_joined' && envelope.participant) {
          const participant = envelope.participant;
          upsertParticipantSnapshot({
            userId: participant.userId,
            displayName: participant.displayName,
            username: participant.username,
            avatarUrl: participant.avatarUrl,
            role: participant.role,
            micEnabled: participant.micEnabled,
            cameraEnabled: participant.cameraEnabled,
            hasAudioTrack: participant.hasAudioTrack,
            hasVideoTrack: participant.hasVideoTrack,
            isConnectedToRtc: true,
            connectionState: normalizeConnectionState(participant.connectionState),
          });
          return;
        }

        if (envelope.type === 'panel_invited' && envelope.targetUserId === userId) {
          setPendingInviteFromHostUserId(envelope.sourceUserId);
          return;
        }

        if (envelope.type === 'participant_media_state') {
          const existingParticipant = participantsByUserIdRef.current[envelope.userId];
          upsertParticipantSnapshot({
            userId: envelope.userId,
            displayName: existingParticipant?.displayName ?? '',
            username: existingParticipant?.username ?? '',
            avatarUrl: existingParticipant?.avatarUrl ?? '',
            role: envelope.role,
            micEnabled: envelope.micEnabled,
            cameraEnabled: envelope.cameraEnabled,
            hasAudioTrack: envelope.hasAudioTrack,
            hasVideoTrack: envelope.hasVideoTrack,
            isConnectedToRtc: true,
          });
          return;
        }

        if (envelope.type === 'signal') {
          void handleSignal(envelope);
          return;
        }

        if (envelope.type === 'error') {
          setLastError(envelope.code || 'rtc_error');
        }
      };
    };

    closedManuallyRef.current = false;
    void connect();

    return () => {
      cancelled = true;
      void disconnect();
    };
  }, [
    backendBaseUrl,
    closePeer,
    disconnect,
    enabled,
    getToken,
    handleSignal,
    isHost,
    joinRoom,
    liveId,
    resolvePendingAcks,
    syncPeersForRoomState,
    upsertParticipantSnapshot,
    userId,
  ]);

  const toggleMic = useCallback(async () => {
    localMicEnabledRef.current = !localMicEnabledRef.current;
    if (localStreamRef.current && typeof localStreamRef.current.getAudioTracks === 'function') {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = localMicEnabledRef.current;
      });
    }
    const ack = await emitCommandWithRetry('toggle_mic', {
      enabled: localMicEnabledRef.current,
    });
    return ack.ok;
  }, [emitCommandWithRetry]);

  const toggleCamera = useCallback(async () => {
    if (!localStreamRef.current && (currentRoleRef.current === 'host' || currentRoleRef.current === 'panel')) {
      await ensureLocalStream();
      await syncLocalTracks();
    }
    localCameraEnabledRef.current = !localCameraEnabledRef.current;
    if (localStreamRef.current && typeof localStreamRef.current.getVideoTracks === 'function') {
      localStreamRef.current.getVideoTracks().forEach((track: any) => {
        track.enabled = localCameraEnabledRef.current;
      });
    }
    const ack = await emitCommandWithRetry('toggle_camera', {
      enabled: localCameraEnabledRef.current,
    });
    return ack.ok;
  }, [emitCommandWithRetry, ensureLocalStream, syncLocalTracks]);

  const requestPanelAccess = useCallback(async () => {
    const ack = await emitCommand('request_panel');
    return ack.ok;
  }, [emitCommand]);

  const inviteToPanel = useCallback(
    async (targetUserId: string) => {
      const ack = await emitCommand('invite_panel', { targetUserId });
      return ack.ok;
    },
    [emitCommand],
  );

  const respondToPanelInvite = useCallback(
    async (accepted: boolean) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ack = await emitCommand('respond_panel_invite', { accepted });
        if (ack.ok) {
          if (accepted) {
            await publishAsPanel();
          } else {
            await removeLocalTracksFromPeers();
          }
          return true;
        }

        const shouldRetry =
          ack.code === 'ack_timeout' ||
          ack.code === 'socket_unavailable' ||
          ack.code === 'socket_closed' ||
          ack.code === 'socket_send_failed';
        if (!shouldRetry || attempt === 2) {
          return false;
        }

        forceSocketReconnect();
        await waitForSocketReady();
      }
      return false;
    },
    [emitCommand, forceSocketReconnect, publishAsPanel, removeLocalTracksFromPeers, waitForSocketReady],
  );

  const respondToPanelRequest = useCallback(
    async (targetUserId: string, accepted: boolean) => {
      const ack = await emitCommand('respond_panel_request', {
        targetUserId,
        accepted,
      });
      return ack.ok;
    },
    [emitCommand],
  );

  const removePanelMember = useCallback(
    async (targetUserId: string) => {
      const ack = await emitCommand('remove_panel_member', {
        targetUserId,
      });
      return ack.ok;
    },
    [emitCommand],
  );

  const leavePanel = useCallback(async () => {
    const ack = await emitCommand('leave_panel');
    if (ack.ok) {
      await unpublishAsPanel();
    }
    return ack.ok;
  }, [emitCommand, unpublishAsPanel]);

  const state = useMemo<RtcHookState>(
    () => ({
      connected,
      participantsByUserId,
      remoteStreamsByUserId,
      localStream,
      currentRole,
      pendingInviteFromHostUserId,
      pendingRequestUserIds,
      speakingUserIds,
      debug: {
        enabled: debugEnabled,
        socketConnected: connected,
        localRole: currentRole,
        localAudioTrackPresent:
          Boolean(localStream && typeof (localStream as any).getAudioTracks === 'function') &&
          (localStream as any).getAudioTracks().length > 0,
        localVideoTrackPresent:
          Boolean(localStream && typeof (localStream as any).getVideoTracks === 'function') &&
          (localStream as any).getVideoTracks().length > 0,
        lastError,
        lastCommandAck,
        lastRenegotiationAt,
        peerStatesByUserId,
      },
    }),
    [
      connected,
      currentRole,
      debugEnabled,
      lastError,
      lastCommandAck,
      lastRenegotiationAt,
      localStream,
      participantsByUserId,
      peerStatesByUserId,
      pendingInviteFromHostUserId,
      pendingRequestUserIds,
      remoteStreamsByUserId,
      speakingUserIds,
    ],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    (window as typeof window & { __VULU_RTC_DEBUG__?: unknown }).__VULU_RTC_DEBUG__ = {
      liveId,
      userId,
      enabled,
      state,
    };

    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      delete (window as typeof window & { __VULU_RTC_DEBUG__?: unknown }).__VULU_RTC_DEBUG__;
    };
  }, [enabled, liveId, state, userId]);

  return {
    enabled,
    state,
    connectToRoom: joinRoom,
    disconnectFromRoom: disconnect,
    joinAsWatcher: joinRoom,
    publishAsPanel,
    unpublishAsPanel,
    toggleMic,
    toggleCamera,
    inviteToPanel,
    requestPanelAccess,
    respondToPanelInvite,
    respondToPanelRequest,
    removePanelMember,
    leavePanel,
    restartIce,
  };
}
