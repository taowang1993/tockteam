const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const runtimeUrl = process.env.DSH_SMOKE_RUNTIME_URL ?? process.argv[2]
const timeoutMs = 20_000

if (runtimeUrl === undefined) throw new Error('runtime URL is required')

app.disableHardwareAcceleration()
// Keep scheduled UI work ticking throughout the bounded client-graph smoke.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

function finish(window, error) {
  if (error === undefined) {
    process.stdout.write('DSH Chromium client graph and Tailwind utilities: ready\n')
  } else {
    process.stderr.write(`${error.stack ?? error.message}\n`)
  }
  window.destroy()
  app.exit(error === undefined ? 0 : 1)
}

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    height: 800,
    // CI runs this window under Xvfb so layout and animation frames stay live.
    show: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'smoke-client-preload.cjs'),
      sandbox: false,
    },
    width: 1280,
  })
  let navigationReadyAt = null
  let lastState = null
  let settled = false
  let watchdog

  const settle = error => {
    if (settled) return
    settled = true
    clearTimeout(watchdog)
    finish(window, error)
  }
  watchdog = setTimeout(() => {
    settle(new Error('DSH Chromium client graph timed out during navigation or renderer execution'
      + `\nLast state: ${JSON.stringify(lastState)}`))
  }, timeoutMs)

  window.webContents.on('render-process-gone', (_event, details) => {
    settle(new Error(`Chromium renderer exited: ${details.reason}`))
  })
  window.webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (isMainFrame === false) return
    if (code === -3) return
    settle(new Error(`Chromium failed to load DSH (${code}): ${description} (${validatedUrl})`))
  })

  await window.loadURL(runtimeUrl)
  const poll = async () => {
    if (settled) return
    try {
      const state = await window.webContents.executeJavaScript(`(() => {
        const onboardingButton = [...document.querySelectorAll('button')]
          .find(button => /^(继续|continue|start using|开始使用|稍后配置|configure later|skip|later)$/i.test((button.textContent ?? '').trim()))
        if (onboardingButton !== undefined) onboardingButton.click()
        return {
          body: document.body?.innerText ?? '',
          tailwind: (() => {
            const probe = document.createElement('div')
            const reference = document.createElement('div')
            probe.className = 'flex flex-col text-foreground'
            reference.style.color = 'var(--dsw-alias-label-primary)'
            document.body.append(probe, reference)
            const style = getComputedStyle(probe)
            const referenceColor = getComputedStyle(reference).color
            const result = {
              color: style.color,
              display: style.display,
              flexDirection: style.flexDirection,
              ready: style.display === 'flex'
                && style.flexDirection === 'column'
                && style.color === referenceColor,
              referenceColor,
            }
            probe.remove()
            reference.remove()
            return result
          })(),
          previewBadgeVisible: (() => {
            const headline = document.querySelector('[data-tockteam-hero-headline]')
            const badge = headline?.nextElementSibling
            return badge instanceof HTMLElement && !badge.hidden && badge.getBoundingClientRect().width > 0
          })(),
          navigation: (() => {
            const rail = document.querySelector('nav[aria-label="App Navigation"]')
            if (!(rail instanceof HTMLElement)) return null
            const bounds = element => {
              const rect = element.getBoundingClientRect()
              return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
            }
            const items = ['TockCoder', 'TockTutor', 'Settings'].map(label => {
              const button = rail.querySelector('button[aria-label="' + label + '"]')
              const icon = button?.querySelector('svg')
              if (!(button instanceof HTMLButtonElement) || !(icon instanceof SVGElement)) return null
              return { label, button: bounds(button), icon: bounds(icon) }
            })
            if (items.some(item => item === null)) return null
            return {
              items,
              rail: bounds(rail),
              viewport: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
            }
          })(),
          ready: document.documentElement.dataset.tockteamDesktop === 'true',
        }
      })()`)
      lastState = { ready: state.ready, tailwind: state.tailwind, navigation: state.navigation }
      if (state.ready === true && state.previewBadgeVisible === true) {
        settle(new Error('TockCoder Preview badge is visible.'))
        return
      }
      if (state.body.includes('Failed to load plugins')) {
        settle(new Error(state.body.trim()))
        return
      }
      if (state.ready === true && state.navigation !== null && state.tailwind.ready === true) {
        const { items, rail, viewport } = state.navigation
        const inside = (rect, container) => rect.width > 0 && rect.height > 0
          && rect.left >= container.left && rect.right <= container.right
          && rect.top >= container.top && rect.bottom <= container.bottom
        const center = items[0].icon.left + items[0].icon.width / 2
        const invalid = !inside(rail, viewport) || items.some((item, index) =>
          !inside(item.button, rail) || !inside(item.icon, item.button)
          || Math.abs(item.icon.width - 18) > 0.5 || Math.abs(item.icon.height - 18) > 0.5
          || Math.abs(item.icon.left + item.icon.width / 2 - center) > 0.5
          || (index > 0 && item.button.top < items[index - 1].button.bottom))
        if (invalid) {
          settle(new Error('App navigation bounds, icon sizing, alignment, or vertical order is invalid: '
            + JSON.stringify(state.navigation)))
          return
        }
        navigationReadyAt ??= Date.now()
        if (Date.now() - navigationReadyAt >= 750) {
          settle()
          return
        }
      } else {
        navigationReadyAt = null
      }
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)))
      return
    }
    setTimeout(() => { void poll() }, 100)
  }
  await poll()
}).catch(error => {
  process.stderr.write(`${error.stack ?? String(error)}\n`)
  app.exit(1)
})
