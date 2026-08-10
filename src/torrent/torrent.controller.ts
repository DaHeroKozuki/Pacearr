import { Logger } from 'ez-ts-logger'
import { existsSync, mkdirSync, readdirSync, renameSync, statfsSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import environment from '../environment.js'
import { TargetLibraryFile } from '../library/library.model.js'
import {
	CRCNotInMetadata,
	EpisodeMetadata,
	FileMetadata,
	HashNotInMetadata,
	MetadataAbsentError,
} from '../metadata/metadata.model.js'
import { Context } from '../util/context.js'
import { Filter } from '../util/filters.js'
import safeCopyFileSync from '../util/safe-copy-file.js'
import getFileCrc32Hash from '../util/crc32.js'
import { stateStore } from '../util/state-store.js'
import { DelugeController } from './clients/deluge.controller.js'
import { qBittorrentController } from './clients/qbittorrent.controller.js'
import { TransmissionController } from './clients/transmission.controller.js'
import { UTorrentController } from './clients/utorrent.controller.js'
import {
	ITorrentController,
	QueueDownloadResult,
	Torrent,
	TorrentClient,
	TorrentConnectionError,
} from './torrent.model.js'

export class TorrentController {
	private client: ITorrentController

	private __watching: boolean = false
	private __handler

	// Stable build: imported files awaiting Plex confirmation
	private pendingPlex: {
		episode: EpisodeMetadata
		torrent: Torrent
	}[] = []

	private queuePendingPlex(episode: EpisodeMetadata, torrent: Torrent) {
		const exists = this.pendingPlex.some(
			item =>
				item.torrent.hash === torrent.hash &&
				item.episode.arc === episode.arc &&
				item.episode.episode === episode.episode,
		)

		if (!exists) {
			this.pendingPlex.push({ episode, torrent })
		}

		stateStore.setEpisodeState(
			episode.arc,
			episode.episode,
			'plex_pending',
			{ torrentHash: torrent.hash },
		)
	}

	constructor() {
		if (environment.PIPELINE_SKIP_DOWNLOADS) return

		switch (environment.TORRENT_CLIENT as TorrentClient) {
			case 'qbittorrent':
				this.client = new qBittorrentController({
					baseUrl: environment.TORRENT_URL,
					username: environment.TORRENT_USER,
					password: environment.TORRENT_PASSWORD,
				})
				break
			case 'deluge':
				this.client = new DelugeController({
					baseUrl: environment.TORRENT_URL,
					username: environment.TORRENT_USER,
					password: environment.TORRENT_PASSWORD,
				})
				break
			case 'utorrent':
				this.client = new UTorrentController({
					baseUrl: environment.TORRENT_URL,
					username: environment.TORRENT_USER,
					password: environment.TORRENT_PASSWORD,
				})
				break
			case 'transmission':
				this.client = new TransmissionController({
					baseUrl: environment.TORRENT_URL,
					username: environment.TORRENT_USER,
					password: environment.TORRENT_PASSWORD,
				})
				break
			default:
				Logger.error(
					`Torrent client '${environment.TORRENT_CLIENT}' not implemented yet...`,
				)
				throw new Error()
		}
	}

private async restorePersistentState() {
if (!environment.STATE_ENABLED) return

Logger.info(`Checking persistent state for interrupted work...`)

try {
const torrents = await this.client.getAllTorrents()

const recoverable = [
...stateStore.getByState('plex_pending'),
...stateStore.getByState('metadata_pending'),
]

let restored = 0

for (const stored of recoverable) {
if (!stored.torrentHash) continue

const torrent = torrents.find(
item => item.hash === stored.torrentHash,
)

if (!torrent) {
Logger.warn(
`S${stored.arc}E${String(stored.episode).padStart(2, '0')} has persistent state '${stored.state}' but torrent ${stored.torrentHash} is no longer present`,
)
continue
}

try {
const episode = await Context.metadata.getEpisode(
stored.arc,
stored.episode,
)

this.queuePendingPlex(episode, torrent)
restored++
} catch (e) {
Logger.warn(
`Could not restore S${stored.arc}E${String(stored.episode).padStart(2, '0')} from persistent state`,
)
Logger.debug(e)
}
}

Logger.info(
`Persistent state recovery restored ${restored} Plex-pending episode(s)...`,
)
} catch (e) {
Logger.warn(`Persistent state recovery could not query torrent client...`)
Logger.debug(e)
}
}

private async restoreCleanupPending() {
if (!environment.STATE_ENABLED) return

const pendingCleanup = stateStore.getByState('cleanup_pending')
if (pendingCleanup.length < 1) return

Logger.info(
`Restoring ${pendingCleanup.length} cleanup-pending episode(s) from persistent state...`,
)

try {
const torrents = await this.client.getAllTorrents()

const hashes = [
...new Set(
pendingCleanup
.map(item => item.torrentHash)
.filter(Boolean),
),
]

for (const hash of hashes) {
const torrent = torrents.find(item => item.hash === hash)

if (!torrent) {
Logger.warn(
`Cleanup-pending torrent ${hash} is no longer present in torrent client`,
)
continue
}

try {
if (
environment.TORRENT_CLIENT === 'deluge' &&
this.client instanceof DelugeController
) {
await this.client.removeTorrent(torrent, true)
} else {
await this.client.updateTorrentCategory(
torrent,
environment.TORRENT_CATEGORY_ONCE_COMPLETED,
)
}

for (const item of pendingCleanup.filter(
state => state.torrentHash === hash,
)) {
stateStore.setEpisodeState(
item.arc,
item.episode,
'complete',
{ torrentHash: hash },
)
}

Logger.info(
`Recovered cleanup completed successfully for torrent ${hash}`,
)
} catch (e) {
Logger.warn(
`Recovered cleanup failed for torrent ${hash}; will retry later`,
)
Logger.debug(e)
}
}
} catch (e) {
Logger.warn(`Could not restore cleanup-pending work...`)
Logger.debug(e)
}
}

	public async startWatching() {
		if (environment.PIPELINE_SKIP_DOWNLOADS) return

		if (!this.__watching) {
			Logger.info(
				`Starting to monitor ${this.client.torrentClient} for completed downloads...`,
			)

			this.__watching = true

			await this.restorePersistentState()
			await this.restoreCleanupPending()
			await this.monitorLoop()
		}
	}

	public async stoptWatching() {
		if (environment.PIPELINE_SKIP_DOWNLOADS) return

		if (this.__watching) {
			Logger.info(
				`Stopping to monitor ${this.client.torrentClient} for completed downloads...`,
			)

			this.__watching = false
			if (this.__handler) clearTimeout(this.__handler)
			this.__handler = null

			await this.processCompletedTorrents()
		}
	}

	public async monitorLoop() {
		if (!this.__watching) {
			if (this.__handler) clearTimeout(this.__handler)
			this.__handler = null
			return
		}

		Logger.debug(`Starting torrent processing loop`)
		if (Context.pipeline.isRunning()) {
			await Context.pipeline.waitForFinished()
		}

		try {
			await this.processCompletedTorrents()
		} catch (e) {
			Logger.error(
				`Download process error, will retry in ${environment.TORRENT_CHECK_INTERVAL / 1000} seconds...`,
			)
		} finally {
			if (this.__watching) {
				setTimeout(() => {
					this.monitorLoop()
				}, environment.TORRENT_CHECK_INTERVAL)
			}
		}
	}

	public async queueDownload(
		torrentInfo: FileMetadata,
	): Promise<QueueDownloadResult> {
		if (environment.PIPELINE_SKIP_DOWNLOADS) {
			Logger.debug(`Downloads disabled by env vars`)
			return 'skipped'
		}

		Logger.debug(`Adding magnetURI to ${this.client.torrentClient}...`)
		let torrents = await this.client.getAllTorrents(
			environment.TORRENT_CATEGORY,
		)
		if (torrents.find(t => t.hash === torrentInfo.hash)) {
			Logger.debug(`Torrent already in ${this.client.torrentClient}...`)
			return 'already_present'
		}

		await this.client.addTorrent(torrentInfo, environment.TORRENT_CATEGORY)
		return 'added'
	}

	private async processCompletedTorrents() {
		Logger.debug(`Checking completed torrents`)

		try {
			let completed = await this.client.getCompletedTorrents(
				environment.TORRENT_CATEGORY,
			)

			if (completed.length > 0)
				Logger.debug(`Processing ${completed.length} completed torrents...`)

			for (let torrent of completed) {
				const currentTorrent = torrent as Torrent

				if (
					this.pendingPlex.some(
						item => item.torrent.hash === currentTorrent.hash,
					)
				) {
					Logger.debug(
						`Torrent ${currentTorrent.hash} already imported and awaiting Plex confirmation...`,
					)
					continue
				}

				try {
					await this.importTorrentFiles(currentTorrent)
				} catch (e) {
					Logger.error(
						`Failed processing torrent ${currentTorrent.hash}; continuing with remaining torrents`,
					)
					Logger.error(e)
				}
			}

			// Stable build: one Plex scan after all imports in this cycle.
			await this.processPendingPlexQueue()
		} catch (e) {
			if (e instanceof MetadataAbsentError) {
				Logger.warn(
					`Metadata still missing, cannot process completed torrents...`,
				)
			} else if (e instanceof TorrentConnectionError) {
				Logger.warn(
					`Torrent Client down, could not process completed download...`,
				)
			} else {
				Logger.error(`Error processing completed downloads`)
				Logger.error(e)
			}
		}
	}

	private async processPendingPlexQueue() {
		if (this.pendingPlex.length < 1) return

		let batchNumber = 0

		while (this.pendingPlex.length > 0) {
			batchNumber++

			const totalRemaining = this.pendingPlex.length

			const pending = this.pendingPlex.splice(
				0,
				environment.PLEX_BATCH_SIZE,
			)

			Logger.info(``)
			Logger.info(`##################################`)
			Logger.info(`PLEX QUEUE PROCESSING`)
			Logger.info(`Batch: ${batchNumber}`)
			Logger.info(`Processing: ${pending.length} episode(s)`)
			Logger.info(`Remaining queue: ${Math.max(totalRemaining - pending.length, 0)}`)
			Logger.info(`##################################`)

		if (!(await Context.library.isHealthy())) {
			Logger.warn(`Plex is currently unavailable; deferring ${pending.length} pending episode(s)...`)
			for (const item of pending) this.queuePendingPlex(item.episode, item.torrent)
			return
		}

		try {
			const first = pending[0]
			const target =
				await Context.library.getTargetLibraryEpisodeFile(first.episode)

			// Convert season path to One Pace root path.
			const seriesFolder = target.path.replace(
				/Season [0-9]+[\\/]?$/,
				'',
			)

			Logger.info(
				`Starting one Plex scan for ${pending.length} imported episode(s)...`,
			)

			await Context.library.scanLibrary(
				seriesFolder,
				first.episode.arc,
			)

			await Context.library.waitForScanCompletion()
		} catch (e) {
			Logger.error(`Plex batch scan failed; keeping imports for retry`)
			Logger.error(e)
			for (const item of pending)
				this.queuePendingPlex(item.episode, item.torrent)
			return
		}

		const confirmed: typeof pending = []
		const failed: typeof pending = []

		for (const item of pending) {
			try {
				const plexFile =
					await Context.library.getExistingLibraryEpisodeFile(
						item.episode,
						true,
					)

				if (!plexFile) {
					throw new Error(
						`Plex does not yet report S${item.episode.arc}E${String(item.episode.episode).padStart(2, '0')}`,
					)
				}

				stateStore.setEpisodeState(
					item.episode.arc,
					item.episode.episode,
					'metadata_pending',
					{ torrentHash: item.torrent.hash },
				)

				await Context.library.updateEpisodeMetadata(item.episode)

				stateStore.setEpisodeState(
					item.episode.arc,
					item.episode.episode,
					'cleanup_pending',
					{ torrentHash: item.torrent.hash },
				)

				Logger.info(
					`Plex confirmed and metadata applied to S${item.episode.arc}E${String(item.episode.episode).padStart(2, '0')}`,
				)

				confirmed.push(item)
			} catch (e) {
				Logger.warn(
					`Plex confirmation/metadata deferred for S${item.episode.arc}E${String(item.episode.episode).padStart(2, '0')}`,
				)
				Logger.debug(e)
				stateStore.setEpisodeState(
					item.episode.arc,
					item.episode.episode,
					'plex_pending',
					{
						torrentHash: item.torrent.hash,
						lastError: e instanceof Error ? e.message : String(e),
					},
				)
				failed.push(item)
			}
		}

		// Update each affected season only once.
		const arcs = [...new Set(confirmed.map(item => item.episode.arc))]

		for (const arc of arcs) {
			try {
				await Context.library.updateSeasonMetadata(arc)
			} catch (e) {
				Logger.warn(
					`Season ${arc} metadata/poster update failed; episode imports remain valid`,
				)
				Logger.debug(e)
			}
		}

		// Show metadata only once for the whole batch.
		if (confirmed.length > 0) {
			try {
				await Context.library.updateShowMetadata()
			} catch (e) {
				Logger.warn(
					`Show metadata/poster update failed; episode imports remain valid`,
				)
				Logger.debug(e)
			}
		}

		// Group pending episodes by torrent.
		const torrentGroups = new Map<string, typeof pending>()

		for (const item of pending) {
			const group = torrentGroups.get(item.torrent.hash) || []
			group.push(item)
			torrentGroups.set(item.torrent.hash, group)
		}

		for (const [hash, group] of torrentGroups.entries()) {
			const allConfirmed = group.every(item =>
				confirmed.some(
					confirmedItem =>
						confirmedItem.torrent.hash === item.torrent.hash &&
						confirmedItem.episode.arc === item.episode.arc &&
						confirmedItem.episode.episode === item.episode.episode,
				),
			)

			if (!allConfirmed) {
				Logger.warn(
					`Torrent ${hash} retained because Plex has not confirmed every imported episode`,
				)
				continue
			}

			const torrent = group[0].torrent

			try {
				if (
					environment.TORRENT_CLIENT === 'deluge' &&
					this.client instanceof DelugeController
				) {
					await this.client.removeTorrent(torrent, true)
					Logger.info(
						`Torrent ${hash} removed from Deluge and downloaded data deleted after Plex confirmation`,
					)

					for (const item of group) {
						stateStore.setEpisodeState(
							item.episode.arc,
							item.episode.episode,
							'complete',
							{ torrentHash: hash },
						)
					}
				} else {
					await this.client.updateTorrentCategory(
						torrent,
						environment.TORRENT_CATEGORY_ONCE_COMPLETED,
					)
				}
			} catch (e) {
				Logger.error(
					`Torrent cleanup failed for ${hash}; retaining for retry`,
				)
				Logger.error(e)

				for (const item of group) {
					stateStore.setEpisodeState(
						item.episode.arc,
						item.episode.episode,
						'cleanup_pending',
						{
							torrentHash: item.torrent.hash,
							lastError: e instanceof Error ? e.message : String(e),
						},
					)
				}
			}
		}

		// Retry only Plex/metadata failures next cycle.
		for (const item of failed)
			this.queuePendingPlex(item.episode, item.torrent)

		Logger.info(``)
		Logger.info(`##################################`)
		Logger.info(`PLEX BATCH COMPLETE`)
		Logger.info(`Batch: ${batchNumber}`)
		Logger.info(`Confirmed: ${confirmed.length}`)
		Logger.info(`Remaining queue: ${this.pendingPlex.length}`)
		Logger.info(`##################################`)
		Logger.info(``)

	if (this.pendingPlex.length > 0) {
		Logger.info(
			`Waiting ${environment.PLEX_BATCH_DELAY_SECONDS}s before next Plex batch...`,
		)

		await new Promise<void>(resolve => {
			setTimeout(
				resolve,
				environment.PLEX_BATCH_DELAY_SECONDS * 1000,
			)
		})
	}

	}

	Logger.info(``)
	Logger.info(`##################################`)

	Logger.info(`PLEX QUEUE COMPLETE`)
	Logger.info(`All pending episodes processed`)
	Logger.info(`##################################`)
	Logger.info(``)

	}

private quarantinePartialFile(
partialFile: string,
episode: EpisodeMetadata,
torrent: Torrent,
reason: string,
) {
if (!environment.QUARANTINE_ENABLED) {
if (existsSync(partialFile)) unlinkSync(partialFile)
return
}

try {
mkdirSync(environment.QUARANTINE_DIR, {
recursive: true,
})

const quarantineFile = path.resolve(
environment.QUARANTINE_DIR,
`S${String(episode.arc).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}-${torrent.hash}-${path.basename(partialFile)}`,
)

if (existsSync(quarantineFile)) {
unlinkSync(quarantineFile)
}

if (existsSync(partialFile)) {
renameSync(partialFile, quarantineFile)
}

stateStore.setEpisodeState(
episode.arc,
episode.episode,
'failed',
{
torrentHash: torrent.hash,
filePath: quarantineFile,
lastError: reason,
},
)

Logger.error(
`S${episode.arc}E${String(episode.episode).padStart(2, '0')} moved to quarantine: ${quarantineFile}`,
)
} catch (e) {
Logger.error(
`Failed to quarantine S${episode.arc}E${String(episode.episode).padStart(2, '0')}`,
)
Logger.error(e)

if (existsSync(partialFile)) {
try {
unlinkSync(partialFile)
} catch {}
}
}
}

	private mapDownloadPath(qbPath: string): string {
		return path.resolve(
			qbPath.replace(
				environment.MOUNT_DOWNLOADS_TORRENT,
				environment.MOUNT_DOWNLOADS_ONEPACERR,
			),
		)
	}

	private resolveTorrentContentPath(torrent: Torrent): string {
		const candidates = [torrent.content_path]
		if (torrent.save_path && torrent.name) {
			candidates.push(path.join(torrent.save_path, torrent.name))
		}

		for (const candidate of candidates) {
			const mapped = this.mapDownloadPath(candidate)
			if (existsSync(mapped)) {
				if (candidate !== torrent.content_path) {
					Logger.debug(
						`Resolved torrent content path to '${mapped}' (qBittorrent reported '${torrent.content_path}')`,
					)
				}
				return candidate
			}
		}

		return candidates[0]
	}

	//TODO refactor this method to be more maintainable
	private async importTorrentFiles(torrent: Torrent) {
		const contentPath = this.mapDownloadPath(
			this.resolveTorrentContentPath(torrent),
		)

		let files: string[] = []

		if (contentPath.endsWith('.mkv') || contentPath.endsWith('.mp4')) {
			files = [contentPath]
			Logger.debug(`Processing 1 torrent file...`)
		} else {
			let mkvs = readdirSync(contentPath).filter(
				f => f.endsWith('.mkv') || f.endsWith('.mp4'),
			)
			if (mkvs.length > 0)
				Logger.debug(`Processing ${mkvs.length} torrent files...`)
			for (let f of mkvs) {
				files.push(path.join(contentPath, f))
			}
		}

		let processed = false

		for (let file of files) {
			let match = file.match(/\[([0-9A-F]{8})\]\.(mkv|mp4)$/i)

			if (!match && file.includes('316829437')) {
				match = file
					.replace('316829437', '964FB36B')
					.match(/\[([0-9A-F]{8})\]\.(mkv|mp4)$/i)
				Logger.debug(`Punk Hazard 13 manual correction attempt`)
			}

			let episode: EpisodeMetadata
			let CRC32

			if (!match) {
				try {
					episode = await Context.metadata.findEpisodeByHash(torrent.hash)
					CRC32 = Context.metadata.findCRC32(episode.arc, episode.episode)
				} catch (e) {
					if (e instanceof MetadataAbsentError) {
						throw e
					} else if (e instanceof HashNotInMetadata) {
						Logger.debug(
							`File '${file}' is not most up to date (probably part of an outdated batch)... Skipping import`,
						)
						continue
					}
				}
				if (!episode) {
					Logger.error(`No CRC32 found in file name: ${file}`)
					continue
				}
			} else {
				CRC32 = match[1].toUpperCase()
				Logger.debug(`Parsed CRC32: ${CRC32}`)

				try {
					episode = await Context.metadata.findEpisodeByCRC32(CRC32)
				} catch (e) {
					if (e instanceof MetadataAbsentError) {
						throw e
					} else if (e instanceof CRCNotInMetadata) {
						Logger.debug(
							`File '${file}' is not most up to date (probably part of an outdated batch)... Skipping import`,
						)
						continue
					}
				}
			}

			if (!Filter(episode)) {
				Logger.debug(
					`File for S${String(episode.arc).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')} skipped due to filters...`,
				)
				continue
			} else processed = true

			let targetCRC32 = await Context.metadata.findCRC32(
				episode.arc,
				episode.episode,
			)

			if (targetCRC32 != CRC32) {
				Logger.debug(
					`File '${file}' is not most up to date (probably part of an outdated batch)... Skipping import`,
				)
				continue
			}

			let targetLibraryFile: TargetLibraryFile =
				await Context.library.getTargetLibraryEpisodeFile(episode)

// FIX: Normalize Windows Plex paths when OnePacerr runs on Linux
const targetLibraryPath = targetLibraryFile.path
.replace(
environment.MOUNT_LIBRARY_MEDIA_SERVER,
environment.MOUNT_LIBRARY_ONEPACERR,
)
.replaceAll('\\', '/')


			let previousLibraryFileName

			try {
				let existingLibraryFiles = readdirSync(
					path.resolve(targetLibraryPath),
				)
				for (let existingFile of existingLibraryFiles.filter(
					f => f.endsWith('.mkv') || f.endsWith('.mp4'),
				)) {
					let episodeNumber = existingFile
						.replace(/^.+S[0-9][0-9]E/, '')
						.replace(/\ .+$/, '')
					if (Number.parseInt(episodeNumber) == episode.episode) {
						previousLibraryFileName = existingFile
					}
				}
			} catch (e) {
				Logger.debug('File did not exist on Media Server...')
			}

			const source = file
			const destinationFolder = path.resolve(targetLibraryPath)
			const destination = path.resolve(
				destinationFolder,
				targetLibraryFile.filename,
			)
			const partialDestination = `${destination}.partial`

			// Stable build: filesystem is authoritative for imported files.
			// Never copy an identical destination again just because Plex is behind.
			if (existsSync(destination)) {
				try {
					const sourceSize = statSync(source).size
					const destinationSize = statSync(destination).size

					if (sourceSize === destinationSize) {
						Logger.info(
							`S${episode.arc}E${String(episode.episode).padStart(2, '0')} already exists in library and matches source size; duplicate copy skipped`,
						)
						stateStore.setEpisodeState(
							episode.arc,
							episode.episode,
							'verified',
							{
								torrentHash: torrent.hash,
								filePath: destination,
								crc32: CRC32,
							},
						)
						this.queuePendingPlex(episode, torrent)
						continue
					}
				} catch (e) {
					Logger.warn(`Could not verify existing destination; normal import will continue`)
				}
			}

			Logger.debug(
				`File for S${String(episode.arc).padStart(2, '0')}-${String(episode.episode).padStart(2, '0')} detected`,
			)
			if (!environment.PIPELINE_SKIP_DOWNLOADS_IMPORTS) {
				if (previousLibraryFileName) {
					const toDelete = path.resolve(targetLibraryPath, previousLibraryFileName)
					try {
						unlinkSync(toDelete)
						Logger.debug(
							`Pre-existing file for S${String(episode.arc).padStart(2, '0')}-${String(episode.episode).padStart(2, '0')} deleted`,
						)
					} catch (e) {
						Logger.error(
							`Couldn't delete '${previousLibraryFileName}', it probably has been deleted already but Media Server didn't scan the library...`,
						)
					}
				}

				Logger.debug(
					`Copying file for S${String(episode.arc).padStart(2, '0')}-${String(episode.episode).padStart(2, '0')}`,
				)

				mkdirSync(destinationFolder, {
					recursive: true,
				})

				const fsStats = statfsSync(destinationFolder)
				const availableBytes = Number(fsStats.bavail) * Number(fsStats.bsize)
				const sourceBytes = statSync(source).size
				const reserveBytes = environment.MIN_FREE_SPACE_GB * 1024 * 1024 * 1024

				if (availableBytes - sourceBytes < reserveBytes) {
					throw new Error(`Insufficient free space for S${episode.arc}E${String(episode.episode).padStart(2, '0')}: ${(availableBytes / 1024 / 1024 / 1024).toFixed(2)} GB available, ${environment.MIN_FREE_SPACE_GB} GB reserve required`)
				}

				if (existsSync(partialDestination)) unlinkSync(partialDestination)

				await safeCopyFileSync(source, partialDestination)

				const sourceSize = statSync(source).size
				const partialSize = statSync(partialDestination).size

				if (sourceSize !== partialSize) {
					const reason = `Atomic import verification failed for S${episode.arc}E${String(episode.episode).padStart(2, '0')}: source size ${sourceSize}, copied size ${partialSize}`
					this.quarantinePartialFile(partialDestination, episode, torrent, reason)
					throw new Error(reason)
				}

				const partialCRC32 = await getFileCrc32Hash(partialDestination)

				if (partialCRC32 !== CRC32) {
					const reason = `CRC verification failed for S${episode.arc}E${String(episode.episode).padStart(2, '0')}: expected ${CRC32}, copied ${partialCRC32}`
					this.quarantinePartialFile(partialDestination, episode, torrent, reason)
					throw new Error(reason)
				}

				renameSync(partialDestination, destination)

				Logger.info(
					`File for S${String(episode.arc).padStart(2, '0')}-${String(episode.episode).padStart(2, '0')} imported successfully`,
				)
				// Stable build: persist successful import before Plex processing.
				stateStore.setEpisodeState(
					episode.arc,
					episode.episode,
					'imported',
					{
						torrentHash: torrent.hash,
						filePath: destination,
						crc32: CRC32,
					},
				)

				// Defer Plex work until the import batch finishes.
				this.queuePendingPlex(episode, torrent)
				Logger.debug(
					`S${episode.arc}E${String(episode.episode).padStart(2, '0')} queued for Plex batch confirmation`,
				)
			} else {
				Logger.info(
					`File for S${String(episode.arc).padStart(2, '0')}-${String(episode.episode).padStart(2, '0')} skipped due to 'PIPELINE_SKIP_DOWNLOADS_IMPORTS'...`,
				)
			}
		}

		// Stable build: torrent is only moved/removed after Plex confirmation.
	}
}
