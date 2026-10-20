// -----------------------------------------------------------------------------
// Pure functions from the Sonarr/Radarr API v3, Lidarr/Prowlarr API v1 and
// Bazarr API answers to what the integration uses. Shapes checked on Sonarr
// 4.0, Radarr 6.4, Lidarr 3.1, Prowlarr 2.6 and Bazarr 1.6 (fixtures in
// test/fixtures/arr/, captured from real instances and anonymized).
// -----------------------------------------------------------------------------

import { KINDS } from '../config.js';

const GIB = 1024 ** 3;

/** Download queue: items, and those needing attention (warning or error). */
export function parseQueue(page) {
  const records = Array.isArray(page?.records) ? page.records : [];
  const count = Number.isInteger(page?.totalRecords) ? page.totalRecords : records.length;
  const troubled = records.filter(
    (record) =>
      ['warning', 'error'].includes(record.trackedDownloadStatus) ||
      ['failed', 'warning'].includes(String(record.status).toLowerCase()),
  );
  return { count, errors: troubled.length };
}

/** Health checks: counts per level, and the issues themselves (scene events). */
export function parseHealth(list) {
  const issues = (Array.isArray(list) ? list : [])
    .filter((item) => item && ['warning', 'error'].includes(item.type))
    .map((item) => ({
      source: String(item.source ?? ''),
      level: item.type,
      message: String(item.message ?? '').slice(0, 300),
    }));
  return {
    warnings: issues.filter((issue) => issue.level === 'warning').length,
    errors: issues.filter((issue) => issue.level === 'error').length,
    issues,
  };
}

/**
 * Free space of the root folders, in GiB (what Sonarr/Radarr show as "GB"):
 * the smallest one, the folder that fills up first. Null without a readable
 * root folder.
 */
export function parseFreeSpace(folders) {
  const spaces = (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder?.accessible !== false && Number.isFinite(folder?.freeSpace))
    .map((folder) => folder.freeSpace);
  return spaces.length === 0 ? null : Math.floor(Math.min(...spaces) / GIB);
}

const pad = (number) => String(number).padStart(2, '0');

/** "S01E02" (several episodes of one file are separate calendar entries). */
export const episodeCode = (season, episode) =>
  Number.isInteger(season) && Number.isInteger(episode) ? `S${pad(season)}E${pad(episode)}` : '';

const validDate = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time) : null;
};

/**
 * A Radarr or Lidarr release date: a calendar day sent as midnight UTC. Read as that
 * day at local midnight, so a release of today stays today west of UTC.
 */
const releaseDay = (value) => {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

const dayString = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Release kinds of a movie, in the order Radarr lists them.
export const RELEASES = Object.freeze(['cinema', 'digital', 'physical']);
const RELEASE_FIELDS = {
  cinema: 'inCinemas',
  digital: 'digitalRelease',
  physical: 'physicalRelease',
};

/** An album is downloaded once every track of its chosen release has a file. */
const albumComplete = (statistics) =>
  Number.isInteger(statistics?.trackCount) &&
  statistics.trackCount > 0 &&
  statistics.trackFileCount >= statistics.trackCount;

/**
 * Calendar entries released in [start, end): one per episode, one per movie
 * (its first release inside the window), one per album (`title` the artist,
 * `subtitle` the album, `mediaId` the artist: Lidarr keeps a small poster of
 * the artist only). Sorted by date.
 * @returns {Array<{ key, kind, mediaId, title, subtitle, date: Date, day?, hasFile, release?, overview }>}
 */
export function parseCalendar(kind, list, start, end) {
  const items = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (kind === KINDS.SONARR) {
      const date = validDate(entry.airDateUtc);
      if (!date || date < start || date >= end) {
        continue;
      }
      const code = episodeCode(entry.seasonNumber, entry.episodeNumber);
      items.push({
        key: `episode-${entry.id}`,
        kind,
        mediaId: entry.seriesId ?? entry.series?.id ?? null,
        title: String(entry.series?.title ?? entry.title ?? '?'),
        subtitle: [code, entry.title].filter(Boolean).join(' · '),
        date,
        hasFile: entry.hasFile === true,
        overview: typeof entry.overview === 'string' ? entry.overview : '',
      });
    } else if (kind === KINDS.LIDARR) {
      const date = releaseDay(entry.releaseDate);
      if (!date || date < start || date >= end) {
        continue;
      }
      items.push({
        key: `album-${entry.id}`,
        kind,
        mediaId: entry.artistId ?? entry.artist?.id ?? null,
        title: String(entry.artist?.artistName ?? entry.title ?? '?'),
        subtitle: String(entry.title ?? ''),
        date,
        day: dayString(date),
        hasFile: albumComplete(entry.statistics),
        overview: typeof entry.overview === 'string' ? entry.overview : '',
      });
    } else {
      const release = RELEASES.map((name) => ({
        name,
        date: releaseDay(entry[RELEASE_FIELDS[name]]),
      })).find(({ date }) => date && date >= start && date < end);
      if (!release) {
        continue;
      }
      items.push({
        key: `movie-${entry.id}`,
        kind,
        mediaId: entry.id ?? null,
        title: String(entry.title ?? '?'),
        subtitle: entry.year ? String(entry.year) : '',
        date: release.date,
        // A day, not an instant: the widget shows it without a time.
        day: dayString(release.date),
        release: release.name,
        hasFile: entry.hasFile === true,
        overview: typeof entry.overview === 'string' ? entry.overview : '',
      });
    }
  }
  return items.sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
}

// History event types that fire a scene event. Lidarr writes one import per
// track (`trackFileImported`, with or without a download client; the album
// level `downloadImported` only comes with a download client): they are
// grouped by album.
export const HISTORY_EVENTS = Object.freeze({
  downloadFolderImported: 'imported',
  downloadFailed: 'failed',
});
const LIDARR_HISTORY_EVENTS = Object.freeze({
  trackFileImported: 'imported',
  downloadFailed: 'failed',
});

/**
 * The history events worth a scene event (an import, a failed download), in
 * chronological order, after the event `afterId` (the cursor). One import per
 * album for Lidarr: its new tracks make one event (the highest id and the last
 * date), filtered on the cursor first so that tracks already announced do not
 * bring the album back.
 * @returns {Array<{ id, date: Date, type: 'imported'|'failed', title, label, quality, reason }>}
 */
export function parseHistory(kind, list, afterId = 0) {
  const events = [];
  for (const record of Array.isArray(list) ? list : []) {
    const type = (kind === KINDS.LIDARR ? LIDARR_HISTORY_EVENTS : HISTORY_EVENTS)[
      record?.eventType
    ];
    const date = validDate(record?.date);
    if (!type || !date || !Number.isInteger(record.id) || record.id <= afterId) {
      continue;
    }
    let title;
    let label;
    if (kind === KINDS.SONARR) {
      title = record.series?.title ?? record.sourceTitle ?? '?';
      const code = episodeCode(record.episode?.seasonNumber, record.episode?.episodeNumber);
      label = code ? `${title} ${code}` : title;
    } else if (kind === KINDS.LIDARR) {
      title = record.album?.title ?? record.sourceTitle ?? '?';
      const artist = record.artist?.artistName;
      label = artist ? `${artist} – ${title}` : title;
    } else {
      title = record.movie?.title ?? record.sourceTitle ?? '?';
      label = record.movie?.year ? `${title} (${record.movie.year})` : title;
    }
    events.push({
      id: record.id,
      date,
      type,
      title: String(title).slice(0, 200),
      label: String(label).slice(0, 200),
      quality: String(record.quality?.quality?.name ?? ''),
      reason: type === 'failed' ? String(record.data?.message ?? '').slice(0, 300) : '',
      album: kind === KINDS.LIDARR && type === 'imported' ? (record.albumId ?? null) : null,
    });
  }
  events.sort((a, b) => a.date - b.date || a.id - b.id);
  // Lidarr: the last track of each album stands for the album, with the
  // highest id of its tracks (the cursor moves past all of them).
  const lastOfAlbum = new Map();
  const maxId = new Map();
  for (const event of events) {
    if (event.album !== null) {
      lastOfAlbum.set(event.album, event);
      maxId.set(event.album, Math.max(event.id, maxId.get(event.album) ?? 0));
    }
  }
  return events
    .filter((event) => event.album === null || lastOfAlbum.get(event.album) === event)
    .map(({ album, ...event }) => (album === null ? event : { ...event, id: maxId.get(album) }));
}

// --- Prowlarr ------------------------------------------------------------------

/**
 * Indexers: the enabled ones, and those Prowlarr paused after failures
 * (/indexerstatus lists the blocked ones only), with their name.
 * @returns {{ enabled: number, failing: number, failures: Array<{ id, name, until }>, names: Record<string, string> }}
 */
export function parseIndexers(indexers, statuses) {
  const list = Array.isArray(indexers) ? indexers : [];
  const names = new Map(list.map((indexer) => [indexer?.id, String(indexer?.name ?? '')]));
  const failures = (Array.isArray(statuses) ? statuses : [])
    .filter((status) => Number.isInteger(status?.indexerId))
    .map((status) => ({
      id: status.indexerId,
      name: (names.get(status.indexerId) || `#${status.indexerId}`).slice(0, 200),
      until: validDate(status.disabledTill)?.toISOString() ?? '',
    }))
    .sort((a, b) => a.id - b.id);
  return {
    enabled: list.filter((indexer) => indexer?.enable === true).length,
    failing: failures.length,
    failures,
    // Every indexer by id (an indexer back from a failure is announced by name).
    names: Object.fromEntries([...names].map(([id, name]) => [String(id), name || `#${id}`])),
  };
}

/** Queries and grabs of every indexer over the period of /indexerstats. */
export function parseIndexerStats(stats) {
  const indexers = Array.isArray(stats?.indexers) ? stats.indexers : [];
  const sum = (key) =>
    indexers.reduce((total, item) => total + (Number.isInteger(item?.[key]) ? item[key] : 0), 0);
  return { queries: sum('numberOfQueries'), grabs: sum('numberOfGrabs') };
}

// --- Bazarr --------------------------------------------------------------------

/** Episodes and movies missing subtitles (the Wanted badges). */
export function parseBadges(badges) {
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return { episodes: count(badges?.episodes), movies: count(badges?.movies) };
}

/**
 * The throttled providers (Bazarr pauses a provider after an error: too many
 * requests, refused login...). /providers lists every enabled provider, the
 * healthy ones with the status "Good" (checked on Bazarr 1.6.2).
 * @returns {{ count: number, list: Array<{ name, reason, until }> }}
 */
export function parseProviders(answer) {
  const list = (Array.isArray(answer?.data) ? answer.data : [])
    .filter(
      (provider) =>
        typeof provider?.name === 'string' &&
        provider.name &&
        provider.status &&
        provider.status !== 'Good',
    )
    .map((provider) => ({
      name: provider.name.slice(0, 200),
      reason: String(provider.status ?? '').slice(0, 300),
      until: String(provider.retry ?? '').slice(0, 100),
    }));
  return { count: list.length, list };
}

/**
 * Bazarr health issues (System → Status): an object and a message, no level:
 * warnings, in the shape of parseHealth.
 */
export function parseBazarrHealth(answer) {
  const issues = (Array.isArray(answer?.data) ? answer.data : [])
    .filter((item) => item && (item.object || item.issue))
    .map((item) => ({
      source: String(item.object ?? ''),
      level: 'warning',
      message: String(item.issue ?? '').slice(0, 300),
    }));
  return { warnings: issues.length, errors: 0, issues };
}
