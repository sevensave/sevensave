import { ArrowClockwise, DownloadSimple, Play, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { Status } from '../lib/status'
import { bytes, clock, eta } from '../lib/format'

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** Одна главная кнопка игры. Во время загрузки она сама становится полосой прогресса. */
export function ActionButton({ id, status }: { id: string; status: Status }) {
  const api = window.sevensave
  const now = useNow(status.kind === 'running')

  switch (status.kind) {
    case 'install':
      return (
        <div className="action">
          <button className="slab" onClick={() => void api.install(id)}>
            <DownloadSimple size={22} weight="bold" /> Установить
          </button>
          <span className="action__hint">{status.size ? bytes(status.size) : ''}</span>
        </div>
      )
    case 'update':
      return (
        <div className="action">
          <button className="slab" onClick={() => void api.install(id)}>
            <ArrowClockwise size={22} weight="bold" /> Обновить
          </button>
          <span className="action__hint">
            {status.from} → {status.version}
            {status.size ? `, ${bytes(status.size)}` : ''}
          </span>
        </div>
      )
    case 'play':
      return (
        <div className="action">
          <button className="slab" onClick={() => void api.play(id)} autoFocus>
            <Play size={22} weight="fill" /> Играть
          </button>
        </div>
      )
    case 'running':
      return (
        <div className="action">
          <div className="slab slab--running" role="status">
            <span className="pulse" /> Запущено
            <span className="slab__clock">{clock(now - status.since)}</span>
          </div>
        </div>
      )
    case 'download': {
      const pct = status.total ? Math.floor((status.received / status.total) * 100) : 0
      return (
        <div className="action">
          <div className="slab slab--progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Загрузка">
            <span className="slab__fill" style={{ width: `${pct}%` }} />
            <span className="slab__label">{status.total ? `${pct} %` : 'Подключаемся…'}</span>
          </div>
          <button className="ghost" onClick={() => api.cancel(id)}>
            <X size={16} weight="bold" /> Отменить
          </button>
          <span className="action__hint">
            {status.total ? `${bytes(status.received)} из ${bytes(status.total)}` : ''}
            {status.total && status.speed ? `, ${eta(status.total - status.received, status.speed)}` : ''}
          </span>
        </div>
      )
    }
    case 'installing':
      return (
        <div className="action">
          <div className="slab slab--progress slab--busy" role="status">
            <span className="slab__label">Устанавливаем…</span>
          </div>
        </div>
      )
    case 'uninstalling':
      return (
        <div className="action">
          <div className="slab slab--progress slab--busy" role="status">
            <span className="slab__label">Удаляем…</span>
          </div>
        </div>
      )
    case 'soon':
      return (
        <div className="action">
          <div className="slab slab--soon" aria-disabled>
            Скоро
          </div>
          <span className="action__hint">Сборка для этого компьютера выйдет со следующим обновлением игры</span>
        </div>
      )
    case 'offline':
      return (
        <div className="action">
          <button className="slab slab--soon" onClick={() => void api.refresh()}>
            <ArrowClockwise size={20} weight="bold" /> Проверить снова
          </button>
          <span className="action__hint">Нет связи: не видно, какая версия последняя</span>
        </div>
      )
  }
}
