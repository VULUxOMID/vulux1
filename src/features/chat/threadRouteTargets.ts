type RouteParam = string | string[] | undefined;

function normalizeRouteParam(value: RouteParam): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveThreadRouteTargets<T extends { id: string }>(
  messages: T[],
  params: {
    messageId?: RouteParam;
    replyToMessageId?: RouteParam;
  },
): {
  focusMessage: T | null;
  replyToMessage: T | null;
} {
  const messageId = normalizeRouteParam(params.messageId);
  const replyToMessageId = normalizeRouteParam(params.replyToMessageId);

  return {
    focusMessage: messageId ? messages.find((message) => message.id === messageId) ?? null : null,
    replyToMessage: replyToMessageId
      ? messages.find((message) => message.id === replyToMessageId) ?? null
      : null,
  };
}
