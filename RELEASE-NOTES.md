# Pacearr v1.6.0 — Official Episode Takeovers & Backup Controls

The understudy had a good run. The official Ham gets the stage. 🎭🏴‍☠️

## Official episodes can take over matching supplemental cuts

An installed Onigashima or Shaved placeholder previously blocked an official episode sharing its season/episode slot. Pacearr now accepts the official replacement when its chapter coverage exactly matches the established supplemental mapping. The installed release still needs a known checksum, the incoming download must pass completion and content verification, and your quality, revision and cut preferences remain in force.

This addresses the Wano 63 mapping conflict. A different or unknown chapter range stays in review; Pacearr does not guess how to split or renumber media. Historical identities remain available after catalogue refreshes and restarts.

## Old editions stay out of your media library

Settings now includes **Upgrade backups**:

- Retained, verified backups move from media folders to persistent state storage, outside the configured library and download folders.
- Automatic deletion is **off by default**. Choose immediate cleanup after verified replacement, or retention of 1, 7, 14 or 30 days.
- Refresh the list, migrate existing tracked backups, and select individual or multiple stored backups for permanent deletion.
- Both episode backups and complete arc backups are supported. Changed replacement files, altered backups and active recovery journals block cleanup.

The default location is `/data/state/backups`, covered by the existing state mount. `PACEARR_BACKUP_DIR` can select another writable, mounted location outside scanned media trees. Check that backup storage has room for retained files. Source downloads and seeding files are preserved.

## Clearer decisions and quieter repeat processing

- Completed arc rebuilds retire obsolete requests for episode numbers removed from that arc, including stale Loguetown episode 04 requests.
- Unchanged source and verified destination records are reused to avoid repeating completed processing.
- Diagnostics include catalogue mapping conflicts and backup maintenance problems under unresolved issues.
- Worker errors name the processing stage where they occurred.
- **Download diagnostic report** is available on System as well as Activity.

Straw Hat Theatre, Warship Island and One Piece Fan Letter still require verified season mappings where none exists. This release keeps those warnings visible rather than inventing destinations.

## Validation and installation

Unit checks cover exact/ambiguous supplemental mappings, historical identities, backup movement, retention, tamper protection, symbolic-link rejection and interrupted migration. Integration checks exercise official takeovers, feed-only revisions, selective bundle downloads, restart recovery and full arc replacement with synthetic media. Desktop and mobile browser checks cover the existing management UI and backup controls.

Pull `ghcr.io/daherokozuki/pacearr:latest` (or pin `:v1.6.0`) and recreate the service using your existing Compose file and persistent state mount. Existing credentials, checksums and automation preferences are retained. After updating, use **System → Check now**, then **Settings → Upgrade backups** to inspect retained copies. A media-server rescan may be needed to remove previously indexed backup entries.
