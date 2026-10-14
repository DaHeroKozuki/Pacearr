# Clearer downloads. Clearer decisions. 🚢

Pacearr v1.0.2 separates successful work from files needing attention and makes the Deluge grab lifecycle easier to follow. The glass layout and ship banner stay intact.

![Pacearr Downloads](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.2/docs/screenshots/downloads.png)

## Downloads now has distinct sections

- **Queued episode grabs:** requests waiting for a slot or Deluge metadata/feed confirmation. Existing torrents outside the configured folder are explained here.
- **Downloading:** scoped torrent progress.
- **Awaiting action:** completed downloads needing verification, approval, a profile decision or manual episode assignment—with its own single/bulk import and deletion controls.
- **Completed:** imported or already installed source files, with a separate selection and source-deletion control. Sources remain available for seeding until explicitly deleted.
- **Errors:** current failed jobs, actual reasons, retry timing and actions. Manual grab failures now appear here too.

Selections are scoped to their section and cleared when a file changes category, avoiding accidental reuse of a selection after import.

## Deluge rejections explained

The previous generic “rejected read-only query” message hid the failed operation. New messages include the RPC method, error code and Deluge's reason, with saved password values redacted. Grab failures show attempt and retry timing; skipped grabs explain why they were skipped.

Exact existing hashes are reused. A duplicate/being-added response naming the requested hash is treated as confirmation, not an unsuccessful new grab. Successfully accepted magnets reserve concurrency capacity while waiting for feed visibility and are not resubmitted automatically. If confirmation remains absent after five minutes, the queue asks for a Deluge check and manual Retry instead of sending another add blindly.

## Activity distinguishes current work from history

A severity filter helps inspect information, warnings or errors. The current failed-grab count is shown separately from historical events, which may already be resolved. Existing history and checksum records remain intact.

![Pacearr Activity](https://raw.githubusercontent.com/DaHeroKozuki/Pacearr/v1.0.2/docs/screenshots/activity.png)

## Try missing episodes

In Library, filter to Missing, select the episodes you want and use Grab selected episodes. Review the available releases/profile matches before submitting. Alternatively, enable Automatically grab missing episodes in Profiles and save while automation runs. Existing saved preferences are not silently changed; the default concurrency remains three unless you changed it.

Unavailable releases or unsupported profile matches can remain missing; the new skip/queue messages distinguish these from successful submissions and actual failures.

## Update

```sh
cd /volume1/docker/pacearr
docker-compose -p pacearr -f compose.yaml pull pacearr
docker-compose -p pacearr -f compose.yaml up -d --no-build --no-deps --force-recreate pacearr
```

Refresh the browser once for the new assets. Preserve `/data/state`. Public images: `ghcr.io/daherokozuki/pacearr:v1.0.2`, `:latest` and compatibility tag `:alpha`, for amd64/arm64.

The application ZIP, complete active source archive and SHA256SUMS are attached. All earlier source/history and the expanded [setup/mount guide](https://github.com/DaHeroKozuki/Pacearr) remain available. No private state or credentials are packaged.

**Validation:** 23 unit tests, automatic import/upgrade/acquisition/bulk/restart fixtures, a delayed Deluge visibility regression, desktop/mobile UI checks, and CI Docker build/health checks before publication. Screenshots use isolated demonstration data.

[Project and setup guide](https://github.com/DaHeroKozuki/Pacearr) · [Community](https://discord.gg/u3zksrG8G6)
