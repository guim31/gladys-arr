// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to eight instances in fixed slots: two Sonarr, two Radarr, two Lidarr,
// one Prowlarr, one Bazarr (address, API key, name). The slot is the device identity: changing the address of a slot
// (an IP for a name, HTTP for HTTPS) keeps the device and its history.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const KINDS = Object.freeze({
  SONARR: 'sonarr',
  RADARR: 'radarr',
  LIDARR: 'lidarr',
  PROWLARR: 'prowlarr',
  BAZARR: 'bazarr',
});

/** The applications that manage a library (calendar, queue, history). */
export const MEDIA_KINDS = Object.freeze([KINDS.SONARR, KINDS.RADARR, KINDS.LIDARR]);

/** The configuration slots: `<kind>_<number>`, in display order. */
export const SLOTS = [
  { kind: KINDS.SONARR, number: 1 },
  { kind: KINDS.SONARR, number: 2 },
  { kind: KINDS.RADARR, number: 1 },
  { kind: KINDS.RADARR, number: 2 },
  { kind: KINDS.LIDARR, number: 1 },
  { kind: KINDS.LIDARR, number: 2 },
  { kind: KINDS.PROWLARR, number: 1 },
  { kind: KINDS.BAZARR, number: 1 },
].map((slot) => Object.freeze({ ...slot, id: `${slot.kind}_${slot.number}` }));

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

export const DEFAULT_CONFIG = {
  sonarr_1_url: '',
  sonarr_1_api_key: '',
  sonarr_1_name: '',
  sonarr_2_url: '',
  sonarr_2_api_key: '',
  sonarr_2_name: '',
  radarr_1_url: '',
  radarr_1_api_key: '',
  radarr_1_name: '',
  radarr_2_url: '',
  radarr_2_api_key: '',
  radarr_2_name: '',
  lidarr_1_url: '',
  lidarr_1_api_key: '',
  lidarr_1_name: '',
  lidarr_2_url: '',
  lidarr_2_api_key: '',
  lidarr_2_name: '',
  prowlarr_1_url: '',
  prowlarr_1_api_key: '',
  prowlarr_1_name: '',
  bazarr_1_url: '',
  bazarr_1_api_key: '',
  bazarr_1_name: '',
  bazarr_1_missing_threshold: 20,
  poll_interval: '120',
  language: 'fr',
};

const MAX_NAME_LENGTH = 40;
const MAX_THRESHOLD = 100_000;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8989`), or the URL copied from the browser, with the URL base
 * of an instance behind a reverse proxy (`https://example.org/sonarr/`).
 * HTTP by default; the query, the fragment and a trailing slash dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseInstanceUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // A path copied from the browser: keep the URL base, drop the page.
  const path = url.pathname
    .replace(
      /\/(calendar|activity|wanted|settings|system|series|movie|artist|album|add)(\/.*)?$/i,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/** The Bazarr "missing subtitles" threshold: a whole number from 1, else the default. */
function threshold(raw) {
  const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
  return Number.isInteger(value) && value >= 1 && value <= MAX_THRESHOLD
    ? value
    : DEFAULT_CONFIG.bazarr_1_missing_threshold;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const instances = [];
  const invalidSlots = [];
  for (const slot of SLOTS) {
    const typed = text(`${slot.id}_url`);
    if (!typed) {
      continue;
    }
    const url = parseInstanceUrl(typed);
    const apiKey = text(`${slot.id}_api_key`);
    if (!url || !apiKey) {
      invalidSlots.push(slot.id);
      continue;
    }
    instances.push({
      slot: slot.id,
      kind: slot.kind,
      url,
      apiKey,
      name: text(`${slot.id}_name`).slice(0, MAX_NAME_LENGTH) || null,
      ...(slot.kind === KINDS.BAZARR
        ? { missingThreshold: threshold(source[`${slot.id}_missing_threshold`]) }
        : {}),
    });
  }

  return {
    instances,
    invalidSlots,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
