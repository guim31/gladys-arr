// -----------------------------------------------------------------------------
// The hub: one record per configured Sonarr/Radarr/Lidarr instance, read on a timer
// of the container (the interval chosen in the configuration), its states
// published to Gladys when they change, its scene events fired from the
// history and the health checks, and the commands of the scene actions and
// the widget.
//
// Gladys never polls these devices (should_poll: false): the interval goes
// beyond the fixed list of the core scheduler, and the scene events must fire
// even for an instance whose device was not added.
//
// History: the hub reads /history/since from a cursor kept under /data (the
// last event id per instance), so an import is announced once, also across
// restarts; events older than an hour are not announced (a container stopped
// for a night does not replay it). No webhook: the sandbox has no inbound port.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { KINDS } from './config.js';
import { ArrClient, COMMANDS, ERROR_KINDS } from './arr/client.js';
import {
  parseCalendar,
  parseFreeSpace,
  parseHealth,
  parseHistory,
  parseQueue,
} from './arr/model.js';
import {
  APP_NAMES,
  FEATURE_KEYS,
  buildDevice,
  deviceIds,
  featureValues,
  instanceName,
  slotOf,
} from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SUMMARY_TEXT,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'arr-hub' });

export const WIDGET_KEY = 'upcoming';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  IMPORTED: 'download_imported',
  FAILED: 'download_failed',
  HEALTH: 'health_issue',
});

export const HUB_TIMINGS = {
  // The version changes with an update: read it hourly, not at every reading.
  statusMs: 60 * 60_000,
  // History events older than this are not announced.
  historyMaxAgeMs: 60 * 60_000,
  // At most this many history scene events per reading (a season pack).
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
  // Width of the calendar window: today and the next 6 days.
  calendarDays: 7,
};

const MAX_STATES_PER_REQUEST = 100;

/** Midnight (container time zone: the TZ of Gladys) of the day of `now`. */
export function startOfDay(now) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

const signature = (instance) => JSON.stringify([instance.url, instance.apiKey]);

export class ArrHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/arr/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    /** @type {Map<string, object>} instance records, by slot */
    this.records = new Map();
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transports = new Map();
    this.connection = null;
    this.saved = { history: {}, health: {} };
    this.pollTimer = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const object = (value) => (value && typeof value === 'object' ? value : {});
    this.saved = { history: object(saved.history), health: object(saved.health) };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const wanted = new Map(config.instances.map((instance) => [instance.slot, instance]));
    for (const [slot, record] of this.records) {
      const instance = wanted.get(slot);
      if (!instance || record.signature !== signature(instance)) {
        this.dropRecord(record);
        this.records.delete(slot);
      }
    }
    for (const instance of config.instances) {
      const record = this.records.get(instance.slot);
      if (record) {
        record.instance = instance; // a new name only
      } else {
        this.records.set(instance.slot, this.newRecord(instance));
      }
    }
    await this.publishDevices();
    await this.pollAll();
    this.schedulePoll();
  }

  newRecord(instance) {
    return {
      instance,
      signature: signature(instance),
      client: new ArrClient({
        url: instance.url,
        apiKey: instance.apiKey,
        kind: instance.kind,
        request: this.request,
      }),
      snapshot: {
        reachable: null,
        version: null,
        queue: null,
        missing: null,
        upcoming: null,
        freeSpace: null,
        health: null,
      },
      error: null,
      statusAt: 0,
      polling: null,
    };
  }

  dropRecord(record) {
    record.dropped = true;
    for (const { externalId } of featureValues(this.gladys, record.instance.slot, {})) {
      this.published.delete(externalId);
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices -----------------------------------------------------------------

  async publishDevices() {
    const devices = [...this.records.values()].map((record) =>
      buildDevice(this.gladys, record.instance, this.config.language),
    );
    // Even an empty list: the Discovery tab then shows no stale instance.
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the devices again, read the instances. */
  async rediscover() {
    await this.publishDevices();
    await this.pollAll();
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const record = this.recordOf(device.external_id);
    if (!record) {
      return;
    }
    await this.publishStates(record, { force: true });
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  recordOf(deviceExternalId) {
    const slot = slotOf(this.gladys, deviceExternalId);
    return slot === null ? null : (this.records.get(slot) ?? null);
  }

  // --- Reading the instances -------------------------------------------------------

  async pollAll() {
    const records = [...this.records.values()];
    const changes = await Promise.all(records.map((record) => this.poll(record)));
    await this.afterChanges(changes.some(Boolean));
  }

  /** Gladys asks for a refresh (onPoll): read that instance now. */
  async pollDevice(device) {
    const record = this.recordOf(device.external_id);
    if (record) {
      await this.afterChanges(await this.poll(record));
    }
  }

  /**
   * Read one instance and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll(record) {
    record.polling ??= this.read(record).finally(() => {
      record.polling = null;
    });
    return record.polling;
  }

  calendarWindow() {
    const start = startOfDay(this.now());
    const end = new Date(start);
    end.setDate(end.getDate() + this.timings.calendarDays); // local days, across a DST change
    return { start, end };
  }

  async read(record) {
    const { client } = record;
    const statusDue =
      !record.snapshot.version || this.now() - record.statusAt >= this.timings.statusMs;
    const { start, end } = this.calendarWindow();
    try {
      const [status, health, queue, missing, folders, calendar] = await Promise.all([
        statusDue ? client.status() : null,
        client.health(),
        client.queue(),
        client.missingCount(),
        client.rootFolders(),
        client.calendar(start, end),
      ]);
      if (status) {
        record.statusAt = this.now();
      }
      const changed = await this.applySuccess(record, {
        version: status ? status.version : record.snapshot.version,
        health: parseHealth(health),
        queue: parseQueue(queue),
        missing,
        freeSpace: parseFreeSpace(folders),
        upcoming: parseCalendar(record.instance.kind, calendar, start, end),
      });
      const announced = await this.readHistory(record);
      return changed || announced;
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      // Lidarr (API v1) in a Sonarr slot, or the reverse, answers 404 here.
      return this.applyFailure(record, await client.otherApp(err));
    }
  }

  label(record) {
    return `${APP_NAMES[record.instance.kind]} ${record.instance.slot.slice(-1)} (${instanceName(record.instance)})`;
  }

  async applySuccess(record, next) {
    if (record.dropped) {
      return false;
    }
    const previous = record.snapshot;
    if (record.error) {
      logger.info(`${this.label(record)}: connection restored`);
    } else if (previous.reachable === null) {
      logger.info(`${this.label(record)}: connected, version ${next.version}`);
    }
    record.error = null;
    record.snapshot = { reachable: true, ...next };
    await this.healthTransition(record, next.health);
    await this.publishStates(record);
    return (
      previous.reachable !== true ||
      JSON.stringify([previous.queue, previous.missing, previous.upcoming]) !==
        JSON.stringify([next.queue, next.missing, next.upcoming])
    );
  }

  async applyFailure(record, err) {
    if (record.dropped) {
      return false;
    }
    const wasError = record.error?.kind;
    record.error = { kind: err.kind, message: err.message };
    record.snapshot = { ...record.snapshot, reachable: false };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`${this.label(record)}: ${err.message}`);
    } else {
      logger.debug(`${this.label(record)}: ${err.message} (again)`);
    }
    await this.publishStates(record);
    return wasError !== err.kind;
  }

  /**
   * Announce each new health issue once (by level and source), across
   * restarts. The issues found at the first reading of an instance are the
   * starting point, not news.
   */
  async healthTransition(record, health) {
    const { slot, url } = record.instance;
    const keys = health.issues.map((issue) => `${issue.level}:${issue.source}`);
    const saved = this.saved.health[slot];
    // Another server in the slot is a first reading too.
    const known = saved?.url === url && Array.isArray(saved.keys) ? saved.keys : null;
    this.saved.health[slot] = { url, keys };
    if (JSON.stringify(known) !== JSON.stringify(keys)) {
      this.store.save(this.saved);
    }
    if (!known) {
      return;
    }
    for (const issue of health.issues) {
      if (!known.includes(`${issue.level}:${issue.source}`)) {
        logger.info(`${this.label(record)}: new health issue (${issue.source})`);
        await this.fire(TRIGGERS.HEALTH, record, {
          level: issue.level,
          source: issue.source,
          message: issue.message,
        });
      }
    }
  }

  /**
   * Read the history since the cursor, fire the imports and failed downloads.
   * @returns {Promise<boolean>} whether something was announced
   */
  async readHistory(record) {
    const { slot, url } = record.instance;
    const now = this.now();
    const cursor = this.saved.history[slot];
    if (!cursor || cursor.url !== url || !Number.isInteger(cursor.lastId)) {
      // First reading of this instance: start from now, announce nothing old.
      try {
        const events = parseHistory(
          record.instance.kind,
          await record.client.historySince(new Date(now - this.timings.historyMaxAgeMs)),
        );
        if (record.dropped) {
          return false;
        }
        const lastId = events.reduce((max, event) => Math.max(max, event.id), 0);
        this.saved.history[slot] = { url, lastId };
        this.store.save(this.saved);
        this.resolved(`history:${slot}`);
      } catch (err) {
        this.historyProblem(record, err);
      }
      return false;
    }
    let events;
    try {
      events = parseHistory(
        record.instance.kind,
        await record.client.historySince(new Date(now - this.timings.historyMaxAgeMs)),
      );
      this.resolved(`history:${slot}`);
    } catch (err) {
      this.historyProblem(record, err);
      return false;
    }
    // Checked after the request: the record that replaced this one (a new API
    // key) may have moved the cursor meanwhile.
    if (record.dropped || this.saved.history[slot] !== cursor) {
      return false;
    }
    const fresh = events.filter((event) => event.id > cursor.lastId);
    if (fresh.length === 0) {
      return false;
    }
    cursor.lastId = Math.max(cursor.lastId, ...fresh.map((event) => event.id));
    this.store.save(this.saved);
    const announced = fresh.slice(-this.timings.maxEventsPerRead);
    if (announced.length < fresh.length) {
      logger.info(
        `${this.label(record)}: ${fresh.length} history events, only the last ${announced.length} announced`,
      );
    }
    for (const event of announced) {
      const imported = event.type === 'imported';
      await this.fire(imported ? TRIGGERS.IMPORTED : TRIGGERS.FAILED, record, {
        title: event.title,
        label: event.label,
        ...(imported ? { quality: event.quality } : { reason: event.reason }),
      });
    }
    // An import changes what the widget shows (a poster gets its badge).
    return true;
  }

  historyProblem(record, err) {
    if (!err.kind) {
      throw err;
    }
    this.problem(
      `history:${record.instance.slot}`,
      `${this.label(record)}: history not read: ${err.message}`,
    );
  }

  async fire(key, record, data) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.instance.slot).device,
        app: record.instance.kind,
        instance: instanceName(record.instance),
        ...data,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates(record, { force = false } = {}) {
    const now = this.now();
    const states = [];
    for (const { key, externalId, value, text } of featureValues(
      this.gladys,
      record.instance.slot,
      record.snapshot,
    )) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While the instance is down, its last counts are not republished as fresh.
      const stale = record.snapshot.reachable === false && key !== FEATURE_KEYS.ONLINE;
      const fresh =
        last && last.value === value && (stale || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        for (const state of batch) {
          this.published.set(state.device_feature_external_id, {
            value: state.text ?? state.state,
            at: now,
          });
        }
        this.resolved('states');
      } catch (err) {
        this.problem('states', `States of ${this.label(record)} refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransports() {
    const entries = [];
    for (const record of this.records.values()) {
      if (record.snapshot.reachable === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, record.instance.slot).device;
      const transport = record.snapshot.reachable
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name: connected while one instance answers. */
  connectionStatus() {
    const { instances, invalidSlots } = this.config;
    if (instances.length === 0) {
      return {
        connected: false,
        message: invalidSlots.length ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noInstance,
      };
    }
    const failing = [...this.records.values()].filter((record) => record.error);
    if (failing.length === 0 && invalidSlots.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noInstance)) {
      const parts = failing.map((record) =>
        labelled(
          instanceName(record.instance),
          pick(ERROR_TEXT[record.error.kind], language),
          language,
        ),
      );
      if (invalidSlots.length) {
        parts.push(pick(CONNECTION_TEXT.invalid, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    return { connected: failing.length < this.records.size, message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  /**
   * The instances a command targets: one device, or every configured instance.
   * @param {string|null|undefined} deviceExternalId
   */
  targets(deviceExternalId) {
    if (this.records.size === 0) {
      throw new Error(pick(ACTION_TEXT.noInstance, this.config?.language));
    }
    if (!deviceExternalId) {
      return [...this.records.values()];
    }
    const record = this.recordOf(deviceExternalId);
    if (!record) {
      throw new Error(pick(ACTION_TEXT.unknownInstance, this.config.language));
    }
    return [record];
  }

  /**
   * Start a command on the targeted instances (`searchMissing`, `refresh`).
   * Resolves with the number of instances that accepted it.
   */
  async command(deviceExternalId, which) {
    const records = this.targets(deviceExternalId);
    const results = await Promise.all(
      records.map(async (record) => {
        const name = COMMANDS[record.instance.kind][which];
        try {
          await record.client.command(name);
          logger.info(`${this.label(record)}: ${name} started`);
          return true;
        } catch (err) {
          if (!err.kind) {
            throw err;
          }
          logger.warn(`${this.label(record)}: ${name} refused: ${err.message}`);
          // A command refused by an instance that answers says nothing of its
          // connection: only a connection problem marks it offline.
          if (err.kind !== ERROR_KINDS.HTTP) {
            await this.applyFailure(record, err);
          }
          return false;
        }
      }),
    );
    await this.afterChanges(false);
    const done = results.filter(Boolean).length;
    if (done === 0) {
      const [record] = records;
      throw new Error(
        records.length === 1 && record.error
          ? labelled(
              instanceName(record.instance),
              pick(ERROR_TEXT[record.error.kind], this.config.language),
              this.config.language,
            )
          : pick(ACTION_TEXT.failed, this.config.language),
      );
    }
    return done;
  }

  searchMissing(deviceExternalId) {
    return this.command(deviceExternalId, 'searchMissing');
  }

  /** Refresh the library (metadata, files) and read the instances again. */
  async refresh(deviceExternalId) {
    const count = await this.command(deviceExternalId, 'refresh');
    const records = this.targets(deviceExternalId);
    const changes = await Promise.all(records.map((record) => this.poll(record)));
    await this.afterChanges(changes.some(Boolean));
    return count;
  }

  // --- Reports -------------------------------------------------------------------------------

  /** Totals of the targeted instances that answer. */
  totals(records) {
    const ok = records.filter((record) => !record.error && record.snapshot.reachable);
    const sum = (read) => ok.reduce((total, record) => total + (read(record.snapshot) ?? 0), 0);
    const of = (kind) => ok.filter((record) => record.instance.kind === kind);
    return {
      answering: ok.length,
      episodes: of(KINDS.SONARR).reduce((n, r) => n + (r.snapshot.upcoming?.length ?? 0), 0),
      movies: of(KINDS.RADARR).reduce((n, r) => n + (r.snapshot.upcoming?.length ?? 0), 0),
      albums: of(KINDS.LIDARR).reduce((n, r) => n + (r.snapshot.upcoming?.length ?? 0), 0),
      queue: sum((s) => s.queue?.count),
      queueErrors: sum((s) => s.queue?.errors),
      missing: sum((s) => s.missing),
      health: sum((s) => (s.health ? s.health.warnings + s.health.errors : 0)),
    };
  }

  /** The sentence of the summary scene action, in every language. */
  summary(deviceExternalId) {
    const records = this.targets(deviceExternalId);
    const sentence = {};
    for (const [language, text] of Object.entries(SUMMARY_TEXT)) {
      sentence[language] = records
        .map((record) => {
          const name = instanceName(record.instance);
          if (record.error || !record.snapshot.reachable) {
            return labelled(name, text.down, language);
          }
          const { upcoming, queue, missing, health } = record.snapshot;
          const media = {
            [KINDS.SONARR]: text.episodes,
            [KINDS.RADARR]: text.movies,
            [KINDS.LIDARR]: text.albums,
          }[record.instance.kind];
          const parts = [media(upcoming.length), text.queue(queue.count, queue.errors)];
          if (missing !== null) {
            parts.push(text.missing(missing));
          }
          const issues = health.warnings + health.errors;
          if (issues) {
            parts.push(text.health(issues));
          }
          return labelled(name, parts.join(', '), language);
        })
        .join('. ')
        .concat('.')
        .slice(0, 1000);
    }
    return { sentence, totals: this.totals(records) };
  }

  /** "Test the connection": read every instance now, one line each. */
  async testConnection() {
    await this.pollAll();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (this.records.size === 0) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const lines = [...this.records.values()].map((record) => {
        const name = instanceName(record.instance);
        if (record.error) {
          return labelled(name, pick(ERROR_TEXT[record.error.kind], language), language);
        }
        const { version, queue, missing, health } = record.snapshot;
        const parts = [text.ok(version), text.queue(queue.count)];
        if (missing !== null) {
          parts.push(text.missing(missing));
        }
        if (health.issues.length) {
          parts.push(text.health(health.issues.length));
        }
        return labelled(name, parts.join(', '), language);
      });
      if (this.config.invalidSlots.length) {
        lines.push(pick(CONNECTION_TEXT.invalid, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** What the widget shows, for one instance or all of them. */
  view(deviceExternalId) {
    if (!deviceExternalId) {
      return [...this.records.values()];
    }
    const record = this.recordOf(deviceExternalId);
    return record ? [record] : [];
  }
}

export { ERROR_KINDS };
