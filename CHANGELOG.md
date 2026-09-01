# Changelog

All notable changes to Pacearr will be documented in this file.

Pacearr follows semantic versioning for its own development line beginning with `0.1.0-alpha`.

The project originated from OnePacerr, and the preserved OnePacerr beta history is documented separately below so the reliability work inherited by Pacearr remains properly attributed.

---

## [Unreleased]

### Planned

- Continued Stage 1 repository and documentation work.
- `CONTRIBUTING.md`.
- Repository-wide branding audit.
- GitHub repository metadata and presentation review.
- Clean build and release-workflow verification.
- First Pacearr `v0.1.0-alpha` pre-release.
- First Pacearr GHCR image.
- Preparation for persistent settings, the Pacearr API, and the future Web UI.

See [ROADMAP.md](ROADMAP.md) for the full staged development plan.

---

## [0.1.0-alpha] - Unreleased

### Added

- Established the **Pacearr** project identity.
- Started the new Pacearr version line at `0.1.0-alpha`.
- Added the new Pacearr project banner.
- Added a redesigned Pacearr README.
- Added the full Pacearr development roadmap.
- Added explicit project-origin and OnePacerr attribution documentation.
- Preserved the historical OnePacerr README under `docs/legacy/ONEPACERR-README.md`.
- Began tracking `package-lock.json` for reproducible application builds.
- Added Synology `@eaDir` metadata exclusions to `.gitignore`.

### Changed

- Renamed the GitHub repository from the OnePacerr beta fork identity to `DaHeroKozuki/Pacearr`.
- Updated package identity from `OnePacerr` to `Pacearr`.
- Updated Docker/OpenContainer image branding.
- Updated GitHub Actions container publishing target to `ghcr.io/daherokozuki/pacearr`.
- Updated visible application and logging references from OnePacerr to Pacearr where safe.
- Updated documentation to clearly separate currently implemented functionality from planned Web UI and management functionality.
- Repositioned the project from a reliability-focused OnePacerr fork into a standalone application development line.

### Compatibility

Pacearr `0.1.0-alpha` intentionally retains several OnePacerr-derived configuration names and defaults because they remain active implementation details.

Examples include:

```dotenv
MOUNT_LIBRARY_ONEPACERR=...
MOUNT_DOWNLOADS_ONEPACERR=...
STATE_DB=/data/state/onepacerr.db
TORRENT_CATEGORY=onepacerr
METADATA_URL=https://onepacerr.com/api/v1
```

These values should not be renamed manually. Future Pacearr releases will introduce documented compatibility aliases and migration paths before legacy identifiers are removed.

### Foundation

Pacearr `0.1.0-alpha` is built on the final preserved OnePacerr Beta 1.3 reliability foundation.

The legacy branch remains available as:

```text
legacy/onepacerr-beta1.3
```

---

# Legacy OnePacerr Foundation

The versions below predate the Pacearr project identity and are retained for historical accuracy.

Pacearr would not exist without the original [OnePacerr](https://github.com/eltharynd/OnePacerr) project created by [eltharynd](https://github.com/eltharynd).

---

## OnePacerr v1.7.19-beta1.3

### Reliability and persistent state

- Expanded persistent episode-processing state.
- Improved state reconciliation across application/container restarts.
- Added persistent retry tracking and retry timing.
- Added recovery handling for interrupted processing.
- Added failed-state and quarantine recovery.
- Added cleanup-pending state handling.
- Added recovery of stale state so genuinely missing episodes can be rediscovered.
- Added additional reliability-related environment configuration.

### Plex processing

- Expanded queued Plex processing.
- Added batched Plex handling.
- Reduced unnecessary repeated Plex refresh operations.
- Added safer Plex confirmation handling before torrent cleanup.
- Added persistent retry/backoff for Plex confirmation.
- Improved separation between Plex confirmation, metadata processing, and torrent cleanup.
- Added scan-completion waiting and safe timeout behaviour.
- Improved handling of delayed or temporarily unavailable Plex responses.

### Metadata processing

- Added a separate metadata-pending queue.
- Added persistent metadata retry behaviour.
- Prevented successful Plex confirmations from needlessly repeating the complete import workflow when only metadata failed.
- Added season/show metadata update handling after successful episode processing.

### Deluge cleanup

- Added safer Deluge torrent cleanup.
- Added support for deleting torrent data after successful media-server confirmation when enabled.
- Made Deluge torrent removal idempotent: an already-absent torrent is treated as successful cleanup.
- Added recurring cleanup-pending processing during normal monitor cycles.
- Added cleanup retry/backoff.
- Added reconciliation for cleanup records whose torrents are already absent.
- Added stale cleanup-state recovery.

### Pipeline reliability

- Improved protection around pipeline failures.
- Added state-aware processing so one temporary failure does not require the entire workflow to restart.
- Improved cleanup and metadata recovery without blocking unrelated episodes.
- Added persistent reliability configuration to `sample.env` and `sample.min.env`.

---

## OnePacerr v1.7.19-beta1.2

This release is preserved as a historical predecessor to Beta 1.3.

Beta 1.2 continued the Plex/Docker reliability work that later became the basis of the more extensive persistent state and cleanup changes in Beta 1.3.

See the repository history and tag `v1.7.19-beta1.2` for the exact source state.

---

## OnePacerr v1.7.19-beta1.1

### Plex reliability

- Improved Plex reliability and recovery behaviour.
- Expanded retry handling.
- Added additional resilience around Plex operations.
- Continued mixed Windows/Linux path compatibility improvements.

See the preserved tag `v1.7.19-beta1.1`.

---

## Project lineage

```text
OnePacerr v1.7.19
        ↓
OnePacerr Beta
        ↓
OnePacerr Beta 1.1
        ↓
OnePacerr Beta 1.2
        ↓
OnePacerr Beta 1.3
        ↓
Pacearr 0.1.0-alpha
```

The repository history, legacy branch, historical README, and upstream attribution are intentionally preserved so Pacearr's origins remain visible.

[Unreleased]: https://github.com/DaHeroKozuki/Pacearr/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/DaHeroKozuki/Pacearr/releases/tag/v0.1.0-alpha
