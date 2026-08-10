import { Logger } from 'ez-ts-logger'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import environment from '../environment.js'
import { EpisodeMetadata } from '../metadata/metadata.model.js'
import { Context } from '../util/context.js'
import resolvePosterPath from '../util/resolve-poster-path.js'
import resolveSeasonPosterFileName from '../util/resolve-season-poster-filename.js'
import resolveSeriesRootFolder, {
	resolveSeasonFolder,
} from '../util/resolve-series-root-folder.js'
import safeCopyFileSync from '../util/safe-copy-file.js'
import sanitizeWindowsFileName from '../util/sanitize-windows-filename.js'
import { EmbyController } from './clients/emby.controller.js'
import { JellyfinController } from './clients/jellyfin.controller.js'
import { LocalFolderController } from './clients/local-folder.controller.js'
import { PlexController } from './clients/plex.controller.js'
import {
	ILibraryController,
	LibraryClient,
	TargetLibraryFile,
} from './library.model.js'

export class LibraryController {
private mapMediaServerPath(filePath: string): string {
return filePath
.replace(
environment.MOUNT_LIBRARY_MEDIA_SERVER,
environment.MOUNT_LIBRARY_ONEPACERR,
)
.replaceAll('\\', '/')
}

	private client: ILibraryController

	private scanLock: Promise<void> = Promise.resolve()

	constructor() {
		switch (environment.LIBRARY_MEDIA_SERVER as LibraryClient) {
			case 'none':
				this.client = new LocalFolderController({
					root: environment.LIBRARY_NONE_ROOT_FOLDER,
				})
				break
			case 'plex':
				this.client = new PlexController({
					baseUrl: environment.PLEX_URL,
					token: environment.PLEX_TOKEN,
				})
				break
			case 'jellyfin':
				this.client = new JellyfinController({
					baseUrl: environment.JELLYFIN_URL,
					username: environment.JELLYFIN_USERNAME,
					password: environment.JELLYFIN_PASSWORD,
				})
				break
			case 'emby':
				this.client = new EmbyController({
					baseUrl: environment.EMBY_URL,
					username: environment.EMBY_USERNAME,
					password: environment.EMBY_PASSWORD,
				})
				break
			default:
				Logger.error(
					`Media Server '${environment.LIBRARY_MEDIA_SERVER}' not implemented yet...`,
				)
				throw new Error()
		}
	}

	async init() {
		await this.client.init()
	}

	async getLibraryFolder() {
		return this.client.getLibraryFolder()
	}

	async getExistingLibraryEpisodeFile(
		episode: EpisodeMetadata,
		pathAccordingToMediaServer?: boolean,
	): Promise<string> {
		const file = await this.client.getExistingLibraryEpisodeFile(
			episode,
			pathAccordingToMediaServer,
		)

		if (!file || pathAccordingToMediaServer) return file

		// Stable build:
		// Convert Media Server paths to the path visible inside OnePacerr.
		// This is required when Plex runs on Windows but OnePacerr runs on Linux.
		return this.mapMediaServerPath(file)
	}

	async getTargetLibraryEpisodeFile(
		episode: EpisodeMetadata,
	): Promise<TargetLibraryFile> {
		return await this.client.getTargetLibraryEpisodeFile(episode)
	}

	async isHealthy(): Promise<boolean> {
		if (!this.client.isHealthy) return true
		return await this.client.isHealthy()
	}

	async scanLibrary(folder: string, arc: number) {
		const previousScan = this.scanLock

		let releaseScan: () => void = () => {}
		this.scanLock = new Promise<void>(resolve => {
			releaseScan = resolve
		})

		await previousScan

		try {
			let libraryFolder = resolveSeriesRootFolder(await this.getLibraryFolder())

		mkdirSync(
			`${path.resolve(`${this.mapMediaServerPath(libraryFolder)}`)}${path.sep}`,
			{ recursive: true },
		)

		if (
			this.client.libraryClient != 'plex' &&
			environment.PLEX_PLEXMATCH_EVEN_IF_NOT
		) {
			let plexmatch = `show: ${environment.LIBRARY_SERIES_NAME}`
			writeFileSync(
				`${path.resolve(`${this.mapMediaServerPath(libraryFolder)}`)}${path.sep}.plexmatch`,
				plexmatch,
			)
		}

		if (
			this.client.libraryClient != 'plex' ||
			!environment.PLEX_SKIP_METADATA_FILES
		)
			writeFileSync(
				`${path.resolve(`${this.mapMediaServerPath(libraryFolder)}`)}${path.sep}tvshow.nfo`,
				Context.metadata.getTVShowNFO(),
			)

			await this.client.scanLibrary(folder, arc)
		} finally {
			releaseScan()
		}
	}

	async waitForScanCompletion(): Promise<void> {
		if (!this.client.waitForScanCompletion) return
		await this.client.waitForScanCompletion()
	}


	async updateEpisodeMetadata(episode: EpisodeMetadata) {
		if (
			this.client.libraryClient != 'plex' ||
			!environment.PLEX_SKIP_METADATA_FILES
		) {
			let folder = resolveSeasonFolder(
				await this.getLibraryFolder(),
				episode.arc,
			)

			mkdirSync(
				`${path.resolve(`${this.mapMediaServerPath(folder)}`)}${path.sep}`,
				{ recursive: true },
			)
			writeFileSync(
				`${path.resolve(`${this.mapMediaServerPath(folder)}`)}${path.sep}${sanitizeWindowsFileName(
					await LibraryController.resolveEpisodeTargetFileName(
						episode.arc,
						episode.episode,
						episode.title,
					),
				)
					.replace('.mkv', '.nfo')
					.replace('.mp4', '.nfo')}`,
				await Context.metadata.getEpisodeNFO(episode.arc, episode.episode),
			)
		}
		await this.client.updateEpisodeMetadata(episode)
	}

	async updateSeasonMetadata(arc: number) {
		if (
			this.client.libraryClient != 'plex' ||
			!environment.PLEX_SKIP_METADATA_FILES
		) {
			let folder = resolveSeasonFolder(await this.getLibraryFolder(), arc)
			let showFolder = path.resolve(
				this.mapMediaServerPath(
					resolveSeriesRootFolder(await this.getLibraryFolder()),
				),
			)

			mkdirSync(
				`${path.resolve(`${this.mapMediaServerPath(folder)}`)}${path.sep}`,
				{ recursive: true },
			)
			writeFileSync(
				`${path.resolve(`${this.mapMediaServerPath(folder)}`)}${path.sep}season.nfo`,
				await Context.metadata.getSeasonNFO(arc),
			)
			if (!environment.PIPELINE_SKIP_POSTERS) {
				if (this.client.libraryClient === 'none') {
					mkdirSync(showFolder, { recursive: true })
					await safeCopyFileSync(
						resolvePosterPath({ arc }),
						`${showFolder}${path.sep}${resolveSeasonPosterFileName(arc)}`,
					)
				} else {
					await safeCopyFileSync(
						resolvePosterPath({ arc }),
						`${path.resolve(`${this.mapMediaServerPath(folder)}`)}${path.sep}poster.png`,
					)
				}
			}
		}

		await this.client.updateSeasonMetadata(arc)
	}

	async updateShowMetadata() {
		if (
			this.client.libraryClient != 'plex' ||
			!environment.PLEX_SKIP_METADATA_FILES
		) {
			if (!environment.PIPELINE_SKIP_POSTERS) {
				let libraryFolder = path.resolve(
					this.mapMediaServerPath(
						resolveSeriesRootFolder(await this.getLibraryFolder()),
					),
				)

				mkdirSync(`${libraryFolder}${path.sep}`, { recursive: true })
				await safeCopyFileSync(
					resolvePosterPath(),
					`${libraryFolder}${path.sep}poster.png`,
				)
			}
		}

		await this.client.updateShowMetadata()
	}

	static resolveEpisodeTargetFileName(
		arc: number,
		episode: number,
		title: string,
	): string {
		const format = environment.LIBRARY_FILENAME_FORMAT
		const variables: Record<string, string> = {
			SERIES_NAME: environment.LIBRARY_SERIES_NAME,
			ARC: String(arc).padStart(2, '0'),
			EPISODE: String(episode).padStart(2, '0'),
			TITLE: title,
		}

		let targetFileName = format.replace(/\{(\w+)\}/g, (match, key) => {
			if (!(key in variables)) {
				throw new Error(
					`Unknown placeholder in LIBRARY_FILENAME_FORMAT: {${key}}`,
				)
			}
			return variables[key]
		})

		if (targetFileName.endsWith('.mkv')) return targetFileName
		else if (targetFileName.endsWith('.mp4')) return targetFileName
		else return targetFileName.replace(/(\.mkv)*$/, '.mkv')
	}
}
