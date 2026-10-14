// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Search the missing episodes or movies, refresh the library, and read the
// summary sentence (for a "say" or a notification: "this week: 3 episodes,
// 2 downloads in queue..."). One instance, or all of them. Nothing destructive.
// -----------------------------------------------------------------------------

import { pick } from './texts.js';

export const SCENE_ACTIONS = {
  async search_missing(hub, { fields = {} }) {
    const instances = await hub.searchMissing(fields.device || null);
    return { instances };
  },

  async refresh_library(hub, { fields = {} }) {
    const instances = await hub.refresh(fields.device || null);
    return { instances };
  },

  async read_summary(hub, { fields = {} }) {
    const device = fields.device || null;
    // Read now: the sentence says what is true at the time of the scene.
    await Promise.all(hub.targets(device).map((record) => hub.poll(record)));
    await hub.afterChanges(false);
    const { sentence, totals } = hub.summary(device);
    return {
      summary: pick(sentence, hub.config.language),
      upcoming: totals.episodes + totals.movies,
      queue: totals.queue,
      missing: totals.missing,
    };
  },
};
