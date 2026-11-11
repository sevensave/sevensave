import { Fragment, type ReactNode } from 'react'

/** **жирный** и `код` внутри строки. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return <Fragment key={i}>{part}</Fragment>
  })
}

/**
 * Патчноут из тела релиза. Понимаем только то, что пишут наши релизы: заголовки, списки, абзацы.
 * Заголовок второго уровня — имя релиза, его показываем отдельно, здесь пропускаем.
 */
export function Notes({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    list = []
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (/^#{1,2}\s/.test(line)) continue
    const h = /^#{3,}\s+(.*)$/.exec(line)
    if (h) {
      flush()
      blocks.push(<h4 key={blocks.length}>{h[1]}</h4>)
      continue
    }
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) {
      if (para.length) flush()
      list.push(li[1]!)
      continue
    }
    if (list.length) flush()
    para.push(line)
  }
  flush()
  return <div className="notes">{blocks}</div>
}

/** Имя релиза: первый заголовок «## …». */
export function notesTitle(text: string): string | null {
  return /^##\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null
}
