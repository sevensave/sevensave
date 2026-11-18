import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { createGunzip } from 'node:zlib'
import { z } from 'zod'
import { fs, fsp } from './fsx'
import { Cancelled, extract, verify } from './installer'
import type { Asset, Platform } from './releases'

const run = promisify(execFile)
const BLOCK = 256 * 1024
// Только относительные пути пакета Windows, без потоков NTFS и имён устройств.
const gamePath = z.string().refine((s) => s.split('/').every((part) =>
  part.length > 0 && !/[<>:"\\|?*\x00-\x1f]|[ .]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part),
))
const manifest = z.object({
  format: z.literal(1),
  directories: z.array(gamePath),
  files: z.array(z.object({
    path: gamePath, size: z.int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
    changed: z.array(z.int().nonnegative()),
  })),
})

async function applyWindows(payload: string, installed: string, game: string, staging: string, signal: AbortSignal) {
  const parts = join(staging, 'parts')
  await extract(payload, parts, 'win')
  const tree = manifest.parse(JSON.parse(await fsp.readFile(join(parts, 'manifest.json'), 'utf8')))
  const base = await fsp.realpath(installed)
  for (const path of tree.directories) await fsp.mkdir(join(game, path), { recursive: true })
  for (const [i, file] of tree.files.entries()) {
    signal.throwIfAborted()
    const count = Math.ceil(file.size / BLOCK)
    if (file.changed.some((n, j) => n >= count || (j > 0 && n <= file.changed[j - 1]!))) throw new Error('Неверные номера блоков')
    const dest = join(game, file.path)
    await fsp.mkdir(dirname(dest), { recursive: true })
    const reuse = file.changed.length < count
    if (reuse) {
      const source = await fsp.realpath(join(base, file.path))
      const rel = relative(base, source)
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Файл вне папки установки')
      await fsp.copyFile(source, dest, fs.constants.COPYFILE_EXCL)
    }
    const handle = await fsp.open(dest, reuse ? 'r+' : 'wx')
    try {
      for (const n of file.changed) {
        signal.throwIfAborted()
        const data = await fsp.readFile(join(parts, 'blocks', `${i}-${n}`))
        const offset = n * BLOCK
        if (data.length !== Math.min(BLOCK, file.size - offset)) throw new Error('Неверный размер блока')
        const { bytesWritten } = await handle.write(data, 0, data.length, offset)
        if (bytesWritten !== data.length) throw new Error('Не удалось записать блок')
      }
      await handle.truncate(file.size)
    } finally {
      await handle.close()
    }
    const hash = createHash('sha256')
    await pipeline(fs.createReadStream(dest), hash, { signal })
    if (hash.digest('hex') !== file.sha256) throw new Error('Файл игры не совпал с релизом')
  }
}

interface Update {
  installed?: string
  executable: string
  version: string
  platform: Platform
  staging: string
  full: Asset
  patch: Asset | null
  signal: AbortSignal
  transfer: (file: Asset, dest: string) => Promise<void>
}

/** Возвращает проверенную игру в staging; swapInstall вызывается только после успеха. */
export async function stageGame({ installed, executable, version, platform, staging, full, patch, signal, transfer }: Update) {
  const game = join(staging, 'game')
  const payload = join(staging, 'download')
  if (installed && patch) {
    try {
      await transfer(patch, payload)
      if (platform === 'mac') {
        const bundle = join(game, executable)
        const batch = join(staging, 'update.rsync')
        await pipeline(fs.createReadStream(payload), createGunzip(), fs.createWriteStream(batch), { signal })
        await fsp.mkdir(game)
        await run('/usr/bin/ditto', [join(installed, executable), bundle], { signal })
        await run('/usr/bin/rsync', ['-rlptc', '--delete', `--read-batch=${batch}`, bundle + '/'], { signal })
        await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { signal })
        const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(bundle, 'Contents/Info.plist')], { signal })
        if (stdout.trim() !== version) throw new Error('Версия приложения не совпала')
      } else {
        await applyWindows(payload, installed, game, staging, signal)
        await verify(game, executable, platform)
      }
      return game
    } catch (error) {
      if (signal.aborted || error instanceof Cancelled) throw new Cancelled()
      console.warn('Не удалось применить патч, загружаем полный ZIP', error)
      await fsp.rm(staging, { recursive: true, force: true })
      await fsp.mkdir(staging, { recursive: true })
    }
  }
  await transfer(full, payload)
  await extract(payload, game, platform)
  await verify(game, executable, platform)
  return game
}
