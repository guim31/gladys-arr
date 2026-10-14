// -----------------------------------------------------------------------------
// The "Upcoming releases" widget: valid content within the core budget, the
// posters served from the instances, the buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { ACTIONS } from '../src/widgets.js';
import { createClock, createWorld, deviceId } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const components = (ack) => ack.data.content.components;
const ofType = (ack, type) => components(ack).filter((c) => c.type === type);

function assertBudget(content) {
  assert.deepEqual(validateWidgetContent(content), []);
  const list = content.components;
  assert.ok(list.length <= 8);
  assert.ok(list.filter((c) => c.type === 'text').length <= 2);
  assert.ok(list.filter((c) => ['value', 'gauge'].includes(c.type)).length <= 6);
  assert.ok(list.filter((c) => c.type === 'button').length <= 4);
  const keys = list.filter((c) => c.type === 'button').map((c) => c.action.key);
  assert.equal(new Set(keys).size, keys.length, 'unique button keys');
}

test('the week of the captures: the episode, its poster, the queues', async (t) => {
  const w = await world(t);
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await w.fake.widgetGet('upcoming', { language });
    assert.equal(ack.success, true, ack.error);
    assertBudget(ack.data.content);
  }
  const ack = await w.fake.widgetGet('upcoming', { language: 'en' });
  const [grid] = ofType(ack, 'card-list');
  assert.deepEqual(grid.items[0], {
    title: 'The Simpsons · S38E03',
    date: '2026-10-19T00:00:00.000Z',
    image: 'poster-sonarr-1-1',
    badge: { text: 'Downloaded', color: 'success' },
    description:
      'S38E03 · Treehouse of Horror Presents: The Revengening\n\nAll hell breaks loose on Halloween when a killer comes to Springfield and hacks their way through town. No Simpson is safe from... THE REVENGENING!',
  });
  assert.deepEqual(
    ofType(ack, 'value').map((c) => c.value),
    [3, 1263],
  );
  const [status] = ofType(ack, 'status');
  assert.equal(status.items[0].value, '3 in queue · 2 in error · 3 alert(s)');
});

test('a movie released this week shows how it comes out', async (t) => {
  const w = await world(t, { clock: createClock(Date.parse('2026-10-30T10:00:00Z')) });
  const ack = await w.fake.widgetGet('upcoming', {
    language: 'fr',
    settings: { device: deviceId(w.gladys, 'radarr_1') },
  });
  const [grid] = ofType(ack, 'card-list');
  assert.equal(grid.items.length, 1);
  assert.equal(grid.items[0].title, 'Avatar Aang: The Last Airbender');
  assert.equal(grid.items[0].date, '2026-11-03T00:00:00.000Z');
  assert.deepEqual(grid.items[0].badge, { text: 'Blu-ray / DVD', color: 'neutral' });
});

test('an empty week says so', async (t) => {
  const w = await world(t, { clock: createClock(Date.parse('2026-12-01T10:00:00Z')) });
  const ack = await w.fake.widgetGet('upcoming', { language: 'fr' });
  assert.deepEqual(ofType(ack, 'card-list'), []);
  assert.equal(ofType(ack, 'text')[0].text, 'Aucune sortie cette semaine.');
  assertBudget(ack.data.content);
});

test('the posters come from the instance, other keys are refused', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetGetImage('poster-sonarr-1-1');
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetImage(ack.data.image), []);
  assert.equal(w.sonarr.requests.at(-1).path, '/api/v3/mediacover/1/poster-250.jpg');
  for (const key of ['poster-sonarr-2-1', 'poster-lidarr-1-1', '../etc/passwd']) {
    assert.equal((await w.fake.widgetGetImage(key)).success, false, key);
  }
});

test('the buttons search the missing items and refresh', async (t) => {
  const w = await world(t, { config: { ...(await import('./helpers/world.js')).BOTH } });
  const search = await w.fake.widgetAction('upcoming', ACTIONS.SEARCH_MISSING);
  assert.equal(search.success, true, search.error);
  assert.match(search.data.message.en, /started on 2 instance/);
  const refresh = await w.fake.widgetAction(
    'upcoming',
    ACTIONS.REFRESH,
    {},
    {
      settings: { device: deviceId(w.gladys, 'sonarr_1') },
    },
  );
  assert.equal(refresh.success, true, refresh.error);
  assert.deepEqual(w.sonarr.commands, ['MissingEpisodeSearch', 'RefreshSeries']);
});

test('without configuration, or for a removed instance, a message', async (t) => {
  const empty = await world(t, { config: {} });
  const ack = await empty.fake.widgetGet('upcoming', { language: 'en' });
  assert.match(ofType(ack, 'text')[0].text, /address and API key/);
  const w = await world(t);
  const gone = await w.fake.widgetGet('upcoming', {
    language: 'en',
    settings: { device: deviceId(w.gladys, 'radarr_2') },
  });
  assert.match(ofType(gone, 'text')[0].text, /no longer in the configuration/);
});
