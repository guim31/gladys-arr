# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-14

### Added

- Sonarr and Radarr in Gladys, over the local network (API v3): up to two of
  each, one device per instance with online state, download queue, downloads
  in error, missing episodes or movies, releases of the next 7 days, free space
  of the root folders, health warnings and errors, and version.
- Scene triggers: episode or movie downloaded, download failed, new health
  issue, read from the history and the health checks of each instance.
- Scene actions: search missing episodes or movies, refresh the library, read
  a summary sentence (releases of the week, queue, missing items, alerts).
- "Upcoming releases" dashboard widget: the episodes and movies of the week
  with their posters, the queues, and Search missing / Refresh buttons.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-arr/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-arr/releases/tag/v1.0.0
