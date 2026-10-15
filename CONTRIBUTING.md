# Contributing

Use Node 24. Run npm test and syntax checks before submitting. Preserve scoped-file and authoritative-identity checks, persistent state compatibility, original download preservation and replacement recovery. Never commit real state, tokens or media. Legacy src/ is retained historical code and is not the active runtime.

When bumping an application release, update only the application version and the root package version in `package-lock.json`. Never replace version strings throughout the lockfile: transitive dependency ranges belong to their published packages. Validate with a clean `npm ci --ignore-scripts` before publishing.
