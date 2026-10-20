# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Sonarr, Radarr, Lidarr, Prowlarr and Bazarr API keys are `secret` fields of the
  Gladys configuration. The integration reads them from Gladys at startup,
  keeps them in memory, sends them only to the instance they belong to (in the
  `X-Api-Key` header, never in a URL), and never writes them to `/data` nor to
  the logs.
- **Stored in `/data`**: `arr-state.json`, the id of the last history event
  read per instance (with its address) and the health checks already
  announced to the scenes; for Prowlarr and Bazarr, the ids of the indexers
  paused, the names of the subtitle providers throttled, and whether the
  missing subtitles were over the threshold. Nothing else.
- **Network**: requests go only to the Sonarr, Radarr, Lidarr, Prowlarr and Bazarr addresses typed in the
  configuration, on the local network, in HTTP or HTTPS (certificates
  verified). The posters shown by the widget are read from these instances,
  never from the Internet. The integration opens no port and calls no cloud
  service. It only reads, and starts searches and refreshes: it never deletes
  anything.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Sonarr, Radarr and Lidarr themselves, and the other devices and services of your
network.
