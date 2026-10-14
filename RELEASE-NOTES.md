# Pacearr v1.1.2 — Bring your remaining episodes home 🚢

**Reuse the files you have. Keep retries under control.** This update repairs repeated automatic missing-episode requests and brings untracked downloads into the control room, while keeping the familiar glass interface.

![Pacearr control room](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.1.2/docs/screenshots/overview.png)

## Reliable automation overnight

Automatic missing requests now retain their attempt counts, retry deadlines and cancellation state instead of being recreated each cycle. Requests sharing a bundle retain one bounded retry schedule. Confirmed local imports retire obsolete automatic missing requests for the same episode.

Verified torrent-file metadata is cached in persistent state. When direct retrieval fails, Pacearr can use Deluge WebUI retrieval and inspect the exact torrent hash and file list before adding a paused torrent with selected file priorities. Activity reports per-source HTTP, DNS, TLS and redirect failures instead of a generic fetch failure. Unavailable metadata does not start an entire unselected bundle.

## Recover downloads without a Deluge entry

Video files already inside the configured Download path now appear even if their torrent is absent from Deluge. Awaiting action distinguishes these untracked files from live downloads. **Import matched missing files** presents suggested episode assignments, including numbered custom cuts, for bulk review.

Confirm that the files are fully downloaded and the assignments are correct. Pacearr checks the source fingerprint, probes the media, computes its checksum and verifies the copy before publishing the library file. Original downloads are retained. Completion confirmation is revoked if the source changes.

A suggestion is not authoritative release proof. Older cuts can split episodes differently from current metadata; unverified alternatives keep installed episodes intact and remain available for explicit review. This update does not blindly turn every missing metadata checksum into an automatic import.

## Update

Back up persistent state, then run from your existing deployment directory:

```sh
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Use `docker-compose` on older hosts. Keep existing mounts, ports, private configuration and `/data/state`. Refresh the browser once. Saved credentials, checksums, activity, automation preferences and pause decisions are retained. Verified completed files are reconsidered with automation enabled; untracked files require the confirmation described above.

Images: `ghcr.io/daherokozuki/pacearr:v1.1.2`, `:latest` and `:alpha`, for amd64 and arm64. Application and full-source ZIPs plus SHA256SUMS are attached. Historical source and project documentation remain available.

## Validation

The release workflow runs unit tests, isolated integration checks, portable Compose validation and a native Docker health test before publishing. Regression coverage includes automatic-missing retries and cancellations, selective shared bundles, restart persistence, source preservation and confirmed recovery of 19 untracked files. Local browser checks cover exact selections, confirmation requirements, refreshed outcomes and credential controls. Showcase images use synthetic data.

Actual media assignments, remote metadata availability and sustained automation still need verification on each deployment. Check Activity after enabling automation; review suggestions before confirming untracked files.

[Setup and mounts](https://github.com/DaHeroKozuki/Pacearr/blob/v1.1.2/README.md#getting-started) · [Source and history](https://github.com/DaHeroKozuki/Pacearr) · [Community](https://discord.gg/u3zksrG8G6)
