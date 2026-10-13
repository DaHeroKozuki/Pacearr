Pacearr v1.0.0 brings the live Library Control interface and verified import engine to the public container.

- Automatic refresh of library, overview, downloads and activity; no manual refresh after an import.
- Glass ocean theme with a visible pirate ship and flag, plus GitHub/Discord links under System.
- Whole-library and individual release grabs, verified revisions and 720p-to-1080p upgrades.
- Quality/cut/language profiles, live Deluge progress, review/retry/ignore actions and persistent activity.
- Single/bulk manual episode assignment/import and confirmed scoped download deletion.
- Persisted checksum results reused after restart/update; verified copy publication, replacement backups and interrupted-operation recovery.

Images: ghcr.io/daherokozuki/pacearr:v1.0.0, :latest and :alpha. The historical :v0.1.0-alpha image remains available for rollback.

This runtime supports Deluge and mounted library folders, with read-only Plex connection/library discovery. Plex mutations and the older Jellyfin/Emby/qBittorrent engine are not enabled in this runtime. Earlier Alpha environment settings/SQLite state are not automatically migrated; configure the new UI. Phase 16–31 standalone users retain their existing setup.json, vault and checksum records by keeping /data/state mounted.

Local validation: 20 unit tests and fixture integration/browser checks passed, including automatic page refresh, grabs, bulk imports/deletion and restart checksum reuse. CI builds/smoke-tests Docker before publishing amd64/arm64 images.

See README for installation, mount permissions, upgrade and rollback guidance.
