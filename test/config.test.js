import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseInstanceUrl } from '../src/config.js';

test('addresses: bare host, port, URL base, a page copied from the browser', () => {
  assert.equal(parseInstanceUrl('192.0.2.10:8989'), 'http://192.0.2.10:8989');
  assert.equal(parseInstanceUrl(' https://example.org/sonarr/ '), 'https://example.org/sonarr');
  assert.equal(
    parseInstanceUrl('http://192.0.2.10:7878/radarr/calendar?view=week'),
    'http://192.0.2.10:7878/radarr',
  );
  assert.equal(parseInstanceUrl('http://192.0.2.10:8989/wanted/missing'), 'http://192.0.2.10:8989');
  for (const bad of ['', 'ftp://x', 'http://user:pass@192.0.2.10', 'http://', 42, null]) {
    assert.equal(parseInstanceUrl(bad), null, String(bad));
  }
});

test('the defaults and an incomplete slot', () => {
  const config = normalizeConfig({
    sonarr_1_url: '192.0.2.10:8989',
    sonarr_1_api_key: ' abc ',
    radarr_1_url: '192.0.2.10:7878',
    poll_interval: '7',
  });
  assert.deepEqual(config, {
    instances: [
      {
        slot: 'sonarr_1',
        kind: 'sonarr',
        url: 'http://192.0.2.10:8989',
        apiKey: 'abc',
        name: null,
      },
    ],
    invalidSlots: ['radarr_1'],
    pollIntervalMs: Number(DEFAULT_CONFIG.poll_interval) * 1000,
    language: 'fr',
  });
});

test('a URL base named like a page of another application is kept', () => {
  assert.equal(parseInstanceUrl('http://192.0.2.1:7878/movies'), 'http://192.0.2.1:7878/movies');
  assert.equal(
    parseInstanceUrl('https://example.org/media/movies/radarr/'),
    'https://example.org/media/movies/radarr',
  );
  assert.equal(parseInstanceUrl('http://192.0.2.1/history'), 'http://192.0.2.1/history');
});
