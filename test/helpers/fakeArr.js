// -----------------------------------------------------------------------------
// In-memory Sonarr, Radarr and Lidarr instances behind the `request` seam of the
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
   * @param {'sonarr'|'radarr'|'lidarr'} [options.kind]
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
    this.apiVersion = kind === 'lidarr' ? 'v1' : 'v3';
    this.history = [];
    this.commands = [];
    this.requests = [];
    this.failNext = null;
  }

  /**
   * A real import event of the fixtures, as a new event `date`. Lidarr: the
   * eight track imports of the captured album, as Lidarr writes them.
   */
  addImport(date, overrides = {}) {
    const templates = fixture(`${this.kind}-history`);
    for (const template of this.kind === 'lidarr' ? templates : templates.slice(0, 1)) {
      const id = this.history.length + 1;
      this.history.push({ ...template, ...overrides, id, date: new Date(date).toISOString() });
    }
    return this.history.length;
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
    const prefix = `${this.urlBase}/api/${this.apiVersion}/`;
    if (!pathname.startsWith(prefix)) {
      // Like the real ones: an empty 404 for another API version.
      return { status: 404, headers: {}, body: '' };
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
        // Sonarr filters on the air date, Radarr on any of the release dates,
        // Lidarr on the album release date.
        return json(
          200,
          this.calendarList.filter((entry) =>
            [
              entry.airDateUtc,
              entry.inCinemas,
              entry.digitalRelease,
              entry.physicalRelease,
              entry.releaseDate,
            ]
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

/**
 * A fake Prowlarr (API v1) or Bazarr (unversioned API, answers in `data`),
 * from the answers of real instances (Prowlarr 2.6.5, Bazarr 1.6.2): one
 * enabled indexer paused after failures, two disabled; a healthy subtitle
 * provider. Tests change the fields to move the state.
 */
export class FakeTool {
  /**
   * @param {object} [options]
   * @param {'prowlarr'|'bazarr'} [options.kind]
   * @param {string} [options.apiKey]
   */
  constructor({ kind = 'prowlarr', apiKey = 'key-p' } = {}) {
    this.kind = kind;
    this.apiKey = apiKey;
    this.online = true;
    this.requests = [];
    this.tasksRun = [];
    if (kind === 'prowlarr') {
      this.status = fixture('prowlarr-status');
      this.healthChecks = fixture('prowlarr-health');
      this.indexers = fixture('prowlarr-indexer');
      this.statuses = fixture('prowlarr-indexerstatus');
      this.stats = fixture('prowlarr-indexerstats');
    } else {
      this.status = fixture('bazarr-status');
      this.healthChecks = fixture('bazarr-health');
      this.badges = fixture('bazarr-badges');
      this.providers = fixture('bazarr-providers');
      // The tasks of a Bazarr with Sonarr and Radarr enabled.
      this.tasks = [
        'update_series',
        'update_movies',
        'wanted_search_missing_subtitles_series',
        'wanted_search_missing_subtitles_movies',
        'check_health',
      ];
    }
  }

  handle(url, { method = 'GET', headers = {} } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({ method, path: pathname, query: Object.fromEntries(searchParams) });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    const prefix = this.kind === 'prowlarr' ? '/api/v1/' : '/api/';
    if (this.kind === 'bazarr' && !/^\/api\/(?!v\d\/)/.test(pathname)) {
      // Bazarr's web interface answers any other path with its HTML page.
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    if (!pathname.startsWith(prefix)) {
      return { status: 404, headers: {}, body: '' };
    }
    // HTTP header names are case-insensitive (X-Api-Key, X-API-KEY).
    const key = Object.entries(headers).find(([name]) => name.toLowerCase() === 'x-api-key')?.[1];
    if (key !== this.apiKey) {
      return json(401, { message: 'Unauthorized' });
    }
    const path = pathname.slice(prefix.length);
    if (this.kind === 'prowlarr') {
      const answers = {
        'system/status': this.status,
        health: this.healthChecks,
        indexer: this.indexers,
        indexerstatus: this.statuses,
        indexerstats: this.stats,
      };
      return path in answers ? json(200, answers[path]) : { status: 404, headers: {}, body: '' };
    }
    if (path === 'system/tasks' && method === 'POST') {
      const task = searchParams.get('taskid');
      if (!this.tasks.includes(task)) {
        return json(500, { message: 'Internal Server Error' });
      }
      this.tasksRun.push(task);
      return { status: 204, headers: {}, body: '' };
    }
    const answers = {
      'system/status': this.status,
      'system/health': this.healthChecks,
      'system/tasks': { data: this.tasks.map((job_id) => ({ job_id, name: job_id })) },
      badges: this.badges,
      providers: this.providers,
    };
    return path in answers
      ? json(200, answers[path])
      : { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
  }
}
