import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Cancelled, STAGING, download, recover, swapInstall } from './installer'

const tmp = () => mkdtempSync(join(tmpdir(), 'ss-inst-'))
const put = (dir: string, file: string, text: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), text)
}

describe('swapInstall', () => {
  it('ставит новую версию на место старой и убирает старую', async () => {
    const lib = tmp()
    put(join(lib, 'river'), 'v.txt', '1.8.0')
    put(join(lib, 'stage'), 'v.txt', '1.8.1')
    await swapInstall(join(lib, 'stage'), join(lib, 'river'))
    expect(readFileSync(join(lib, 'river/v.txt'), 'utf8')).toBe('1.8.1')
    expect(readdirSync(lib)).toEqual(['river'])
  })
  it('первая установка без старой версии', async () => {
    const lib = tmp()
    put(join(lib, 'stage'), 'v.txt', '1.0.0')
    await swapInstall(join(lib, 'stage'), join(lib, 'namek'))
    expect(readFileSync(join(lib, 'namek/v.txt'), 'utf8')).toBe('1.0.0')
  })
  it('если новая не встала — старая возвращается на место', async () => {
    const lib = tmp()
    put(join(lib, 'river'), 'v.txt', '1.8.0')
    await expect(swapInstall(join(lib, 'нет-такой-папки'), join(lib, 'river'))).rejects.toThrow()
    expect(readFileSync(join(lib, 'river/v.txt'), 'utf8')).toBe('1.8.0')
    expect(readdirSync(lib)).toEqual(['river'])
  })
})

describe('recover', () => {
  it('возвращает игру, пропавшую посреди замены, и чистит staging', async () => {
    const lib = tmp()
    put(join(lib, 'river.old-123'), 'v.txt', '1.8.0')
    put(join(lib, 'namek'), 'v.txt', '0.1.1')
    put(join(lib, 'namek.old-456'), 'v.txt', '0.1.0')
    put(join(lib, STAGING, 'river-1'), 'River.zip', 'half')
    await recover(lib)
    expect(readFileSync(join(lib, 'river/v.txt'), 'utf8')).toBe('1.8.0')
    expect(readFileSync(join(lib, 'namek/v.txt'), 'utf8')).toBe('0.1.1')
    expect(readdirSync(lib).sort()).toEqual(['namek', 'river'])
  })
  it('нет папки библиотеки — ничего не делает', async () => {
    await expect(recover(join(tmp(), 'nope'))).resolves.toBeUndefined()
  })
})

const stream = (chunks: Uint8Array[], delay = 0) =>
  new ReadableStream<Uint8Array>({
    async start(c) {
      for (const ch of chunks) {
        if (delay) await new Promise((r) => setTimeout(r, delay))
        c.enqueue(ch)
      }
      c.close()
    },
  })

describe('download', () => {
  const chunk = new Uint8Array(1000)
  it('качает целиком и сообщает прогресс', async () => {
    const dest = join(tmp(), 'a.zip')
    const progress = vi.fn()
    await download(async () => new Response(stream([chunk, chunk, chunk])), 'u', dest, 3000, new AbortController().signal, progress)
    expect(readFileSync(dest).length).toBe(3000)
    expect(progress).toHaveBeenLastCalledWith({ received: 3000, total: 3000 })
  })
  it('файл не того размера — ошибка', async () => {
    const dest = join(tmp(), 'a.zip')
    await expect(download(async () => new Response(stream([chunk])), 'u', dest, 3000, new AbortController().signal, () => {})).rejects.toThrow(/не целиком/)
  })
  it('отмена посреди загрузки', async () => {
    const dest = join(tmp(), 'a.zip')
    const ac = new AbortController()
    const p = download(async () => new Response(stream([chunk, chunk, chunk, chunk], 30)), 'u', dest, 4000, ac.signal, ({ received }) => {
      if (received >= 1000) ac.abort()
    })
    await expect(p).rejects.toBeInstanceOf(Cancelled)
  })
  it('связь оборвалась посреди файла', async () => {
    const dest = join(tmp(), 'a.zip')
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(chunk)
        setTimeout(() => c.error(new Error('ECONNRESET')), 10)
      },
    })
    await expect(download(async () => new Response(broken), 'u', dest, 3000, new AbortController().signal, () => {})).rejects.toThrow(/оборвалась/)
  })
  it('сервер ответил ошибкой', async () => {
    const dest = join(tmp(), 'a.zip')
    await expect(download(async () => new Response('no', { status: 404 }), 'u', dest, 1, new AbortController().signal, () => {})).rejects.toThrow(/404/)
    expect(existsSync(dest)).toBe(false)
  })
})
