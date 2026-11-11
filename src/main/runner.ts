import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Platform } from './releases'

/** Путь к исполняемому файлу внутри папки игры. */
export function binaryPath(dir: string, executable: string, platform: Platform): string {
  if (platform === 'mac') return join(dir, executable, 'Contents', 'MacOS', executable.replace(/\.app$/, ''))
  return join(dir, executable)
}

/**
 * Окружение для игры: метка SEVENSAVE_LAUNCHER (игра не обновляет себя сама) и без переменных
 * Electron самого лаунчера — иначе, например, ELECTRON_RUN_AS_NODE запустит игру как node.
 */
export function gameEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(base)) {
    if (k.startsWith('ELECTRON_') || k === 'NODE_OPTIONS') continue
    env[k] = v
  }
  env.SEVENSAVE_LAUNCHER = '1'
  return env
}

export interface Session {
  startedAt: number
  /** Сколько секунд уже записано в статистику. */
  counted: number
}

/** Запущенные игры. Время в игре дописываем раз в минуту, чтобы не потерять его при сбое. */
export class Runner {
  private sessions = new Map<string, Session>()

  constructor(
    private onChange: () => void,
    private addSeconds: (id: string, seconds: number) => void,
  ) {
    setInterval(() => this.flush(), 60_000).unref()
  }

  running(): Record<string, number> {
    return Object.fromEntries([...this.sessions].map(([id, s]) => [id, s.startedAt]))
  }

  isRunning(id: string): boolean {
    return this.sessions.has(id)
  }

  start(id: string, dir: string, executable: string, platform: Platform): Promise<void> {
    if (this.sessions.has(id)) return Promise.resolve()
    const bin = binaryPath(dir, executable, platform)
    return new Promise((resolve, reject) => {
      const child = spawn(bin, [], { cwd: dir, env: gameEnv(process.env), detached: true, stdio: 'ignore' })
      child.once('error', (e) => {
        this.end(id)
        reject(new Error(`Не удалось запустить игру: ${e.message}`))
      })
      child.once('spawn', () => {
        this.sessions.set(id, { startedAt: Date.now(), counted: 0 })
        this.onChange()
        resolve()
      })
      child.once('exit', () => this.end(id))
      child.unref()
    })
  }

  /** Дописать время всех идущих сессий (перед выходом лаунчера). */
  flushAll() {
    this.flush()
  }

  private flush(id?: string) {
    const now = Date.now()
    for (const [sid, s] of this.sessions) {
      if (id && sid !== id) continue
      const total = Math.floor((now - s.startedAt) / 1000)
      if (total > s.counted) {
        this.addSeconds(sid, total - s.counted)
        s.counted = total
      }
    }
  }

  private end(id: string) {
    if (!this.sessions.has(id)) return
    this.flush(id)
    this.sessions.delete(id)
    this.onChange()
  }
}
