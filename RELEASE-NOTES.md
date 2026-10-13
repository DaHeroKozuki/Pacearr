# Set sail with Pacearr 🚢

**One Pace. Managed.** A live library view, visible download progress and verified upgrades—with the history of the project preserved.

![Pacearr control room](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.1/docs/screenshots/overview.png)

## What’s new in v1.0.1

| Change | What it means for you |
| --- | --- |
| Clean deployment names | Project, service and container are all `pacearr`; the official Synology folder is `/volume1/docker/pacearr` |
| Lean deployment folder | Only Compose and persistent state are needed when using the public image; cleanup archives development leftovers |
| A richer project page | Original history, configuration reference and credits return, with current instructions, mount guidance and five WebUI screenshots |
| Quieter live updates | Library, Overview, Downloads and Activity refresh automatically; background inventory checks no longer crowd the activity log |
| Complete rebuildable source | Active source, portable integration/browser fixtures, packaging and screenshot tooling are published and included in a source archive |
| Fresh public image | amd64 and arm64 builds pass unit/integration checks and a Docker health check before publication |

## Your collection, your control

Search the full library, selected episodes or one release. Follow scoped Deluge progress. Import completed verified episodes, let same-cut revisions and 720p→1080p upgrades run unattended, or review custom edits with explicit episode assignments. Select one file or several for manual import or confirmed download deletion.

Saved checksums survive restarts and updates. Verified copies preserve original downloads for seeding; replacements retain backups and restart-recovery journals. Activity records outcomes, errors and retries. Quality, cut, language and concurrency profiles put the release decisions in your hands.

![Pacearr Library](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.1/docs/screenshots/library.png)

<details><summary><b>See live downloads and profiles</b></summary>

![Pacearr Downloads](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.1/docs/screenshots/downloads.png)
![Pacearr Profiles](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.1/docs/screenshots/profiles.png)

</details>

*Screenshots show an isolated demonstration library.*

## Install or update

**Image:** `ghcr.io/daherokozuki/pacearr:v1.0.1` · Rolling tags: `:latest` and `:alpha`.

New deployments: edit the host folders and UID:GID in [compose.yaml](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.1/compose.yaml), create a writable `data/state`, then configure the WebUI at port 49113. [Read the complete mount/setup guide](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.1/README.md#getting-started).

Existing standalone Synology deployments: run [migrate-synology.sh](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.1/scripts/migrate-synology.sh) to clean the names while preserving saved paths and state. Then run [cleanup-synology.py](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.1/scripts/cleanup-synology.py) to archive unused development files. Inspect the new state mount before deleting any old test folder.

```sh
cd /volume1/docker/pacearr
docker-compose -p pacearr -f compose.yaml pull pacearr
docker-compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Keep `/data/state` mounted across updates: it holds your private settings, vault keys, encrypted credentials, checksums and history. It is never included in public source archives.

## What’s included

- `pacearr-v1.0.1.zip`: application/deployment files, not personal state.
- `pacearr-v1.0.1-source.zip`: complete active application, tests, scripts, documentation, screenshots and license.
- `SHA256SUMS`: archive checksums.

Current runtime: Deluge and mounted libraries, with read-only Plex connection/discovery. Plex mutations and historical Jellyfin/Emby/other-client integrations remain outside this runtime; their original source and reference are preserved in GitHub. Earlier Alpha environment/SQLite settings require explicit WebUI configuration; standalone setup.json/vault/checksum state stays compatible.

Thanks to eltharynd, the One Pace team and everyone who helped bring Pacearr from its original foundation to this release. [Explore the project’s journey](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.1/README.md#the-journey-so-far) · [Join the community](https://discord.gg/u3zksrG8G6)
