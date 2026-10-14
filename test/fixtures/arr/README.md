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
