# Fixtures

Answers of real instances, captured on 14/10/2026 from the
`lscr.io/linuxserver/sonarr` (Sonarr 4.0.20) and `lscr.io/linuxserver/radarr`
(Radarr 6.4.4) images, with two series and four movies added through the API
and one real import each (`.strm` files dropped in a download folder,
`DownloadedEpisodesScan` / `DownloadedMoviesScan`). Trimmed of long lists
(seasons, alternate titles, keywords); no address, no key.

Built by hand, from the API v3 shapes (no download client in the test
instances): `sonarr-queue.json` (one download, one blocked import, one failed
download). The `downloadFailed` history events are derived from the real
import events in `test/helpers/fakeArr.js`.

Lidarr (API v1): captured on 16/10/2026 from `lscr.io/linuxserver/lidarr`
(Lidarr 3.1.0.4875), with one artist added through the API and one real import
of an eight-track album (silent MP3 files tagged with ffmpeg, imported by the
`ManualImport` command: Lidarr writes one `trackFileImported` per track). Long
lists trimmed (releases, links, media, genres). Edited: the release date of
`A Moon Shaped Pool` in `lidarr-calendar.json`, moved to 2026-10-16 so that the
week of the test clock has an album. Lidarr has the same empty queue as Radarr
in the tests (`sonarr-queue-empty.json`).

Prowlarr (API v1): captured on 20/10/2026 from `lscr.io/linuxserver/prowlarr`
(Prowlarr 2.6.5.5623), with three Generic Torznab indexers: two disabled, one
enabled behind a small fake Torznab server, used for one search, then stopped
so that the next search paused it (`prowlarr-indexerstatus.json`, the
`IndexerStatusCheck` of `prowlarr-health.json`). Edited: the indexer addresses
(documentation range).

Bazarr: captured on 20/10/2026 from `lscr.io/linuxserver/bazarr` (Bazarr
1.6.2), without Sonarr nor Radarr behind it: the badges count nothing missing,
and the one enabled provider is healthy (`status: "Good"`). The missing counts
and a throttled provider are set by the tests. Edited: the kernel version in
`bazarr-status.json`.
