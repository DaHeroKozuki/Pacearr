import { EpisodeMetadata } from '../metadata/metadata.model'

export type LibraryClient = 'none' | 'plex' | 'jellyfin' | 'emby'
export type TargetLibraryFile = {
	readonly path: string
	readonly filename: string
}

export class LibraryConnectionError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'LibraryConnectionError'
	}
}

export interface ILibraryController {
	readonly libraryClient: LibraryClient

	isHealthy?(): Promise<boolean>

	init()

	getLibraryFolder()

	getExistingLibraryEpisodeFile(
		episode: EpisodeMetadata,
		pathAccordingToMediaServer?: boolean,
	): Promise<string> | string

	getTargetLibraryEpisodeFile(
		episode: EpisodeMetadata,
	): Promise<TargetLibraryFile> | TargetLibraryFile

	scanLibrary(folder: string, arc: number)

	waitForScanCompletion(): Promise<void>

	updateEpisodeMetadata(episode: EpisodeMetadata)

	updateSeasonMetadata(arc: number)

	updateShowMetadata()
}
