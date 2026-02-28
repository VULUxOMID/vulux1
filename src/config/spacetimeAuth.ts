function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getSpacetimeAuthClientId(): string | undefined {
  return normalize(process.env.EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID);
}

export function getSpacetimeAuthIssuer(): string {
  return (
    normalize(process.env.EXPO_PUBLIC_SPACETIMEAUTH_ISSUER) ??
    'https://auth.spacetimedb.com/oidc'
  );
}

export function getSpacetimeAuthScheme(): string {
  return normalize(process.env.EXPO_PUBLIC_SPACETIMEAUTH_SCHEME) ?? 'vulu';
}

export function getSpacetimeAuthScopes(): string[] {
  const configured = normalize(process.env.EXPO_PUBLIC_SPACETIMEAUTH_SCOPES);
  if (!configured) {
    return ['openid', 'profile', 'email', 'offline_access'];
  }

  const parsed = configured
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return parsed.length > 0 ? parsed : ['openid', 'profile', 'email', 'offline_access'];
}

export function getSpacetimeAuthRedirectUri(): string | undefined {
  return normalize(process.env.EXPO_PUBLIC_SPACETIMEAUTH_REDIRECT_URI);
}
