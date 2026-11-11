import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Game } from '../shared/catalog'
import { ReleaseFeed, currentPlatform, parseRelease, pickAsset, playerNotes, type Release } from './releases'

const game = {
  id: 'river',
  assets: { mac: 'River-{version}-mac-{arch}.zip', win: 'River-{version}-win-x64.zip' },
} as unknown as Game

const names = [
  'River-1.8.1-mac-arm64.zip',
  'River-1.8.1-mac-x64.zip',
  'River-1.8.1-mac-arm64.dmg',
  'River-1.8.1-win-x64.zip',
  'River-Setup-1.8.1.exe',
  'River-1.8.1-portable.exe',
]
const release: Release = { version: '1.8.1', notes: '', publishedAt: null, assets: names.map((name, i) => ({ name, size: i + 1, url: `u/${name}` })) }

describe('pickAsset', () => {
  it('Mac: zip под свой процессор', () => {
    expect(pickAsset(game, release, 'mac', 'arm64')?.name).toBe('River-1.8.1-mac-arm64.zip')
    expect(pickAsset(game, release, 'mac', 'x64')?.name).toBe('River-1.8.1-mac-x64.zip')
  })
  it('Windows: всегда x64, даже на ARM', () => {
    expect(pickAsset(game, release, 'win', 'x64')?.name).toBe('River-1.8.1-win-x64.zip')
    expect(pickAsset(game, release, 'win', 'arm64')?.name).toBe('River-1.8.1-win-x64.zip')
  })
  it('нет zip в релизе — нет сборки («Скоро»)', () => {
    const old = { ...release, version: '1.8.0', assets: release.assets.filter((a) => !a.name.includes('win-x64')).map((a) => ({ ...a, name: a.name.replace('1.8.1', '1.8.0') })) }
    expect(pickAsset(game, old, 'win', 'x64')).toBeNull()
    expect(pickAsset(game, old, 'mac', 'arm64')?.name).toBe('River-1.8.0-mac-arm64.zip')
  })
  it('платформы нет в каталоге или она чужая', () => {
    const macOnly = { ...game, assets: { mac: game.assets.mac } } as Game
    expect(pickAsset(macOnly, release, 'win', 'x64')).toBeNull()
    expect(pickAsset(game, release, 'other', 'x64')).toBeNull()
  })
  it('платформа из process.platform', () => {
    expect(currentPlatform('darwin')).toBe('mac')
    expect(currentPlatform('win32')).toBe('win')
    expect(currentPlatform('linux')).toBe('other')
  })
})

describe('parseRelease', () => {
  it('берёт версию из тега и пропускает кривые ассеты', () => {
    const r = parseRelease({
      tag_name: 'v1.8.0',
      body: '## Что нового',
      published_at: '2026-11-09T10:00:00Z',
      assets: [{ name: 'a.zip', size: 5, browser_download_url: 'https://x/a.zip' }, { name: 'b.zip' }],
    })
    expect(r).toEqual({ version: '1.8.0', notes: '## Что нового', publishedAt: '2026-11-09T10:00:00Z', assets: [{ name: 'a.zip', size: 5, url: 'https://x/a.zip' }] })
  })
  it('не релиз — null', () => {
    expect(parseRelease({ message: 'Not Found' })).toBeNull()
    expect(parseRelease({ tag_name: 'nightly' })).toBeNull()
    expect(parseRelease(null)).toBeNull()
  })
})

describe('ReleaseFeed', () => {
  const body = { tag_name: 'v1.0.0', body: 'x', assets: [] }
  it('второй запрос идёт с ETag и 304 отдаёт кэш', async () => {
    const seen: (string | undefined)[] = []
    const fetcher = async (_u: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers['If-None-Match'])
      return seen.length === 1 ? new Response(JSON.stringify(body), { headers: { etag: '"abc"' } }) : new Response(null, { status: 304 })
    }
    const file = join(mkdtempSync(join(tmpdir(), 'ss-')), 'releases.json')
    const feed = new ReleaseFeed(file, fetcher)
    expect((await feed.latest('o/r')).release?.version).toBe('1.0.0')
    expect((await feed.latest('o/r')).release?.version).toBe('1.0.0')
    expect(seen).toEqual([undefined, '"abc"'])
    // кэш пережил перезапуск
    const again = new ReleaseFeed(file, async () => {
      throw new Error('offline')
    })
    expect(await again.latest('o/r')).toEqual({ release: expect.objectContaining({ version: '1.0.0' }), online: false })
  })
})

describe('playerNotes', () => {
  it('отрезает инструкции по скачиванию и ссылки на GitHub', () => {
    const body = '## Первая партия\r\n\r\n- **Поле.** Две команды, [подробнее](https://github.com/vldvr/namek).\r\n\r\n---\r\n\r\n**Что скачать:** `Namek-Setup.exe` [README](https://github.com/vldvr/namek#readme)'
    const n = playerNotes(body)
    expect(n).toBe('## Первая партия\n\n- **Поле.** Две команды, подробнее.')
    expect(n).not.toMatch(/github|скачать/i)
  })
  it('без черты — весь текст', () => {
    expect(playerNotes('### Исправлено\n- Мелочи')).toBe('### Исправлено\n- Мелочи')
  })
})
