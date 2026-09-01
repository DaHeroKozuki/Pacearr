<p align="center">
  <img src="docs/assets/pacearr-banner.png" alt="Pacearr — automated One Pace library management" width="100%">
</p>

# Pacearr

**One Pace library automation, built for self-hosters.**

[![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange?style=flat-square)](https://github.com/DaHeroKozuki/Pacearr/releases)
[![GitHub Packages](https://img.shields.io/badge/ghcr.io-daherokozuki%2Fpacearr-blue?style=flat-square&logo=github)](https://github.com/DaHeroKozuki/Pacearr/pkgs/container/pacearr)
[![GitHub Release](https://img.shields.io/github/v/release/DaHeroKozuki/Pacearr?include_prereleases&style=flat-square)](https://github.com/DaHeroKozuki/Pacearr/releases)
[![GitHub Issues](https://img.shields.io/github/issues/DaHeroKozuki/Pacearr?style=flat-square)](https://github.com/DaHeroKozuki/Pacearr/issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/DaHeroKozuki/Pacearr?style=flat-square)](https://github.com/DaHeroKozuki/Pacearr/commits/main)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Pacearr is a self-hosted One Pace library manager that automates release discovery, downloading, importing, file organization, metadata, posters, and media-server integration.

Originally derived from [OnePacerr](https://github.com/eltharynd/OnePacerr), Pacearr is evolving into an independent application focused on resilient automation, flexible release management, and a modern web-based experience.

> [!IMPORTANT]
> **Pacearr is alpha software.** Version `0.1.0-alpha` begins the Pacearr development line. The background automation and reliability foundation is functional, but the planned web UI, release profiles, and other Sonarr-like management features described in the roadmap are **not implemented yet**. Back up your configuration and persistent state before upgrading or testing.

Pacearr is not affiliated with, endorsed by, or maintained by the One Pace team.

## Table of contents

- [What Pacearr does](#what-pacearr-does)
- [Current capabilities](#current-capabilities)
- [Planned features](#planned-features)
- [Compatibility](#compatibility)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Docker Compose](#docker-compose)
  - [Recommended first run](#recommended-first-run)
  - [Running locally](#running-locally)
- [Configuration reference](#configuration-reference)
  - [General](#general)
  - [Reliability and persistent state](#reliability-and-persistent-state)
  - [Pipeline](#pipeline)
  - [Filters](#filters)
  - [Library](#library)
  - [Plex](#plex)
  - [Jellyfin](#jellyfin)
  - [Emby](#emby)
  - [Torrent clients](#torrent-clients)
  - [Path mappings](#path-mappings)
  - [Metadata](#metadata)
- [Posters](#posters)
- [Reliability and recovery](#reliability-and-recovery)
- [Roadmap](#roadmap)
- [Migration from OnePacerr](#migration-from-onepacerr)
- [Origins and attribution](#origins-and-attribution)
- [Contributing](#contributing)
- [Credits and acknowledgements](#credits-and-acknowledgements)
- [License and disclaimer](#license-and-disclaimer)

## What Pacearr does

Sonarr does not natively understand [One Pace](https://onepace.net/), the fan-edited, manga-focused version of One Piece. Pacearr fills that gap by monitoring One Pace releases, comparing them with an existing library, sending missing episodes to a supported torrent client, importing completed downloads, and updating the corresponding media-server metadata and artwork.

Pacearr can work with Plex, Jellyfin, Emby, or a local folder. It can also organize an existing library without downloading anything.

## Current capabilities

The `0.1.0-alpha` foundation currently provides:

- RSS-based discovery of One Pace releases and metadata
- comparison of available releases with an existing library
- optional CRC32 verification and replacement of outdated files
- optional organization and renaming of existing files
- automatic submission of missing releases to a torrent client
- completed-download monitoring, import, and category changes
- Plex, Jellyfin, Emby, and local-folder library modes
- episode, season, and show metadata and poster management
- persistent episode-processing state across restarts
- retry and backoff for temporary Plex and metadata failures
- recovery of interrupted imports and pending torrent cleanup
- Plex API timeouts, circuit breaking, scan monitoring, and WebSocket recovery
- batched Plex imports and refreshes
- quarantine handling for problematic files
- minimum-free-space protection
- mixed Windows/Plex and Linux/Docker path mapping
- structured text or JSON logging

### What is not available yet

The following ideas are part of Pacearr's direction, but are not current features:

- a browser-based management interface
- an episode and arc dashboard
- interactive monitoring and queue controls
- configurable release and fallback profiles
- UI-managed quality, language, Dub/Sub, and cut preferences
- automatic upgrades based on those profiles
- activity history and notification management
- general migration of day-to-day settings from environment variables into the UI

## Planned features

Pacearr is moving toward a Sonarr-inspired experience designed around One Pace's release structure rather than general television indexing.

Planned work includes:

- **Web UI:** dashboard, library health, arcs, episodes, queue, activity, history, logs, and settings
- **Release monitoring:** clear monitored/unmonitored state and release availability per episode
- **Release profiles:** ordered preferences for resolution, language, Dub/Sub, Extended Cut, Standard Cut, and fallback behavior
- **Upgrade detection:** identify and safely replace installed releases when a preferred or corrected version becomes available
- **Persistent configuration:** manage routine application, media-server, and download-client settings through the UI
- **Operational visibility:** surface pipeline state, failures, retries, and recovery actions without requiring log inspection

An eventual profile might express preferences such as:

```text
1. English Dub — Extended Cut — 1080p
2. English Dub — 1080p
3. English Subtitles — Extended Cut — 1080p
4. English Subtitles — 1080p
5. Fall back to 720p
```

This example illustrates the planned design only; profiles are not implemented in `0.1.0-alpha`.

## Compatibility

### Supported media servers

- [Plex](https://www.plex.tv/)
- [Jellyfin](https://jellyfin.org/)
- [Emby](https://emby.media/)
- local folder, without a media server

### Supported torrent clients

- [qBittorrent](https://www.qbittorrent.org/)
- [Deluge](https://deluge-torrent.org/)
- [Transmission](https://transmissionbt.com/)
- [µTorrent](https://www.utorrent.com/)

### Platforms

Docker is the recommended deployment method and can run anywhere Docker is supported. Local execution is available on Windows, macOS, and Linux with Node.js installed.

## Getting started

### Prerequisites

For the normal automated workflow, you need:

- Docker and Docker Compose, or Node.js for a local installation
- one supported torrent client with its Web UI/API enabled
- a Plex, Jellyfin, or Emby server, or a writable local library folder
- paths and permissions that allow Pacearr to read completed downloads and write to the library

qBittorrent is the recommended torrent client. You may omit torrent-client integration when using Pacearr only to organize or update an existing library.

### Docker Compose

The Pacearr container uses this GitHub Container Registry path:

```text
ghcr.io/daherokozuki/pacearr
```

The following Compose file is a complete reference example. Change URLs, credentials, IDs, and volume paths for your environment. Remove settings for media servers and torrent clients you are not using.

> [!CAUTION]
> Do not publish a real Plex token or torrent-client password in a repository. Keep secrets in a private `.env` file or another secret-management system.

```yaml
services:
  pacearr:
    image: ghcr.io/daherokozuki/pacearr:v0.1.0-alpha
    container_name: pacearr
    restart: unless-stopped
    environment:
      # Container identity and logging
      TZ: Europe/London
      PUID: 1000
      PGID: 1000
      LOG_LEVEL: info
      LOG_OUTPUT: text

      # Pipeline
      PIPELINE_SKIP_VERIFY_PRESENT_FILES: "false"
      PIPELINE_SKIP_ORGANIZE_PRESENT_FILES: "false"
      PIPELINE_SKIP_UPDATE_METADATA_PRESENT_FILES: "false"
      PIPELINE_PREFER_EXTENDED: "true"
      PIPELINE_PREFER_ALTERNATE: "true"

      # Library: plex, jellyfin, emby, or none
      LIBRARY_MEDIA_SERVER: plex
      LIBRARY_SERIES_NAME: One Pace
      LIBRARY_SERIES_FOLDER_NAME: One Pace
      LIBRARY_FILENAME_FORMAT: "{SERIES_NAME} - S{ARC}E{EPISODE} - {TITLE}.mkv"
      LIBRARY_CREATE_SHOW_IF_NOT_FOUND: "true"

      # Plex example
      PLEX_URL: http://plex:32400
      PLEX_TOKEN: ${PLEX_TOKEN}
      PLEX_LIBRARY_NAME: TV
      PLEX_API_TIMEOUT_SECONDS: 120
      PLEX_CIRCUIT_BREAKER_FAILURES: 3
      PLEX_CIRCUIT_BREAKER_COOLDOWN_SECONDS: 300
      PLEX_BATCH_SIZE: 20
      PLEX_BATCH_DELAY_SECONDS: 30
      PLEX_SCAN_MIN_WAIT_SECONDS: 30
      PLEX_SCAN_TIMEOUT_SECONDS: 600
      PLEX_SCAN_VERIFY: "true"

      # Torrent-client example
      TORRENT_CLIENT: qbittorrent
      TORRENT_URL: http://qbittorrent:8080
      TORRENT_USER: ${TORRENT_USER}
      TORRENT_PASSWORD: ${TORRENT_PASSWORD}
      TORRENT_CLIENT_TIMEOUT: 10
      TORRENT_CATEGORY_FORCE: "false"
      TORRENT_CATEGORY: onepacerr
      TORRENT_CATEGORY_ONCE_COMPLETED: completed
      TORRENT_CHECK_INTERVAL: 60

      # Persistent reliability state
      STATE_ENABLED: "true"
      STATE_DB: /data/state/onepacerr.db
      QUARANTINE_ENABLED: "true"
      QUARANTINE_DIR: /data/quarantine
      MIN_FREE_SPACE_GB: 20

      # Metadata
      METADATA_URL: https://onepacerr.com/api/v1
      METADATA_LANGUAGE: en
      METADATA_POSTER_SET: default
      METADATA_DISABLE_WEBSOCKET: "false"
      METADATA_CHECK_INTERVAL: 3600

      # Legacy path-mapping identifiers; uncomment only when needed.
      # MOUNT_LIBRARY_MEDIA_SERVER: /media-server/TV
      # MOUNT_LIBRARY_ONEPACERR: /library
      # MOUNT_DOWNLOADS_TORRENT: /torrent-client/downloads
      # MOUNT_DOWNLOADS_ONEPACERR: /downloads
    volumes:
      - /path/to/library:/library
      - /path/to/downloads:/downloads
      - ./state:/data/state
      - ./quarantine:/data/quarantine
```

Create a private `.env` file beside `docker-compose.yml` for the interpolated secrets:

```dotenv
PLEX_TOKEN=replace-with-your-token
TORRENT_USER=replace-with-your-username
TORRENT_PASSWORD=replace-with-your-password
```

Then start Pacearr:

```bash
docker compose up -d
docker compose logs -f pacearr
```

> [!NOTE]
> `PUID` and `PGID` must identify a user/group with read access to the download directory and read/write access to the library. Your media-server account must also be able to read the imported library files.

### Recommended first run

If your library is already organized and you do not want Pacearr to inspect or modify existing items, keep the default skip behavior:

```dotenv
PIPELINE_SKIP_VERIFY_PRESENT_FILES=true
PIPELINE_SKIP_ORGANIZE_PRESENT_FILES=true
PIPELINE_SKIP_UPDATE_METADATA_PRESENT_FILES=true
```

To audit an existing library on the first run, enable all three operations:

```dotenv
PIPELINE_SKIP_VERIFY_PRESENT_FILES=false
PIPELINE_SKIP_ORGANIZE_PRESENT_FILES=false
PIPELINE_SKIP_UPDATE_METADATA_PRESENT_FILES=false
```

CRC32 verification can take considerable time on a large library. You can also set `PIPELINE_SKIP_DOWNLOADS=true` for the initial audit, stop Pacearr after it finishes, and then restore your normal settings.

### Running locally

Install Node.js (Node.js 24 has been tested), clone the repository, and create `.env` from `sample.env`:

```bash
npm install
npm run build
npm start
```

## Configuration reference

The current alpha retains the environment-variable configuration model inherited from OnePacerr. Some names and defaults intentionally still contain `ONEPACERR` or `onepacerr` because they are active compatibility identifiers in the code. Do not replace them with guessed `PACEARR` equivalents.

Legend:

- **Required:** normally required for the selected integration
- **Default:** used when the variable is omitted

### General

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | `critical`, `error`, `warning`, `info`, or `debug`. |
| `LOG_OUTPUT` | `text` | Set to `json` for structured log collection. |

### Reliability and persistent state

| Variable | Default | Description |
| :--- | :--- | :--- |
| `STATE_ENABLED` | `true` | Enables persistent processing-state tracking. |
| `STATE_DB` | `/data/state/onepacerr.db` | Persistent state database. The legacy filename is still the implemented default. |
| `QUARANTINE_ENABLED` | `true` | Isolates problematic files rather than allowing them to block normal processing. |
| `QUARANTINE_DIR` | `/data/quarantine` | Quarantine directory. |
| `MIN_FREE_SPACE_GB` | `20` | Minimum free storage required before new file processing continues. |

Persist `/data/state` across container replacements. If quarantine is enabled, persist `/data/quarantine` as well.

### Pipeline

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PIPELINE_SKIP_VERIFY_PRESENT_FILES` | `true` | When `false`, hashes existing files to confirm they match the wanted releases. |
| `PIPELINE_SKIP_VERIFY_NOT_FOR_EXTENDED` | `false` | When `true`, limits verification behavior around releases without extended or alternate variants. |
| `PIPELINE_SKIP_ORGANIZE_PRESENT_FILES` | `true` | When `false`, checks and corrects folders and filenames for existing library items. |
| `PIPELINE_SKIP_UPDATE_METADATA_PRESENT_FILES` | `true` | When `false`, updates metadata for existing files as well as new imports. |
| `PIPELINE_SKIP_DOWNLOADS` | `false` | When `true`, does not submit downloads; useful for library-only operation. |
| `PIPELINE_SKIP_DOWNLOADS_IMPORTS` | `false` | When `true`, skips importing completed downloads. |
| `PIPELINE_FORCE_REDOWNLOAD` | `false` | Downloads and imports even when a file is already present. Use with care. |
| `PIPELINE_SKIP_POSTERS` | `false` | Skips poster updates. |
| `PIPELINE_INCLUDE_SPECIALS` | `false` | Includes specials in processing. |
| `PIPELINE_PREFER_EXTENDED` | `false` | Prefers an available extended cut over the standard release. |
| `PIPELINE_PREFER_ALTERNATE` | `false` | Prefers the alternate G-8 cut at the end of Skypiea. |
| `PIPELINE_FILTERS_INCLUDE` | empty | Processes only items matched by the include filters. |
| `PIPELINE_FILTERS_EXCLUDE` | empty | Excludes items matched by the exclude filters. |
| `PIPELINE_RETRY_INTERVAL` | `10` | Seconds before the pipeline runs again after a failure. |

### Filters

`PIPELINE_FILTERS_INCLUDE` and `PIPELINE_FILTERS_EXCLUDE` accept comma-separated filters:

- `S01` matches every episode in season/arc 1.
- `S01E06` matches only episode 6 in season/arc 1.
- `E06` matches episode 6 in every season/arc.

Examples:

```dotenv
# Monitor only S16E09
PIPELINE_FILTERS_INCLUDE=S16E09

# Monitor everything except S35 and S36
PIPELINE_FILTERS_EXCLUDE=S35,S36

# Monitor the first episode of each season except S35 and S36
PIPELINE_FILTERS_INCLUDE=E01
PIPELINE_FILTERS_EXCLUDE=S35,S36
```

An item must satisfy both the include and exclude rules to be processed.

### Library

Set `LIBRARY_MEDIA_SERVER` to `plex`, `jellyfin`, `emby`, or `none`. Local-folder mode creates files such as `.plexmatch`, `.nfo`, and poster images that can be used by a media server later.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LIBRARY_MEDIA_SERVER` | `plex` | Library integration: `plex`, `jellyfin`, `emby`, or `none`. |
| `LIBRARY_SERIES_NAME` | `One Pace` | Show name in the media server. |
| `LIBRARY_SERIES_FOLDER_NAME` | value of `LIBRARY_SERIES_NAME` | Overrides the on-disk show-folder name. |
| `LIBRARY_FILENAME_FORMAT` | `{SERIES_NAME} - S{ARC}E{EPISODE} - {TITLE}.mkv` | Output filename format. `.mkv` is appended if no extension is supplied. |
| `LIBRARY_CREATE_SHOW_IF_NOT_FOUND` | `true` | Creates the show when it cannot be found. Set to `false` to fail on a missing or misspelled show name. |
| `LIBRARY_NONE_ROOT_FOLDER` | `C:\\OnePacerr` | Root folder for `none` mode. Do not include `LIBRARY_SERIES_FOLDER_NAME`. This legacy default remains implemented. |

### Plex

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PLEX_URL` | `http://localhost:32400` | Plex server URL. **Required for Plex.** |
| `PLEX_TOKEN` | empty | [Plex authentication token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/). **Required for Plex.** |
| `PLEX_LIBRARY_NAME` | `TV Shows` | Plex library name. |
| `PLEX_SKIP_METADATA_FILES` | `true` | When `false`, also writes `.nfo` and poster files for Plex libraries. |
| `PLEX_PLEXMATCH_EVEN_IF_NOT` | `false` | Writes `.plexmatch` even when another media-server mode is selected. |
| `PLEX_API_TIMEOUT_SECONDS` | `120` | Maximum duration of an individual Plex API request. |
| `PLEX_CIRCUIT_BREAKER_FAILURES` | `3` | Failed Plex operation sequences before the circuit opens. |
| `PLEX_CIRCUIT_BREAKER_COOLDOWN_SECONDS` | `300` | Seconds to pause Plex requests after the circuit opens. |
| `PLEX_BATCH_SIZE` | `20` | Maximum pending imports in one Plex batch. |
| `PLEX_BATCH_DELAY_SECONDS` | `30` | Delay before processing a Plex import batch. |
| `PLEX_SCAN_MIN_WAIT_SECONDS` | `30` | Minimum scan wait before completion monitoring continues. |
| `PLEX_SCAN_TIMEOUT_SECONDS` | `600` | Maximum time to wait for scan completion before continuing safely. |
| `PLEX_SCAN_VERIFY` | `true` | Enables Plex scan and episode-confirmation handling for imports. |

Plex metadata is updated through its API because file-only metadata updates are unreliable. Set `PLEX_SKIP_METADATA_FILES=false` if the same files are also consumed by Jellyfin/Emby or if you want sidecar metadata for future migrations.

### Jellyfin

| Variable | Default | Description |
| :--- | :--- | :--- |
| `JELLYFIN_URL` | `http://localhost:8096` | Jellyfin URL. **Required for Jellyfin.** |
| `JELLYFIN_USERNAME` | empty | Jellyfin username. **Required for Jellyfin.** |
| `JELLYFIN_PASSWORD` | empty | Jellyfin password. **Required for Jellyfin.** |
| `JELLYFIN_LIBRARY_NAME` | `Shows` | Jellyfin library name. |

### Emby

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EMBY_URL` | `http://localhost:8096` | Emby URL. **Required for Emby.** |
| `EMBY_USERNAME` | empty | Emby username. **Required for Emby.** |
| `EMBY_PASSWORD` | empty | Emby password. **Required for Emby.** |
| `EMBY_LIBRARY_NAME` | `TV Shows` | Emby library name. |

### Torrent clients

| Variable | Default | Description |
| :--- | :--- | :--- |
| `TORRENT_CLIENT` | `qbittorrent` | `qbittorrent`, `deluge`, `transmission`, or `utorrent`. |
| `TORRENT_URL` | `http://localhost:8080` | Torrent-client API URL. **Required when downloads are enabled.** |
| `TORRENT_USER` | empty | API/Web UI username. **Required when authentication is enabled.** |
| `TORRENT_PASSWORD` | empty | API/Web UI password. **Required when authentication is enabled.** |
| `TORRENT_CLIENT_TIMEOUT` | `10` | Request timeout in seconds. Increase for very large torrent queues. |
| `TORRENT_CATEGORY_FORCE` | `false` | Corrects an existing torrent's category when it differs from `TORRENT_CATEGORY`. |
| `TORRENT_CATEGORY` | `onepacerr` | Category used for new downloads and completed-torrent filtering. The legacy default is intentional. |
| `TORRENT_CATEGORY_ONCE_COMPLETED` | `completed` | Category assigned after an imported torrent is processed. |
| `TORRENT_CHECK_INTERVAL` | `60` | Seconds between completed-download checks. |

Completed torrents are copied and renamed into the library, followed by media-server/metadata processing. Pacearr changes their category only after the relevant processing step completes.

### Path mappings

Path mappings translate the path reported by an external service into the path visible inside the Pacearr container.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MOUNT_LIBRARY_MEDIA_SERVER` | empty | Library path as reported by Plex/Jellyfin/Emby. |
| `MOUNT_LIBRARY_ONEPACERR` | empty | The same library path as visible to Pacearr. The legacy identifier is required. |
| `MOUNT_DOWNLOADS_TORRENT` | empty | Download path as reported by the torrent client. |
| `MOUNT_DOWNLOADS_ONEPACERR` | empty | The same download path as visible to Pacearr. The legacy identifier is required. |

Do not rename `MOUNT_LIBRARY_ONEPACERR` or `MOUNT_DOWNLOADS_ONEPACERR`; those are the currently implemented environment-variable names.

#### Windows Plex with Docker/Linux Pacearr

If Plex runs on Windows but Pacearr runs in a Linux container, Plex may report:

```text
M:\Anime
```

while Pacearr sees the same directory as:

```text
/volume1/Media/Anime
```

Configure:

```dotenv
MOUNT_LIBRARY_MEDIA_SERVER=M:\Anime
MOUNT_LIBRARY_ONEPACERR=/volume1/Media/Anime
```

`MOUNT_LIBRARY_MEDIA_SERVER` must match Plex's reported path. `MOUNT_LIBRARY_ONEPACERR` must match the path inside the Pacearr container. The same principle applies to torrent-client download paths. See [TRaSH Guides' remote path mapping explanation](https://trash-guides.info/Radarr/Tips/Radarr-remote-path-mapping/) for additional background.

### Metadata

| Variable | Default | Description |
| :--- | :--- | :--- |
| `METADATA_URL` | `https://onepacerr.com/api/v1` | Metadata API URL. The historical URL remains the implemented default. |
| `METADATA_LANGUAGE` | `en` | Metadata language; currently only English is supported. |
| `METADATA_POSTER_SET` | `default` | Poster set. `default` currently resolves to `piratezekk`; `official` and `mizzoufan523` are also available. |
| `METADATA_DISABLE_WEBSOCKET` | `false` | Disables WebSocket/long-polling updates and uses interval checks instead. |
| `METADATA_CHECK_INTERVAL` | `3600` | Poll interval in seconds when WebSocket mode is disabled. |

Pacearr also uses the [One Pace public API](https://github.com/eltharynd/one-pace-api).

## Posters

Preview the bundled poster sets:

- [piratezekk (default)](docs/poster%20previews/piratezekk.md#show)
- [mizzoufan523](docs/poster%20previews/mizzoufan523.md#show)
- [official](docs/poster%20previews/official.md#show)

Missing artwork falls back to the default set. To add or update a set, see [POSTER-SETS.md](POSTER-SETS.md#how-to-contribute-to-poster-sets).

## Reliability and recovery

Pacearr tracks processing in persistent, recoverable stages instead of assuming every episode can complete in one uninterrupted cycle:

```text
Discovered
    ↓
Downloading
    ↓
Imported
    ↓
Media-server confirmation pending
    ↓
Metadata pending
    ↓
Cleanup pending
    ↓
Complete
```

Pending operations can be reconciled during a later monitoring cycle or after a container restart. This protects unattended operation during:

- media-server outages and scan delays
- metadata API or WebSocket failures
- interrupted imports
- torrent-client and cleanup failures
- temporary filesystem states
- low available storage
- application or container restarts

For Plex specifically, Pacearr can batch imports, issue one refresh per batch, wait for scanning, confirm episodes, and defer unresolved items to a future cycle. Metadata retries are stored separately so a confirmed import does not needlessly repeat the whole import workflow.

## Roadmap

Pacearr development is planned in stages:

- [x] Preserve the final OnePacerr-based foundation and historical documentation
- [x] Establish Pacearr identity and the `0.1.0-alpha` development line
- [x] Retain the automation engine and persistent reliability layer
- [ ] Refine internal service boundaries and application API
- [ ] Add persistent settings and safe configuration migration
- [ ] Build the web UI foundation and system-health dashboard
- [ ] Add library, arc, episode, queue, history, and log views
- [ ] Add release monitoring and preference profiles
- [ ] Add quality, language, Dub/Sub, Extended Cut, and fallback preferences
- [ ] Add release comparison and upgrade management
- [ ] Add media-server and download-client management
- [ ] Expand migration tooling, automated tests, and release hardening
- [ ] Publish a stable Pacearr release

See [ROADMAP.md](ROADMAP.md) for the evolving development plan.

## Migration from OnePacerr

Pacearr `0.1.0-alpha` intentionally preserves compatibility with much of OnePacerr's environment-variable configuration and on-disk state model. This is why some active identifiers still contain the old project name.

Before testing a migration:

1. Stop the existing container cleanly.
2. Back up the Compose file, `.env`, persistent state directory, and quarantine directory.
3. Keep all existing variable names unless the Pacearr release notes explicitly document a replacement.
4. Change the image reference to `ghcr.io/daherokozuki/pacearr:v0.1.0-alpha` only when you are ready to test alpha software.
5. Preserve volumes for `/data/state` and `/data/quarantine`.
6. Review logs and validate path mappings before enabling unattended downloads or cleanup.

In particular, continue using:

```dotenv
MOUNT_LIBRARY_ONEPACERR=...
MOUNT_DOWNLOADS_ONEPACERR=...
STATE_DB=/data/state/onepacerr.db
TORRENT_CATEGORY=onepacerr
METADATA_URL=https://onepacerr.com/api/v1
```

These names and defaults reflect the current code. Future migration work may replace them through a documented compatibility path; users should not invent replacements in advance.

The complete historical README is preserved at [docs/legacy/ONEPACERR-README.md](docs/legacy/ONEPACERR-README.md).

## Origins and attribution

Pacearr began with [OnePacerr](https://github.com/eltharynd/OnePacerr), created by [eltharynd](https://github.com/eltharynd). OnePacerr supplied the original architecture and implementation for One Pace release discovery, downloading, library organization, metadata, poster handling, and Plex/Jellyfin/Emby integration.

The fork that became Pacearr initially concentrated on operational reliability: persistent state, recovery after restarts, safer Plex processing, Docker improvements, and mixed Windows/Linux path handling. As the scope expanded toward release profiles, upgrade management, persistent settings, and a dedicated web UI, it became a distinct project.

Pacearr would not exist without eltharynd's work and the contributions made to OnePacerr. The original project and its contributors retain full credit for that foundation. Repository history and the [legacy README](docs/legacy/ONEPACERR-README.md) are preserved so this lineage remains visible.

## Contributing

Issues and pull requests are welcome at [DaHeroKozuki/Pacearr](https://github.com/DaHeroKozuki/Pacearr).

For local development, install dependencies and run the TypeScript compiler and development process in separate terminals:

```bash
npm install
npx tsc -w
```

```bash
npm run dev
```

When contributing poster artwork, follow [POSTER-SETS.md](POSTER-SETS.md#how-to-contribute-to-poster-sets) and retain the relevant artist attribution.

## Credits and acknowledgements

- **[One Pace](https://onepace.net/):** the team behind the One Pace fan edit
- **[eltharynd](https://github.com/eltharynd):** creator of OnePacerr and the [One Pace public API](https://github.com/eltharynd/one-pace-api)
- **[piratezekk](https://reddit.com/user/piratezekk):** default custom poster artwork
- **[@3](https://discord.com/invite/pacing):** name normalization and the matching Elbaph poster contributed through the One Pace Discord community
- **[Mizzoufan523](https://reddit.com/user/Mizzoufan523):** `mizzoufan523` poster artwork
- **[One Pace](https://onepace.net/):** official poster set
- all OnePacerr and Pacearr contributors

Please do not donate to Pacearr's maintainer for this tool. If you want to support the people doing the underlying editing work, support [One Pace](https://onepace.net/).

## License and disclaimer

Pacearr is distributed under the [MIT License](LICENSE).

Pacearr is an independent community project and is not affiliated with, endorsed by, or maintained by the One Pace team. Users are responsible for ensuring that their use of Pacearr, One Pace releases, torrent clients, and external services complies with the laws and requirements applicable to them.

---

<p align="center">
  <strong>Pacearr</strong><br>
  One Pace. Managed.
</p>
