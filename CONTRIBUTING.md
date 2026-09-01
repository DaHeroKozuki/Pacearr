# Contributing to Pacearr

Thank you for your interest in contributing to Pacearr.

Pacearr is an alpha-stage, self-hosted One Pace library automation project. It originated from OnePacerr and is being developed into an independent application while preserving compatibility with the working OnePacerr-derived foundation.

Please read this guide before opening an issue or submitting a pull request.

---

## Project status

Pacearr is currently on the `0.1.x-alpha` development line.

The project is being developed in deliberate stages. The current development priorities, planned architecture, and completion criteria are documented in [ROADMAP.md](ROADMAP.md).

Alpha means:

- interfaces and internal architecture may change;
- some configuration still uses legacy OnePacerr names;
- planned features in the roadmap may not exist yet;
- migration paths must be considered before breaking existing installations;
- reliability and recoverability take priority over rapid feature expansion.

Please do not present roadmap items as implemented features.

---

## Before contributing

Before starting significant work:

1. Read [README.md](README.md).
2. Read [ROADMAP.md](ROADMAP.md).
3. Check existing issues and pull requests to avoid duplicating work.
4. Keep changes focused on a single problem or feature.
5. For substantial architectural changes, open an issue for discussion before writing a large implementation.

Small bug fixes, documentation corrections, and narrowly scoped improvements generally do not require prior discussion.

---

## Compatibility policy

Pacearr intentionally retains several OnePacerr-derived environment variables, paths, defaults, and internal identifiers.

Examples include:

```dotenv
MOUNT_LIBRARY_ONEPACERR=...
MOUNT_DOWNLOADS_ONEPACERR=...
STATE_DB=/data/state/onepacerr.db
TORRENT_CATEGORY=onepacerr
METADATA_URL=https://onepacerr.com/api/v1
```

Do **not** rename or remove legacy identifiers simply for branding consistency.

A legacy identifier may still be part of the active configuration contract and changing it can break existing deployments, Docker Compose files, persistent state, or migration compatibility.

Changes to legacy configuration should provide an appropriate compatibility or migration path and should be documented.

Visible user-facing references may be updated to Pacearr where doing so does not alter compatibility.

---

## Development principles

Contributions should support the project's core principles:

- **Self-hosted first** — Pacearr is designed primarily for Docker and homelab environments.
- **Recoverable** — interrupted operations should recover safely after restarts and temporary service failures.
- **Transparent** — users should be able to understand what the application is doing and why.
- **Configurable** — important release, quality, language, download-client, and media-server behaviour should not be unnecessarily hard-coded.
- **Backward-conscious** — existing working installations should not be broken without a deliberate migration strategy.
- **Modular** — new functionality should avoid unnecessary coupling between release discovery, downloading, media-server integration, settings, APIs, and the future Web UI.
- **Honest about feature status** — documentation must distinguish implemented behaviour from planned functionality.

---

## Development setup

Pacearr is a Node.js and TypeScript application.

A typical local development workflow is:

```bash
npm install
npm run build
npm test
```

Development mode can be started with:

```bash
npm run dev
```

A production-style start uses:

```bash
npm start
```

Docker changes should also be tested with a clean image build where practical.

For example:

```bash
docker build -t pacearr:dev .
```

Do not commit generated dependency directories such as `node_modules`.

The repository tracks `package-lock.json`. Dependency changes should keep the lock file synchronized with `package.json`.

---

## Testing changes

Before submitting a pull request, run the checks relevant to your change.

At minimum, code changes should normally pass:

```bash
npm run build
npm test
```

Also check the Git diff for whitespace problems:

```bash
git diff --check
```

If your change affects Docker behaviour, verify that the image builds successfully.

If your change affects Plex, Jellyfin, Emby, Deluge, qBittorrent, rTorrent, Transmission, filesystem mappings, or mixed Windows/Linux paths, describe what environment you tested.

Not every contributor will have access to every supported integration. If something could not be tested, state that clearly in the pull request rather than implying complete coverage.

---

## Reliability-sensitive changes

Take extra care when modifying:

- persistent state;
- retry or backoff logic;
- torrent cleanup;
- file importing or moving;
- quarantine handling;
- Plex/media-server confirmation;
- metadata processing;
- scan coordination;
- path translation;
- restart recovery.

These areas can affect user data or determine whether an interrupted operation resumes correctly.

Changes in these areas should prefer idempotent behaviour. Repeating an operation after a restart should not corrupt state, duplicate imports, or delete data prematurely.

Torrent data must not be removed merely because an earlier processing step appeared successful if the configured workflow still requires media-server confirmation or another safety condition.

---

## Mixed Windows and Linux environments

Pacearr supports deployments where the application runs in a Linux container while a media server such as Plex runs on Windows.

Do not assume paths reported by the media server are directly usable inside the Pacearr container.

Changes involving paths should account for configured mappings such as:

```dotenv
MOUNT_LIBRARY_MEDIA_SERVER=...
MOUNT_LIBRARY_ONEPACERR=...
MOUNT_DOWNLOADS_TORRENT=...
MOUNT_DOWNLOADS_ONEPACERR=...
```

Avoid introducing platform-specific path assumptions without considering mapped or translated paths.

---

## Reporting bugs

A useful bug report should include:

- Pacearr version or commit;
- installation method;
- operating system or NAS platform;
- Docker version if applicable;
- media server and version;
- download client and version;
- relevant configuration with secrets removed;
- steps to reproduce the problem;
- expected behaviour;
- actual behaviour;
- relevant logs or error messages;
- whether the problem persists after restarting Pacearr.

For path-related problems, include both the path reported by the external service and the path visible inside the Pacearr container where relevant.

Never post passwords, API keys, access tokens, cookies, private tracker credentials, or other secrets.

---

## Feature requests

Feature requests are welcome, but please check [ROADMAP.md](ROADMAP.md) first.

If the feature is already planned, an issue can still be useful for discussing implementation details or specific requirements.

A good feature request explains:

- the problem being solved;
- the desired behaviour;
- why the existing behaviour is insufficient;
- any compatibility concerns;
- whether the feature affects the API, Web UI, download clients, media servers, release discovery, or persistent configuration.

---

## Pull requests

Keep pull requests focused and reviewable.

A pull request should:

- explain what changed;
- explain why the change is needed;
- identify relevant issues where applicable;
- describe how the change was tested;
- mention anything that was not tested;
- call out configuration or migration implications;
- update documentation when user-facing behaviour changes.

Avoid combining unrelated refactors, formatting changes, dependency upgrades, and feature work into one pull request unless they genuinely need to be delivered together.

Large formatting-only changes make functional reviews harder and should generally be separate from behavioural changes.

---

## Commit messages

Use concise commit messages that describe the purpose of the change.

Examples:

```text
Improve Plex scan recovery
Add Pacearr development roadmap
Handle missing Deluge torrent during cleanup
Document Windows Plex path mapping
```

Prefer meaningful messages over generic messages such as:

```text
Update files
Fix stuff
Changes
```

A clean history makes debugging and future migration work easier.

---

## Documentation

Documentation changes are treated as part of the application.

When behaviour changes, check whether updates are needed in:

- `README.md`;
- `ROADMAP.md`;
- `CHANGELOG.md`;
- sample environment files;
- migration documentation;
- comments describing compatibility-sensitive behaviour.

Documentation must not claim that a roadmap feature already exists when it has not been implemented.

Historical OnePacerr documentation is preserved under `docs/legacy/` and should remain historical rather than being rewritten to describe current Pacearr behaviour.

---

## Dependencies

Avoid adding dependencies without a clear reason.

When introducing a dependency:

- explain why existing dependencies or platform functionality are insufficient;
- prefer actively maintained packages;
- consider image size and runtime impact;
- consider security implications;
- update both `package.json` and `package-lock.json`.

Do not make unrelated dependency upgrades as part of an otherwise focused bug fix unless required.

---

## Security

Do not publish security-sensitive vulnerabilities in a way that unnecessarily exposes users before a fix can be prepared.

Never include real credentials or tokens in issues, logs, tests, screenshots, examples, or commits.

If you accidentally commit a secret, assume it has been compromised and rotate it immediately. Removing it from the latest commit alone does not make the exposed credential safe again.

---

## Attribution and project history

Pacearr originated from [OnePacerr](https://github.com/eltharynd/OnePacerr), created by [eltharynd](https://github.com/eltharynd).

The project intentionally preserves its upstream history and attribution.

Contributions must not remove upstream copyright notices, license information, historical attribution, or other required notices.

The preserved legacy branch is:

```text
legacy/onepacerr-beta1.3
```

The historical OnePacerr README is stored at:

```text
docs/legacy/ONEPACERR-README.md
```

Pacearr is not affiliated with, endorsed by, or maintained by the One Pace team.

---

## Licensing

By contributing code or documentation to this repository, you agree that your contribution may be distributed under the repository's existing license.

See [LICENSE](LICENSE) for the current license terms.

---

## Questions

If you are unsure whether a proposed change fits the current development stage, open an issue describing the idea before investing significant time in implementation.

Focused discussion before a large change is preferable to maintaining multiple incompatible implementations later.

Thank you for helping improve Pacearr.
