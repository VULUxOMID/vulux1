function stamp(): string {
  return new Date().toISOString();
}

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      level: "info",
      time: stamp(),
      message,
      ...(extra ?? {}),
    }),
  );
}

export function logWarn(message: string, extra?: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      time: stamp(),
      message,
      ...(extra ?? {}),
    }),
  );
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: "error",
      time: stamp(),
      message,
      ...(extra ?? {}),
    }),
  );
}
