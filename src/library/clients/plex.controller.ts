import { MediaPart, PlexServer, Show, ShowSection } from '@ctrl/plex'
import { Logger } from 'ez-ts-logger'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import WebSocket from 'ws'
import environment from '../../environment.js'
import { EpisodeMetadata } from '../../metadata/metadata.model.js'
import { Context } from '../../util/context.js'
import resolvePosterPath from '../../util/resolve-poster-path.js'
import sanitizeWindowsFileName from '../../util/sanitize-windows-filename.js'
import { LibraryController } from '../library.controller.js'
import {
	ILibraryController,
	LibraryClient,
	TargetLibraryFile,
} from '../library.model.js'

export class PlexController implements ILibraryController {
	libraryClient: LibraryClient = 'plex'

	private server: PlexServer
	private ws: WebSocket

	private section: ShowSection
	private show: Show

	private async plexRetry<T>(
		operation: () => Promise<T>,
		name: string,
	): Promise<T> {
		let attempts = 3
		let delay = 5000

		while (attempts > 0) {
			try {
				return await operation()
			} catch (e) {
				attempts--

				Logger.warn(
					`Plex ${name} failed. Attempts remaining: ${attempts}`,
				)

				if (attempts === 0) {
					throw e
				}

				await new Promise<void>(resolve => {
					setTimeout(resolve, delay)
				})

				delay = Math.min(delay * 2, 30000)
			}
		}
		throw new Error(`Plex ${name} failed`)
	}


	public async isHealthy(): Promise<boolean> {
		try {
			await this.server.library()
			return true
		} catch (e) {
			Logger.warn(`Plex health check failed...`)
			Logger.debug(e)
			return false
		}
	}

private connectWebSocket() {
const wsUrl =
`${environment.PLEX_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/:/websockets/notifications?X-Plex-Token=${environment.PLEX_TOKEN}`

const socket = new WebSocket(wsUrl)
this.ws = socket

socket.on('open', () => {
Logger.debug(`Connected to Plex Live Event Stream`)
})

socket.on('error', error => {
Logger.warn(`Plex WebSocket error; connection will be retried if closed`)
Logger.debug(error)
})

socket.on('close', (code, reason) => {
Logger.warn(
`Plex WebSocket closed (Code: ${code}). Reconnecting in 15 seconds...`,
)

if (this.ws === socket) {
this.ws = null

setTimeout(() => {
this.connectWebSocket()
}, 15000)
}
})
}


	constructor(config: { baseUrl: string; token: string }) {
		if (!config.baseUrl || !config.token) {
			throw new Error(`Plex misconfigured`)
		}
		this.server = new PlexServer(config.baseUrl, config.token)
		this.connectWebSocket()
	}

	async init() {
		Logger.info(`Searching for Plex Library...`)

		let retryDelay = 10000

		while (true) {
			try {
				this.section = await (
					await this.server.library()
				).section<ShowSection>(environment.PLEX_LIBRARY_NAME)

				Logger.info(`Found Plex Library '${this.section.title}'...`)

				await this.plexRetry(
					() => this.fetchShow(),
					"show lookup",
				)
				return
			} catch (e) {
				Logger.warn(
					`Plex unavailable during initialization. Retrying in ${retryDelay / 1000} seconds...`,
				)
				Logger.debug(e)

				await new Promise<void>(resolve =>
					setTimeout(resolve, retryDelay),
				)

				retryDelay = Math.min(retryDelay + 10000, 60000)
			}
		}
	}

	async getLibraryFolder() {
		return await this.section.locations.map(loc => loc.path)[0]
	}

	async getExistingLibraryEpisodeFile(
		episode: EpisodeMetadata,
		pathAccordingToMediaServer?: boolean,
	): Promise<string> {
		let _episode
		try {
			_episode = await this.show.episode({
				season: episode.arc,
				episode: episode.episode,
			})
		} catch (e) {
			Logger.debug(
				`Episode ${episode.arc}-${String(episode.episode).padStart(2, '0')} does not exists on Plex...`,
			)
			return null
		}

		if (_episode.media.length > 1) {
			Logger.error(
				`Episode ${episode.arc}-${String(episode.episode).padStart(2, '0')} has multiple files in Plex, you should probably manually scan the library, delete the trash then relaunch...`,
			)
			//TODO handle automatic resolution perhaps
			throw new Error(
				`Multiple files on plex for Episode ${episode.arc}-${String(episode.episode).padStart(2, '0')}`,
			)
		}
		if (_episode.media.length < 1 || _episode.media[0].parts.length < 1) {
			Logger.info(
				`Episode ${episode.arc}-${String(episode.episode).padStart(2, '0')} exists on plex with no file...`,
			)
			return null
		}

		let part: MediaPart = _episode.media[0].parts[0]

		if (!pathAccordingToMediaServer)
			return path.resolve(
				part.file.replace(
					environment.MOUNT_LIBRARY_MEDIA_SERVER,
					environment.MOUNT_LIBRARY_ONEPACERR,
				),
			)
		else return part.file
	}

	async getTargetLibraryEpisodeFile(
		episode: EpisodeMetadata,
	): Promise<TargetLibraryFile> {
		let plexLibraryPath = await Context.library.getLibraryFolder()
		let plexSeparator = plexLibraryPath.includes('/') ? '/' : '\\'

		let targetPlexFileName = LibraryController.resolveEpisodeTargetFileName(
			episode.arc,
			episode.episode,
			episode.title,
		)
		const seasonFolder = episode.arc === 0 ? 'Specials' : `Season ${String(episode.arc).padStart(2, '0')}`
		let targetPlexPath = `${plexLibraryPath}${plexSeparator}${environment.LIBRARY_SERIES_FOLDER_NAME}${plexSeparator}${seasonFolder}${plexSeparator}`

		return {
			path: targetPlexPath,
			filename: sanitizeWindowsFileName(targetPlexFileName),
		}
	}

	async scanLibrary(folder: string, arc: number) {
		Logger.debug(`Refreshing Library`)

		let plexmatch = `show: ${environment.LIBRARY_SERIES_NAME}`

		// Stable build: normalize Windows Plex path for Linux filesystem access.
		const mappedScanFolder = path.resolve(
			folder
				.replace(
					environment.MOUNT_LIBRARY_MEDIA_SERVER,
					environment.MOUNT_LIBRARY_ONEPACERR,
				)
				.replaceAll('\\', '/'),
		)

		const plexmatchFolder =
			path.basename(mappedScanFolder) === environment.LIBRARY_SERIES_FOLDER_NAME
				? mappedScanFolder
				: path.resolve(mappedScanFolder, '..')

		writeFileSync(
			`${plexmatchFolder}${path.sep}.plexmatch`,
			plexmatch,
		)

		try {
			await new Promise<void>(async (resolve, reject) => {
				const timeout = 60000
				let timeoutHandler
				let callback = async data => {
					let event = JSON.parse(data).NotificationContainer
					if (event.type == 'activity') {
						let notification = event.ActivityNotification[0]
						let activity = notification.Activity
						if (
							activity.title.startsWith('Scanning') &&
							activity.subtitle?.startsWith(
								environment.LIBRARY_SERIES_FOLDER_NAME,
							) &&
							activity.progress >= 100
						) {
							Logger.debug(`Plex notified folder update`)
							if (!this.show)
								await this.plexRetry(
									() => this.fetchShow(),
									"show lookup",
								)
							if (timeoutHandler) clearTimeout(timeoutHandler)
							if (this.ws) {
								this.ws.off('message', callback)
							}
							resolve()
						}
					}
				}
				if (this.ws) {
					this.ws.on('message', callback)
				} else {
					Logger.warn(
						`Plex WebSocket unavailable during scan. Continuing without live notification...`,
					)
					resolve()
				}

				if (this.ws) {
					timeoutHandler = setTimeout(() => {
						Logger.warn(
							`Plex didn't notify folder update before timeout expired...`,
						)

						if (this.ws) {
							this.ws.off('message', callback)
						}

						reject(new PlexSocketNoResponseError())
					}, timeout)
				}
				await this.plexRetry(
					() => this.section.update({ path: folder }),
					"library refresh",
				)
			})
		} catch (e) {
			if (e instanceof PlexSocketNoResponseError) {
				Logger.warn(
					`Assuming Plex is just being Plex and that the library got scanned by now`,
				)
			} else {
				throw e
			}
		}

		// Stable build: allow Plex database/indexing to settle after scan
		Logger.debug(`Waiting 10 seconds for Plex database to settle...`)
		await new Promise<void>(resolve => setTimeout(resolve, 10000))

		// Refresh Plex show object after library changes
		await this.plexRetry(
			() => this.fetchShow(),
			"show lookup",
		)
	}

	async waitForScanCompletion(): Promise<void> {
		const minWait =
			environment.PLEX_SCAN_MIN_WAIT_SECONDS * 1000

		const timeout =
			environment.PLEX_SCAN_TIMEOUT_SECONDS * 1000

		Logger.info(
			`Waiting for Plex scan completion (timeout ${environment.PLEX_SCAN_TIMEOUT_SECONDS}s)...`,
		)

		await new Promise<void>(resolve => {
			setTimeout(resolve, minWait)
		})

		return new Promise<void>((resolve, reject) => {
			let finished = false

			const timeoutHandler = setTimeout(() => {
				if (finished) return

				finished = true

				Logger.warn(
					`Plex scan completion timeout reached; continuing safely`,
				)

				resolve()
			}, timeout)

			const callback = async data => {
				try {
					const event =
						JSON.parse(data).NotificationContainer

					if (
						event?.type === 'activity'
					) {
						const activity =
							event.ActivityNotification?.[0]?.Activity

						if (
							activity?.title?.startsWith('Scanning') &&
							activity.progress >= 100
						) {
							finished = true
							clearTimeout(timeoutHandler)

							if (this.ws) {
								this.ws.off('message', callback)
							}

							Logger.info(
								`Plex scan completed`,
							)

							resolve()
						}
					}
				} catch {}
			}

			if (this.ws) {
				this.ws.on('message', callback)
			} else {
				Logger.warn(
					`Plex WebSocket unavailable while waiting for scan`,
				)
				clearTimeout(timeoutHandler)
				resolve()
			}
		})
	}


	async updateEpisodeMetadata(episode: EpisodeMetadata) {
		Logger.debug(
			`Episode ${episode.arc}-${String(episode.episode).padStart(2, '0')} - Updating Metadata`,
		)

		const attempt = async (attemptsLeft: number) => {
			try {
				Logger.debug(`Metadata update attempt`)

				// Stable build: refresh Plex show object before episode lookup
				await this.plexRetry(
					() => this.fetchShow(),
					"show lookup",
				)

				let _episode = await this.show.episode({
					season: episode.arc,
					episode: episode.episode,
				})

				if (episode.title) {
					if (episode.mangaChapters)
						await _episode.editTitle(
							`[${episode.mangaChapters}] ${episode.title}`,
						)
					else await _episode.editTitle(episode.title)
				}
				await _episode.editSortTitle(String(episode.episode).padStart(4, '0'))
				if (episode.description) await _episode.editSummary(episode.description)
				if (episode.released)
					await _episode.editOriginallyAvailableAt(
						episode.released.split('T')[0],
					)
				return true
			} catch (e) {
				if (attemptsLeft > 1) {
					Logger.debug(
						`Metadata update attempt failed, this could just be due to how plex reports being done scanning (it sucks). Attempting ${attemptsLeft} more times...`,
					)
					return false
				} else {
					Logger.error(e)
					throw e
				}
			}
		}

		let attemptsLeft = 12
		let retryDelay = 5000

		while (attemptsLeft-- > 0) {
			if (await attempt(attemptsLeft)) attemptsLeft = 0

			await new Promise<void>(resolve => {
				setTimeout(() => {
					resolve()
				}, retryDelay)
			})

			retryDelay = Math.min(retryDelay * 2, 30000)
		}
	}

	async updateSeasonMetadata(arc: number) {
		Logger.debug(`Updating Season ${arc} Metadata in Plex...`)
		let _arc = await Context.metadata.getArc(arc)

		let season = await this.show.season(arc)

		//Bypasses a bug in @ctrl/plex
		Object.defineProperty(season, 'librarySectionID', {
			value: this.section.key,
			writable: true,
			configurable: true,
		})

		if (arc > 0) {
			const arcMetadata = Context.metadata.getArc(arc)
			if (arcMetadata.mangaChapters) {
				await season.editTitle(`[${arcMetadata.mangaChapters}] ${arcMetadata.title}`)
			} else {
				await season.editTitle(arcMetadata.title)
			}

			await season.editSummary(`[${arcMetadata.saga} Saga]\n${arcMetadata.description}`)
		} else {
			await season.editTitle('Specials')
			await season.editSummary(_arc.description)
		}
		await season.editSortTitle(String(arc).padStart(3, '0'))

		const meta = Context.metadata.getShow()
		await season.editContentRating(meta.mpaa ? meta.mpaa : meta.customRating)

		if (!environment.PIPELINE_SKIP_POSTERS) {
			Logger.debug(`Updating Season ${arc} poster in Plex...`)
			await season.uploadPoster({
				file: readFileSync(resolvePosterPath({ arc })),
			})
		}
		Logger.debug(
			`Metadata${!environment.PIPELINE_SKIP_POSTERS ? ' and posters' : ''} for Season ${arc} updated...`,
		)
	}

	async updateShowMetadata() {
		Logger.debug(`Updating Show Metadata in Plex...`)
		let show = await Context.metadata.getShow()

		await this.show.editTitle(environment.LIBRARY_SERIES_NAME)
		await this.show.editSummary(show.description)

		if (!environment.PIPELINE_SKIP_POSTERS) {
			Logger.debug(`Updating Show poster in Plex...`)
			await this.show.uploadPoster({
				file: readFileSync(resolvePosterPath()),
			})
		}

		Logger.debug(
			`Metadata${!environment.PIPELINE_SKIP_POSTERS ? ' and posters' : ''} for Show updated...`,
		)
	}

	private async fetchShow() {
		Logger.info(`Searching for Plex Show...`)

		let searchResults = await this.section.search({
			title: environment.LIBRARY_SERIES_NAME,
		})
		if (searchResults.length < 1) {
			if (!environment.LIBRARY_CREATE_SHOW_IF_NOT_FOUND) {
				Logger.error(
					`Could not find show '${environment.LIBRARY_SERIES_NAME}' in library '${environment.PLEX_LIBRARY_NAME}'...`,
				)
				throw new Error('Show not found')
			}
		} else if (searchResults.length > 1) {
			Logger.error(
				`Could not find show '${environment.LIBRARY_SERIES_NAME}' in library '${environment.PLEX_LIBRARY_NAME}'...`,
			)
			throw new Error('Too many shows found')
		}

		if (searchResults[0]) {
			this.show = searchResults[0]
			Logger.info(`Found Plex Show '${this.show.title}'...`)
		}
	}
}

class PlexSocketNoResponseError extends Error {
	constructor(message?: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'PlexSocketNoResponseError'
	}
}
