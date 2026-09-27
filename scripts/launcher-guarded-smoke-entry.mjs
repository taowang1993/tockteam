import { fileURLToPath } from 'node:url'

// The guard fills top-level windows. Keep the Launcher an owned child so its
// real popup bounds survive, and let clicks on the workbench dismiss it.
export function installBoundedLauncherSmoke(electron) {
  const GuardedWindow = electron.BrowserWindow
  let workbench
  let launcher
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
  process.chdir(fileURLToPath(new URL('..', import.meta.url)))
  process.argv.push('--toggle')
  void import('../dist/main.js').catch(error => { console.error(error); electron.app.exit(1) })
}
