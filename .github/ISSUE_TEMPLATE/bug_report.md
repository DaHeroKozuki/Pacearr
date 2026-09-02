---
name: Bug report
about: Report a reproducible problem with Pacearr
title: "[Bug] "
labels: bug
assignees: ''
---

## Before submitting

Please confirm the following:

- [ ] I have searched existing issues and did not find an existing report for this problem.
- [ ] I am using a supported/current Pacearr release.
- [ ] I have read the relevant documentation.
- [ ] I have removed passwords, API keys, tokens, and other sensitive information from logs and configuration.

## Pacearr version

Provide the Pacearr version or Docker image tag you are running.

Example:

`v0.1.0-alpha`

**Version:**

## Installation environment

Please provide information about the environment where Pacearr is running.

- **Operating system / NAS:**
- **Docker / container platform:**
- **Architecture:** (amd64, arm64, etc.)
- **Pacearr image/tag:**

## Media server

- **Media server:** (Plex / Jellyfin / Emby / None)
- **Media server operating system:**
- **Is the media server running on the same machine as Pacearr?** Yes / No

If different systems or containers are involved, briefly describe the setup.

## Download client

- **Download client:**
- **Download client version:**
- **Is the download client running on the same machine as Pacearr?** Yes / No

## Describe the bug

Provide a clear description of what went wrong.

## Steps to reproduce

Please provide the steps needed to reproduce the problem.

1.
2.
3.
4.

## Expected behaviour

Describe what you expected Pacearr to do.

## Actual behaviour

Describe what Pacearr actually did.

## Relevant configuration

Provide any configuration relevant to the problem.

For example:

~~~env
LIBRARY_MEDIA_SERVER=
LIBRARY_SERIES_NAME=
LIBRARY_SERIES_FOLDER_NAME=
TORRENT_CLIENT=
TORRENT_CATEGORY=
MOUNT_LIBRARY_MEDIA_SERVER=
MOUNT_LIBRARY_ONEPACERR=
MOUNT_DOWNLOADS_TORRENT=
MOUNT_DOWNLOADS_ONEPACERR=
~~~

Do **not** include passwords, API keys, authentication tokens, or other secrets.

## Logs

Paste relevant Pacearr logs below.

~~~text
Paste logs here
~~~

Please include enough log output to show what happened before and after the error.

## Path information

For import, media-server, or download-path problems, provide the relevant paths as seen by each service.

**Pacearr container path:**

~~~text
Example: /library
~~~

**Media server path:**

~~~text
Example: M:\Anime
~~~

**Download client path:**

~~~text
Example: /downloads
~~~

## Additional context

Add anything else that may help diagnose the problem, including screenshots, unusual configuration, recent upgrades, or whether the problem started after a restart/update.
