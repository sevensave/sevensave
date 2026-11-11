// Рисует арт каталога и иконку лаунчера из tools/art/*.html: npm run art (ART_ONLY=<страница> — только её)
// Каждая сцена — HTML-страница нужного размера; снимаем её офскрин-окном Electron.
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join, dirname } = require('node:path')

const root = join(__dirname, '..')
const jobs = [
  { page: 'river.html', scene: 'hero', w: 1600, h: 640, out: ['catalog/assets/river/hero.jpg'] },
  { page: 'river.html', scene: 'cover', w: 600, h: 800, out: ['catalog/assets/river/cover.jpg'] },
  { page: 'namek.html', scene: 'hero', w: 1600, h: 640, out: ['catalog/assets/namek/hero.jpg'] },
  { page: 'namek.html', scene: 'cover', w: 600, h: 800, out: ['catalog/assets/namek/cover.jpg'] },
  { page: 'operator.html', scene: 'hero', w: 1600, h: 640, out: ['catalog/assets/operator/hero.jpg'] },
  { page: 'operator.html', scene: 'cover', w: 600, h: 800, out: ['catalog/assets/operator/cover.jpg', 'site/games/operator.jpg'] },
  { page: 'operator.html', scene: 'icon', w: 1024, h: 1024, out: ['catalog/assets/operator/icon.png:256'] },
  { page: 'icon.html', scene: 'icon', w: 1024, h: 1024, out: ['build/icon.png', 'resources/icon.png:256', 'site/icon.png:180', 'site/favicon.png:64', 'src/renderer/src/assets/mark.png:128'] },
]

// ART_ONLY=operator npm run art — перерисовать только сцены одной страницы.
const only = process.env.ART_ONLY
const todo = only ? jobs.filter((j) => j.page.startsWith(only)) : jobs

app.disableHardwareAcceleration()
// Окна закрываем по одному: без этого Electron выйдет после первого.
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  for (const job of todo) {
    const win = new BrowserWindow({ width: job.w, height: job.h, show: false, frame: false, transparent: job.scene === 'icon', webPreferences: { offscreen: true } })
    await win.loadFile(join(__dirname, 'art', job.page), { query: { scene: job.scene } })
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 400))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: job.w, height: job.h })
    for (const spec of job.out) {
      const [rel, size] = spec.split(':')
      const file = join(root, rel)
      mkdirSync(dirname(file), { recursive: true })
      const sized = size ? img.resize({ width: Number(size), height: Number(size), quality: 'best' }) : img.resize({ width: job.w, height: job.h })
      writeFileSync(file, rel.endsWith('.png') ? sized.toPNG() : sized.toJPEG(88))
      console.log('→', rel)
    }
    win.destroy()
  }
  app.quit()
})
