import { FolderOpen, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import type { GameView, LauncherState } from '../../../preload/api'
import { date, playtime } from '../lib/format'
import { gameStatus } from '../lib/status'
import { ActionButton } from './ActionButton'
import { Notes, notesTitle } from './Notes'

export function GamePage({ game, s }: { game: GameView; s: LauncherState }) {
  const status = gameStatus(s, game.id)
  const inst = s.installed[game.id]
  const rel = s.releases[game.id]
  const play = s.play[game.id]
  const error = s.errors[game.id]
  const [shot, setShot] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const busy = !!s.jobs[game.id] || s.running[game.id] !== undefined

  return (
    <article className="game" style={{ ['--accent' as string]: game.accent }} key={game.id}>
      <header className="hero">
        <img className="hero__art" src={game.art.hero} alt="" />
        <div className="hero__text">
          <h1>{game.title}</h1>
          <p>{game.tagline}</p>
        </div>
      </header>

      <section className="bar">
        <ActionButton id={game.id} status={status} />
        <dl className="facts">
          <div>
            <dt>Время в игре</dt>
            <dd>{playtime(play?.seconds ?? 0)}</dd>
          </div>
          <div>
            <dt>{inst ? 'Установлена' : 'Версия'}</dt>
            <dd>{inst?.version ?? rel?.version ?? '—'}</dd>
          </div>
          {play?.lastPlayed && (
            <div>
              <dt>Последний раз</dt>
              <dd>{date(play.lastPlayed)}</dd>
            </div>
          )}
        </dl>
        {inst && (
          <div className="bar__tools">
            <button className="tool" onClick={() => window.sevensave.reveal(game.id)} title="Показать папку игры">
              <FolderOpen size={18} /> Папка
            </button>
            {confirm ? (
              <span className="confirm">
                Удалить {game.title}? Время в игре сохранится.
                <button className="tool tool--danger" onClick={() => { setConfirm(false); void window.sevensave.uninstall(game.id) }}>Удалить</button>
                <button className="tool" onClick={() => setConfirm(false)}>Оставить</button>
              </span>
            ) : (
              <button className="tool" disabled={busy} onClick={() => setConfirm(true)} title={busy ? 'Сначала закрой игру' : undefined}>
                <Trash size={18} /> Удалить
              </button>
            )}
          </div>
        )}
      </section>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="body">
        <div className="body__main">
          <p className="lead">{game.description}</p>
          {game.art.screenshots.length > 0 && (
            <div className="shots">
              {game.art.screenshots.map((src) => (
                <button key={src} className="shot" onClick={() => setShot(src)} aria-label="Открыть скриншот">
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="body__side">
          <dl className="about">
            <div><dt>Жанр</dt><dd>{game.genre}</dd></div>
            <div><dt>Игроки</dt><dd>{game.players}</dd></div>
          </dl>
          {rel?.notes && (
            <div className="changes">
              <h3>
                Что нового в {rel.version}
                {notesTitle(rel.notes) && <span className="changes__name">{notesTitle(rel.notes)}</span>}
              </h3>
              {rel.publishedAt && <p className="changes__date">{date(rel.publishedAt)}</p>}
              <Notes text={rel.notes} />
            </div>
          )}
        </aside>
      </section>

      {shot && (
        <div className="lightbox" onClick={() => setShot(null)} role="dialog" aria-label="Скриншот">
          <img src={shot} alt="" />
        </div>
      )}
    </article>
  )
}
