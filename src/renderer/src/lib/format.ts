/** 116 940 060 → «112 МБ». */
export function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} МБ`
  return `${Math.max(1, Math.round(n / 1024))} КБ`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Время в игре: «ещё не играли», «12 минут», «3 ч 20 мин». */
export function playtime(seconds: number): string {
  const min = Math.floor(seconds / 60)
  if (seconds <= 0) return 'Ещё не играли'
  if (min < 1) return 'Меньше минуты'
  if (min < 60) return `${min} ${plural(min, 'минута', 'минуты', 'минут')}`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h} ч ${rest} мин` : `${h} ${plural(h, 'час', 'часа', 'часов')}`
}

/** Часы для «Запущено»: 0:07, 1:02:15. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function eta(remaining: number, speed: number): string {
  if (speed <= 0) return ''
  const s = Math.ceil(remaining / speed)
  if (s < 60) return `ещё ${s} с`
  return `ещё ${Math.ceil(s / 60)} мин`
}

export function date(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
