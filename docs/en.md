# Sonarr, Radarr, Lidarr & co

Bring your [Sonarr](https://sonarr.tv) (series), [Radarr](https://radarr.video)
(movies) and [Lidarr](https://lidarr.audio) (music) into Gladys, over your local
network: the episodes, movies and albums coming out this week on the dashboard,
with their posters, the state of the download queues, the missing items, the
health alerts, and scenes that react when an episode, a movie or an album is
downloaded.

The integration was tested against real Sonarr 4, Radarr 6 and Lidarr 3
instances (the official Docker images), not yet in a real Gladys installation: feedback is
welcome on the [Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-arr/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- **Sonarr** v3 or v4, **Radarr** v3 or later and/or **Lidarr** v1 or later,
  reachable from Gladys (same network). Up to two of each.
- The **API key** of each instance: in Sonarr, Radarr or Lidarr, **Settings** →
  **General** → **Security** → **API Key**.

- Optionally **Prowlarr** (v1 or later, one) and **Bazarr** (v1 or later, one):
  API key in **Settings** → **General** → **Security** → **API Key**.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, in the _Sonarr_ section, enter the **Address** of your
   Sonarr with its port (for example `192.168.1.2:8989`), its **API key**, and
   optionally a **Name**. Same thing in the _Radarr_ section (port `7878` by
   default) and the _Lidarr_ section (port `8686`). A Sonarr behind a reverse proxy with a URL base? Enter it too:
   `https://example.org/sonarr`. Leave a section empty if you do not use that
   application. A second Sonarr (4K, anime…), Radarr or Lidarr? Fill in
   the matching _Second…_ section.
3. Save, then click **Test the connection**: the message under the button says,
   for each instance, whether it answers, its version, its queue, its missing
   items and its health alerts.
4. Open the **Discover** tab: one device per instance. Click **Add**, pick a
   room and save.

Options:

- **Refresh interval**: how often the instances are read (queue, calendar,
  history, health), from 1 to 10 minutes (2 minutes by default). Each reading
  makes 6 small requests to each instance, 7 once an hour.
- **Language of the feature names**: English, French, German or Spanish. The
  names are given when a device is added (French by default); the language also
  sets the sentence of the summary action.

## The device of each instance

All the features are read-only. The names say "episodes" on a Sonarr, "movies"
on a Radarr and "albums" on a Lidarr.

| Feature                                                                             | What it is                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Online                                                                              | 1 while the instance answers, 0 when it does not                                       |
| Download queue                                                                      | Items in the download queue (Activity → Queue)                                         |
| Downloads in error                                                                  | Items of the queue in warning or error: blocked import, failed download…               |
| Missing episodes / Missing movies / Missing albums                                  | Monitored episodes, movies or albums without files (Wanted → Missing)                  |
| Episodes in the next 7 days / Movies in the next 7 days / Albums in the next 7 days | Episodes airing, movies (cinema, digital, disc) or albums released, today to 6 days on |
| Free space                                                                          | Free space of the root folders, in GB; the smallest when there are several             |
| Health warnings                                                                     | Warnings of System → Status (indexer, download client…)                                |
| Health errors                                                                       | Errors of System → Status                                                              |
| Version                                                                             | Version of Sonarr, Radarr or Lidarr                                                    |

## Prowlarr and Bazarr

Two optional sections of the configuration, one instance each:
**Prowlarr (indexers)** (port `9696` by default) and **Bazarr (subtitles)**
(port `6767`), with the same **Address**, **API key** and **Name** fields. They
get their own device in the **Discover** tab, and the widget gives them one
line each. Tested against real Prowlarr 2.6 and Bazarr 1.6 instances (the
official Docker images).

The Prowlarr device (5 small requests per reading, 6 once an hour):

| Feature          | What it is                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ |
| Online           | 1 while Prowlarr answers                                                             |
| Enabled indexers | Indexers enabled in Prowlarr                                                         |
| Failing indexers | Indexers Prowlarr paused after failures (down site, refused login, too many queries) |
| Queries (24 h)   | Queries sent to the indexers over the last 24 hours                                  |
| Grabs (24 h)     | Releases grabbed through Prowlarr over the last 24 hours                             |
| Health warnings  | Warnings of System → Status                                                          |
| Health errors    | Errors of System → Status                                                            |
| Version          | Version of Prowlarr                                                                  |

The Bazarr device (4 requests per reading, 5 once an hour):

| Feature                    | What it is                                                                    |
| -------------------------- | ----------------------------------------------------------------------------- |
| Online                     | 1 while Bazarr answers                                                        |
| Episodes missing subtitles | Episodes waiting for subtitles (Wanted → Series), as Bazarr counts them       |
| Movies missing subtitles   | Movies waiting for subtitles (Wanted → Movies)                                |
| Failing providers          | Subtitle providers Bazarr paused after an error (System → Providers)          |
| Health warnings            | Issues of System → Status (Bazarr gives them no level: all count as warnings) |
| Version                    | Version of Bazarr                                                             |

The **Missing subtitles threshold** of the Bazarr section (20 by default) is
the number of episodes and movies without subtitles from which the trigger
below fires.

## Dashboard

Add the **Upcoming releases** widget (the integration's widgets in the
dashboard editor). By default it covers every instance; its **Instance**
setting limits it to one.

It shows:

- two tiles: the items **In queue** and the **Missing** ones, for all the
  instances shown;
- a grid of the episodes, movies and albums coming out from today to the next
  6 days, with their poster (for an album, the poster of its artist), their date, and a _Downloaded_ badge once the file is
  there (for a movie: _In cinemas_, _Digital_ or _Blu-ray / DVD_ before that).
  Tap a card for the episode or album title and the overview;
- one line per instance: queue, downloads in error, health alerts, or
  _Unreachable_;
- two buttons: **Search missing** (the same as the action below) and
  **Refresh**.

The posters come from Sonarr, Radarr and Lidarr themselves (the small copy they keep),
through Gladys: your browser never loads an outside address.

## Scenes

### Triggers

| Trigger                            | When                                                                     | Filters                      | Variables                                                         |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| Episode, movie or album downloaded | Sonarr, Radarr or Lidarr imported a finished download into the library   | instance, application        | instance name, title, title with episode, year or artist, quality |
| Download failed                    | A download was marked as failed                                          | instance, application        | instance name, title, title with episode, year or artist, reason  |
| New health issue                   | A warning or error appears in System → Status (once, until it goes away) | instance, application, level | instance name, level, check, message                              |

The integration reads the history of each instance at every refresh: a
download is announced at most one interval after the import, once, even across
a restart. Events older than one hour are not announced (Gladys stopped for a
night does not replay the night). The health alerts present when an instance is
added are the starting point: only the new ones are announced.

For Lidarr, the title is the album and the title with artist reads
"Radiohead – The King of Limbs". Lidarr records one import per track: the
tracks of an album read together make a single event. Tracks of an album imported later (a missing track, an upgrade) announce the album again; an album whose tracks are imported across two readings (rare: an import takes seconds) is announced twice.

Prowlarr and Bazarr have their own triggers:

| Trigger                                      | When                                                                                         | Filters  | Variables                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| Prowlarr indexer failing                     | Prowlarr paused an indexer after failures                                                    | instance | instance name, indexer, paused until (ISO date) |
| Prowlarr indexer back                        | That indexer works again (its pause is over)                                                 | instance | instance name, indexer                          |
| Bazarr: missing subtitles over the threshold | The episodes and movies missing subtitles reach the threshold (once, until they go under it) | instance | episodes, movies, total, threshold              |
| Bazarr subtitle provider failing             | Bazarr paused a subtitle provider after an error                                             | instance | instance name, provider, reason, paused until   |

The _New health issue_ trigger covers Prowlarr and Bazarr too (application
filter). As for the health alerts, the state found at the first reading of an
instance is the starting point: an indexer already paused, or subtitles already
over the threshold, are not announced.

### Actions

| Action                                               | What it does                                                                                                                | Outputs                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Search missing episodes, movies, albums or subtitles | Starts the search of every monitored missing episode, movie or album, on one instance or all of them                        | instances that started the search           |
| Refresh the Sonarr, Radarr, Lidarr or Bazarr library | Asks for a refresh of the information and files of every series, movie or artist (run in the background by the application) | instances refreshed                         |
| Read the *arr summary                                | Builds a sentence: releases this week, queue, missing items, health alerts                                                  | sentence, releases, items in queue, missing |

Nothing is ever deleted: the integration only reads, and starts searches and
refreshes.

On Bazarr, the search runs its "search missing subtitles" tasks (series and
movies) and the refresh its sync with Sonarr and Radarr; these tasks exist only
when Sonarr or Radarr is enabled in Bazarr. Prowlarr has no library: the actions
skip it.

### Scene ideas

- **Movie night**: trigger _Episode, movie or album downloaded_ with the
  application _Radarr_, then a notification that uses the variable _Title with
  episode (S01E02), year or artist_: "Avatar (2009) is ready to watch".
- **New album**: trigger _Episode, movie or album downloaded_ with the
  application _Lidarr_, then a notification with _Title with episode (S01E02),
  year or artist_: "Radiohead – The King of Limbs is in the library".
- **Morning summary**: every day at 8:00, _Read the \*arr summary_,
  then send its sentence on Telegram or have it said by the speaker.
- **Stuck downloads**: trigger _Download failed_, then a message with the
  reason; or a scene on the _Downloads in error_ feature above 0.
- **Weekly catch-up**: every Sunday night, _Search missing episodes, movies, albums or subtitles_.

- **Indexer down**: trigger _Prowlarr indexer failing_, then a notification
  "Indexer {{indexer}} paused until {{until}}".
- **Subtitles piling up**: trigger _Bazarr: missing subtitles over the threshold_,
  then _Search missing episodes, movies, albums or subtitles_ on the Bazarr device.

## Troubleshooting

- **"does not answer"**: check the address and the port from the Gladys
  machine (`http://<address>:8989` for Sonarr, `:7878` for Radarr, `:8686` for Lidarr). Gladys runs
  the integration in a container: `localhost` is the container itself, use the
  IP address of the machine.
- **"API key refused"**: copy the key again from Settings → General → Security.
  A new key in Sonarr, Radarr or Lidarr needs the new key here.
- **"this address is another application"**: a Radarr address in a Sonarr
  section, a Sonarr in a Lidarr section… (with the key of that other application; with the
  right key, a wrong address answers "API key refused").
- **"no Sonarr, Radarr, Lidarr, Prowlarr or Bazarr API at this address"** or **"the address redirects"**:
  an instance behind a reverse proxy needs its URL base
  (`https://example.org/sonarr`), and a login page of the proxy blocks the API:
  use the local address.
- **"certificate refused"**: HTTPS with a self-signed certificate is not
  supported; use the `http://` address on your network.
- No poster: the application has not downloaded it yet (MediaCover); it comes
  with the next refresh of the series, movie or artist. An artist without a
  poster on Lidarr's metadata server leaves its albums without one.

- **Bazarr "API key refused"**: the key is in Bazarr under Settings → General →
  Security. Bazarr answers any other address with its web page: an address of
  Sonarr in the Bazarr section says "this address is another application".
- **Bazarr "No instance accepted the command"**: Sonarr and Radarr are not
  enabled in Bazarr (Settings → Sonarr / Radarr), so it has nothing to search.

## Limits

- No webhook: the sandbox of Gladys has no inbound port, so the imports are
  read from the history at each refresh, not pushed instantly.
- The _Downloads in error_ count reads the first 100 items of the queue.
- The widget shows 12 releases at most, the first ones in time.
- No calendar in the Gladys calendar view: an integration is either a device
  or a calendar provider, and the devices, triggers and actions matter more
  here. The widget plays the calendar part.
- Lidarr keeps album covers at full size only (often over the 300 KB a widget
  image may weigh): the cards show the poster of the artist.
- Readarr and the download clients are not covered. One Prowlarr and one
  Bazarr at most.
- The Bazarr threshold counts episodes and movies together.
- Not affiliated with the Sonarr, Radarr, Lidarr, Prowlarr or Bazarr projects.
