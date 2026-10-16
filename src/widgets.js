// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `upcoming`.
//
// The use case: what comes out this week, at a glance on the wall tablet,
// and whether the downloads are stuck. So the widget shows a poster grid of
// the episodes, movies and albums released from today to the next 6 days (a check
// mark badge once downloaded), two tiles (queue, missing), one status row per
// instance, and two direct buttons: search the missing ones, refresh.
//
// Every instance by default, or the one chosen in the widget settings. The
// figures are sent as values, not bound to device features, so the widget
// works before the devices are added to Gladys and sums several instances.
//
// Posters: Sonarr, Radarr and Lidarr keep a small copy of each poster
// (MediaCover, ~250 px wide JPEG; for an album, the poster of its artist). The content declares a key per poster, Gladys asks for
// its bytes through onWidgetGetImage, and the hub reads them from the
// instance: the browser never loads a third-party URL.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { KINDS } from './config.js';
import { ERROR_KINDS } from './arr/client.js';
import { instanceName } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  SEARCH_MISSING: 'search_missing',
  REFRESH: 'refresh',
});

const MAX_CARDS = 12;
const MAX_IMAGE_BYTES = 300 * 1024;
const POSTER_KEY = /^poster-(sonarr|radarr|lidarr)-(\d)-(\d{1,12})$/;

export const TEXT = {
  pick: {
    en: 'Enter the address and API key of your Sonarr, Radarr or Lidarr in the configuration of the integration.',
    fr: "Saisissez l'adresse et la clé d'API de votre Sonarr, Radarr ou Lidarr dans la configuration de l'intégration.",
    de: 'Gib die Adresse und den API-Schlüssel deines Sonarr, Radarr oder Lidarr in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección y la clave de API de su Sonarr, Radarr o Lidarr en la configuración de la integración.',
  },
  unknown: {
    en: 'This instance is no longer in the configuration: choose another one in the widget settings.',
    fr: "Cette instance n'est plus dans la configuration : choisissez-en une autre dans les réglages du widget.",
    de: 'Diese Instanz ist nicht mehr in der Konfiguration: Wähle eine andere in den Widget-Einstellungen.',
    es: 'Esta instancia ya no está en la configuración: elija otra en la configuración del widget.',
  },
  nothing: {
    en: 'Nothing comes out this week.',
    fr: 'Aucune sortie cette semaine.',
    de: 'Diese Woche erscheint nichts.',
    es: 'No hay estrenos esta semana.',
  },
  queue: { en: 'In queue', fr: 'En file', de: 'In Warteschlange', es: 'En cola' },
  missing: { en: 'Missing', fr: 'Manquants', de: 'Fehlend', es: 'Pendientes' },
  inQueue: { en: 'in queue', fr: 'en file', de: 'wartend', es: 'en cola' },
  inError: { en: 'in error', fr: 'en erreur', de: 'mit Fehler', es: 'con error' },
  healthy: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  issues: { en: 'alert(s)', fr: 'alerte(s)', de: 'Meldung(en)', es: 'aviso(s)' },
  unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  downloaded: { en: 'Downloaded', fr: 'Téléchargé', de: 'Geladen', es: 'Descargado' },
  cinema: { en: 'In cinemas', fr: 'Au cinéma', de: 'Im Kino', es: 'En cines' },
  digital: { en: 'Digital', fr: 'Numérique', de: 'Digital', es: 'Digital' },
  physical: { en: 'Blu-ray / DVD', fr: 'Blu-ray / DVD', de: 'Blu-ray / DVD', es: 'Blu-ray / DVD' },
  searchMissing: {
    en: 'Search missing',
    fr: 'Chercher les manquants',
    de: 'Fehlende suchen',
    es: 'Buscar pendientes',
  },
  refresh: { en: 'Refresh', fr: 'Rafraîchir', de: 'Aktualisieren', es: 'Actualizar' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    searchMissing: (count) => `Search for the missing items started on ${count} instance(s).`,
    refresh: (count) => `Refresh started on ${count} instance(s).`,
  },
  fr: {
    searchMissing: (count) => `Recherche des manquants lancée sur ${count} instance(s).`,
    refresh: (count) => `Rafraîchissement lancé sur ${count} instance(s).`,
  },
  de: {
    searchMissing: (count) => `Suche nach fehlenden Elementen auf ${count} Instanz(en) gestartet.`,
    refresh: (count) => `Aktualisierung auf ${count} Instanz(en) gestartet.`,
  },
  es: {
    searchMissing: (count) => `Búsqueda de pendientes iniciada en ${count} instancia(s).`,
    refresh: (count) => `Actualización iniciada en ${count} instancia(s).`,
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** Image key of the poster of a series or movie of an instance. */
export const posterKey = (slot, mediaId) => `poster-${slot.replace('_', '-')}-${mediaId}`;

/** One card of the grid. */
function card(record, item, language) {
  // Under the series: its episode code; under the artist: the album.
  const isEpisode = item.kind === KINDS.SONARR;
  const isAlbum = item.kind === KINDS.LIDARR;
  const code = isEpisode ? item.subtitle.split(' · ')[0] : isAlbum ? item.subtitle : '';
  const title = fit(code ? `${item.title} · ${code}` : item.title, 60);
  const overview = item.overview
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const description = [isEpisode || isAlbum ? item.subtitle : item.title, overview]
    .filter(Boolean)
    .join('\n\n');
  const badge = item.hasFile
    ? { text: t(TEXT.downloaded, language), color: WIDGET_COLORS.SUCCESS }
    : item.release
      ? { text: t(TEXT[item.release], language), color: WIDGET_COLORS.NEUTRAL }
      : null;
  return {
    title,
    date: item.day ?? item.date.toISOString(),
    ...(Number.isSafeInteger(item.mediaId) && item.mediaId > 0
      ? { image: posterKey(record.instance.slot, item.mediaId) }
      : {}),
    ...(badge ? { badge } : {}),
    ...(description ? { description: fit(description, 2000) } : {}),
  };
}

/** The status row of one instance. */
function instanceRow(record, language) {
  const label = fit(instanceName(record.instance), 40);
  if (record.error) {
    const unreachable = record.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      label,
      icon: 'alert-triangle',
      value: t(unreachable ? TEXT.unreachable : TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  const { queue, health } = record.snapshot;
  if (!queue || !health) {
    return { label, icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
  }
  const parts = [`${queue.count} ${t(TEXT.inQueue, language)}`];
  if (queue.errors) {
    parts.push(`${queue.errors} ${t(TEXT.inError, language)}`);
  }
  const issues = health.warnings + health.errors;
  if (issues) {
    parts.push(`${issues} ${t(TEXT.issues, language)}`);
  }
  const color =
    health.errors || queue.errors
      ? WIDGET_COLORS.DANGER
      : health.warnings
        ? WIDGET_COLORS.WARNING
        : WIDGET_COLORS.SUCCESS;
  return {
    label,
    icon: { [KINDS.SONARR]: 'tv', [KINDS.RADARR]: 'film', [KINDS.LIDARR]: 'music' }[
      record.instance.kind
    ],
    value: fit(parts.join(' · '), 40),
    color,
  };
}

export function buttons(language) {
  return [
    {
      type: 'button',
      label: t(TEXT.searchMissing, language),
      icon: 'search',
      style: 'secondary',
      action: { key: ACTIONS.SEARCH_MISSING },
    },
    {
      type: 'button',
      label: t(TEXT.refresh, language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTIONS.REFRESH },
    },
  ];
}

async function get(hub, { settings, language = 'en' }) {
  if (hub.records.size === 0) {
    return message(TEXT.pick, language);
  }
  const records = hub.view(settings?.device);
  if (records.length === 0) {
    return message(TEXT.unknown, language);
  }
  const totals = hub.totals(records);
  const components = [];
  if (totals.answering > 0) {
    components.push(
      { type: 'value', value: totals.queue, label: t(TEXT.queue, language), icon: 'download' },
      {
        type: 'value',
        value: totals.missing,
        label: t(TEXT.missing, language),
        icon: 'search',
        color: totals.missing ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  const cards = records
    .filter((record) => !record.error && record.snapshot.upcoming)
    .flatMap((record) => record.snapshot.upcoming.map((item) => ({ record, item })))
    .sort((a, b) => a.item.date - b.item.date || a.item.title.localeCompare(b.item.title))
    .slice(0, MAX_CARDS)
    .map(({ record, item }) => card(record, item, language));
  if (cards.length > 0) {
    components.push({ type: 'card-list', display: 'grid', items: cards });
  } else if (totals.answering > 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
  }
  components.push({
    type: 'status',
    items: records.slice(0, 10).map((record) => instanceRow(record, language)),
  });
  components.push(...buttons(language));
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, settings }) {
  const device = settings?.device || null;
  const done = (render) =>
    Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));
  if (actionKey === ACTIONS.SEARCH_MISSING) {
    const count = await hub.searchMissing(device);
    return { message: done((text) => text.searchMissing(count)) };
  }
  if (actionKey === ACTIONS.REFRESH) {
    const count = await hub.refresh(device);
    return { message: done((text) => text.refresh(count)) };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

/**
 * Bytes of a poster, as raw base64 (onWidgetGetImage). Only the keys this
 * widget declares, only from a configured instance.
 */
export async function getImage(hub, imageKey) {
  const match = POSTER_KEY.exec(String(imageKey));
  if (!match) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const record = hub.records.get(`${match[1]}_${match[2]}`);
  if (!record) {
    throw new Error(`No instance for image ${imageKey}`);
  }
  const { body } = await record.client.poster(Number(match[3]));
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw new Error(`Poster ${imageKey} is empty or too large`);
  }
  const image = body.toString('base64');
  // The checks of the core (format, header, size): refused here, explained in the logs.
  const problems = validateWidgetImage(image);
  if (problems.length > 0) {
    throw new Error(`Poster ${imageKey} refused: ${problems.join('; ')}`);
  }
  return image;
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
