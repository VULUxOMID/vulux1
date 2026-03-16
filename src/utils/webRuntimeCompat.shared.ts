type OrientationCapableScreen = {
  orientation?: {
    lock?: unknown;
    unlock?: unknown;
  } | null;
} | null | undefined;

type BlurCapableDocument = {
  activeElement?: {
    blur?: () => void;
  } | null;
} | null | undefined;

const IGNORABLE_ORIENTATION_ERROR_NAMES = new Set(['NotSupportedError', 'AbortError']);

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '';
}

function readErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return '';
}

export function isIgnorableOrientationError(error: unknown): boolean {
  const name = readErrorName(error);
  if (IGNORABLE_ORIENTATION_ERROR_NAMES.has(name)) {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('notsupportederror') ||
    message.includes('aborterror') ||
    message.includes('not supported') ||
    message.includes('screen orientation')
  );
}

export function hasScreenOrientationApiSupport(screenLike: OrientationCapableScreen): boolean {
  const orientation = screenLike?.orientation;
  return !!orientation && typeof orientation.lock === 'function' && typeof orientation.unlock === 'function';
}

export function blurDocumentActiveElement(documentLike: BlurCapableDocument): void {
  const activeElement = documentLike?.activeElement;
  if (activeElement && typeof activeElement.blur === 'function') {
    activeElement.blur();
  }
}
