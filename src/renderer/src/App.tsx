import { DownloadSimple, X } from '@phosphor-icons/react'
import type { LauncherState } from '../../preload/api'
import { GamePage } from './components/GamePage'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { bytes } from './lib/format'
import { useUi } from './store'

/** Полоса загрузок внизу: видна, пока что-то качается или ставится. */
function Downloads({ s }: { s: LauncherState }) {
  const select = useUi((u) => u.select)
  const active = Object.entries(s.jobs).filter(([, j]) => j.phase !== 'uninstall')
  if (!active.length) return null
  return (
    <div className="downloads" role="status">
      {active.map(([id, job]) => {
        const g = s.games.find((x) => x.id === id)
        const pct = job.phase === 'download' && job.total ? (job.received / job.total) * 100 : 100
        return (
          <div className="dl" key={id} style={{ ['--accent' as string]: g?.accent }}>
            <DownloadSimple size={18} />
            <button className="dl__name" onClick={() => select(id)}>
              {g?.title} {job.phase !== 'uninstall' && job.version}
            </button>
            <span className="dl__track">
              <span className={`dl__fill${job.phase === 'install' ? ' is-busy' : ''}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="dl__nums">
              {job.phase === 'download' ? (job.total ? `${bytes(job.received)} из ${bytes(job.total)}` : 'Подключаемся…') : 'Распаковываем…'}
            </span>
            {job.phase === 'download' && (
              <button className="dl__x" onClick={() => window.sevensave.cancel(id)} aria-label="Отменить загрузку">
                <X size={16} weight="bold" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function App() {
  const s = useUi((u) => u.launcher)
  const view = useUi((u) => u.view)
  if (!s) return <div className="boot" />
  const game = s.games.find((g) => g.id === view)
  return (
    <div className="app">
      <div className="drag" />
      <Sidebar s={s} />
      <main className="main">
        {game ? <GamePage game={game} s={s} key={game.id} /> : <Settings s={s} />}
        {!s.online && <p className="offline">Нет связи. Установленные игры запускаются, обновления проверим позже.</p>}
      </main>
      <Downloads s={s} />
    </div>
  )
}
