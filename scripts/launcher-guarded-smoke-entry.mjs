import childProcess from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// The guard wraps execFile for sandboxing; its wrapper loses Node's custom
// promisified { stdout, stderr } result unless this adapter restores it.
export function restoreGuardedExecFilePromisify({ execFile }) {
  if (typeof execFile !== 'function') throw new Error('Guarded Launcher smoke requires execFile')
  if (typeof execFile[promisify.custom] === 'function') return
  Object.defineProperty(execFile, promisify.custom, { configurable: true, value: (...args) => new Promise((resolve, reject) => {
    execFile(...args, (error, stdout, stderr) => {
      if (error) { Object.assign(error, { stdout, stderr }); reject(error) }
      else resolve({ stdout, stderr })
    })
  }) })
}

// The guard fills top-level windows. Keep the Launcher an owned child so its
// real popup bounds survive, and let clicks on the workbench dismiss it.
export function installBoundedLauncherSmoke(electron) {
  const GuardedWindow = electron.BrowserWindow
  let workbench
  let launcher
  // An earlier ESM import can cache the original guarded constructor. Reject
  // its top-level Launcher before it can become a full-display window.
  electron.app?.on('browser-window-created', (_event, window) => {
    if (window.getTitle() !== 'TockLauncher') return
    if (workbench && !workbench.isDestroyed() && window.getParentWindow() === workbench) return
    window.destroy()
    throw new Error('Guarded Launcher smoke rejected an unparented Launcher window')
  })
  Object.defineProperty(electron, 'BrowserWindow', { configurable: true, enumerable: true, value: new Proxy(GuardedWindow, {
    construct(Target, args) {
      const options = args[0] ?? {}
      if (options.title === 'TockLauncher') {
        if (!workbench || workbench.isDestroyed()) throw new Error('Guarded Launcher smoke requires a live workbench parent')
        const window = new Target({ ...options, parent: workbench, alwaysOnTop: false, show: false })
        const bounds = window.getBounds()
        if (bounds.width !== options.width || bounds.height !== options.height) {
          window.destroy()
          throw new Error('Guarded Launcher smoke rejected unexpected native popup bounds')
        }
        launcher = window
        window.once('closed', () => { if (launcher === window) launcher = undefined })
        return window
      }
      const window = new Target(...args)
      if (options.title === 'TockTeam' && options.width === 1280 && options.height === 840) {
        workbench = window
        window.webContents.on('before-mouse-event', (_event, mouse) => {
          if (mouse.type === 'mouseDown' && launcher?.isVisible() && !launcher.isDestroyed()) launcher.hide()
        })
        window.once('closed', () => { if (workbench === window) workbench = undefined })
      }
      return window
    },
  }) })
}

if (process.versions.electron) {
  const electron = globalThis[Symbol.for('pi.extended-display.electron')]
  if (!electron) throw new Error('The Launcher smoke requires the extended-display guard')
  installBoundedLauncherSmoke(electron)
  restoreGuardedExecFilePromisify(childProcess)
  process.chdir(fileURLToPath(new URL('..', import.meta.url)))
  process.argv.push('--toggle')
  void import('../dist/main.js').catch(error => { console.error(error); electron.app.exit(1) })
}
