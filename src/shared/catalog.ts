import { z } from 'zod'

/** Шаблон имени файла в релизе: {version} и {arch} подставляются. */
const assetTemplate = z
  .string()
  .min(5)
  .regex(/\{version\}/, 'в шаблоне нет {version}')
  .regex(/\.zip$/, 'лаунчер ставит только zip')

const artFile = z.string().regex(/^[\w.-]+\.(png|jpe?g|webp)$/, 'имя файла арта')

export const GameSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  title: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().min(1),
  players: z.string().min(1),
  /** owner/name репозитория со сборками. */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  assets: z.object({ mac: assetTemplate.optional(), win: assetTemplate.optional() }),
  /** Что запускать внутри папки игры: X.app на Mac, X.exe на Windows. */
  executable: z.object({
    mac: z.string().regex(/^[\w .-]+\.app$/),
    win: z.string().regex(/^[\w .-]+\.exe$/),
  }),
  art: z.object({
    icon: artFile,
    cover: artFile,
    hero: artFile,
    screenshots: z.array(artFile).max(8),
  }),
})

export const CatalogSchema = z
  .object({
    schema: z.literal(1),
    games: z.array(GameSchema).min(1),
  })
  .refine((c) => new Set(c.games.map((g) => g.id)).size === c.games.length, 'id игр повторяются')

export type Game = z.infer<typeof GameSchema>
export type Catalog = z.infer<typeof CatalogSchema>
