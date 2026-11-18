import { describe, expect, it } from 'vitest'
import { lightSupported } from './light'

const reg = (answers: Record<string, string>) => async (_cmd: string, args: string[]) => {
  const out = Object.entries(answers).find(([hive]) => args[1]?.startsWith(hive))?.[1]
  if (out === undefined) throw new Error('ключа нет')
  return { stdout: out, stderr: '' }
}

describe('lightSupported', () => {
  it('Mac: с macOS 14 (Darwin 23)', async () => {
    expect(await lightSupported('mac', '23.0.0')).toBe(true)
    expect(await lightSupported('mac', '27.0.0')).toBe(true)
    expect(await lightSupported('mac', '22.6.0')).toBe(false)
  })
  it('Windows: только с установленным WebView2', async () => {
    const pv = (v: string) => `\r\nHKEY_LOCAL_MACHINE\\...\r\n    pv    REG_SZ    ${v}\r\n`
    expect(await lightSupported('win', '', reg({ 'HKLM\\SOFTWARE\\WOW6432Node': pv('131.0.2903.70') }) as never)).toBe(true)
    expect(await lightSupported('win', '', reg({ HKCU: pv('131.0.2903.70') }) as never)).toBe(true)
    expect(await lightSupported('win', '', reg({ HKLM: pv('0.0.0.0') }) as never)).toBe(false)
    expect(await lightSupported('win', '', reg({}) as never)).toBe(false)
  })
  it('прочие системы — нет', async () => {
    expect(await lightSupported('other')).toBe(false)
  })
})
