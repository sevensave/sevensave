import { app, net, protocol } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CatalogSchema, type Catalog, type Game } from '../shared/catalog'
import type { GameView } from '../preload/api'

/** Свежий каталог: новая игра появляется у всех без выпуска нового лаунчера. */
export const REMOTE_BASE = 'https://raw.githubusercontent.com/sevensave/sevensave/main/catalog'
export const ASSET_SCHEME = 'sevensave-asset'

/** Каталог, вшитый в сборку. В dev — папка catalog в корне проекта. */
export function bundledDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'catalog') : join(app.getAppPath(), 'catalog')
}

const cacheDir = () => join(app.getPath('userData'), 'catalog')

export function parseCatalog(raw: unknown): Catalog | null {
  const r = CatalogSchema.safeParse(raw)
  return r.success ? r.data : null
}

async function readCatalog(path: string): Promise<Catalog | null> {
  try {
    return parseCatalog(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return null
  }
}

/** Сначала то, что скачали в прошлый раз, иначе встроенный. */
export async function loadCatalog(): Promise<Catalog> {
  const cached = await readCatalog(join(cacheDir(), 'catalog.json'))
  if (cached) return cached
  const bundled = await readCatalog(join(bundledDir(), 'catalog.json'))
  if (!bundled) throw new Error('Встроенный каталог повреждён')
  return bundled
}

/** Тянет каталог из сети. Невалидный или недоступный — молча оставляем прежний. */
export async function refreshCatalog(): Promise<Catalog | null> {
  try {
    const res = await net.fetch(`${REMOTE_BASE}/catalog.json`)
    if (!res.ok) return null
    const text = await res.text()
    const cat = parseCatalog(JSON.parse(text))
    if (!cat) return null
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(join(cacheDir(), 'catalog.json'), text)
    return cat
  } catch {
    return null
  }
}

export function toView(g: Game): GameView {
  const url = (file: string) => `${ASSET_SCHEME}://art/${g.id}/${file}`
  return {
    ...g,
    art: { icon: url(g.art.icon), cover: url(g.art.cover), hero: url(g.art.hero), screenshots: g.art.screenshots.map(url) },
  }
}

export function registerAssetScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true } }])
}

/**
 * Арт игр: из встроенного каталога, иначе из кэша, иначе скачиваем с основного адреса каталога
 * и кладём в кэш. Так у игры, добавленной в каталог по сети, тоже будут картинки.
 */
export function handleAssets() {
  protocol.handle(ASSET_SCHEME, async (req) => {
    const { pathname } = new URL(req.url)
    const m = /^\/([a-z][a-z0-9-]{1,31})\/([\w.-]+\.(?:png|jpe?g|webp))$/.exec(pathname)
    if (!m) return new Response(null, { status: 404 })
    const rel = normalize(join('assets', m[1]!, m[2]!))
    for (const base of [bundledDir(), cacheDir()]) {
      const p = join(base, rel)
      if (existsSync(p)) return net.fetch(pathToFileURL(p).toString())
    }
    try {
      const res = await net.fetch(`${REMOTE_BASE}/assets/${m[1]}/${m[2]}`)
      if (!res.ok) return new Response(null, { status: 404 })
      const buf = Buffer.from(await res.arrayBuffer())
      const p = join(cacheDir(), rel)
      await mkdir(join(p, '..'), { recursive: true })
      await writeFile(p, buf)
      return new Response(buf, { headers: { 'content-type': res.headers.get('content-type') ?? 'image/png' } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
