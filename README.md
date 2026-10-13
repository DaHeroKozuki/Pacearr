<p align="center"><img src="pacearr-banner.png" alt="Pacearr" width="100%"></p>

# Pacearr v1.0.0

One Pace library control: discover releases, manage downloads and import verified episodes through a responsive glass interface.

[GitHub releases](https://github.com/DaHeroKozuki/Pacearr/releases) · [Container](https://github.com/DaHeroKozuki/Pacearr/pkgs/container/pacearr) · [Discord community](https://discord.gg/u3zksrG8G6)

## Features

Overview, Library, Downloads, Activity, Profiles, Settings and System update automatically while open. New imports and changed files appear without clicking Refresh. Start/Pause controls manage unattended imports and release grabs. Search a single episode, selected episodes or the full library. Quality, cut and language profiles govern revisions and upgrades. English dub is preferred when available, with an English-subbed fallback.

Deluge feeds include only files beneath the saved Download path. Complete verified releases import automatically. Single/bulk custom imports require explicit episode assignments. Review, ignore and retry controls explain unresolved cases. Confirmed deletion removes only selected completed downloads; optional torrent removal never requests unselected data deletion. Removing source files affects seeding.

Checksums and the latest 1,000 Activity entries persist in /data/state. Unchanged files reuse saved verification. CRC32 is a content identity check, not a cryptographic authenticity guarantee. Replacements retain the previous file as .pacearr-backup-* and recover interrupted publication. Sources remain after imports until explicitly deleted.

## Run with Docker

Use Node 24/ffmpeg through the published Docker image. Edit compose.yaml with your folders and actual uid/gid, create a writable state directory for that user, then run:

```sh
docker compose up -d
docker compose logs --tail 30 pacearr
```

Open http://your-server:49113, create the administrator account, and configure connections/paths in Settings. Choose the exact One Pace download subfolder. Paths reported by Deluge must be accessible at the same absolute path inside Pacearr; adjust volume destinations accordingly. Both folders must be readable/traversable; imports require library writes, deletion requires download writes. At least 2 GiB extra free library space is required. Connections currently accept private-network HTTP IP endpoints, not public hosts or localhost.

Run on a private network. Credentials are encrypted in the state volume; back up its keys together with setup.json. Saved credentials reveal only after administrator reauthentication.

The first library checksum baseline starts automatically when configured. Review Profiles and pause automation during configuration if desired. Existing pauses persist. Automatic missing-episode acquisition is optional; explicit grabs work while automatic processing is paused. Pausing allows an active file operation to finish.

## Upgrade your standalone Synology deployment

Use the release ZIP with compose.synology.yaml (packaged as compose.yaml) for the existing phase16-standalone location/service. Preserve ./data/state. Stop the container, back up source and state, apply pacearr-update application files, then build and recreate using project pacearr16/service pacearr-alpha. No secrets or state are included in the ZIP. After rebuilding, refresh the browser once to load new assets; subsequent library/feed changes refresh automatically.

For registry deployment use ghcr.io/daherokozuki/pacearr:v1.0.0. Rolling tags :latest and :alpha point to v1 after successful CI; :v0.1.0-alpha remains historical. Keep mount destinations and state location unchanged when switching from your local image.

## Compatibility

This runtime supports Deluge and mounted library files, plus read-only Plex tests/library discovery. Plex mutations are disabled. Older Alpha Jellyfin/Emby, metadata/poster mutations and other torrent clients are not part of this runtime. Legacy environment/SQLite configuration does not migrate automatically. Standalone Phase 16–31 setup.json, vault keys and checksums are retained through /data/state. Earlier documentation is preserved under docs/legacy; the older TypeScript source remains historical and is not copied into the v1 image.

## Develop and validate

```sh
npm test
PACEARR_STATE_DIR=./data/state PACEARR_WEB_DIR=./web PACEARR_LIBRARY_ROOT=/your/library PACEARR_DOWNLOAD_ROOT=/your/downloads npm start
```

There are no npm runtime dependencies. Docker installs ffmpeg for media-track inspection. Tests cover identities, completion, folder boundaries, profiles, atomic copies, backup recovery and guarded torrent mutations. Browser/fixture checks additionally cover automatic refresh, bulk actions and persistence; actual NAS service permissions remain deployment-specific.

## Rollback

Pause and stop the worker before restoring application files or an earlier image. Preserve current state unless deliberately recovering a matching backup: an older snapshot can lose journals, activity and verification results. Replaced episodes can be recovered from recorded .pacearr-backup-* files while stopped. Deleted downloads require backups or redownloads.

## Credits and license

Derived from [OnePacerr](https://github.com/eltharynd/OnePacerr) by eltharynd, with authoritative Beta episode mapping and One Pace release metadata. Original repository history, MIT license and artist attribution remain preserved. Pacearr is an independent community project; thanks to the One Pace team and prior contributors.
