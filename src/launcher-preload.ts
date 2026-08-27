import { contextBridge, ipcRenderer } from 'electron'
import { createLauncherPreloadBridge } from './launcher-preload-bridge.ts'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
} from './launcher-window-contract.ts'

ipcRenderer.on(LAUNCHER_WINDOW_IPC_CHANNELS.focusSearch, () => {
  document.getElementById('launcher-search')?.focus()
})

contextBridge.exposeInMainWorld('tockteamLauncher', createLauncherPreloadBridge({
  invoke: (channel, args) => args === undefined
    ? ipcRenderer.invoke(channel)
    : ipcRenderer.invoke(channel, args),
}))
