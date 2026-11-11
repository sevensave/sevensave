import { execFile } from 'node:child_process'
import { fs, fsp } from './fsx'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { Platform } from './releases'

const run = promisify(execFile)

/** Служебные папки внутри библиотеки: на одном диске с играми, чтобы замена была переименованием. */
export const STAGING = '.sevensave-staging'

export class Cancelled extends Error {
  constructor() {
    super('Загрузка отменена')
  }
}

export interface Progress {
  received: number
  total: number
}

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>

/** Скачивает файл потоком. Прерывается сигналом; файл, скачанный не целиком, считается ошибкой. */
export async function download(
  fetcher: Fetch,
  url: string,
  dest: string,
  size: number,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let res: Response
  try {
    res = await fetcher(url, { signal })
  } catch (e) {
    if (signal.aborted) throw new Cancelled()
    throw new Error('Нет связи с сервером загрузки', { cause: e })
  }
  if (!res.ok || !res.body) throw new Error(`Сервер загрузки ответил ${res.status}`)
  let received = 0
  const count = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length
      onProgress({ received, total: size })
      cb(null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(res.body as never), count, fs.createWriteStream(dest), { signal })
  } catch (e) {
    if (signal.aborted) throw new Cancelled()
    throw new Error('Загрузка оборвалась', { cause: e })
  }
  const got = (await fsp.stat(dest)).size
  if (got !== size) throw new Error(`Файл скачался не целиком: ${got} из ${size} байт`)
}

/** Распаковка: на Mac через ditto (сохраняет права и подпись .app), на Windows через extract-zip. */
export async function extract(zip: string, dir: string, platform: Platform): Promise<void> {
  await fsp.mkdir(dir, { recursive: true })
  if (platform === 'mac') {
    await run('/usr/bin/ditto', ['-x', '-k', zip, dir])
    return
  }
  // extract-zip пишет через обычный fs, а в Electron он считает .asar папкой: на resources/app.asar
  // игры-Electron запись зависает навсегда. Пока идёт распаковка, отключаем поддержку asar.
  const { default: extractZip } = await import('extract-zip')
  const proc = process as NodeJS.Process & { noAsar?: boolean }
  const prev = proc.noAsar
  proc.noAsar = true
  try {
    await extractZip(zip, { dir })
  } finally {
    proc.noAsar = prev
  }
}

/** Проверяет распакованную игру: исполняемый файл на месте, на Mac подпись цела. */
export async function verify(dir: string, executable: string, platform: Platform): Promise<void> {
  const path = join(dir, executable)
  if (!fs.existsSync(path)) throw new Error(`В архиве нет ${executable}`)
  if (platform === 'mac') {
    try {
      await run('/usr/bin/codesign', ['--verify', '--deep', path])
    } catch {
      throw new Error('Подпись игры не прошла проверку: архив повреждён')
    }
  }
}

/**
 * Ставит готовую папку на место установленной игры. Старая версия сначала отодвигается в сторону
 * и удаляется только после того, как новая встала; если что-то пошло не так, старая возвращается.
 * Папки staging и target должны лежать на одном диске.
 */
export async function swapInstall(staging: string, target: string): Promise<void> {
  const old = `${target}.old-${Date.now()}`
  const hadOld = fs.existsSync(target)
  if (hadOld) await fsp.rename(target, old)
  try {
    await fsp.rename(staging, target)
  } catch (e) {
    if (hadOld) {
      await fsp.rm(target, { recursive: true, force: true }).catch(() => {})
      await fsp.rename(old, target)
    }
    throw e
  }
  if (hadOld) await fsp.rm(old, { recursive: true, force: true }).catch(() => {})
}

/**
 * Уборка после аварийного выхода: недокачанные архивы и, если игра пропала посреди замены,
 * возвращение старой версии на место.
 */
export async function recover(library: string): Promise<void> {
  await fsp.rm(join(library, STAGING), { recursive: true, force: true }).catch(() => {})
  let names: string[]
  try {
    names = await fsp.readdir(library)
  } catch {
    return
  }
  for (const name of names) {
    const m = /^(.+)\.old-\d+$/.exec(name)
    if (!m?.[1]) continue
    const target = join(library, m[1])
    if (fs.existsSync(target)) await fsp.rm(join(library, name), { recursive: true, force: true }).catch(() => {})
    else await fsp.rename(join(library, name), target).catch(() => {})
  }
}
