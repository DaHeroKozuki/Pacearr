# Pacearr v1.1.0 — Smarter downloads. Fewer blockers. 🚢

**Fill the gaps. Skip the extras. Keep control.** This update brings selective bundle downloading, usable release fallbacks and recovery for downloads that were previously stuck awaiting action. The glass-style control room stays familiar.

![Pacearr control room](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.1.0/docs/screenshots/overview.png)

## Download the episodes you choose

Your Library selection carries into confirmation with an exact count. Optional additional upgrades are unchecked. Episodes sharing a torrent are grouped into one request; unneeded bundle files have zero download priority. Finished selected files can import while other files remain incomplete. Pause/resume selected downloads, cancel requests, clear pending grabs or stop all Pacearr downloads. Cancellations persist and source data is retained.

## Bring completed downloads home

The upgraded worker rechecks previous policy/metadata review entries without redownloading. Verified older/non-preferred versions can fill missing episodes. English audio or Japanese audio with English subtitles can serve as a usable language fallback. Choose a minimum of 480p, 720p or 1080p independently of your upgrade target; automatic downgrades are blocked.

Beta filename checksum aliases are recognised, and untagged files receive a cached content checksum. Language preferences are soft: a verified episode with audio can also import when preferred tracks/subtitles are unavailable or unconfirmed, with that limitation shown clearly. No-audio media still needs review. Copies and replacements use recovery journals, free-space checks and verified publication; previous replaced files are backed up. Unknown custom edits still need a confirmed episode assignment rather than guessed numbering. Recheck completed downloads and single/bulk manual imports provide the recovery controls.

## Keep Deluge organised

An optional label selector lets you refresh, create and verify labels using your saved encrypted Deluge connection. The selected label applies to new and existing Pacearr-managed torrents. Labels are not an import requirement. Pacearr does not configure file moves; an existing label’s move rule is reported before saving. Unrelated torrents are left alone.

![Pacearr Downloads](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.1.0/docs/screenshots/downloads.png)

Activity distinguishes manual grabs from automatic missing episodes, revisions and quality upgrades. Retries use delays and capped attempts; accepted torrents are not repeatedly submitted while awaiting visibility. Automation shows running/paused/blocked status and last/next checks. Library, overview and download outcomes refresh automatically.

## Update your deployment

Back up your persistent state first, then run from your deployment directory:

```sh
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Use `docker-compose` if your host has the older command. Keep your working Compose mounts, ports, private `.env` and `/data/state`. Refresh the browser once for the new controls. Saved credentials, checksums, activity and automation preferences are retained. Previously blocked completed files are reconsidered automatically when automation is enabled. A saved pause remains paused.

Images: `ghcr.io/daherokozuki/pacearr:v1.1.0`, `:latest` and `:alpha`, for amd64 and arm64. Application/source ZIPs and SHA256SUMS are attached.

## Practical limits and validation

Selective bundle acquisition needs verified torrent-file metadata. If the official Nyaa download and hash-cache fallback are unavailable, Pacearr reports a retryable error without starting the whole payload. BitTorrent piece boundaries can cause a small amount of neighbouring skipped-file data. Only a real NAS run can confirm each custom cut’s mapping and your Deluge/plugin configuration.

The release workflow runs unit and isolated integration tests for import migration, checksum aliases, 480p/language fallbacks, partial-bundle completion, selective file priorities, shared-hash requests, label verification, scoped pause/cancel controls, restart persistence and source preservation, followed by Docker health checks before publishing. Local browser checks cover exact selections, unchecked optional upgrades, automatic refresh and desktop/mobile credential controls. Showcase screenshots use synthetic data.

[Setup and mount guide](https://github.com/DaHeroKozuki/Pacearr/blob/v1.1.0/README.md#getting-started) · [Source and project history](https://github.com/DaHeroKozuki/Pacearr) · [Join the community](https://discord.gg/u3zksrG8G6)
