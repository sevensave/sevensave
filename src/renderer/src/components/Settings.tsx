import type { LauncherState } from '../../../preload/api'

export function Settings({ s }: { s: LauncherState }) {
  const api = window.sevensave
  const custom = s.settings.libraryDir !== null
  const update =
    s.update.state === 'downloading'
      ? `Скачивается версия ${s.update.version}`
      : s.update.state === 'ready'
        ? `Версия ${s.update.version} поставится при следующем запуске`
        : s.update.state === 'available'
          ? `Вышла версия ${s.update.version}`
          : 'Обновления ставятся сами'
  return (
    <section className="settings">
      <h1>Настройки</h1>

      <div className="setting">
        <div className="setting__text">
          <h2>Папка для игр</h2>
          <p className="path">{s.settings.libraryDir ?? s.defaultLibraryDir}</p>
          <p className="muted">Новые игры ставятся сюда. Уже установленные остаются там, где стоят.</p>
        </div>
        <div className="setting__ctl">
          <button className="ghost" onClick={() => void api.chooseLibraryDir()}>Выбрать папку</button>
          {custom && <button className="ghost" onClick={() => void api.resetLibraryDir()}>Вернуть стандартную</button>}
        </div>
      </div>

      <div className="setting">
        <div className="setting__text">
          <h2>Сворачивать при запуске игры</h2>
          <p className="muted">Окно Sevensave уйдёт в Dock или на панель задач, пока ты играешь.</p>
        </div>
        <div className="setting__ctl">
          <button
            className={`switch${s.settings.minimizeOnLaunch ? ' is-on' : ''}`}
            role="switch"
            aria-checked={s.settings.minimizeOnLaunch}
            aria-label="Сворачивать при запуске игры"
            onClick={() => void api.setMinimizeOnLaunch(!s.settings.minimizeOnLaunch)}
          >
            <span />
          </button>
        </div>
      </div>

      <div className="setting">
        <div className="setting__text">
          <h2>Sevensave {s.version}</h2>
          <p className="muted">{update}</p>
        </div>
      </div>
    </section>
  )
}
