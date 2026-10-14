// -----------------------------------------------------------------------------
// Pure functions from the Sonarr/Radarr API v3 answers to what the
// integration uses. Shapes checked on Sonarr 4.0 and Radarr 6.4 (fixtures in
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

// Release kinds of a movie, in the order Radarr lists them.
export const RELEASES = Object.freeze(['cinema', 'digital', 'physical']);
const RELEASE_FIELDS = {
  cinema: 'inCinemas',
  digital: 'digitalRelease',
  physical: 'physicalRelease',
};

/**
 * Calendar entries released in [start, end): one per episode, one per movie
 * (its first release inside the window). Sorted by date.
 * @returns {Array<{ key, kind, mediaId, title, subtitle, date: Date, hasFile, release?, overview }>}
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
    } else {
      const release = RELEASES.map((name) => ({
        name,
        date: validDate(entry[RELEASE_FIELDS[name]]),
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
        release: release.name,
        hasFile: entry.hasFile === true,
        overview: typeof entry.overview === 'string' ? entry.overview : '',
      });
    }
  }
  return items.sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
}

// History event types that fire a scene event.
export const HISTORY_EVENTS = Object.freeze({
  downloadFolderImported: 'imported',
  downloadFailed: 'failed',
});

/**
 * The history events worth a scene event (an import, a failed download), in
 * chronological order.
 * @returns {Array<{ id, date: Date, type: 'imported'|'failed', title, label, quality, reason }>}
 */
export function parseHistory(kind, list) {
  const events = [];
  for (const record of Array.isArray(list) ? list : []) {
    const type = HISTORY_EVENTS[record?.eventType];
    const date = validDate(record?.date);
    if (!type || !date || !Number.isInteger(record.id)) {
      continue;
    }
    let title;
    let label;
    if (kind === KINDS.SONARR) {
      title = record.series?.title ?? record.sourceTitle ?? '?';
      const code = episodeCode(record.episode?.seasonNumber, record.episode?.episodeNumber);
      label = code ? `${title} ${code}` : title;
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
    });
  }
  return events.sort((a, b) => a.date - b.date || a.id - b.id);
}
