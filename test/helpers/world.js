// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake Sonarr/Radarr/Lidarr instances
// on a fake network, a temporary /data and a manual clock, with the
// integration wired on top through registerHandlers. No timer runs unless
// `timers: true`: the tests read the instances with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeArr, createNetwork } from './fakeArr.js';

process.env.LOG_LEVEL ??= 'silent';
// The calendar window starts at midnight in the time zone of Gladys.
process.env.TZ = 'Europe/Paris';

export const SONARR_URL = 'http://192.0.2.10:8989';
export const RADARR_URL = 'http://192.0.2.10:7878';
export const LIDARR_URL = 'http://192.0.2.10:8686';

/** A manual clock: the morning of the real captures (one episode and one movie that week). */
export function createClock(start = Date.parse('2026-10-14T16:30:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BOTH = {
  sonarr_1_url: SONARR_URL,
  sonarr_1_api_key: 'key-1',
  sonarr_1_name: 'Sonarr',
  radarr_1_url: RADARR_URL,
  radarr_1_api_key: 'key-2',
  language: 'en',
};

export const defaultInstances = () => ({
  [SONARR_URL]: new FakeArr({ kind: 'sonarr', apiKey: 'key-1' }),
  [RADARR_URL]: new FakeArr({ kind: 'radarr', apiKey: 'key-2' }),
});

/**
 * @param {object} [options]
 * @param {Record<string, FakeArr>} [options.instances] by base URL
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  instances,
  config = BOTH,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-arr-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(instances ?? defaultInstances());
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return {
    gladys,
    fake: gladys.fake,
    network,
    sonarr: network.instances[SONARR_URL],
    radarr: network.instances[RADARR_URL],
    app,
    hub: app.hub,
    clock,
    dataDir,
  };
}

/** External id of the device of a configuration slot. */
export const deviceId = (gladys, slot = 'sonarr_1') => gladys.externalIds('arr', slot).device;
export const featureId = (gladys, key, slot = 'sonarr_1') =>
  gladys.externalIds('arr', slot).feature(key);

export { FakeArr };
