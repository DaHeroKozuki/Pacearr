# Pacearr v1.0.3 — Portable setup 🚢

**Your adventure. Perfectly organised.** The public setup guide now explains how anyone can deploy Pacearr with their own folders, account IDs and WebUI port. It includes the v1.0.2 download-management and Deluge fixes.

![Pacearr WebUI](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.3/docs/screenshots/overview.png)

## Set up your own container

- Copy `.env.example` to `.env` and choose your host library/download folders, UID:GID and an available WebUI port.
- Use the portable Compose file; the sample host port is 3000 and can be changed independently of the internal port.
- Mount persistent state at `/data/state`, library at `/library` and downloads at `/downloads`, or keep your existing destinations when updating.
- Configure the actual series folder, supported torrent client and optional read-only Plex connection in the WebUI.
- NAS instructions explain the same setup without depending on a particular user's folder layout or account.

[Complete setup and mount guide](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.3/README.md#getting-started) · [Compose example](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.3/compose.yaml) · [Environment example](https://github.com/DaHeroKozuki/Pacearr/blob/v1.0.3/.env.example)

## Clearer downloads and activity

Downloads separates Queued episode grabs, Downloading, Awaiting action, Completed and Errors. Successful imports/source deletion have their own controls; review/approval/manual-assignment files have separate single/bulk actions. Selections clear when files change category.

Deluge errors now show the operation, RPC method, code and reason with password redaction. Exact existing/being-added hashes are reused, accepted magnets are not repeatedly submitted while waiting for feed visibility, and confirmation failures show a manual next step. Activity severity filtering and current failed-grab counts distinguish historical errors from ongoing work.

![Pacearr Downloads](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.3/docs/screenshots/downloads.png)

## Update an existing deployment

Run from your own deployment directory:

```sh
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Use `docker-compose` on hosts with the older command. Keep existing ports, mount destinations, private `.env` and `/data/state`; do not replace your working configuration with placeholder paths. Refresh the browser once for updated assets. Saved credentials, checksum records, activity and automation preferences are preserved.

Images: `ghcr.io/daherokozuki/pacearr:v1.0.3`, `:latest` and compatibility tag `:alpha`, supporting amd64/arm64.

## Source, history and verification

The application ZIP, complete active source archive and SHA256SUMS are attached. Earlier source, historical references, artwork and credits remain in the repository/history. Private state, keys, media and credentials are never packaged.

Current runtime supports Deluge and mounted libraries, plus read-only Plex tests/discovery. Historical implementations for other clients/media servers remain documented separately; this release does not claim they are enabled.

Validation includes 23 unit tests, automation/import/upgrade/bulk/restart fixtures, delayed Deluge visibility, desktop/mobile section-selection checks, portable Compose validation and CI Docker build/health checks before publication. Screenshots show isolated demo data.

[Explore Pacearr](https://github.com/DaHeroKozuki/Pacearr) · [Join the community](https://discord.gg/u3zksrG8G6)
