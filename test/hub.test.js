// -----------------------------------------------------------------------------
// The hub against fake Sonarr/Radarr instances built from real answers: the
// scene events (history, health), what survives a restart, the timer of the
// container, the commands, an instance that goes away.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  BOTH,
  FakeArr,
  RADARR_URL,
  SONARR_URL,
  createWorld,
  defaultInstances,
  deviceId,
  featureId,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const keys = (w) => w.fake.sceneEvents.map((event) => event.key);

test('an import already in the history at the first reading is not announced', async (t) => {
  const instances = defaultInstances();
  instances[SONARR_URL].addImport(Date.parse('2026-10-14T16:20:00Z'));
  const w = await world(t, { instances });
  await w.hub.pollAll();
  assert.deepEqual(keys(w), []);
});

test('a new import fires once, with its title, episode and quality', async (t) => {
  const w = await world(t);
  w.sonarr.addImport(w.clock.now());
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: 'download_imported',
      data: {
        device: deviceId(w.gladys, 'sonarr_1'),
        app: 'sonarr',
        instance: 'Sonarr',
        title: 'The Simpsons',
        label: 'The Simpsons S38E03',
        quality: 'WEBDL-1080p',
      },
    },
  ]);
});

test('a failed download fires with its reason; a movie is labelled with its year', async (t) => {
  const w = await world(t);
  w.radarr.addFailure(w.clock.now(), 'Download failed: missing articles');
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    device: deviceId(w.gladys, 'radarr_1'),
    app: 'radarr',
    instance: 'Radarr 192.0.2.10:7878',
    title: 'Avatar',
    label: 'Avatar (2009)',
    reason: 'Download failed: missing articles',
  });
  assert.equal(w.fake.sceneEvents[0].key, 'download_failed');
});

test('a restart announces nothing twice, and catches up on the last hour', async (t) => {
  const w = await createWorld();
  w.sonarr.addImport(w.clock.now());
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 1);
  await w.app.stop();

  // Restarted 10 minutes later: one import happened meanwhile.
  w.clock.advance(10 * 60_000);
  w.sonarr.addImport(w.clock.now() - 5 * 60_000);
  const again = await world(t, {
    clock: w.clock,
    dataDir: w.dataDir,
    instances: { [SONARR_URL]: w.sonarr, [RADARR_URL]: w.radarr },
  });
  assert.deepEqual(keys(again), ['download_imported']);
  assert.equal(again.fake.sceneEvents[0].data.label, 'The Simpsons S38E03');
});

test('a season pack fires at most 10 events per reading', async (t) => {
  const w = await world(t);
  for (let i = 0; i < 15; i += 1) {
    w.sonarr.addImport(w.clock.now());
  }
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 10);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 10);
});

test('a new health issue fires once; the issues found at the start do not', async (t) => {
  const w = await world(t);
  await w.hub.pollAll();
  assert.deepEqual(keys(w), []);
  w.sonarr.healthChecks.push({
    source: 'RootFolderCheck',
    type: 'error',
    message: 'Missing root folder: /tv',
    wikiUrl: 'https://wiki.servarr.com/sonarr/system#missing-root-folder',
  });
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: 'health_issue',
      data: {
        device: deviceId(w.gladys, 'sonarr_1'),
        app: 'sonarr',
        instance: 'Sonarr',
        level: 'error',
        source: 'RootFolderCheck',
        message: 'Missing root folder: /tv',
      },
    },
  ]);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'health_errors')), 2);

  // Solved, then back: news again.
  w.sonarr.healthChecks.pop();
  await w.hub.pollAll();
  w.sonarr.healthChecks.push({ source: 'RootFolderCheck', type: 'error', message: 'Again' });
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 2);
});

test('the container reads the instances on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true, config: { ...BOTH, poll_interval: '60' } });
  const before = w.sonarr.requests.length;
  w.sonarr.missing.totalRecords = 7;
  t.mock.timers.tick(60_000);
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 20 && w.fake.lastState(featureId(w.gladys, 'missing')) !== 7; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(w.sonarr.requests.length > before, 'the instance was read again');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'missing')), 7);
});

test('only changes are published, and an unchanged value again after 12 hours', async (t) => {
  const w = await world(t);
  const count = () => w.fake.states.length;
  const first = count();
  await w.hub.pollAll();
  assert.equal(count(), first, 'nothing changed, nothing published');
  w.clock.advance(12 * 60 * 60_000);
  await w.hub.pollAll();
  assert.ok(count() > first, 'the heartbeat republishes');
});

test('adding a device republishes all its states and refreshes the widget', async (t) => {
  const w = await world(t);
  const device = w.fake.discoveredDevices[0];
  const before = w.fake.states.length;
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.deviceCreated(device);
  assert.equal(w.fake.states.length - before, device.features.length);
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('an instance that stops answering: offline, unreachable, explained', async (t) => {
  const w = await world(t);
  w.radarr.online = false;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'online', 'radarr_1')), 0);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys, 'radarr_1'),
    transport: DEVICE_TRANSPORTS.UNREACHABLE,
  });
  const status = w.fake.connectionStatus;
  assert.equal(status.connected, true, 'Sonarr still answers');
  assert.equal(status.message.fr, 'Radarr 192.0.2.10:7878 : ne répond pas');
});

test('a Radarr typed in a Sonarr slot is reported as such', async (t) => {
  const w = await world(t, {
    config: { sonarr_1_url: RADARR_URL, sonarr_1_api_key: 'key-2', language: 'en' },
  });
  assert.equal(w.hub.records.get('sonarr_1').error.kind, 'wrong_app');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /other application/);
});

test('an instance behind a reverse proxy, with a URL base', async (t) => {
  const proxied = new FakeArr({ kind: 'sonarr', apiKey: 'key-9', urlBase: '/sonarr' });
  const w = await world(t, {
    instances: { 'https://198.51.100.20': proxied },
    config: { sonarr_1_url: 'https://198.51.100.20/sonarr/calendar', sonarr_1_api_key: 'key-9' },
  });
  assert.equal(w.hub.records.get('sonarr_1').error, null);
  assert.ok(proxied.requests.every((request) => request.path.startsWith('/sonarr/api/v3/')));
});

test('searching the missing items runs the command of each application', async (t) => {
  const w = await world(t);
  const all = await w.fake.sceneAction('search_missing', {});
  assert.deepEqual(all.data.outputs, { instances: 2 });
  assert.deepEqual(w.sonarr.commands, ['MissingEpisodeSearch']);
  assert.deepEqual(w.radarr.commands, ['MissingMoviesSearch']);
  const one = await w.fake.sceneAction('refresh_library', {
    device: deviceId(w.gladys, 'radarr_1'),
  });
  assert.deepEqual(one.data.outputs, { instances: 1 });
  assert.deepEqual(w.radarr.commands, ['MissingMoviesSearch', 'RefreshMovie']);
  assert.deepEqual(w.sonarr.commands, ['MissingEpisodeSearch']);
});

test('a command refused by an instance that answers does not mark it offline', async (t) => {
  const w = await world(t);
  w.sonarr.failNext = 500;
  const ack = await w.fake.sceneAction('search_missing', { device: deviceId(w.gladys) });
  assert.equal(ack.success, false);
  assert.equal(w.hub.records.get('sonarr_1').error, null);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'online')), 1);
});

test('refreshing reads the instance again after the command', async (t) => {
  const w = await world(t);
  await w.fake.sceneAction('refresh_library', { device: deviceId(w.gladys) });
  const paths = w.sonarr.requests.map((request) => request.path);
  const command = paths.lastIndexOf('/api/v3/command');
  assert.ok(paths.slice(command + 1).includes('/api/v3/queue'));
});

test('another server in a slot: its existing health issues are a starting point', async (t) => {
  const w = await createWorld();
  await w.app.stop();
  const other = new FakeArr({ kind: 'sonarr', apiKey: 'key-1' });
  other.healthChecks.push({ source: 'RootFolderCheck', type: 'error', message: 'Missing' });
  const again = await world(t, {
    dataDir: w.dataDir,
    instances: { 'http://198.51.100.40:8989': other },
    config: { sonarr_1_url: 'http://198.51.100.40:8989', sonarr_1_api_key: 'key-1' },
  });
  await again.hub.pollAll();
  assert.deepEqual(keys(again), []);
});

test('a command no instance accepts fails with an explanation', async (t) => {
  const w = await world(t, { config: { ...BOTH, language: 'fr' } });
  w.sonarr.online = false;
  const ack = await w.fake.sceneAction('search_missing', { device: deviceId(w.gladys) });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Sonarr : ne répond pas/);
});

test('the summary sentence, in the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...BOTH, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_summary', {});
  assert.deepEqual(ack.data.outputs, {
    summary:
      'Sonarr : 1 épisode(s) cette semaine, 3 en file (2 en erreur), 1260 manquant(s), 3 alerte(s) de santé. ' +
      'Radarr 192.0.2.10:7878 : 0 film(s) cette semaine, 0 en file, 3 manquant(s), 3 alerte(s) de santé.',
    upcoming: 1,
    queue: 3,
    missing: 1263,
  });
});

test('no instance configured: the connection status says what to do', async (t) => {
  const w = await world(t, { config: { language: 'en' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /address and API key/);
});
