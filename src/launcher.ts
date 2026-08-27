interface LauncherBridge {
  dismiss: (...args: unknown[]) => Promise<void>
}

declare global {
  interface Window {
    tockteamLauncher?: LauncherBridge
  }
}

function setReady(ready: boolean): void {
  const value = String(ready)
  document.documentElement.dataset.launcherReady = value
  if (document.body !== null) document.body.dataset.launcherReady = value
  document.getElementById('launcher-root')?.setAttribute('data-launcher-ready', value)
}

async function dismiss(): Promise<void> {
  const bridge = window.tockteamLauncher
  if (bridge === undefined || typeof bridge.dismiss !== 'function') return
  await bridge.dismiss()
}

function bootstrap(): void {
  const root = document.getElementById('launcher-root')
  const search = document.getElementById('launcher-search')
  const close = document.getElementById('launcher-close')
  if (!(root instanceof HTMLElement)
    || !(search instanceof HTMLInputElement)
    || !(close instanceof HTMLButtonElement)) {
    throw new Error('TockLauncher renderer is missing its required controls')
  }
  close.addEventListener('click', () => { void dismiss().catch(() => {}) })
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    void dismiss().catch(() => {})
  })
  setReady(true)
  search.focus()
}

try {
  setReady(false)
  bootstrap()
} catch {
  setReady(false)
}
