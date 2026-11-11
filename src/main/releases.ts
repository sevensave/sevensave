import { readFile, writeFile } from 'node:fs/promises'
import type { Game } from '../shared/catalog'

export interface Asset {
  name: string
  size: number
  url: string
}

export interface Release {
  version: string
  notes: string
  publishedAt: string | null
  assets: Asset[]
}

export type Platform = 'mac' | 'win' | 'other'

export function currentPlatform(p: NodeJS.Platform = process.platform): Platform {
  return p === 'darwin' ? 'mac' : p === 'win32' ? 'win' : 'other'
}

/**
 * Какой файл из релиза ставить на этот компьютер. Mac — сборка под свой процессор.
 * Windows — только x64: на ARM-ноутбуках она идёт через встроенную эмуляцию.
 */
export function pickAsset(game: Game, release: Release, platform: Platform, arch: string): Asset | null {
  if (platform === 'other') return null
  const template = game.assets[platform]
  if (!template) return null
  const a = platform === 'mac' ? (arch === 'arm64' ? 'arm64' : 'x64') : 'x64'
  const name = template.replaceAll('{version}', release.version).replaceAll('{arch}', a)
  return release.assets.find((x) => x.name === name) ?? null
}

/**
 * Патчноут для игрока: всё до первой черты «---». Ниже в релизах идут инструкции, какой файл
 * качать, и ссылки на GitHub — в лаунчере это лишнее. Ссылки превращаем в простой текст.
 */
export function playerNotes(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const cut = lines.findIndex((l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l))
  return (cut === -1 ? lines : lines.slice(0, cut))
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
}

/** Ответ GitHub API → наш Release. null, если это не похоже на релиз. */
export function parseRelease(data: unknown): Release | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const tag = typeof d.tag_name === 'string' ? d.tag_name : ''
  const version = tag.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null
  const assets = Array.isArray(d.assets) ? d.assets : []
  return {
    version,
    notes: typeof d.body === 'string' ? playerNotes(d.body) : '',
    publishedAt: typeof d.published_at === 'string' ? d.published_at : null,
    assets: assets.flatMap((a: Record<string, unknown>) =>
      typeof a.name === 'string' && typeof a.size === 'number' && typeof a.browser_download_url === 'string'
        ? [{ name: a.name, size: a.size, url: a.browser_download_url }]
        : [],
    ),
  }
}

interface CacheEntry {
  etag: string | null
  release: Release
}

type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>

/**
 * Последние релизы игр с GitHub. Ответ хранится вместе с ETag: повторный запрос с If-None-Match
 * отвечает 304 и не тратит лимит в 60 запросов в час. Без сети отдаём то, что знали раньше.
 */
export class ReleaseFeed {
  private cache: Record<string, CacheEntry> = {}
  private loaded = false

  constructor(
    private file: string,
    private fetcher: Fetch,
  ) {}

  private async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      this.cache = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, CacheEntry>
    } catch {
      this.cache = {}
    }
  }

  cached(repo: string): Release | null {
    return this.cache[repo]?.release ?? null
  }

  async latest(repo: string): Promise<{ release: Release | null; online: boolean }> {
    await this.load()
    const prev = this.cache[repo]
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    if (prev?.etag) headers['If-None-Match'] = prev.etag
    try {
      const res = await this.fetcher(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
      if (res.status === 304 && prev) return { release: prev.release, online: true }
      if (!res.ok) return { release: prev?.release ?? null, online: res.status < 500 }
      const release = parseRelease(await res.json())
      if (!release) return { release: prev?.release ?? null, online: true }
      this.cache[repo] = { etag: res.headers.get('etag'), release }
      await writeFile(this.file, JSON.stringify(this.cache)).catch(() => {})
      return { release, online: true }
    } catch {
      return { release: prev?.release ?? null, online: false }
    }
  }
}
