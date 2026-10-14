// Parsers of the API answers, west of UTC: a Radarr release date is a day.
process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { parseCalendar } = await import('../src/arr/model.js');
const { fixture } = await import('./helpers/fakeArr.js');

test('a movie released today stays today in New York', () => {
  const start = new Date(2026, 10, 3); // local midnight, 3 November
  const end = new Date(2026, 10, 10);
  const [item] = parseCalendar('radarr', fixture('radarr-calendar'), start, end);
  assert.equal(item.release, 'physical');
  assert.equal(item.day, '2026-11-03');
});

test('a movie released the day before the window is left out', () => {
  const start = new Date(2026, 10, 4);
  const end = new Date(2026, 10, 11);
  assert.deepEqual(parseCalendar('radarr', fixture('radarr-calendar'), start, end), []);
});
