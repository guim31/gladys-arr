# Sonarr & Radarr for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings [Sonarr](https://sonarr.tv) (series) and
[Radarr](https://radarr.video) (movies) into Gladys, over the local network:
what comes out this week, the download queues, the missing items, the health
alerts, and scenes that react to a finished download.

## Features

- **One device per instance**, up to two Sonarr and two Radarr: online, download
  queue, downloads in error, missing episodes or movies, releases of the next 7
  days, free space of the root folders, health warnings and errors, version.
- **Scene triggers**: episode or movie downloaded, download failed, new health
  issue — read from the history and the health checks of each instance, each
  event announced once, also across restarts.
- **Scene actions**: search missing episodes or movies, refresh the library,
  read a summary sentence (for a notification or a speaker). Nothing
  destructive.
- **"Upcoming releases" widget**: the episodes and movies of the week as a
  poster grid (posters served from the instances themselves), the queues per
  instance, and Search missing / Refresh buttons.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Sonarr v3 or v4 and/or Radarr v3 or later, reachable from Gladys, and the API
  key of each (Settings → General → Security).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-arr` (or
   install **Sonarr & Radarr** from the catalog once it is listed).
2. In **Configuration**, enter the address of your Sonarr (`192.168.1.2:8989`,
   or `https://example.org/sonarr` with a URL base) and its API key, then the
   same for Radarr (`:7878`). Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration reads each instance on its own timer (1 to 10 minutes, 2 by
default) through the documented API v3: `/system/status` (hourly), `/health`,
`/queue`, `/wanted/missing`, `/rootfolder`, `/calendar` and `/history/since`.
States are published only when they change (and every 12 hours otherwise).
The devices are published with `should_poll: false`: Gladys does not poll
them.

The history replaces the webhooks of Sonarr and Radarr, which would need an
inbound port the Gladys sandbox does not have: the last event id per instance
is kept in `/data`, so each import is announced once, events older than one
hour are not replayed.

The calendar is a widget, not a Gladys calendar: an integration has one type,
and a `calendar` integration has no devices, triggers on devices or Discover
tab. The devices, triggers and actions matter more here; the widget covers the
"what's coming" part.

## Checked against real instances

Tested with the official `lscr.io/linuxserver/sonarr` (Sonarr 4.0.20) and
`lscr.io/linuxserver/radarr` (Radarr 6.4.4) images: series and movies added
through the API, real imports, calendar, missing items, health checks, root
folders, commands, posters; the fixtures of the tests are their answers. Not
checked yet in a real Gladys installation, nor with a download client (the
queue fixture is built from the API shapes), nor on Sonarr v3: feedback
welcome in the [issues](https://github.com/guim31/gladys-arr/issues).

## Limitations

- No instant push: imports are read from the history at each refresh.
- HTTPS with a self-signed certificate is not supported (use the local
  `http://` address).
- The "downloads in error" count reads the first 100 items of the queue; the
  widget shows 12 releases at most.
- Lidarr, Readarr, Prowlarr and the download clients are not covered.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against fake Sonarr and Radarr instances built from real answers
(`test/fixtures/arr/`) and the fake Gladys of the SDK; they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Sonarr](https://github.com/Sonarr/Sonarr) and
  [Radarr](https://github.com/Radarr/Radarr) (GPL-3.0) and their
  [API documentation](https://wiki.servarr.com); the Home Assistant
  [Sonarr](https://www.home-assistant.io/integrations/sonarr/) and
  [Radarr](https://www.home-assistant.io/integrations/radarr/) integrations
  (Apache 2.0) for the choice of sensors. No code was copied from them.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js).

## Disclaimer

Not affiliated with, nor endorsed by, the Sonarr or Radarr projects. Sonarr and
Radarr are the names of their respective projects.

## License

[Apache-2.0](LICENSE)
