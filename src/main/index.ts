import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { join } from 'node:path'
import { handleAssets, registerAssetScheme } from './catalog'
import { Launcher } from './launcher'
import { initUpdater, installUpdate, openUpdatePage } from './updater'

if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('me.sevensave.launcher')
registerAssetScheme()

let win: BrowserWindow | null = null
const launcher = new Launcher(
  (s) => win?.webContents.send('state', s),
  () => win?.minimize(),
)

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Sevensave',
    backgroundColor: '#0b0c10',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#0b0c10', symbolColor: '#9a98a6', height: 36 } }
      : { trafficLightPosition: { x: 16, y: 14 } }),
    icon: join(import.meta.dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!process.env.ELECTRON_RENDERER_URL || !url.startsWith(process.env.ELECTRON_RENDERER_URL)) e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function setupIpc() {
  ipcMain.handle('state', () => launcher.state())
  ipcMain.handle('install', (_e, id: unknown) => launcher.install(str(id)))
  ipcMain.on('cancel', (_e, id: unknown) => launcher.cancel(str(id)))
  ipcMain.handle('uninstall', (_e, id: unknown) => launcher.uninstall(str(id)))
  ipcMain.handle('play', (_e, id: unknown) => launcher.play(str(id)))
  ipcMain.on('reveal', (_e, id: unknown) => launcher.reveal(str(id)))
  ipcMain.handle('refresh', () => launcher.refresh())
  ipcMain.handle('library:choose', async () => {
    if (!win) return
    const r = await dialog.showOpenDialog(win, {
      title: 'Папка для игр',
      buttonLabel: 'Выбрать',
      defaultPath: launcher.library(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!r.canceled && r.filePaths[0]) await launcher.setLibraryDir(r.filePaths[0])
  })
  ipcMain.handle('library:reset', () => launcher.setLibraryDir(null))
  ipcMain.handle('settings:minimize', (_e, on: unknown) => launcher.setMinimizeOnLaunch(on === true))
  ipcMain.on('update:install', () => installUpdate())
  ipcMain.on('update:page', () => openUpdatePage())
}

function setupSession() {
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

function setupMenu() {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]),
    )
  } else {
    Menu.setApplicationMenu(null)
  }
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(async () => {
  setupSession()
  setupMenu()
  handleAssets()
  await launcher.init()
  setupIpc()
  createWindow()
  initUpdater((s) => launcher.setUpdate(s))
})

app.on('activate', () => {
  if (!win && app.isReady()) createWindow()
})

app.on('before-quit', () => launcher.shutdown())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Ссылки наружу открываем только в браузере.
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
})
