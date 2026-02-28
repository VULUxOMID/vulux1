import type { CursorPageRequest } from '../../contracts';

type QueryValue = string | number | boolean | null | undefined;

type FieldSelector<T> = (item: T) => QueryValue | QueryValue[];

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() ?? '';
}

function valueMatchesQuery(value: QueryValue, query: string): boolean {
  if (value === undefined || value === null) return false;
  return String(value).toLowerCase().includes(query);
}

export function filterByQuery<T>(
  items: T[],
  query: string | undefined,
  selectors: FieldSelector<T>[],
): T[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return items;

  return items.filter((item) =>
    selectors.some((selector) => {
      const value = selector(item);
      if (Array.isArray(value)) {
        return value.some((entry) => valueMatchesQuery(entry, normalizedQuery));
      }
      return valueMatchesQuery(value, normalizedQuery);
    }),
  );
}

export function applyCursorPage<T extends { id: string }>(
  items: T[],
  request?: CursorPageRequest,
): T[] {
  if (!request) return items;

  const safeLimit =
    typeof request.limit === 'number' && Number.isFinite(request.limit) && request.limit > 0
      ? Math.floor(request.limit)
      : undefined;

  let startIndex = 0;
  if (request.cursor) {
    const cursorIndex = items.findIndex((item) => item.id === request.cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  if (!safeLimit) {
    return items.slice(startIndex);
  }
  return items.slice(startIndex, startIndex + safeLimit);
}
