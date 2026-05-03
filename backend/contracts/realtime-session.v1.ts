export const REALTIME_SESSION_CONTRACT_VERSION = "realtime-session.v1" as const;

export type RealtimeSessionClaims = {
  sub: string;
  handle: string;
  role: string;
  creator_enabled: boolean;
  admin_level: number;
  account_state: string;
  ban_version: number;
  entitlement_version: number;
  iat: number;
  exp: number;
  jti: string;
};

export type RealtimeSessionRequest = {
  refresh?: boolean;
  knownVuluUserId?: string | null;
};

export type RealtimeSessionEnvelope = {
  ok: true;
  code: "ok";
  requestId: string;
  correlationId: string;
  contractVersion: typeof REALTIME_SESSION_CONTRACT_VERSION;
  session: {
    token: string;
    tokenType: "Bearer";
    format: "jwt";
    issuedAt: string;
    expiresAt: string;
    expiresIn: number;
    issuer: string;
    audience: string;
    endpoint: string | null;
    keyId: string | null;
  };
  user: {
    id: string;
    profileId: string | null;
    vuluUserId: string | null;
    handle: string;
    role: string;
    creatorEnabled: boolean;
    adminLevel: number;
    accountState: string;
    banVersion: number;
    entitlementVersion: number;
  };
};

export type ErrorEnvelope = {
  ok: false;
  code: string;
  message: string;
  requestId: string;
  correlationId: string;
  contractVersion?: string;
};
