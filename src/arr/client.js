// -----------------------------------------------------------------------------
// Sonarr and Radarr API v3 client (the API both serve under /api/v3, Sonarr
// v3 and v4, Radarr v3 to v6). One API key per instance (Settings → General),
// sent in the X-Api-Key header: never in the URL, never in the logs.
//
// The client knows which application the slot expects (`kind`) and checks it
// against /system/status: a Radarr address typed in a Sonarr slot is reported
// as such instead of failing on every request.
// -----------------------------------------------------------------------------

import { KINDS } from '../config.js';
import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key refused (401)
  WRONG_APP: 'wrong_app', // a Sonarr in a Radarr slot, or the reverse
  NOT_ARR: 'not_arr', // something answers, not a Sonarr/Radarr API
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class ArrError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'ArrError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const APP_NAMES = { [KINDS.SONARR]: 'Sonarr', [KINDS.RADARR]: 'Radarr' };

// The commands of the scene actions, per application.
export const COMMANDS = Object.freeze({
  [KINDS.SONARR]: { searchMissing: 'MissingEpisodeSearch', refresh: 'RefreshSeries' },
  [KINDS.RADARR]: { searchMissing: 'MissingMoviesSearch', refresh: 'RefreshMovie' },
});

export const QUEUE_PAGE_SIZE = 100;

export class ArrClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the URL base if any
   * @param {string} options.apiKey
   * @param {'sonarr'|'radarr'} options.kind
   * @param {Function} [options.request] HTTP seam (src/arr/http.js)
   */
  constructor({ url, apiKey, kind, request = httpRequest }) {
    this.url = url;
    this.apiKey = apiKey;
    this.kind = kind;
    this.request = request;
  }

  async call(path, { method = 'GET', json, binary = false } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}/api/v3/${path}`, {
        method,
        json,
        binary,
        headers: { 'X-Api-Key': this.apiKey },
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new ArrError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new ArrError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status, headers = {}, body } = answer;
    if (status === 401 || status === 403) {
      throw new ArrError(ERROR_KINDS.AUTH, 'API key refused', { status });
    }
    if (status >= 300 && status < 400) {
      throw new ArrError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404 && !String(headers['content-type'] ?? '').includes('json')) {
      throw new ArrError(ERROR_KINDS.NOT_ARR, `No API v3 at this address (/${path})`, { status });
    }
    if (status < 200 || status >= 300) {
      throw new ArrError(ERROR_KINDS.HTTP, `/${path.split('?')[0]} answered HTTP ${status}`, {
        status,
      });
    }
    if (binary) {
      return { body, contentType: String(headers['content-type'] ?? '') };
    }
    try {
      return body === '' ? null : JSON.parse(body);
    } catch {
      // A reverse proxy's login page, another web application...
      throw new ArrError(ERROR_KINDS.NOT_ARR, `/${path.split('?')[0]} did not answer JSON`);
    }
  }

  /** /system/status, checked against the expected application. */
  async status() {
    const status = await this.call('system/status');
    const appName = typeof status?.appName === 'string' ? status.appName : null;
    if (!appName || typeof status.version !== 'string') {
      throw new ArrError(ERROR_KINDS.NOT_ARR, 'No Sonarr or Radarr status at this address');
    }
    if (appName.toLowerCase() !== this.kind) {
      throw new ArrError(ERROR_KINDS.WRONG_APP, `This is ${appName}, not ${APP_NAMES[this.kind]}`, {
        appName,
      });
    }
    return status;
  }

  health() {
    return this.call('health');
  }

  queue() {
    const unknown =
      this.kind === KINDS.SONARR ? 'includeUnknownSeriesItems' : 'includeUnknownMovieItems';
    return this.call(`queue?page=1&pageSize=${QUEUE_PAGE_SIZE}&${unknown}=true`);
  }

  /** Number of monitored missing episodes or movies (Wanted → Missing). */
  async missingCount() {
    const page = await this.call('wanted/missing?page=1&pageSize=1&monitored=true');
    return Number.isInteger(page?.totalRecords) ? page.totalRecords : null;
  }

  rootFolders() {
    return this.call('rootfolder');
  }

  /** Episodes (with their series) or movies released between two instants. */
  calendar(start, end) {
    const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    return this.call(
      this.kind === KINDS.SONARR
        ? `calendar?${range}&unmonitored=false&includeSeries=true`
        : `calendar?${range}&unmonitored=false`,
    );
  }

  /** History events since an instant, with their series/episode or movie. */
  historySince(date) {
    const include =
      this.kind === KINDS.SONARR ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
    return this.call(`history/since?date=${encodeURIComponent(date.toISOString())}&${include}`);
  }

  /** Start a command (MissingEpisodeSearch, RefreshMovie...). */
  command(name) {
    return this.call('command', { method: 'POST', json: { name } });
  }

  /** The small poster Sonarr/Radarr keep of a series or a movie (JPEG, ~250 px wide). */
  poster(id) {
    return this.call(`mediacover/${Number(id)}/poster-250.jpg`, { binary: true });
  }
}
