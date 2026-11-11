import { describe, expect, it } from 'vitest'
import { binaryPath, gameEnv } from './runner'

describe('runner', () => {
  it('путь к исполняемому файлу', () => {
    expect(binaryPath('/lib/river', 'River.app', 'mac')).toBe('/lib/river/River.app/Contents/MacOS/River')
    expect(binaryPath('/lib/river', 'River.exe', 'win')).toMatch(/River\.exe$/)
  })
  it('окружение игры: метка лаунчера, без переменных Electron', () => {
    const env = gameEnv({ PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', ELECTRON_RENDERER_URL: 'http://x', NODE_OPTIONS: '--x' })
    expect(env).toEqual({ PATH: '/bin', SEVENSAVE_LAUNCHER: '1' })
  })
})
