# Pacearr Development Roadmap

Pacearr is being developed in deliberate stages so each phase leaves the project in a usable, recoverable state.

This roadmap is the main development tracker for Pacearr. It separates the working automation foundation from planned features so users can clearly see what exists today and what is still under development.

> **Current development line:** `0.1.x-alpha`
>
> **Current focus:** Stage 1 — Project identity, repository foundation, documentation, and release preparation.

---

## Development principles

Pacearr should remain:

- **Self-hosted first** — designed for Docker and homelab environments.
- **Recoverable** — interrupted processing should resume safely after restarts or service outages.
- **Transparent** — users should be able to see what Pacearr is doing and why.
- **Configurable** — release, quality, language, media-server, and download preferences should be user-controlled.
- **Backward-conscious** — existing OnePacerr-derived configuration and persistent state should not be broken without a documented migration path.
- **Modular** — media servers, download clients, release discovery, settings, and the web UI should evolve as separate components rather than one monolithic pipeline.
- **Honest about feature status** — planned features should never be presented as already implemented.

---

# Stage 1 — Identity & Repository Foundation

**Goal:** Establish Pacearr as its own project while preserving the final OnePacerr-based foundation and its history.

### Completed

- [x] Preserve the final OnePacerr Beta 1.3 codebase.
- [x] Create `legacy/onepacerr-beta1.3`.
- [x] Preserve the historical OnePacerr README under `docs/legacy/`.
- [x] Rename the GitHub repository to `DaHeroKozuki/Pacearr`.
- [x] Update the local Git remote.
- [x] Establish Pacearr package identity.
- [x] Start Pacearr versioning at `0.1.0-alpha`.
- [x] Update Docker/OpenContainer branding.
- [x] Update GitHub Actions container naming to `pacearr`.
- [x] Start tracking `package-lock.json`.
- [x] Build and verify `pacearr:0.1.0-alpha-dev`.
- [x] Create the new Pacearr README.
- [x] Add the Pacearr project banner.
- [x] Document project origins and OnePacerr attribution.
- [x] Document current features separately from planned features.
- [x] Document legacy compatibility identifiers that must remain unchanged for now.
- [x] Confirm local `main` and `origin/main` are fully synchronized.

### Remaining

- [x] Add `CHANGELOG.md`.
- [x] Add `CONTRIBUTING.md`.
- [x] Review and update `POSTER-SETS.md` branding where appropriate.
- [x] Review repository topics, description, and About section.
- [x] Review GitHub Issues/Discussions configuration.
- [x] Perform a repository-wide branding audit.
- [x] Perform a clean TypeScript/Docker build from the current `main`.
- [ ] Verify GitHub Actions workflow syntax and GHCR publishing.
- [ ] Publish the first Pacearr pre-release: `v0.1.0-alpha`.
- [ ] Publish the first Pacearr GHCR image.
- [ ] Verify the documented migration path from OnePacerr Beta 1.3.
- [ ] Mark Stage 1 complete.

**Stage 1 completion criteria:**
A new user should be able to land on the GitHub repository, understand what Pacearr is, understand what is already working, understand what is planned, see proper OnePacerr attribution, build the project successfully, and pull the first Pacearr alpha image.

---

# Stage 2 — Configuration & Internal Architecture

**Goal:** Prepare the backend for a web-managed application without breaking the existing automation engine.

### Planned work

- [ ] Audit all environment variables and classify them as:
  - bootstrap-only;
  - persistent application settings;
  - integration credentials;
  - legacy compatibility values.
- [ ] Design a persistent Pacearr configuration model.
- [ ] Store routine settings in the persistent database.
- [ ] Preserve environment-variable overrides for Docker/bootstrap use.
- [ ] Add compatibility aliases before renaming legacy variables such as:
  - `MOUNT_LIBRARY_ONEPACERR`;
  - `MOUNT_DOWNLOADS_ONEPACERR`;
  - `/data/state/onepacerr.db`;
  - `TORRENT_CATEGORY=onepacerr`.
- [ ] Add a versioned configuration migration system.
- [ ] Separate release discovery, download handling, library handling, metadata, state, and settings into clearer service boundaries.
- [ ] Define stable internal models for:
  - arcs;
  - episodes;
  - releases;
  - installed files;
  - downloads;
  - media-server state;
  - processing state.
- [ ] Refine persistent-state schema for future UI visibility.
- [ ] Add application-level health/status reporting.
- [ ] Add structured event/history storage.
- [ ] Define API contracts needed by the future Web UI.

**Stage 2 completion criteria:**
Pacearr can start from Docker bootstrap values, load persistent settings, migrate old configuration safely, and expose clear backend services without depending on a huge environment-variable list for normal operation.

---

# Stage 3 — Pacearr API

**Goal:** Provide a stable backend interface for the Web UI and external integrations.

### Planned work

- [ ] Add HTTP API server.
- [ ] Add application status endpoint.
- [ ] Add health endpoint.
- [ ] Add configuration read/update endpoints.
- [ ] Add library summary endpoint.
- [ ] Add arcs endpoint.
- [ ] Add episodes endpoint.
- [ ] Add releases endpoint.
- [ ] Add download queue endpoint.
- [ ] Add activity/history endpoint.
- [ ] Add retry/recovery controls.
- [ ] Add manual rescan/refresh actions.
- [ ] Add manual download/import actions where safe.
- [ ] Add logs/event-stream endpoint.
- [ ] Add API validation and error responses.
- [ ] Add authentication/bootstrap security for remote access.
- [ ] Document the API.

**Stage 3 completion criteria:**
Everything required by the first Web UI can be queried and controlled through a documented Pacearr API.

---

# Stage 4 — Web UI Foundation

**Goal:** Replace most day-to-day environment-variable management with a modern browser interface.

### Planned work

- [ ] Create Pacearr frontend application.
- [ ] Establish shared visual identity from the Pacearr branding.
- [ ] Add responsive desktop/mobile layout.
- [ ] Add navigation shell.
- [ ] Add first-run/setup wizard.
- [ ] Add application health indicator.
- [ ] Add version/update information.
- [ ] Add settings framework.
- [ ] Add confirmation dialogs for destructive actions.
- [ ] Add notification/toast system.
- [ ] Add API error handling.
- [ ] Add authentication/session handling if enabled.
- [ ] Package frontend and backend into the Pacearr Docker image.

**Stage 4 completion criteria:**
A user can open Pacearr in a browser, complete initial setup, view system health, and change basic application settings without editing Docker environment variables.

---

# Stage 5 — Dashboard & Operational Visibility

**Goal:** Make it obvious what Pacearr is doing without reading raw container logs.

### Planned work

- [ ] Dashboard summary.
- [ ] Media-server connectivity status.
- [ ] Torrent-client connectivity status.
- [ ] Metadata service status.
- [ ] Library statistics.
- [ ] Missing episode count.
- [ ] Monitored episode count.
- [ ] Upgrade-available count.
- [ ] Active downloads.
- [ ] Pending imports.
- [ ] Plex/media-server pending confirmations.
- [ ] Metadata pending state.
- [ ] Cleanup pending state.
- [ ] Failed/quarantined items.
- [ ] Retry/backoff status.
- [ ] Recent activity feed.
- [ ] Storage/free-space status.
- [ ] WebSocket/live status updates where practical.

**Stage 5 completion criteria:**
The dashboard should answer: **Is Pacearr healthy? What is it doing? What needs attention?**

---

# Stage 6 — Library, Arc & Episode Management

**Goal:** Give users a Sonarr-style view of their One Pace library.

### Planned work

- [ ] Display all One Pace arcs.
- [ ] Display episodes within each arc.
- [ ] Show monitored/unmonitored state.
- [ ] Show whether an episode is:
  - missing;
  - downloading;
  - imported;
  - awaiting media-server confirmation;
  - awaiting metadata;
  - awaiting cleanup;
  - complete;
  - failed/quarantined.
- [ ] Show installed filename and path.
- [ ] Show installed release information.
- [ ] Show resolution.
- [ ] Show language/audio/subtitle information when known.
- [ ] Show Standard/Extended/Alternate status when known.
- [ ] Show CRC/version information.
- [ ] Add per-episode manual search/refresh.
- [ ] Add per-episode monitor toggle.
- [ ] Add per-arc monitoring controls.
- [ ] Add bulk actions.
- [ ] Add filters and search.

**Stage 6 completion criteria:**
Users can understand and manage their entire One Pace library from the Web UI without inspecting folders manually.

---

# Stage 7 — Release Discovery & Release Profiles

**Goal:** Make Pacearr choose releases according to user preferences rather than a small set of global booleans.

### Planned work

- [ ] Audit current RSS/release discovery logic.
- [ ] Model every available release variant for an episode.
- [ ] Capture available attributes where possible:
  - resolution;
  - English Dub;
  - English Subtitles;
  - Extended Cut;
  - Standard Cut;
  - Alternate release;
  - release/version identifier;
  - source/download option.
- [ ] Build reusable release profiles.
- [ ] Add profile ordering/priorities.
- [ ] Add preferred resolution.
- [ ] Add minimum acceptable resolution.
- [ ] Add quality fallback rules.
- [ ] Add Dub/Sub preference.
- [ ] Add Extended/Standard Cut preference.
- [ ] Add fallback language/cut rules.
- [ ] Allow profiles to be assigned globally.
- [ ] Allow future per-arc/per-episode overrides.
- [ ] Show why a release was selected.
- [ ] Show why another release was rejected.

### Example planned profile

```text
1. English Dub — Extended Cut — 1080p
2. English Dub — 1080p
3. English Subtitles — Extended Cut — 1080p
4. English Subtitles — 1080p
5. Fall back to 720p
```

**Stage 7 completion criteria:**
Pacearr can rank available One Pace releases deterministically according to a user-created release profile.

---

# Stage 8 — Upgrade Management

**Goal:** Keep the library at the best release permitted by the user's profile.

### Planned work

- [ ] Store the currently installed release identity.
- [ ] Compare installed release against newly discovered releases.
- [ ] Detect quality upgrades such as `720p → 1080p`.
- [ ] Detect preferred-language upgrades such as `Sub → Dub`.
- [ ] Detect cut upgrades such as `Standard → Extended`.
- [ ] Detect corrected/revised release versions.
- [ ] Determine whether a candidate is truly preferred before downloading.
- [ ] Prevent downgrade loops.
- [ ] Prevent repeated downloads of equivalent releases.
- [ ] Safely replace the existing file only after successful import/verification.
- [ ] Preserve recovery state if an upgrade fails.
- [ ] Show upgrade history in the UI.
- [ ] Add automatic and manual upgrade modes.
- [ ] Add an upgrade cutoff concept so users can stop once a desired tier is reached.

**Stage 8 completion criteria:**
Pacearr can automatically keep an existing library current as improved One Pace releases become available.

---

# Stage 9 — Download Client Management

**Goal:** Make supported download clients first-class configurable integrations.

### Planned work

- [ ] Web UI configuration for download clients.
- [ ] Connection testing.
- [ ] qBittorrent validation.
- [ ] Deluge validation.
- [ ] Transmission validation.
- [ ] µTorrent validation.
- [ ] Per-client capability reporting.
- [ ] Queue visibility.
- [ ] Download progress.
- [ ] Pause/resume where supported.
- [ ] Retry failed submissions.
- [ ] Safe removal/cleanup controls.
- [ ] Category/label management.
- [ ] Path mapping validation.
- [ ] Optional future support for additional download methods/sources.

**Stage 9 completion criteria:**
Users can configure, test, view, and manage the active Pacearr download integration from the Web UI.

---

# Stage 10 — Media Server Management

**Goal:** Bring Plex, Jellyfin, Emby, and local-library integration to the same reliability standard.

### Planned work

- [ ] Web UI configuration for media servers.
- [ ] Connection testing.
- [ ] Library selection.
- [ ] Path mapping validation.
- [ ] Plex reliability regression testing.
- [ ] Jellyfin import/scan reliability review.
- [ ] Emby import/scan reliability review.
- [ ] Normalize media-server confirmation behavior.
- [ ] Normalize metadata update behavior where practical.
- [ ] Surface scan/refresh activity in the UI.
- [ ] Surface media-server failures in the dashboard.
- [ ] Preserve sidecar metadata options.
- [ ] Validate mixed Windows/Linux setups.

**Stage 10 completion criteria:**
Plex, Jellyfin, Emby, and local-folder modes are clearly configured, observable, and recoverable through the same Pacearr management experience.

---

# Stage 11 — Activity, History, Logs & Notifications

**Goal:** Make Pacearr easy to troubleshoot and monitor long-term.

### Planned work

- [ ] Persistent activity history.
- [ ] Download history.
- [ ] Import history.
- [ ] Upgrade history.
- [ ] Failure/recovery history.
- [ ] Searchable logs.
- [ ] Log-level control through the UI.
- [ ] Retry history.
- [ ] Quarantine history.
- [ ] Notification framework.
- [ ] Webhook notifications.
- [ ] Discord-compatible webhook notifications.
- [ ] Optional notification rules for:
  - new release;
  - download started;
  - import completed;
  - upgrade completed;
  - failure;
  - recovery;
  - media-server unavailable;
  - application update available.

**Stage 11 completion criteria:**
Users can understand historical behavior and receive useful notifications without relying on external log scraping.

---

# Stage 12 — Migration & Compatibility

**Goal:** Make upgrading from OnePacerr-derived deployments to Pacearr safe and boring.

### Planned work

- [ ] Detect legacy configuration automatically.
- [ ] Migrate legacy environment settings into persistent settings.
- [ ] Add aliases for renamed configuration values.
- [ ] Migrate legacy SQLite state safely.
- [ ] Decide when/how to rename `onepacerr.db`.
- [ ] Decide when/how to rename legacy torrent categories.
- [ ] Decide when/how to replace `MOUNT_*_ONEPACERR` identifiers.
- [ ] Preserve old identifiers for at least one documented compatibility period.
- [ ] Add migration preview/dry-run.
- [ ] Add backup checks before schema/config migrations.
- [ ] Document rollback procedures.
- [ ] Test migration from the preserved `legacy/onepacerr-beta1.3` branch.

**Stage 12 completion criteria:**
An existing OnePacerr Beta 1.3-style installation can upgrade to Pacearr using documented steps without losing state or media.

---

# Stage 13 — Testing, Security & Release Hardening

**Goal:** Prepare Pacearr for broader use beyond the development environment.

### Planned work

- [ ] Unit tests for release selection.
- [ ] Unit tests for upgrade decisions.
- [ ] State-store tests.
- [ ] Migration tests.
- [ ] Torrent-client integration tests.
- [ ] Plex integration regression tests.
- [ ] Jellyfin integration tests.
- [ ] Emby integration tests.
- [ ] Filesystem/path mapping tests.
- [ ] Windows/Linux path tests.
- [ ] Restart/recovery tests.
- [ ] Low-storage tests.
- [ ] Failed-cleanup tests.
- [ ] Docker multi-architecture build tests.
- [ ] API input validation.
- [ ] Credential/secrets review.
- [ ] Authentication/security review for Web UI.
- [ ] Dependency auditing.
- [ ] Backup/restore documentation.
- [ ] Upgrade/rollback testing.

**Stage 13 completion criteria:**
The core workflows have automated coverage and Pacearr can survive common operational failures without corrupting the library or persistent state.

---

# Stage 14 — Stable Release

**Goal:** Publish the first stable Pacearr release.

### Release requirements

- [ ] Web UI considered production-ready.
- [ ] Release profiles stable.
- [ ] Upgrade management stable.
- [ ] Plex support validated.
- [ ] Jellyfin support validated.
- [ ] Emby support validated.
- [ ] Download-client integrations validated.
- [ ] Migration path validated.
- [ ] Documentation complete.
- [ ] Changelog complete.
- [ ] Upgrade and rollback instructions complete.
- [ ] Multi-architecture GHCR images published.
- [ ] No known data-loss issues.
- [ ] No known unsafe cleanup behavior.
- [ ] Stable version tagged and released.

Potential milestone:

```text
Pacearr v1.0.0
```

---

# Ideas for later

These are intentionally outside the main path and should not delay the core project:

- [ ] Hardlink/softlink import support.
- [ ] Multiple folders per media-server library.
- [ ] Additional download sources.
- [ ] Alternative metadata providers.
- [ ] Backup/restore from the Web UI.
- [ ] Import/export of release profiles.
- [ ] Multiple Pacearr library instances.
- [ ] API tokens for third-party integrations.
- [ ] Home Assistant integration.
- [ ] Prometheus metrics.
- [ ] Advanced notification providers.
- [ ] Theme/customization options.
- [ ] Internationalized Web UI.

---

## Current checkpoint

**Stage 1 — Identity & Repository Foundation**

The project currently has:

- a preserved OnePacerr Beta 1.3 legacy branch;
- Pacearr branding and versioning;
- a clean repository history;
- a working automation/reliability foundation;
- a new README and banner;
- documented OnePacerr attribution;
- local and GitHub repositories synchronized.

The next Stage 1 deliverables are:

1. `CHANGELOG.md`
2. `CONTRIBUTING.md`
3. repository branding/configuration audit
4. clean build verification
5. first Pacearr `v0.1.0-alpha` pre-release and GHCR image
