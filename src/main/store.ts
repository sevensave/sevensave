import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import type { InstalledGame, PlayStats, Settings } from '../preload/api'

/** JSON-файл в userData: читается один раз, пишется атомарно (через временный файл). */
export class JsonFile<T> {
  value: T
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private path: string,
    fallback: T,
    validate: (v: unknown) => T | null,
  ) {
    let v: T | null = null
    try {
      v = validate(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      v = null
    }
    this.value = v ?? fallback
  }

  /** Для выхода из приложения: асинхронная запись может не успеть. */
  saveSync() {
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.value, null, 2))
    renameSync(tmp, this.path)
  }

  save(): Promise<void> {
    const data = JSON.stringify(this.value, null, 2)
    this.writing = this.writing.then(async () => {
      const tmp = `${this.path}.tmp`
      await writeFile(tmp, data)
      await rename(tmp, this.path)
    })
    return this.writing
  }
}

export interface InstalledFile {
  games: Record<string, InstalledGame>
  /** Время в игре храним отдельно: после удаления и переустановки оно не пропадает. */
  play: Record<string, PlayStats>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function parseInstalled(v: unknown): InstalledFile | null {
  if (!isObj(v)) return null
  const games: Record<string, InstalledGame> = {}
  const play: Record<string, PlayStats> = {}
  if (isObj(v.games)) {
    for (const [id, g] of Object.entries(v.games)) {
      if (isObj(g) && typeof g.version === 'string' && typeof g.dir === 'string') {
        games[id] = { version: g.version, dir: g.dir, installedAt: typeof g.installedAt === 'string' ? g.installedAt : '' }
      }
    }
  }
  if (isObj(v.play)) {
    for (const [id, p] of Object.entries(v.play)) {
      if (isObj(p) && typeof p.seconds === 'number') {
        play[id] = { seconds: p.seconds, lastPlayed: typeof p.lastPlayed === 'string' ? p.lastPlayed : null }
      }
    }
  }
  return { games, play }
}

export function parseSettings(v: unknown): Settings | null {
  if (!isObj(v)) return null
  return {
    libraryDir: typeof v.libraryDir === 'string' && v.libraryDir ? v.libraryDir : null,
    minimizeOnLaunch: typeof v.minimizeOnLaunch === 'boolean' ? v.minimizeOnLaunch : true,
  }
}
