// -----------------------------------------------------------------------------
// One Gladys device per configured Sonarr or Radarr instance.
//
// Identity: the configuration slot (`sonarr_1`, `radarr_2`...), not the
// address: moving an instance to another host or behind a reverse proxy keeps
// the device and its history. The slot also fixes the application, so the
// feature names say "episodes" or "movies" from the start (they are frozen at
// creation in Gladys).
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js), all read-only:
//   - online: input/binary, 1 while the instance answers;
//   - queue, queue_errors: items in the download queue, and those in warning
//     or error (stuck import, failed download);
//   - missing: monitored episodes or movies missing (Wanted → Missing);
//   - upcoming_7d: episodes or movies released in the next 7 days;
//   - free_space: free space of the root folders, in GB (the smallest);
//   - health_warnings, health_errors: the System → Status health checks;
//   - version: text/text.
//
// should_poll: false: the integration reads the instances on its own timer
// (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { KINDS, SLOTS, hostOf } from './config.js';

export const DEVICE_TYPE = 'arr';
export const URL_PARAM = 'ARR_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  QUEUE: 'queue',
  QUEUE_ERRORS: 'queue_errors',
  MISSING: 'missing',
  UPCOMING: 'upcoming_7d',
  FREE_SPACE: 'free_space',
  HEALTH_WARNINGS: 'health_warnings',
  HEALTH_ERRORS: 'health_errors',
  VERSION: 'version',
});

export const APP_NAMES = { [KINDS.SONARR]: 'Sonarr', [KINDS.RADARR]: 'Radarr' };

const common = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.QUEUE]: 'Download queue',
    [FEATURE_KEYS.QUEUE_ERRORS]: 'Downloads in error',
    [FEATURE_KEYS.FREE_SPACE]: 'Free space',
    [FEATURE_KEYS.HEALTH_WARNINGS]: 'Health warnings',
    [FEATURE_KEYS.HEALTH_ERRORS]: 'Health errors',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.QUEUE]: 'File de téléchargement',
    [FEATURE_KEYS.QUEUE_ERRORS]: 'Téléchargements en erreur',
    [FEATURE_KEYS.FREE_SPACE]: 'Espace libre',
    [FEATURE_KEYS.HEALTH_WARNINGS]: 'Avertissements de santé',
    [FEATURE_KEYS.HEALTH_ERRORS]: 'Erreurs de santé',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.QUEUE]: 'Download-Warteschlange',
    [FEATURE_KEYS.QUEUE_ERRORS]: 'Downloads mit Fehler',
    [FEATURE_KEYS.FREE_SPACE]: 'Freier Speicher',
    [FEATURE_KEYS.HEALTH_WARNINGS]: 'Zustandswarnungen',
    [FEATURE_KEYS.HEALTH_ERRORS]: 'Zustandsfehler',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.QUEUE]: 'Cola de descargas',
    [FEATURE_KEYS.QUEUE_ERRORS]: 'Descargas con error',
    [FEATURE_KEYS.FREE_SPACE]: 'Espacio libre',
    [FEATURE_KEYS.HEALTH_WARNINGS]: 'Avisos de estado',
    [FEATURE_KEYS.HEALTH_ERRORS]: 'Errores de estado',
    [FEATURE_KEYS.VERSION]: 'Versión',
  },
};

const media = {
  [KINDS.SONARR]: {
    en: { missing: 'Missing episodes', upcoming: 'Episodes in the next 7 days' },
    fr: { missing: 'Épisodes manquants', upcoming: 'Épisodes des 7 prochains jours' },
    de: { missing: 'Fehlende Episoden', upcoming: 'Episoden der nächsten 7 Tage' },
    es: { missing: 'Episodios que faltan', upcoming: 'Episodios de los próximos 7 días' },
  },
  [KINDS.RADARR]: {
    en: { missing: 'Missing movies', upcoming: 'Movies in the next 7 days' },
    fr: { missing: 'Films manquants', upcoming: 'Films des 7 prochains jours' },
    de: { missing: 'Fehlende Filme', upcoming: 'Filme der nächsten 7 Tage' },
    es: { missing: 'Películas que faltan', upcoming: 'Películas de los próximos 7 días' },
  },
};

// Feature names, per application and language (Gladys does not tell a device
// integration the user's language). Frozen at creation in Gladys.
export const NAMES = Object.fromEntries(
  Object.values(KINDS).map((kind) => [
    kind,
    Object.fromEntries(
      Object.entries(common).map(([language, names]) => [
        language,
        {
          ...names,
          [FEATURE_KEYS.MISSING]: media[kind][language].missing,
          [FEATURE_KEYS.UPCOMING]: media[kind][language].upcoming,
        },
      ]),
    ),
  ]),
);

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000;

const counter = (key, value, extra = {}) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
    ...extra,
  },
  value,
});

// Order = display order in Gladys.
const FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (snapshot) => (snapshot.reachable === null ? null : snapshot.reachable ? 1 : 0),
  },
  counter(FEATURE_KEYS.QUEUE, (snapshot) => snapshot.queue?.count ?? null),
  counter(FEATURE_KEYS.QUEUE_ERRORS, (snapshot) => snapshot.queue?.errors ?? null),
  counter(FEATURE_KEYS.MISSING, (snapshot) => snapshot.missing ?? null),
  counter(FEATURE_KEYS.UPCOMING, (snapshot) => snapshot.upcoming?.length ?? null),
  counter(FEATURE_KEYS.FREE_SPACE, (snapshot) => snapshot.freeSpace ?? null, {
    unit: DEVICE_FEATURE_UNITS.GIGABYTE,
  }),
  counter(FEATURE_KEYS.HEALTH_WARNINGS, (snapshot) => snapshot.health?.warnings ?? null, {
    max: 100,
  }),
  counter(FEATURE_KEYS.HEALTH_ERRORS, (snapshot) => snapshot.health?.errors ?? null, {
    max: 100,
  }),
  {
    key: FEATURE_KEYS.VERSION,
    text: true,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    },
    value: (snapshot) => snapshot.version || null,
  },
];

/** External ids of an instance's device and features. */
export const deviceIds = (gladys, slot) => gladys.externalIds(DEVICE_TYPE, slot);

/** The slot of a device external id, null when it is not one of ours. */
export function slotOf(gladys, externalId) {
  return SLOTS.find((slot) => deviceIds(gladys, slot.id).device === externalId)?.id ?? null;
}

/** The name shown for an instance: the one typed in the configuration, else app and host. */
export const instanceName = (instance) =>
  instance.name ?? `${APP_NAMES[instance.kind]} ${hostOf(instance.url)}`.slice(0, 60);

/**
 * The discovery payload of an instance.
 * @param {object} gladys SDK client
 * @param {{ slot: string, kind: string, url: string, name: string|null }} instance
 * @param {string} language feature names language
 */
export function buildDevice(gladys, instance, language = 'en') {
  const ids = deviceIds(gladys, instance.slot);
  const names = NAMES[instance.kind][language] ?? NAMES[instance.kind].en;
  return {
    name: instanceName(instance),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: instance.url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature for an instance snapshot (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(gladys, slot, snapshot) {
  const ids = deviceIds(gladys, slot);
  return FEATURES.map(({ key, value, text = false }) => ({
    key,
    externalId: ids.feature(key),
    value: value(snapshot),
    text,
  }));
}
