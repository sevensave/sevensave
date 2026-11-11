import { GearSix } from '@phosphor-icons/react'
import type { LauncherState } from '../../../preload/api'
import { gameStatus, type Status } from '../lib/status'
import { useUi } from '../store'
import mark from '../assets/mark.png'

function line(st: Status, installed: boolean): string {
  switch (st.kind) {
    case 'download':
      return st.total ? `Скачивается, ${Math.floor((st.received / st.total) * 100)} %` : 'Скачивается'
    case 'installing':
      return 'Устанавливается'
    case 'uninstalling':
      return 'Удаляется'
    case 'running':
      return 'Запущено'
    case 'update':
      return `Обновление ${st.version}`
    case 'play':
      return 'Готова к игре'
    case 'soon':
      return installed ? 'Готова к игре' : 'Скоро'
    default:
      return 'Не установлена'
  }
}

export function Sidebar({ s }: { s: LauncherState }) {
  const view = useUi((u) => u.view)
  const select = useUi((u) => u.select)
  return (
    <nav className="rail" aria-label="Игры">
      <div className="brand">
        <img src={mark} alt="" className="brand__mark" />
        <span>Sevensave</span>
      </div>
      <ul className="games">
        {s.games.map((g) => {
          const st = gameStatus(s, g.id)
          return (
            <li key={g.id}>
              <button
                className={`gitem${view === g.id ? ' is-on' : ''} gitem--${st.kind}`}
                style={{ ['--accent' as string]: g.accent }}
                onClick={() => select(g.id)}
                aria-current={view === g.id ? 'page' : undefined}
              >
                <img src={g.art.icon} alt="" />
                <span className="gitem__text">
                  <span className="gitem__title">{g.title}</span>
                  <span className="gitem__line">{line(st, !!s.installed[g.id])}</span>
                </span>
                {st.kind === 'download' && st.total > 0 && (
                  <span className="gitem__bar" style={{ width: `${(st.received / st.total) * 100}%` }} />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="rail__foot">
        {s.update.state === 'ready' && (
          <button className="update" onClick={() => window.sevensave.installUpdate()}>
            Sevensave {s.update.version} готов. Перезапустить
          </button>
        )}
        {s.update.state === 'available' && (
          <button className="update" onClick={() => window.sevensave.openUpdatePage()}>
            Вышел Sevensave {s.update.version}. Скачать
          </button>
        )}
        <button className={`gitem gitem--settings${view === 'settings' ? ' is-on' : ''}`} onClick={() => select('settings')}>
          <GearSix size={22} />
          <span className="gitem__title">Настройки</span>
        </button>
      </div>
    </nav>
  )
}
