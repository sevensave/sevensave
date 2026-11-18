import { execFile } from 'node:child_process'
import { release } from 'node:os'
import { promisify } from 'node:util'
import type { Platform } from './releases'

const run = promisify(execFile)
const WEBVIEW2 = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'

/**
 * Потянет ли компьютер компактную сборку игры (Tauri). На Mac ей нужна macOS 14 (Darwin 23),
 * на Windows — установленный WebView2: без него такая игра просто не откроется.
 */
export async function lightSupported(platform: Platform, darwin = release(), query = run): Promise<boolean> {
  if (platform === 'mac') return Number(darwin.split('.')[0]) >= 23
  if (platform !== 'win') return false
  const keys = [
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2}`,
    `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2}`,
    `HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2}`,
  ]
  for (const key of keys) {
    try {
      const { stdout } = await query('reg', ['query', key, '/v', 'pv'])
      // Версия 0.0.0.0 значит, что WebView2 удалили.
      if (/\bpv\s+REG_SZ\s+(?!0\.0\.0\.0)\d/.test(String(stdout))) return true
    } catch {
      // Ключа нет: смотрим следующий.
    }
  }
  return false
}
