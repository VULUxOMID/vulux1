function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getBackendTokenTemplate(): string | undefined {
  return (
    normalize(process.env.EXPO_PUBLIC_CLERK_TOKEN_TEMPLATE) ??
    normalize(process.env.EXPO_PUBLIC_CLERK_BACKEND_TOKEN_TEMPLATE)
  );
}
