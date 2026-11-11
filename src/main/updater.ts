import { app, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { access, constants, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { newer } from '../shared/version'
import type { UpdateState } from '../preload/api'

/** Сборки лаунчера. Игроку адрес не показываем: ссылка «скачать вручную» ведёт на сайт. */
const REPO = 'vldvr/sevensave'
// Домен сайта ещё не выбран: поменять здесь вместе с CNAME в site/.
export const SITE_URL = 'https://sevensave.me'
const run = promisify(execFile)

interface Release {
  version: string
  assets: { name: string; size: number; browser_download_url: string }[]
}

/**
 * Самообновление. Windows: штатный electron-updater (NSIS). Mac: Squirrel без подписи Apple
 * не работает, поэтому качаем zip и подменяем Sevensave.app сами — та же схема, что в играх.
 */
export function initUpdater(send: (s: UpdateState) => void) {
  if (!app.isPackaged) return
  if (process.platform === 'darwin') {
    void macUpdate(send)
    return
  }
  if (process.platform !== 'win32') return
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => send({ state: 'downloading', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => send({ state: 'error', message: err.message }))
  autoUpdater.checkForUpdates().catch(() => {})
}

export function installUpdate() {
  if (process.platform === 'darwin') {
    if (!macPending) return
    swapMacApp(true)
    app.quit()
    return
  }
  electronUpdater.autoUpdater.quitAndInstall(false, true)
}

export function openUpdatePage() {
  void shell.openExternal(SITE_URL)
}

async function fetchLatest(): Promise<Release | null> {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string; assets?: Release['assets'] }
    const version = (data.tag_name ?? '').replace(/^v/, '')
    if (!version || !newer(version, app.getVersion())) return null
    return { version, assets: data.assets ?? [] }
  } catch {
    return null
  }
}

// --- Mac ---

let macPending: { app: string; target: string } | null = null
let macSwapped = false

async function macUpdate(send: (s: UpdateState) => void) {
  const dir = join(app.getPath('userData'), 'pending-update')
  await rm(dir, { recursive: true, force: true }).catch(() => {})
  const rel = await fetchLatest()
  if (!rel) return
  const fallback = () => send({ state: 'available', version: rel.version, url: SITE_URL })

  const target = await writableBundle()
  const asset = rel.assets.find((a) => a.name === `Sevensave-${rel.version}-mac-${process.arch}.zip`)
  if (!target || !asset) return fallback()

  send({ state: 'downloading', version: rel.version })
  try {
    await mkdir(dir, { recursive: true })
    const zip = join(dir, asset.name)
    const res = await net.fetch(asset.browser_download_url)
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(zip))
    if ((await stat(zip)).size !== asset.size) throw new Error('файл скачался не целиком')
    await run('/usr/bin/ditto', ['-x', '-k', zip, dir])
    await rm(zip, { force: true })
    const fresh = join(dir, 'Sevensave.app')
    await run('/usr/bin/codesign', ['--verify', '--deep', fresh])
    macPending = { app: fresh, target }
    app.on('will-quit', () => swapMacApp(false))
    send({ state: 'ready', version: rel.version })
  } catch {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    fallback()
  }
}

/** Путь к Sevensave.app, если его можно заменить (не из dmg, не из карантинной копии, есть права). */
async function writableBundle(): Promise<string | null> {
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return null
  try {
    await access(dirname(bundle), constants.W_OK)
    await access(bundle, constants.W_OK)
    return bundle
  } catch {
    return null
  }
}

/** Отдельный процесс дождётся нашего выхода, переложит новую версию на место старой и, если надо, запустит её. */
function swapMacApp(relaunch: boolean) {
  if (!macPending || macSwapped || !existsSync(macPending.app)) return
  macSwapped = true
  const script = `
pid="$1"; src="$2"; dst="$3"; relaunch="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
new="$dst.new"; old="$dst.old"
rm -rf "$new" "$old"
if /usr/bin/ditto "$src" "$new" && mv "$dst" "$old" && mv "$new" "$dst"; then
  rm -rf "$old"
else
  [ -d "$old" ] && [ ! -d "$dst" ] && mv "$old" "$dst"
  rm -rf "$new"
fi
/usr/bin/xattr -dr com.apple.quarantine "$dst" 2>/dev/null
rm -rf "$(dirname "$src")"
[ "$relaunch" = 1 ] && /usr/bin/open "$dst"
`
  spawn('/bin/sh', ['-c', script, 'sh', String(process.pid), macPending.app, macPending.target, relaunch ? '1' : '0'], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}
