// -----------------------------------------------------------------------------
// In-memory Sonarr and Radarr instances behind the `request` seam of the
// client (src/arr/http.js). Answers come from real instances
// (test/fixtures/arr/), with the behaviors that matter: the API key, the
// application name, a history that grows, health checks that change, a poster,
// commands, an instance that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/arr/${name}.json`, import.meta.url), 'utf8'));

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

// A plain 250 × 375 JPEG, the size of the posters Sonarr and Radarr keep.
export const POSTER = readFileSync(new URL('../fixtures/arr/poster-250.jpg', import.meta.url));

export class FakeArr {
  /**
   * @param {object} [options]
   * @param {'sonarr'|'radarr'} [options.kind]
   * @param {string} [options.apiKey]
   * @param {string} [options.urlBase] e.g. '/sonarr'
   */
  constructor({ kind = 'sonarr', apiKey = 'key-1', urlBase = '' } = {}) {
    this.kind = kind;
    this.apiKey = apiKey;
    this.urlBase = urlBase;
    this.online = true;
    this.status = fixture(`${kind}-status`);
    this.healthChecks = fixture(`${kind}-health`);
    this.queuePage = kind === 'sonarr' ? fixture('sonarr-queue') : fixture('sonarr-queue-empty');
    this.missing = fixture(`${kind}-missing`);
    this.folders = fixture(`${kind}-rootfolder`);
    this.calendarList = fixture(`${kind}-calendar`);
    this.history = [];
    this.commands = [];
    this.requests = [];
    this.failNext = null;
  }

  /** A real import event of the fixtures, as a new event `date`. */
  addImport(date, overrides = {}) {
    const [template] = fixture(`${this.kind}-history`);
    const id = this.history.length + 1;
    this.history.push({ ...template, ...overrides, id, date: new Date(date).toISOString() });
    return id;
  }

  addFailure(date, message = 'Download failed: missing articles') {
    const [template] = fixture(`${this.kind}-history`);
    const id = this.history.length + 1;
    this.history.push({
      ...template,
      id,
      eventType: 'downloadFailed',
      date: new Date(date).toISOString(),
      data: { message, downloadClient: 'SABnzbd', downloadClientName: 'SABnzbd' },
    });
    return id;
  }

  /** The `request` function given to the client. */
  handle(url, { method = 'GET', headers = {}, json: body, binary } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({ method, path: pathname, query: Object.fromEntries(searchParams), body });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return { status, headers: {}, body: '' };
    }
    const prefix = `${this.urlBase}/api/v3/`;
    if (!pathname.startsWith(prefix)) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: 'Not Found' };
    }
    if (headers['X-Api-Key'] !== this.apiKey) {
      return { status: 401, headers: {}, body: '' };
    }
    const path = pathname.slice(prefix.length);
    if (method === 'POST' && path === 'command') {
      this.commands.push(body.name);
      return json(201, { name: body.name, status: 'queued', id: this.commands.length });
    }
    if (path.startsWith('mediacover/')) {
      return binary
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: POSTER }
        : { status: 200, headers: { 'content-type': 'image/jpeg' }, body: '' };
    }
    switch (path) {
      case 'system/status':
        return json(200, this.status);
      case 'health':
        return json(200, this.healthChecks);
      case 'queue':
        return json(200, this.queuePage);
      case 'wanted/missing':
        return json(200, this.missing);
      case 'rootfolder':
        return json(200, this.folders);
      case 'calendar': {
        const start = Date.parse(searchParams.get('start'));
        const end = Date.parse(searchParams.get('end'));
        // Sonarr filters on the air date, Radarr on any of the release dates.
        return json(
          200,
          this.calendarList.filter((entry) =>
            [entry.airDateUtc, entry.inCinemas, entry.digitalRelease, entry.physicalRelease]
              .map((value) => Date.parse(value))
              .some((time) => time >= start && time < end),
          ),
        );
      }
      case 'history/since': {
        const since = Date.parse(searchParams.get('date'));
        return json(
          200,
          this.history.filter((event) => Date.parse(event.date) >= since),
        );
      }
      default:
        return json(404, { message: 'NotFound' });
    }
  }
}

/**
 * A network of fake instances, by base URL (with the URL base): the `request`
 * seam of the hub. An address without an instance does not answer.
 */
export function createNetwork(instances = {}) {
  return {
    instances,
    async request(url, options) {
      const origin = new URL(url).origin;
      const instance = Object.entries(instances).find(([base]) => new URL(base).origin === origin);
      if (!instance) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return instance[1].handle(url, options);
    },
  };
}
