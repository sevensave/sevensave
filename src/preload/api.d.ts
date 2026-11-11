import type { Game } from '../shared/catalog'

/** Игра из каталога с адресами арта, которые окно может показать. */
export interface GameView extends Omit<Game, 'art'> {
  art: { icon: string; cover: string; hero: string; screenshots: string[] }
}

export interface ReleaseInfo {
  version: string
  /** Тело релиза: патчноут в markdown. */
  notes: string
  publishedAt: string | null
  /** Есть ли сборка для этого компьютера. */
  available: boolean
  size: number | null
}

export interface InstalledGame {
  version: string
  dir: string
  installedAt: string
}

export interface PlayStats {
  seconds: number
  lastPlayed: string | null
}

export type Job =
  | { phase: 'download'; version: string; received: number; total: number; speed: number }
  | { phase: 'install'; version: string }
  | { phase: 'uninstall' }

export interface Settings {
  /** null — папка по умолчанию внутри данных лаунчера. */
  libraryDir: string | null
  minimizeOnLaunch: boolean
}

export type UpdateState =
  | { state: 'idle' }
  | { state: 'downloading'; version: string }
  | { state: 'ready'; version: string }
  | { state: 'available'; version: string; url: string }
  | { state: 'error'; message: string }

export interface LauncherState {
  version: string
  platform: 'mac' | 'win' | 'other'
  games: GameView[]
  installed: Record<string, InstalledGame>
  play: Record<string, PlayStats>
  releases: Record<string, ReleaseInfo | null>
  /** id игры → что сейчас с ней делаем. */
  jobs: Record<string, Job>
  /** id запущенных игр → время запуска (ms). */
  running: Record<string, number>
  /** Последняя ошибка по игре, показываем под кнопкой. */
  errors: Record<string, string>
  settings: Settings
  defaultLibraryDir: string
  online: boolean
  update: UpdateState
}

/** То, что preload отдаёт окну как window.sevensave. */
export interface SevensaveApi {
  state(): Promise<LauncherState>
  onState(cb: (s: LauncherState) => void): () => void
  /** Установить или обновить до последней версии. */
  install(id: string): Promise<void>
  cancel(id: string): void
  uninstall(id: string): Promise<void>
  play(id: string): Promise<void>
  reveal(id: string): void
  refresh(): Promise<void>
  chooseLibraryDir(): Promise<void>
  resetLibraryDir(): Promise<void>
  setMinimizeOnLaunch(on: boolean): Promise<void>
  installUpdate(): void
  openUpdatePage(): void
}

declare global {
  interface Window {
    sevensave: SevensaveApi
  }
}
