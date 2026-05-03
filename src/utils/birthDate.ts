export type BirthDateParts = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.trunc(value) === value;
}

export function getDaysInMonth(year: number, month: number): number {
  if (!isFiniteInteger(year) || !isFiniteInteger(month) || month < 1 || month > 12) {
    return 31;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampBirthDateParts(parts: BirthDateParts): BirthDateParts {
  const month = Math.max(1, Math.min(12, Math.trunc(parts.month)));
  const year = Math.max(1900, Math.trunc(parts.year));
  const day = Math.max(1, Math.min(getDaysInMonth(year, month), Math.trunc(parts.day)));
  return { year, month, day };
}

export function formatBirthDate(parts: BirthDateParts): string {
  const normalized = clampBirthDateParts(parts);
  return `${normalized.year}-${pad(normalized.month)}-${pad(normalized.day)}`;
}

export function parseBirthDate(value: string | null | undefined): BirthDateParts | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!isFiniteInteger(year) || !isFiniteInteger(month) || !isFiniteInteger(day)) {
    return null;
  }

  const normalized = clampBirthDateParts({ year, month, day });
  if (normalized.year !== year || normalized.month !== month || normalized.day !== day) {
    return null;
  }

  return normalized;
}

export function deriveAgeFromBirthDate(
  value: string | BirthDateParts | null | undefined,
  now = new Date(),
): number | null {
  const parts =
    typeof value === 'string' || value == null
      ? parseBirthDate(value ?? null)
      : clampBirthDateParts(value);
  if (!parts) {
    return null;
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  let age = currentYear - parts.year;
  if (
    currentMonth < parts.month ||
    (currentMonth === parts.month && currentDay < parts.day)
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function isBirthDateWithinAgeRange(
  value: string | BirthDateParts | null | undefined,
  minimumAge: number,
  maximumAge: number,
  now = new Date(),
): boolean {
  const age = deriveAgeFromBirthDate(value, now);
  return age !== null && age >= minimumAge && age <= maximumAge;
}

export function buildBirthDateFromAge(
  age: number,
  now = new Date(),
): string | null {
  if (!isFiniteInteger(age) || age < 0) {
    return null;
  }

  const year = now.getUTCFullYear() - age;
  const month = now.getUTCMonth() + 1;
  const day = Math.min(now.getUTCDate(), getDaysInMonth(year, month));
  return formatBirthDate({ year, month, day });
}
