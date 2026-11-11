import type { LauncherState } from '../../../preload/api'

export type Status =
  | { kind: 'install'; version: string; size: number | null }
  | { kind: 'update'; from: string; version: string; size: number | null }
  | { kind: 'play'; version: string }
  | { kind: 'running'; since: number }
  | { kind: 'download'; version: string; received: number; total: number; speed: number }
  | { kind: 'installing'; version: string }
  | { kind: 'uninstalling' }
  /** Для этого компьютера сборки ещё нет (Windows, пока у игры не вышел zip). */
  | { kind: 'soon' }
  /** Релиз неизвестен: нет сети и кэша. */
  | { kind: 'offline' }

/** Что сейчас с игрой и какую главную кнопку показать. */
export function gameStatus(s: LauncherState, id: string): Status {
  const job = s.jobs[id]
  if (job?.phase === 'download') return { kind: 'download', ...job }
  if (job?.phase === 'install') return { kind: 'installing', version: job.version }
  if (job?.phase === 'uninstall') return { kind: 'uninstalling' }
  const since = s.running[id]
  if (since !== undefined) return { kind: 'running', since }
  const inst = s.installed[id]
  const rel = s.releases[id]
  if (s.platform === 'other') return { kind: 'soon' }
  if (inst) {
    if (rel?.available && newerThan(rel.version, inst.version)) return { kind: 'update', from: inst.version, version: rel.version, size: rel.size }
    return { kind: 'play', version: inst.version }
  }
  if (!rel) return { kind: 'offline' }
  if (!rel.available) return { kind: 'soon' }
  return { kind: 'install', version: rel.version, size: rel.size }
}

function newerThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}
