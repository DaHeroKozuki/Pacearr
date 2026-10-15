# Observation Haki was strong with this build. 👁️

One Pace’s feed timed out. Pacearr checked the horizon—and found a retry instead of waiting for the next six-hour departure.

**v1.4.0 adds independent feed recovery, connection health and space-aware processing**, with the same glass-and-ocean control room.

![Pacearr overview with connection health](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.4.0/docs/screenshots/overview.png)

## A timeout shouldn’t strand the crew

- Failed or degraded feeds retry after approximately **1, 2, 5, 10 and then 15 minutes**, with a small timing variation and respect for server-requested cooldowns.
- Retry state survives restarts. Concurrent refresh requests share one fetch; cached episode mappings remain available while imports continue independently.
- Atom entries without an enclosure can use the deterministic official torrent URL only after their magnet’s hash is validated. Torrent metadata still has to match that exact hash before payload starts.
- Malformed entries are quarantined without discarding valid neighbours. RSS recovery triggers a fresh eligibility pass without waiting for the normal schedule.

## Know what the container is doing

**Check now** refreshes release information without changing the saved interval or enabling paused automation. Overview and System show separate One Pace, Deluge, library and download-folder health indicators, including available space.

System also shows the last successful feed check, next retry, quarantined entries and a restart-recovery summary. Release history distinguishes new episodes, revised edits, quality upgrades and corrected metadata, alongside recorded grab outcomes or the next decision needed.

Activity keeps its original timestamped history and adds a versioned **diagnostic report**, separating current unresolved work from old failures. Saved credentials are excluded and secret values are redacted.

## Keep the library on course

Unexpected release-list shrinkage, conflicting current identities and moved episode assignments are held for review while validated catalogue data is retained. Established slots are protected from unrelated renumbering. Known Warship Island and Fan Letter releases can use their existing Specials slots when exact hash/checksum evidence confirms the association.

Grabs and imports check free space, keep a **2 GiB reserve**, account for selected active payloads and combine download/import requirements when folders share a filesystem. Unknown-size magnets are checked again after their file metadata arrives, before managed payload resumes. Space-blocked work waits and retries automatically; source files and existing library copies are preserved. Overview reports **Library complete for your profile** only when its current inventory has no missing or verification/upgrade decisions outstanding.

## Update your existing installation

Keep your current Compose file and mounts. Pull `ghcr.io/daherokozuki/pacearr:latest` or pin `v1.4.0`, then recreate the service:

```sh
cd /path/to/pacearr
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Older Synology installations use `docker-compose`. Refresh the browser once for the updated screens. Credentials, checksums, catalogue, profiles, schedule and pause decisions remain in the existing state mount.

The source archive includes the application, tests and documentation. Earlier release introductions have also been given individual One Piece themes; their technical details, tags and assets remain intact.
