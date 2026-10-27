# Franky refitted the season. Nobody went overboard. 🔧🏴‍☠️

**v1.5.0 fixes missed episode upgrades and adds verified whole-arc replacement.** The October 26 Loguetown rerelease exposed two problems: filename-shaped feed titles were triggering false catalogue conflicts, and the new batch layout could not safely replace the old episode arrangement. This release addresses both, with a reusable workflow for future arc revisions.

## Episode handling: stop confusing filenames with renumbering

- Normalise friendly titles, full release filenames, batch labels and variant suffixes before comparing arc identities.
- Keep optional fractional releases such as **01.5** distinct from episode **01**.
- Quarantine genuinely conflicting individual records while accepting unaffected catalogue updates. Suspicious large feed reductions still retain the saved catalogue.
- Compare fields shared by RSS and website fallback records so restoring RSS does not fabricate hundreds of release changes.

## Upgrade the arc, not just the episode number

Pacearr verifies the official batch’s torrent info hash, then reads its individual file manifest. It selects the canonical episode files for your preferred standard/extended batch and checks the proposed replacement against verified installed identities, chapter coverage, quality and profile controls. An older batch does not supersede a newer individual release.

For a verified full-batch revision or quality upgrade:

1. Queue required files together, with unrelated and fractional optional cuts unselected.
2. Wait for the complete canonical replacement set. Reuse an installed file when its verified checksum already matches.
3. Stage and checksum the replacements while the installed season remains live.
4. Recheck the installed files, then publish the complete new season directory.
5. Preserve the old directory under a hidden `.pacearr-arc-backup-*` name and update the catalogue/checksum records.

An interrupted directory switch has a persistent recovery journal. Pause/stop decisions are respected before publication; restart recovery can finish verified publication or retain the old season. Sources and sidecars are preserved. Hidden stages and retained seasons are excluded from library inventory.

## Loguetown and future reorganised arcs

The verified October 26 standard and extended manifests contain canonical **01, 02 and 03**, plus optional **01.5**. The companion API currently places the optional file in its second slot. Pacearr uses the official manifest’s file identities and canonical numbers for the replacement instead of copying that shifted ordering into the library.

The same workflow can handle verified full batches with split, merged, reordered or additional canonical episodes when the replacement retains installed chapter coverage. It blocks downgrades and retains ambiguous or incomplete sets for review. Releases without a complete verified mapping continue through the existing per-episode policy or require review; safety checks have not been disabled.

**System → Arc upgrades** shows the plan, progress, reason, retained-directory location and a recheck action. Optional cuts remain separate and are not automatically inserted into the canonical season.

![Verified arc upgrade using isolated demonstration files](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.5.0/docs/screenshots/arc-upgrades.png)

## Update

Keep your existing Compose file, media mounts and state volume. Pull `ghcr.io/daherokozuki/pacearr:latest` or pin `v1.5.0`, then recreate the service:

```sh
cd /path/to/pacearr
docker compose -p pacearr -f compose.yaml pull pacearr
docker compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Use `docker-compose` on older Synology installations. Refresh the browser once, then use **Check now** to request a fresh release assessment. Automation, update/quality preferences and stop controls still determine which work may run.

Credentials, existing checksum records, catalogue history and saved preferences remain in the state mount. No source-video payload was downloaded for development: the real Loguetown torrent metadata was verified, and media operations were exercised with isolated test files.
