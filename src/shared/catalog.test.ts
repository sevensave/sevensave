import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CatalogSchema } from './catalog'

const root = join(import.meta.dirname, '../..')
const raw = JSON.parse(readFileSync(join(root, 'catalog/catalog.json'), 'utf8'))

describe('catalog.json', () => {
  it('проходит схему', () => {
    const r = CatalogSchema.safeParse(raw)
    expect(r.error?.issues ?? []).toEqual([])
  })
  it('весь арт лежит рядом', () => {
    const cat = CatalogSchema.parse(raw)
    for (const g of cat.games) {
      for (const f of [g.art.icon, g.art.cover, g.art.hero, ...g.art.screenshots]) {
        expect(existsSync(join(root, 'catalog/assets', g.id, f)), `${g.id}/${f}`).toBe(true)
      }
    }
  })
})

describe('CatalogSchema', () => {
  const game = () => structuredClone(raw.games[0])
  const bad = (patch: (g: Record<string, any>) => void) => {
    const g = game()
    patch(g)
    return CatalogSchema.safeParse({ schema: 1, games: [g] }).success
  }
  it('отвергает повтор id', () => {
    expect(CatalogSchema.safeParse({ schema: 1, games: [game(), game()] }).success).toBe(false)
  })
  it('отвергает неизвестную версию схемы', () => {
    expect(CatalogSchema.safeParse({ ...raw, schema: 2 }).success).toBe(false)
  })
  it('шаблон ассета без {version} или не zip', () => {
    expect(bad((g) => (g.assets.mac = 'River-mac.zip'))).toBe(false)
    expect(bad((g) => (g.assets.win = 'River-{version}.exe'))).toBe(false)
  })
  it('пути в арте не выходят из папки игры', () => {
    expect(bad((g) => (g.art.hero = '../../secret.png'))).toBe(false)
    expect(bad((g) => (g.art.screenshots = ['a/b.png']))).toBe(false)
  })
  it('платформа без сборки допустима', () => {
    expect(bad((g) => delete g.assets.win)).toBe(true)
  })
  it('id и repo в ожидаемом виде', () => {
    expect(bad((g) => (g.id = 'River Game'))).toBe(false)
    expect(bad((g) => (g.repo = 'https://github.com/x/y'))).toBe(false)
  })
})
