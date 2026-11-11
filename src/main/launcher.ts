import { app, net, shell } from 'electron'
import { fs, fsp } from './fsx'
import { join } from 'node:path'
import type { Catalog, Game } from '../shared/catalog'
import { newer } from '../shared/version'
import { loadCatalog, refreshCatalog, toView } from './catalog'
import { Cancelled, STAGING, download, extract, recover, swapInstall, verify } from './installer'
import { ReleaseFeed, currentPlatform, pickAsset, type Release } from './releases'
import { Runner } from './runner'
import { JsonFile, parseInstalled, parseSettings, type InstalledFile } from './store'
import type { Job, LauncherState, Settings, UpdateState } from '../preload/api'

/** Всё состояние лаунчера в одном месте; окно получает его целиком при каждом изменении. */
export class Launcher {
  private catalog!: Catalog
  private releases: Record<string, Release | null> = {}
  private jobs: Record<string, Job> = {}
  private aborts = new Map<string, AbortController>()
  private errors: Record<string, string> = {}
  private online = true
  private update: UpdateState = { state: 'idle' }
  private platform = currentPlatform()
  private installed: JsonFile<InstalledFile>
  private settings: JsonFile<Settings>
  private feed: ReleaseFeed
  private runner: Runner
  private pushTimer: NodeJS.Timeout | null = null

  constructor(
    private push: (s: LauncherState) => void,
    private onLaunch: () => void,
  ) {
    const data = app.getPath('userData')
    this.installed = new JsonFile(join(data, 'installed.json'), { games: {}, play: {} }, parseInstalled)
    this.settings = new JsonFile(join(data, 'settings.json'), { libraryDir: null, minimizeOnLaunch: true }, parseSettings)
    this.feed = new ReleaseFeed(join(data, 'releases.json'), (url, init) => net.fetch(url, init))
    this.runner = new Runner(
      () => this.changed(),
      (id, s) => {
        const p = (this.installed.value.play[id] ??= { seconds: 0, lastPlayed: null })
        p.seconds += s
        p.lastPlayed = new Date().toISOString()
        void this.installed.save()
        this.changed()
      },
    )
  }

  async init() {
    this.catalog = await loadCatalog()
    for (const g of this.catalog.games) this.releases[g.id] = this.feed.cached(g.repo)
    // Папки игр, пропавшие с диска (удалили руками), считаем неустановленными.
    for (const [id, g] of Object.entries(this.installed.value.games)) {
      if (!fs.existsSync(g.dir)) delete this.installed.value.games[id]
    }
    await recover(this.library())
    void this.refresh()
  }

  defaultLibrary(): string {
    return join(app.getPath('userData'), 'games')
  }

  library(): string {
    return this.settings.value.libraryDir ?? this.defaultLibrary()
  }

  state(): LauncherState {
    return {
      version: app.getVersion(),
      platform: this.platform,
      games: this.catalog.games.map(toView),
      installed: this.installed.value.games,
      play: this.installed.value.play,
      releases: Object.fromEntries(
        this.catalog.games.map((g) => {
          const r = this.releases[g.id]
          if (!r) return [g.id, null]
          const asset = pickAsset(g, r, this.platform, process.arch)
          return [g.id, { version: r.version, notes: r.notes, publishedAt: r.publishedAt, available: !!asset, size: asset?.size ?? null }]
        }),
      ),
      jobs: this.jobs,
      running: this.runner.running(),
      errors: this.errors,
      settings: this.settings.value,
      defaultLibraryDir: this.defaultLibrary(),
      online: this.online,
      update: this.update,
    }
  }

  /** Прогресс загрузки идёт часто: шлём не чаще 10 раз в секунду. */
  private changed(now = true) {
    if (now) {
      if (this.pushTimer) clearTimeout(this.pushTimer)
      this.pushTimer = null
      this.push(this.state())
      return
    }
    this.pushTimer ??= setTimeout(() => {
      this.pushTimer = null
      this.push(this.state())
    }, 100)
  }

  setUpdate(s: UpdateState) {
    this.update = s
    this.changed()
  }

  async refresh() {
    const fresh = await refreshCatalog()
    if (fresh) this.catalog = fresh
    let online = false
    await Promise.all(
      this.catalog.games.map(async (g) => {
        const r = await this.feed.latest(g.repo)
        online ||= r.online
        if (r.release) this.releases[g.id] = r.release
      }),
    )
    this.online = online
    this.changed()
  }

  private game(id: string): Game {
    const g = this.catalog.games.find((x) => x.id === id)
    if (!g) throw new Error('Такой игры нет в каталоге')
    return g
  }

  /** Установить или обновить до последней версии. Старая версия не трогается, пока новая не готова. */
  async install(id: string) {
    if (this.jobs[id]) return
    const game = this.game(id)
    if (this.runner.isRunning(id)) return this.fail(id, 'Закрой игру, чтобы обновить её')
    delete this.errors[id]
    const ac = new AbortController()
    this.aborts.set(id, ac)
    const prev = this.installed.value.games[id]
    // Обновление ставим туда же, где стоит игра; новую — в текущую папку библиотеки.
    const target = prev?.dir ?? join(this.library(), id)
    const staging = join(target, '..', STAGING, `${id}-${Date.now()}`)
    try {
      this.jobs[id] = { phase: 'download', version: '', received: 0, total: 0, speed: 0 }
      this.changed()
      const { release, online } = await this.feed.latest(game.repo)
      this.online = online
      if (!release) throw new Error('Нет связи: не удалось узнать последнюю версию')
      this.releases[id] = release
      const asset = pickAsset(game, release, this.platform, process.arch)
      if (!asset) throw new Error('Для этого компьютера сборки пока нет')
      if (prev && !newer(release.version, prev.version)) {
        delete this.jobs[id]
        return
      }
      await fsp.mkdir(staging, { recursive: true })
      const zip = join(staging, asset.name)
      const started = Date.now()
      this.jobs[id] = { phase: 'download', version: release.version, received: 0, total: asset.size, speed: 0 }
      await download((u, i) => net.fetch(u, i), asset.url, zip, asset.size, ac.signal, ({ received, total }) => {
        const secs = Math.max(0.5, (Date.now() - started) / 1000)
        this.jobs[id] = { phase: 'download', version: release.version, received, total, speed: received / secs }
        this.changed(false)
      })
      this.jobs[id] = { phase: 'install', version: release.version }
      this.changed()
      const unpacked = join(staging, 'game')
      await extract(zip, unpacked, this.platform)
      await fsp.rm(zip, { force: true })
      const exe = this.platform === 'mac' ? game.executable.mac : game.executable.win
      await verify(unpacked, exe, this.platform)
      if (ac.signal.aborted) throw new Cancelled()
      await fsp.mkdir(join(target, '..'), { recursive: true })
      await swapInstall(unpacked, target)
      this.installed.value.games[id] = { version: release.version, dir: target, installedAt: new Date().toISOString() }
      await this.installed.save()
    } catch (e) {
      if (!(e instanceof Cancelled)) this.errors[id] = e instanceof Error ? e.message : String(e)
    } finally {
      await fsp.rm(staging, { recursive: true, force: true }).catch(() => {})
      // пустую служебную папку тоже убираем; занятую другой загрузкой rmdir не тронет
      await fsp.rmdir(join(staging, '..')).catch(() => {})
      this.aborts.delete(id)
      delete this.jobs[id]
      this.changed()
    }
  }

  cancel(id: string) {
    // После распаковки отмена тоже срабатывает: проверяем сигнал перед заменой.
    this.aborts.get(id)?.abort()
  }

  async uninstall(id: string) {
    const g = this.installed.value.games[id]
    if (!g || this.jobs[id]) return
    if (this.runner.isRunning(id)) return this.fail(id, 'Закрой игру, чтобы удалить её')
    this.jobs[id] = { phase: 'uninstall' }
    this.changed()
    try {
      // Сохранения игр лежат в их собственных данных, не в папке установки, — их не трогаем.
      await fsp.rm(g.dir, { recursive: true, force: true })
      delete this.installed.value.games[id]
      delete this.errors[id]
      await this.installed.save()
    } catch (e) {
      this.errors[id] = `Не удалось удалить: ${e instanceof Error ? e.message : e}`
    } finally {
      delete this.jobs[id]
      this.changed()
    }
  }

  async play(id: string) {
    const g = this.installed.value.games[id]
    if (!g || this.jobs[id] || this.platform === 'other') return
    const game = this.game(id)
    delete this.errors[id]
    try {
      await this.runner.start(id, g.dir, this.platform === 'mac' ? game.executable.mac : game.executable.win, this.platform)
      if (this.settings.value.minimizeOnLaunch) this.onLaunch()
    } catch (e) {
      this.fail(id, e instanceof Error ? e.message : String(e))
    }
  }

  reveal(id: string) {
    const g = this.installed.value.games[id]
    if (g) shell.showItemInFolder(g.dir)
  }

  async setLibraryDir(dir: string | null) {
    this.settings.value.libraryDir = dir
    await this.settings.save()
    if (dir) await recover(dir)
    this.changed()
  }

  async setMinimizeOnLaunch(on: boolean) {
    this.settings.value.minimizeOnLaunch = on
    await this.settings.save()
    this.changed()
  }

  /** Перед выходом: прерываем загрузки, чтобы не остались недокачанные архивы. */
  shutdown() {
    for (const ac of this.aborts.values()) ac.abort()
    this.runner.flushAll()
    try {
      this.installed.saveSync()
    } catch {
      // диск недоступен: время последней сессии потеряется, остальное уже записано
    }
  }

  private fail(id: string, message: string) {
    this.errors[id] = message
    this.changed()
  }
}
