import { describe, expect, it } from 'vitest'
import type { LauncherState } from '../../../preload/api'
import { gameStatus } from './status'
import { playtime, clock, bytes } from './format'

const base = (): LauncherState => ({
  version: '0.1.0',
  platform: 'mac',
  games: [],
  installed: {},
  play: {},
  releases: { river: { version: '1.8.1', notes: '', publishedAt: null, available: true, size: 100 } },
  jobs: {},
  running: {},
  errors: {},
  settings: { libraryDir: null, minimizeOnLaunch: true },
  defaultLibraryDir: '/x',
  online: true,
  update: { state: 'idle' },
})

describe('gameStatus', () => {
  it('Установить / Обновить / Играть / Запущено', () => {
    const s = base()
    expect(gameStatus(s, 'river').kind).toBe('install')
    s.installed.river = { version: '1.8.0', dir: '/d', installedAt: '' }
    expect(gameStatus(s, 'river')).toMatchObject({ kind: 'update', from: '1.8.0', version: '1.8.1' })
    s.installed.river.version = '1.8.1'
    expect(gameStatus(s, 'river').kind).toBe('play')
    s.running.river = 1
    expect(gameStatus(s, 'river').kind).toBe('running')
  })
  it('нет сборки под платформу — «Скоро», но установленная игра играется', () => {
    const s = base()
    s.releases.river!.available = false
    expect(gameStatus(s, 'river').kind).toBe('soon')
    s.installed.river = { version: '1.8.0', dir: '/d', installedAt: '' }
    expect(gameStatus(s, 'river').kind).toBe('play')
  })
  it('без сети и кэша', () => {
    const s = base()
    s.releases.river = null
    expect(gameStatus(s, 'river').kind).toBe('offline')
  })
  it('загрузка важнее всего', () => {
    const s = base()
    s.jobs.river = { phase: 'download', version: '1.8.1', received: 5, total: 10, speed: 1 }
    expect(gameStatus(s, 'river').kind).toBe('download')
  })
})

describe('format', () => {
  it('время в игре по-русски', () => {
    expect(playtime(0)).toBe('Ещё не играли')
    expect(playtime(61)).toBe('1 минута')
    expect(playtime(22 * 60)).toBe('22 минуты')
    expect(playtime(11 * 60)).toBe('11 минут')
    expect(playtime(3600 * 2)).toBe('2 часа')
    expect(playtime(3600 * 3 + 20 * 60)).toBe('3 ч 20 мин')
  })
  it('часы и размер', () => {
    expect(clock(7000)).toBe('0:07')
    expect(clock(3735000)).toBe('1:02:15')
    expect(bytes(116940060)).toBe('112 МБ')
  })
})
