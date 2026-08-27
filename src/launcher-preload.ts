import { contextBridge, ipcRenderer } from 'electron'
import {
  LAUNCHER_WINDOW_IPC_CHANNELS,
  parseLauncherWindowAcknowledgement,
} from './launcher-window-contract.ts'

const bridge = Object.freeze({
  dismiss: async (...args: unknown[]): Promise<void> => {
    if (args.length !== 0) throw new Error('TockLauncher dismiss does not accept arguments')
    const acknowledgement = await ipcRenderer.invoke(LAUNCHER_WINDOW_IPC_CHANNELS.dismiss)
    parseLauncherWindowAcknowledgement(acknowledgement)
  },
})

contextBridge.exposeInMainWorld('tockteamLauncher', bridge)
