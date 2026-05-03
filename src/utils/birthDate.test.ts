import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBirthDateFromAge,
  deriveAgeFromBirthDate,
  formatBirthDate,
  parseBirthDate,
} from './birthDate';

test('parseBirthDate accepts valid ISO birthdays and rejects invalid dates', () => {
  assert.deepEqual(parseBirthDate('2001-02-03'), {
    year: 2001,
    month: 2,
    day: 3,
  });
  assert.equal(parseBirthDate('2001-02-31'), null);
  assert.equal(parseBirthDate('not-a-date'), null);
});

test('deriveAgeFromBirthDate handles birthdays before and after the current date', () => {
  const now = new Date(Date.UTC(2026, 2, 20));
  assert.equal(deriveAgeFromBirthDate('2000-03-20', now), 26);
  assert.equal(deriveAgeFromBirthDate('2000-03-21', now), 25);
});

test('buildBirthDateFromAge creates a stable ISO date based on the current UTC day', () => {
  const now = new Date(Date.UTC(2026, 2, 20));
  const birthDate = buildBirthDateFromAge(18, now);
  assert.equal(birthDate, formatBirthDate({ year: 2008, month: 3, day: 20 }));
});
