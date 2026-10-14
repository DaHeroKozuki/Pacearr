# Pacearr v1.3.0 — Clear decks. Stay in control. 🚢

**A cleaner download workflow, a control room that fits your phone, and release checks on your schedule.** This update keeps the glass/ocean design and strengthens how Pacearr reconciles the files you already have.

![Pacearr control room](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.3.0/docs/screenshots/overview.png)

## Downloads that tell the whole story

Completed, Awaiting action, Untracked files and Removed source files now have separate sections. Removing a torrent record does not erase the proven completion of an unchanged imported source. A completed manifest entry whose file is absent offers **Remove stale entry**. Files gone from both disk and Deluge disappear on refresh. Existing v1.2 completion signatures are reused.

Bulk deletion clears already absent known entries and validates existing paths before removal. Library copies stay intact. Bulk **Ignore selected** preserves files and seeding. Clear selection explicitly means unticking files. Untracked files still need explicit completion confirmation before importing.

## Your schedule, continuous imports

Choose checks every **15, 30 or 45 minutes; 1, 3, 6, 12 or 24 hours** under Settings. This persists across restarts and controls automatic discovery, while download progress and completed imports continue independently. Overview shows upcoming work and the next discovery time. Refresh the catalogue or start Automation for an immediate pass.

## Take the control room with you

Readable file cards, touch-sized controls and mobile dialogs retain every field and action on phones. A matching sailboat icon appears in bookmarks and Apple home-screen shortcuts. Activity can group repeated identical events; exported history retains each original timestamp.

<p><img src="https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.3.0/docs/screenshots/mobile-library.png" alt="Mobile library" width="300"></p>

## Update

Retain your existing Compose settings and state/media mounts. Pull **ghcr.io/daherokozuki/pacearr:latest** (or pin **v1.3.0**) and recreate the service. Source, tests, existing documentation and project history remain in GitHub and the complete source archive. Refresh your browser once for the new assets.

```sh
cd /path/to/pacearr
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

On older Synology installations, use `docker-compose`. No host path migration is required. Existing credentials, checksum records, episode catalogue and saved automation preferences are reused. Live NAS behavior should be checked in Downloads and Activity after updating.
