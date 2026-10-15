// -----------------------------------------------------------------------------
// Lidarr (API v1) next to Sonarr and Radarr, against a fake built from the
// answers of a real Lidarr 3.1 (test/fixtures/arr/lidarr-*): the device and its
// names, the albums in the widget, one scene event per imported album, the
// commands, and an address of another application in a slot.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { parseHistory } from '../src/arr/model.js';
import { fixture } from './helpers/fakeArr.js';
import {
  BOTH,
  FakeArr,
  LIDARR_URL,
  SONARR_URL,
  createWorld,
  defaultInstances,
  deviceId,
  featureId,
} from './helpers/world.js';

const WITH_LIDARR = {
  ...BOTH,
  lidarr_1_url: LIDARR_URL,
  lidarr_1_api_key: 'key-5',
  lidarr_1_name: 'Lidarr',
};

async function world(t, options = {}) {
  const lidarr = new FakeArr({ kind: 'lidarr', apiKey: 'key-5' });
  const w = await createWorld({
    config: WITH_LIDARR,
    instances: { ...defaultInstances(), [LIDARR_URL]: lidarr },
    ...options,
  });
  t.after(() => w.app.stop());
  return { ...w, lidarr };
}

test('the eight track imports of an album make one event, titled by the album', () => {
  const events = parseHistory('lidarr', fixture('lidarr-history'));
  assert.equal(events.length, 1);
  assert.deepEqual(
    { ...events[0], date: undefined },
    {
      id: 8,
      date: undefined,
      type: 'imported',
      title: 'The King of Limbs',
      label: 'Radiohead – The King of Limbs',
      quality: 'MP3-64',
      reason: '',
    },
  );
});

test('a Lidarr device: album names, API v1, the figures of the real instance', async (t) => {
  const w = await world(t, { config: { ...WITH_LIDARR, language: 'fr' } });
  const device = w.fake.discoveredDevices.find(
    (d) => d.external_id === deviceId(w.gladys, 'lidarr_1'),
  );
  assert.equal(device.name, 'Lidarr');
  const names = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f.name]),
  );
  assert.equal(names.missing, 'Albums manquants');
  assert.equal(names.upcoming_7d, 'Albums des 7 prochains jours');
  assert.ok(w.lidarr.requests.every((request) => request.path.startsWith('/api/v1/')));
  const state = (key) => w.fake.lastState(featureId(w.gladys, key, 'lidarr_1'));
  assert.equal(state('online'), 1);
  assert.equal(state('missing'), 8);
  assert.equal(state('upcoming_7d'), 1);
  assert.equal(state('free_space'), 96);
  assert.equal(state('health_errors'), 1);
  assert.equal(state('health_warnings'), 2);
  assert.equal(state('version'), '3.1.0.4875');
});

test('the widget shows the album of the week with the poster of its artist', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetGet('upcoming', {
    language: 'en',
    settings: { device: deviceId(w.gladys, 'lidarr_1') },
  });
  assert.equal(ack.success, true, ack.error);
  const grid = ack.data.content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(grid.items, [
    {
      title: 'Radiohead · A Moon Shaped Pool',
      date: '2026-10-16',
      image: 'poster-lidarr-1-1',
      description: 'A Moon Shaped Pool',
    },
  ]);
  const status = ack.data.content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].icon, 'music');
  const image = await w.fake.widgetGetImage('poster-lidarr-1-1');
  assert.equal(image.success, true, image.error);
  assert.deepEqual(validateWidgetImage(image.data.image), []);
  assert.equal(w.lidarr.requests.at(-1).path, '/api/v1/mediacover/artist/1/poster-250.jpg');
});

test('an imported album fires one "downloaded" event, with the Lidarr filter', async (t) => {
  const w = await world(t);
  w.lidarr.addImport(w.clock.now());
  await w.hub.pollAll();
  const events = w.fake.sceneEvents.filter((event) => event.key === 'download_imported');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    device: deviceId(w.gladys, 'lidarr_1'),
    app: 'lidarr',
    instance: 'Lidarr',
    title: 'The King of Limbs',
    label: 'Radiohead – The King of Limbs',
    quality: 'MP3-64',
  });
});

test('the actions run the Lidarr commands and count the albums', async (t) => {
  const w = await world(t);
  const search = await w.fake.sceneAction('search_missing', {});
  assert.deepEqual(search.data.outputs, { instances: 3 });
  assert.deepEqual(w.lidarr.commands, ['MissingAlbumSearch']);
  await w.fake.sceneAction('refresh_library', { device: deviceId(w.gladys, 'lidarr_1') });
  assert.deepEqual(w.lidarr.commands, ['MissingAlbumSearch', 'RefreshArtist']);
  const summary = await w.fake.sceneAction('read_summary', {
    device: deviceId(w.gladys, 'lidarr_1'),
  });
  assert.equal(summary.data.outputs.upcoming, 1);
  assert.match(summary.data.outputs.summary, /^Lidarr: 1 album\(s\) this week/);
});

test('a Lidarr in a Sonarr slot, or a Sonarr in a Lidarr slot, is the wrong application', async (t) => {
  const w = await world(t, {
    config: {
      sonarr_1_url: LIDARR_URL,
      sonarr_1_api_key: 'key-5',
      lidarr_1_url: SONARR_URL,
      lidarr_1_api_key: 'key-1',
    },
  });
  assert.equal(w.hub.records.get('sonarr_1').error.kind, 'wrong_app');
  assert.equal(w.hub.records.get('lidarr_1').error.kind, 'wrong_app');
});
