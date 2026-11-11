import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { LauncherState, SevensaveApi } from './api'

const api: SevensaveApi = {
  state: () => ipcRenderer.invoke('state'),
  onState: (cb) => {
    const listener = (_e: IpcRendererEvent, s: LauncherState) => cb(s)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  install: (id) => ipcRenderer.invoke('install', id),
  cancel: (id) => ipcRenderer.send('cancel', id),
  uninstall: (id) => ipcRenderer.invoke('uninstall', id),
  play: (id) => ipcRenderer.invoke('play', id),
  reveal: (id) => ipcRenderer.send('reveal', id),
  refresh: () => ipcRenderer.invoke('refresh'),
  chooseLibraryDir: () => ipcRenderer.invoke('library:choose'),
  resetLibraryDir: () => ipcRenderer.invoke('library:reset'),
  setMinimizeOnLaunch: (on) => ipcRenderer.invoke('settings:minimize', on),
  installUpdate: () => ipcRenderer.send('update:install'),
  openUpdatePage: () => ipcRenderer.send('update:page'),
}

contextBridge.exposeInMainWorld('sevensave', api)
