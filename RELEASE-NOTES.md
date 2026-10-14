# Pacearr v1.2.0 — One Pace releases, straight to your library 🚢

**Discover the release. Remember the episode. Bring it home.** Pacearr now reads official One Pace release feeds and keeps a persistent episode/release catalogue, with recovery controls for the files you already have.

![Pacearr control room](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.2.0/docs/screenshots/overview.png)

## Work directly with One Pace

RSS is checked every 15 minutes, with Atom and the release page as fallbacks. Releases include episode/arc names, coverage, quality, tracks, dates, hashes, magnets and revision/archival information. One Pace torrent URLs are tried before Nyaa and torrent caches. The published info hash is verified before needed files receive download priority; unrelated bundle files stay unselected.

## A catalogue that remembers

SQLite stores mappings, historical releases, installed fingerprints and confirmed assignments in `/data/state/pacearr.db`. A licensed community snapshot includes full historical Shaved/Kuma, Onigashima and bundle records. Known mappings remain available across restarts, updates and provider outages. Feed-only revisions can trigger acquisition/import when an existing arc mapping is known, without waiting for the community API.

Official and community records keep separate provenance. Unknown arcs, conflicting supplemental slots and split/merged coverage remain visible for review. Existing numbering is preserved. A missing checksum in the current API list no longer erases known historical release identity.

## Unblock verified replacements

Downloads offers **Approve replacement** for a verified incoming release when the installed version is unknown. Approval is bound to the current source and installed fingerprints; changed files require another review. The old copy is preserved during verified publication. Searches and grabs use the same replacement policy. Same-size revised files are supported; automatic downgrades and silent episode-boundary changes are blocked.

Deluge metadata fallback accepts valid platform temporary paths and returned filenames, while rejecting invalid handles and wrong hashes. Existing untracked videos remain discoverable even during a Deluge outage. **Import matched missing files** provides one-time confirmed recovery without downloading those sources again. Matching untracked files defer redundant grabs into local review.

## Install/update

From your existing deployment directory:

```sh
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Use `docker-compose` on older hosts. Keep existing mounts and `/data/state`; no extra database container or mount is needed. Refresh the browser once. Saved credentials, checksums, automation preferences and pause/ignore decisions are retained.

Open System to check catalogue sync. In Downloads, recheck completed files and approve verified replacements where requested. Untracked files still require confirmation that downloading is finished and assignments are correct. Automation processes eligible verified files; it does not blindly import every historical alternative.

Images: `ghcr.io/daherokozuki/pacearr:v1.2.0`, `:latest`, `:alpha` for amd64 and arm64. Application/full-source ZIPs and SHA256SUMS are attached; historical source and documentation remain available.

## Verification and practical limits

Unit, isolated integration, browser and Docker health checks cover historical records, official feed parsing, selected bundles, unknown-version approvals, same-size revisions, API outages and restart persistence. Public feed examples are used in parser fixtures; showcase images use synthetic data. Actual client responses and media assignments still need confirmation on each deployment. Direct torrents reduce fallback dependence for official releases; community supplemental bundles may still need their original sources. An unreachable official site uses retained data and fallbacks, not fabricated new releases.

[Setup and mounts](https://github.com/DaHeroKozuki/Pacearr/blob/v1.2.0/README.md#getting-started) · [Source/history](https://github.com/DaHeroKozuki/Pacearr) · [Community](https://discord.gg/u3zksrG8G6)
