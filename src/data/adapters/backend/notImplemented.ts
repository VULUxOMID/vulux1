export function backendNotImplemented(methodName: string): never {
  throw new Error(
    `[data/backend] ${methodName} is not implemented yet. ` +
      'No fallback adapters are available.',
  );
}
