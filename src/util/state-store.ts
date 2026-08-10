import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Logger } from 'ez-ts-logger'
import environment from '../environment.js'

export type EpisodeState =
| 'downloaded'
| 'imported'
| 'verified'
| 'plex_pending'
| 'metadata_pending'
| 'cleanup_pending'
| 'complete'
| 'failed'

export type StoredEpisodeState = {
arc: number
episode: number
torrentHash?: string
state: EpisodeState
filePath?: string
crc32?: string
lastError?: string
updatedAt: string
}

class StateStore {
private db?: DatabaseSync

init() {
if (!environment.STATE_ENABLED) {
Logger.info(`Persistent state disabled...`)
return
}

const dbPath = environment.STATE_DB

mkdirSync(path.dirname(dbPath), {
recursive: true,
})

this.db = new DatabaseSync(dbPath)

this.db.exec(`
CREATE TABLE IF NOT EXISTS episode_state (
arc INTEGER NOT NULL,
episode INTEGER NOT NULL,
torrent_hash TEXT,
state TEXT NOT NULL,
file_path TEXT,
crc32 TEXT,
last_error TEXT,
updated_at TEXT NOT NULL,
PRIMARY KEY (arc, episode)
)
`)

this.db.exec(`
CREATE INDEX IF NOT EXISTS idx_episode_state_state
ON episode_state(state)
`)

this.db.exec(`
CREATE INDEX IF NOT EXISTS idx_episode_state_torrent
ON episode_state(torrent_hash)
`)

Logger.info(
`Persistent OnePacerr state database ready at '${dbPath}'...`,
)
}

private ensureReady(): boolean {
if (!environment.STATE_ENABLED) return false

if (!this.db) this.init()

return !!this.db
}

setEpisodeState(
arc: number,
episode: number,
state: EpisodeState,
options?: {
torrentHash?: string
filePath?: string
crc32?: string
lastError?: string
},
) {
if (!this.ensureReady()) return

this.db!
.prepare(`
INSERT INTO episode_state (
arc,
episode,
torrent_hash,
state,
file_path,
crc32,
last_error,
updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)

ON CONFLICT(arc, episode)
DO UPDATE SET
torrent_hash = COALESCE(excluded.torrent_hash, torrent_hash),
state = excluded.state,
file_path = COALESCE(excluded.file_path, file_path),
crc32 = COALESCE(excluded.crc32, crc32),
last_error = excluded.last_error,
updated_at = excluded.updated_at
`)
.run(
arc,
episode,
options?.torrentHash || null,
state,
options?.filePath || null,
options?.crc32 || null,
options?.lastError || null,
new Date().toISOString(),
)
}

getEpisodeState(
arc: number,
episode: number,
): StoredEpisodeState | undefined {
if (!this.ensureReady()) return

const row = this.db!
.prepare(`
SELECT
arc,
episode,
torrent_hash,
state,
file_path,
crc32,
last_error,
updated_at
FROM episode_state
WHERE arc = ? AND episode = ?
`)
.get(arc, episode) as any

if (!row) return

return {
arc: row.arc,
episode: row.episode,
torrentHash: row.torrent_hash || undefined,
state: row.state as EpisodeState,
filePath: row.file_path || undefined,
crc32: row.crc32 || undefined,
lastError: row.last_error || undefined,
updatedAt: row.updated_at,
}
}

getByState(state: EpisodeState): StoredEpisodeState[] {
if (!this.ensureReady()) return []

const rows = this.db!
.prepare(`
SELECT
arc,
episode,
torrent_hash,
state,
file_path,
crc32,
last_error,
updated_at
FROM episode_state
WHERE state = ?
ORDER BY arc, episode
`)
.all(state) as any[]

return rows.map(row => ({
arc: row.arc,
episode: row.episode,
torrentHash: row.torrent_hash || undefined,
state: row.state as EpisodeState,
filePath: row.file_path || undefined,
crc32: row.crc32 || undefined,
lastError: row.last_error || undefined,
updatedAt: row.updated_at,
}))
}

countByState(): Record<string, number> {
if (!this.ensureReady()) return {}

const rows = this.db!
.prepare(`
SELECT state, COUNT(*) AS count
FROM episode_state
GROUP BY state
`)
.all() as any[]

return Object.fromEntries(
rows.map(row => [row.state, Number(row.count)]),
)
}
}

export const stateStore = new StateStore()
