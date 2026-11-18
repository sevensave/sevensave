import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stageGame } from './gameUpdate'
import { Cancelled, download } from './installer'
import { pickPatch, type Asset, type Release } from './releases'

describe('обновление установленной игры', () => {
  let dir: string
  let full: Asset
  let patch: Asset
  let release: Release
  const block = Buffer.alloc(256 * 1024, 42)
  const next = Buffer.concat([block, Buffer.from('новый хвост')])
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

  async function pack(name: string, folder: string, entries: string[]): Promise<Asset> {
    const url = join(dir, name)
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'zipfile', '-c', url, ...entries], { cwd: folder })
    const data = await readFile(url)
    return { name, url, size: data.length, digest: 'sha256:' + sha(data) }
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ss-patch-'))
    const seed = join(dir, 'seed')
    await mkdir(join(seed, 'blocks'), { recursive: true })
    await writeFile(join(seed, 'Game.exe'), next)
    // Случайное содержимое не сжимается до размера заголовка маленького тестового патча.
    const deck = randomBytes(8192)
    await writeFile(join(seed, 'deck'), deck)
    full = await pack('Game-2.0.0-win-x64.zip', seed, ['Game.exe', 'deck'])
    await writeFile(join(seed, 'blocks/0-1'), next.subarray(block.length))
    await writeFile(join(seed, 'manifest.json'), JSON.stringify({ format: 1, directories: [], files: [
      { path: 'Game.exe', size: next.length, sha256: sha(next), changed: [1] },
      { path: 'deck', size: deck.length, sha256: sha(deck), changed: [] },
    ] }))
    patch = await pack(`Game-2.0.0-win-x64-from-1.0.0-${full.digest!.slice(7)}.blocks.zip`, seed, ['manifest.json', 'blocks'])
    release = { version: '2.0.0', assets: [full, patch], notes: '', publishedAt: null }
  })

  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

  async function update(mode: 'normal' | 'first' | 'bad-base' | 'bad-patch' | 'cancel') {
    const stage = await mkdtemp(join(dir, 'stage-'))
    const installed = await mkdtemp(join(dir, 'old-'))
    const old = Buffer.concat([block, Buffer.from('старый хвост подлиннее')])
    await writeFile(join(installed, 'Game.exe'), old)
    await writeFile(join(installed, 'obsolete'), 'из старой версии')
    const deck = await readFile(join(dir, 'seed', 'deck'))
    await writeFile(join(installed, 'deck'), mode === 'bad-base' ? Buffer.alloc(deck.length) : deck)
    const ac = new AbortController()
    const requests: string[] = []
    const ready = stageGame({
      staging: stage, installed: mode === 'first' ? undefined : installed, full,
      patch: pickPatch(full, release, 'win', mode === 'first' ? undefined : '1.0.0'),
      platform: 'win', version: release.version, executable: 'Game.exe', signal: ac.signal,
      transfer: async (file, dest) => {
        requests.push(file.name)
        const data = await readFile(file.url)
        if (mode === 'bad-patch' && file === patch) data[0] = 0
        await download(async () => new Response(new Uint8Array(data)), file.url, dest, file.size, ac.signal,
          () => { if (mode === 'cancel') ac.abort() }, file.digest)
      },
    })
    if (mode === 'cancel') await expect(ready).rejects.toBeInstanceOf(Cancelled)
    else {
      const game = await ready
      expect((await readdir(game)).sort()).toEqual(['Game.exe', 'deck'])
      expect((await readFile(join(game, 'Game.exe'))).equals(next)).toBe(true)
      expect((await readFile(join(game, 'deck'))).equals(deck)).toBe(true)
    }
    expect((await readFile(join(installed, 'Game.exe'))).equals(old)).toBe(true)
    return requests
  }

  it('повторно использует блоки, убирает устаревшие файлы и обрезает укороченный файл', async () => {
    expect(await update('normal')).toEqual([patch.name])
  })
  it('для первой установки берёт только полный архив', async () => {
    expect(await update('first')).toEqual([full.name])
  })
  it.each(['bad-base', 'bad-patch'] as const)('переходит на полный ZIP при ошибке %s', async (mode) => {
    expect(await update(mode)).toEqual([patch.name, full.name])
  })
  it('отмена не запускает повторную загрузку', async () => {
    expect(await update('cancel')).toEqual([patch.name])
  })
  it('игнорирует патчи для другой базы, платформы или пересобранного релиза', () => {
    expect(pickPatch(full, release, 'win', '0.9.0')).toBeNull()
    expect(pickPatch(full, release, 'mac', '1.0.0')).toBeNull()
    expect(pickPatch({ ...full, digest: 'sha256:' + '0'.repeat(64) }, release, 'win', '1.0.0')).toBeNull()
  })
})

it.skipIf(process.platform !== 'darwin')('применяет macOS-патч к копии подписанной игры', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ss-mac-patch-'))
  try {
    for (const version of ['1.0.0', '2.0.0']) {
      const bundle = join(dir, version, 'Game.app')
      await mkdir(join(bundle, 'Contents/MacOS'), { recursive: true })
      await copyFile('/bin/echo', join(bundle, 'Contents/MacOS/Game'))
      await writeFile(join(bundle, 'Contents/Info.plist'), `<plist version="1.0"><dict>
        <key>CFBundleIdentifier</key><string>test.sevensave.game</string>
        <key>CFBundleExecutable</key><string>Game</string><key>CFBundlePackageType</key><string>APPL</string>
        <key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`)
      execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', bundle], { stdio: 'pipe' })
    }
    const batch = join(dir, 'batch')
    execFileSync('/usr/bin/rsync', ['-rlptc', '--delete', '--no-whole-file', '--only-write-batch=' + batch,
      join(dir, '2.0.0/Game.app') + '/', join(dir, '1.0.0/Game.app') + '/'])
    const bytes = gzipSync(await readFile(batch))
    const staging = join(dir, 'staging')
    await mkdir(staging)
    const patch = { name: 'patch', size: bytes.length, url: 'patch' }
    const ready = await stageGame({
      platform: 'mac', executable: 'Game.app', version: '2.0.0', installed: join(dir, '1.0.0'),
      staging, full: { ...patch, name: 'full' }, patch, signal: new AbortController().signal,
      transfer: async (file, dest) => { expect(file).toBe(patch); await writeFile(dest, bytes) },
    })
    expect(await readFile(join(ready, 'Game.app/Contents/Info.plist'), 'utf8')).toContain('2.0.0')
    expect(await readFile(join(dir, '1.0.0/Game.app/Contents/Info.plist'), 'utf8')).toContain('1.0.0')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
