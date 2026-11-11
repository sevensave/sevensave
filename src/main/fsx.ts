import * as nodeFs from 'node:fs'
import { createRequire } from 'node:module'

/**
 * Файловые операции с папками игр. В Electron обычный fs считает файлы .asar папками,
 * и rm/rename внутри чужого .app спотыкаются о app.asar игры. original-fs работает как в node.
 * В тестах (чистый node) это обычный fs.
 */
const req = createRequire(import.meta.url)
export const fs: typeof nodeFs = process.versions.electron ? (req('original-fs') as typeof nodeFs) : nodeFs
export const fsp = fs.promises
