// -----------------------------------------------------------------------------
// Prowlarr (API v1) and Bazarr (unversioned API) next to Sonarr and Radarr,
// against fakes built from the answers of a real Prowlarr 2.6.5 and Bazarr
// 1.6.2 (test/fixtures/arr/prowlarr-*, bazarr-*): their devices, their scene
// events (indexer failing or back, provider throttled, missing subtitles over
// the threshold), the commands, the widget rows, the summary, and an address
// of another application in a slot.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { buildDevice } from '../src/devices.js';
import { parseIndexers, parseProviders } from '../src/arr/model.js';
import { fixture } from './helpers/fakeArr.js';
import {
  BAZARR_URL,
  BOTH,
  FakeArr,
  FakeTool,
  LIDARR_URL,
  PROWLARR_URL,
  SONARR_URL,
  createWorld,
  defaultInstances,
  deviceId,
  featureId,
} from './helpers/world.js';

const WITH_TOOLS = {
  ...BOTH,
  prowlarr_1_url: PROWLARR_URL,
  prowlarr_1_api_key: 'key-p',
  prowlarr_1_name: 'Prowlarr',
  bazarr_1_url: BAZARR_URL,
  bazarr_1_api_key: 'key-b',
  bazarr_1_name: 'Bazarr',
  bazarr_1_missing_threshold: 20,
};

async function world(t, options = {}) {
  const prowlarr = new FakeTool({ kind: 'prowlarr', apiKey: 'key-p' });
  const bazarr = new FakeTool({ kind: 'bazarr', apiKey: 'key-b' });
  const w = await createWorld({
    config: WITH_TOOLS,
    instances: { ...defaultInstances(), [PROWLARR_URL]: prowlarr, [BAZARR_URL]: bazarr },
    ...options,
  });
  t.after(() => w.app.stop());
  return { ...w, prowlarr, bazarr };
}

const eventsOf = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('the real Prowlarr answers: one enabled indexer, paused after failures', () => {
  const indexers = parseIndexers(fixture('prowlarr-indexer'), fixture('prowlarr-indexerstatus'));
  assert.deepEqual(indexers, {
    enabled: 1,
    failing: 1,
    failures: [{ id: 3, name: 'Flaky Torznab', until: '2026-10-20T09:56:55.000Z' }],
    names: { 1: 'Spare Torznab', 2: 'Broken Torznab', 3: 'Flaky Torznab' },
  });
});

test('Bazarr lists its healthy providers as "Good": only the others are failing', () => {
  assert.deepEqual(parseProviders(fixture('bazarr-providers')), { count: 0, list: [] });
  const answer = {
    data: [
      { name: 'yifysubtitles', status: 'Good', retry: '-' },
      { name: 'opensubtitlescom', status: 'TooManyRequests', retry: 'in 1 hour' },
    ],
  };
  assert.deepEqual(parseProviders(answer).list, [
    { name: 'opensubtitlescom', reason: 'TooManyRequests', until: 'in 1 hour' },
  ]);
});

test('a Prowlarr device: indexer names, API v1, the figures of the real instance', async (t) => {
  const w = await world(t, { config: { ...WITH_TOOLS, language: 'fr' } });
  const device = w.fake.discoveredDevices.find(
    (d) => d.external_id === deviceId(w.gladys, 'prowlarr_1'),
  );
  assert.equal(device.name, 'Prowlarr');
  const names = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f.name]),
  );
  assert.deepEqual(names, {
    online: 'En ligne',
    indexers: 'Indexeurs actifs',
    indexers_failing: 'Indexeurs en échec',
    queries_24h: 'Requêtes (24 h)',
    grabs_24h: 'Récupérations (24 h)',
    health_warnings: 'Avertissements de santé',
    health_errors: 'Erreurs de santé',
    version: 'Version',
  });
  assert.ok(w.prowlarr.requests.every((request) => request.path.startsWith('/api/v1/')));
  const state = (key) => w.fake.lastState(featureId(w.gladys, key, 'prowlarr_1'));
  assert.equal(state('online'), 1);
  assert.equal(state('indexers'), 1);
  assert.equal(state('indexers_failing'), 1);
  assert.equal(state('queries_24h'), 1);
  assert.equal(state('grabs_24h'), 0);
  assert.equal(state('health_errors'), 1);
  assert.equal(state('version'), '2.6.5.5623');
  const stats = w.prowlarr.requests.find((request) => request.path === '/api/v1/indexerstats');
  assert.equal(Date.parse(stats.query.endDate) - Date.parse(stats.query.startDate), 86_400_000);
});

test('a Bazarr device: subtitle names, its API, the figures of the real instance', async (t) => {
  const w = await world(t, { config: { ...WITH_TOOLS, language: 'de' } });
  const device = w.fake.discoveredDevices.find(
    (d) => d.external_id === deviceId(w.gladys, 'bazarr_1'),
  );
  const names = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f.name]),
  );
  assert.deepEqual(names, {
    online: 'Online',
    episodes_without_subtitles: 'Episoden ohne Untertitel',
    movies_without_subtitles: 'Filme ohne Untertitel',
    providers_failing: 'Fehlerhafte Anbieter',
    health_warnings: 'Zustandswarnungen',
    version: 'Version',
  });
  assert.ok(w.bazarr.requests.every((request) => /^\/api\/(?!v\d)/.test(request.path)));
  const state = (key) => w.fake.lastState(featureId(w.gladys, key, 'bazarr_1'));
  assert.equal(state('online'), 1);
  assert.equal(state('episodes_without_subtitles'), 0);
  assert.equal(state('movies_without_subtitles'), 0);
  assert.equal(state('providers_failing'), 0);
  assert.equal(state('health_warnings'), 1);
  assert.equal(state('version'), '1.6.2');
});

test('the Sonarr, Radarr and Lidarr devices keep their published features', () => {
  const gladys = { externalIds: (type, id) => ({ device: id, feature: (key) => `${id}:${key}` }) };
  for (const kind of ['sonarr', 'radarr', 'lidarr']) {
    const device = buildDevice(gladys, { slot: `${kind}_1`, kind, url: 'http://x', name: 'X' });
    assert.deepEqual(
      device.features.map((feature) => feature.external_id),
      [
        'online',
        'queue',
        'queue_errors',
        'missing',
        'upcoming_7d',
        'free_space',
        'health_warnings',
        'health_errors',
        'version',
      ].map((key) => `${kind}_1:${key}`),
    );
  }
});

test('an indexer paused, then back, fires its two events; not at the first reading', async (t) => {
  const w = await world(t);
  // The real instance had an indexer paused already: a starting point.
  assert.equal(eventsOf(w, 'indexer_failed').length, 0);
  w.prowlarr.statuses = [];
  await w.hub.pollAll();
  assert.deepEqual(eventsOf(w, 'indexer_restored').at(-1).data, {
    device: deviceId(w.gladys, 'prowlarr_1'),
    app: 'prowlarr',
    instance: 'Prowlarr',
    indexer: 'Flaky Torznab',
  });
  w.prowlarr.statuses = fixture('prowlarr-indexerstatus');
  await w.hub.pollAll();
  await w.hub.pollAll();
  const failed = eventsOf(w, 'indexer_failed');
  assert.equal(failed.length, 1);
  assert.deepEqual(failed[0].data, {
    device: deviceId(w.gladys, 'prowlarr_1'),
    app: 'prowlarr',
    instance: 'Prowlarr',
    indexer: 'Flaky Torznab',
    until: '2026-10-20T09:56:55.000Z',
  });
  // Deleted while paused: gone, not back.
  w.prowlarr.statuses = [];
  w.prowlarr.indexers = w.prowlarr.indexers.filter((indexer) => indexer.id !== 3);
  await w.hub.pollAll();
  assert.equal(eventsOf(w, 'indexer_restored').length, 1);
});

test('a failing indexer is remembered across a restart', async (t) => {
  const first = await world(t);
  await first.app.stop();
  const w = await world(t, { dataDir: first.dataDir });
  assert.equal(eventsOf(w, 'indexer_failed').length, 0);
  w.prowlarr.statuses = [];
  await w.hub.pollAll();
  assert.equal(eventsOf(w, 'indexer_restored').length, 1);
});

test('missing subtitles fire once when they reach the threshold', async (t) => {
  const w = await world(t, { config: { ...WITH_TOOLS, bazarr_1_missing_threshold: '5' } });
  w.bazarr.badges = { ...w.bazarr.badges, episodes: 3, movies: 1 };
  await w.hub.pollAll();
  assert.equal(eventsOf(w, 'subtitles_missing').length, 0);
  w.bazarr.badges = { ...w.bazarr.badges, episodes: 3, movies: 2 };
  await w.hub.pollAll();
  w.bazarr.badges = { ...w.bazarr.badges, episodes: 9, movies: 2 };
  await w.hub.pollAll();
  const events = eventsOf(w, 'subtitles_missing');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    device: deviceId(w.gladys, 'bazarr_1'),
    app: 'bazarr',
    instance: 'Bazarr',
    episodes: 3,
    movies: 2,
    total: 5,
    threshold: 5,
  });
  // Back under the threshold, then over again: a new event.
  w.bazarr.badges = { ...w.bazarr.badges, episodes: 0, movies: 0 };
  await w.hub.pollAll();
  w.bazarr.badges = { ...w.bazarr.badges, episodes: 7, movies: 0 };
  await w.hub.pollAll();
  assert.equal(eventsOf(w, 'subtitles_missing').length, 2);
});

test('already over the threshold at the first reading: no event', async (t) => {
  const prowlarr = new FakeTool({ kind: 'prowlarr', apiKey: 'key-p' });
  const bazarr = new FakeTool({ kind: 'bazarr', apiKey: 'key-b' });
  bazarr.badges = { ...bazarr.badges, episodes: 40 };
  const w = await createWorld({
    config: WITH_TOOLS,
    instances: { ...defaultInstances(), [PROWLARR_URL]: prowlarr, [BAZARR_URL]: bazarr },
  });
  t.after(() => w.app.stop());
  await w.hub.pollAll();
  assert.equal(eventsOf(w, 'subtitles_missing').length, 0);
});

test('a provider throttled by Bazarr fires "provider failing" once', async (t) => {
  const w = await world(t);
  const throttled = {
    data: [
      { name: 'yifysubtitles', status: 'Good', retry: '-' },
      { name: 'opensubtitlescom', status: 'TooManyRequests', retry: 'in 23 hours' },
    ],
  };
  w.bazarr.providers = throttled;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const events = eventsOf(w, 'provider_failed');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    device: deviceId(w.gladys, 'bazarr_1'),
    app: 'bazarr',
    instance: 'Bazarr',
    provider: 'opensubtitlescom',
    reason: 'TooManyRequests',
    until: 'in 23 hours',
  });
  assert.equal(w.fake.lastState(featureId(w.gladys, 'providers_failing', 'bazarr_1')), 1);
});

test('the commands: Bazarr runs its tasks, Prowlarr is skipped', async (t) => {
  const w = await world(t);
  const search = await w.fake.sceneAction('search_missing', {});
  assert.deepEqual(search.data.outputs, { instances: 3 });
  assert.deepEqual(w.bazarr.tasksRun, [
    'wanted_search_missing_subtitles_series',
    'wanted_search_missing_subtitles_movies',
  ]);
  await w.fake.sceneAction('refresh_library', { device: deviceId(w.gladys, 'bazarr_1') });
  assert.deepEqual(w.bazarr.tasksRun.slice(2), ['update_series', 'update_movies']);
  const prowlarr = await w.fake.sceneAction('refresh_library', {
    device: deviceId(w.gladys, 'prowlarr_1'),
  });
  assert.equal(prowlarr.success, false);
  assert.match(prowlarr.error, /Prowlarr has no library/);
  // A Bazarr without Sonarr nor Radarr has none of these tasks: refused, still online.
  w.bazarr.tasks = ['check_health'];
  const refused = await w.fake.sceneAction('search_missing', {
    device: deviceId(w.gladys, 'bazarr_1'),
  });
  assert.equal(refused.success, false);
  assert.equal(w.hub.records.get('bazarr_1').error, null);
});

test('summary, report and widget rows speak of indexers and subtitles', async (t) => {
  const w = await world(t);
  const summary = await w.fake.sceneAction('read_summary', {});
  assert.match(summary.data.outputs.summary, /Prowlarr: 1 indexer\(s\) enabled, 1 failing/);
  assert.match(
    summary.data.outputs.summary,
    /Bazarr: 0 episode\(s\) and 0 movie\(s\) missing subtitles, 1 health issue\(s\)/,
  );
  const report = await w.fake.action('test_connection', {});
  assert.equal(report.success, true, report.error);
  const ack = await w.fake.widgetGet('upcoming', { language: 'fr', settings: {} });
  assert.equal(ack.success, true, ack.error);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(rows.slice(-2), [
    {
      label: 'Prowlarr',
      icon: 'search',
      value: '1 indexeur(s) · 1 en échec · 1 alerte(s)',
      color: 'danger',
    },
    {
      label: 'Bazarr',
      icon: 'message-square',
      value: '0 ép. / 0 films sans s.-t. · 1 alerte(s)',
      color: 'warning',
    },
  ]);
  // Only Prowlarr chosen: no queue tile nor "nothing this week".
  const alone = await w.fake.widgetGet('upcoming', {
    language: 'en',
    settings: { device: deviceId(w.gladys, 'prowlarr_1') },
  });
  assert.deepEqual(
    alone.data.content.components.map((c) => c.type),
    ['status', 'button', 'button'],
  );
});

test('a Prowlarr, a Bazarr or a Sonarr in the wrong slot is the wrong application', async (t) => {
  const prowlarr = new FakeTool({ kind: 'prowlarr', apiKey: 'key-p' });
  const bazarr = new FakeTool({ kind: 'bazarr', apiKey: 'key-b' });
  const w = await createWorld({
    config: {
      lidarr_1_url: PROWLARR_URL,
      lidarr_1_api_key: 'key-p',
      sonarr_1_url: BAZARR_URL,
      sonarr_1_api_key: 'key-b',
      bazarr_1_url: SONARR_URL,
      bazarr_1_api_key: 'key-1',
      prowlarr_1_url: LIDARR_URL,
      prowlarr_1_api_key: 'key-5',
    },
    instances: {
      [SONARR_URL]: new FakeArr({ kind: 'sonarr', apiKey: 'key-1' }),
      [LIDARR_URL]: new FakeArr({ kind: 'lidarr', apiKey: 'key-5' }),
      [PROWLARR_URL]: prowlarr,
      [BAZARR_URL]: bazarr,
    },
  });
  t.after(() => w.app.stop());
  for (const slot of ['lidarr_1', 'sonarr_1', 'bazarr_1', 'prowlarr_1']) {
    assert.equal(w.hub.records.get(slot).error?.kind, 'wrong_app', slot);
  }
});

test('a wrong Bazarr API key is reported as such', async (t) => {
  const w = await world(t, { config: { ...WITH_TOOLS, bazarr_1_api_key: 'nope' } });
  assert.equal(w.hub.records.get('bazarr_1').error.kind, 'auth');
});

test('the Bazarr threshold: a whole number from 1, else 20', () => {
  const threshold = (value) =>
    normalizeConfig({
      bazarr_1_url: BAZARR_URL,
      bazarr_1_api_key: 'k',
      bazarr_1_missing_threshold: value,
    }).instances[0].missingThreshold;
  assert.equal(threshold(5), 5);
  assert.equal(threshold(' 12 '), 12);
  assert.equal(threshold(0), 20);
  assert.equal(threshold(2.5), 20);
  assert.equal(threshold(undefined), 20);
});
