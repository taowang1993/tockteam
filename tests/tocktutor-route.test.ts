import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canonicalTockTeamPath,
  isTockCoderPath,
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
  TOCKCODER_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_SLOT,
} from '../plugins/sidebar/src/client/tocktutor-route.ts'

const originalWindow = globalThis.window

function installWindow(href: string): void {
  const url = new URL(href)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        hash: url.hash,
        href: url.href,
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
      },
    },
  })
}

test.afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

test('locks the Desktop TockTutor route seat and publishes its package type entry', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    exports: { './client': { browser?: string; node?: string; types?: string; default?: string } }
    files: string[]
  }
  assert.equal(packageJson.exports['./client'].types, './client.d.ts')
  assert.equal(packageJson.exports['./client'].node, './dist/client-api.js')
  assert.equal(packageJson.exports['./client'].browser, './dist/client-api.js')
  assert.equal(packageJson.exports['./client'].default, './dist/client.js')
  assert.ok(packageJson.files.includes('client.d.ts'))
  assert.equal(TOCKTUTOR_ROUTE_SLOT, 'tockteam.tocktutor.route')
  assert.equal(TOCKCODER_ROUTE_PREFIX, '/tockcoder')
  assert.equal(isTockCoderPath('/tockcoder'), true)
  assert.equal(isTockCoderPath('/tockcoder/session/123'), true)
  assert.equal(isTockCoderPath('/tockcoders'), false)
  assert.equal(isTockCoderPath('/'), false)
  assert.equal(isTockTutorPath('/tocktutor'), true)
  assert.equal(isTockTutorPath('/tocktutor/notes/Plan.md'), true)
  assert.equal(isTockTutorPath('/tocktutors'), false)
  assert.equal(isTockTutorPath('/'), false)
})

test('TockTeam routes the legacy root entrance to TockCoder', () => {
  assert.equal(canonicalTockTeamPath('/'), '/tockcoder')
  assert.equal(canonicalTockTeamPath('/tockcoder'), '/tockcoder')
  assert.equal(canonicalTockTeamPath('/tocktutor'), '/tocktutor')
})

test('TockTutor route synchronizes the trusted native frame without widening IPC', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  const preload = readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../plugins/sidebar/src/client/plugin.tsx', import.meta.url), 'utf8')
  const tutorWorkbench = readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx', import.meta.url), 'utf8')

  assert.match(preload, /ipcRenderer\.invoke\('desktop:set-tocktutor-active', active\)/u)
  assert.match(main, /ipcMain\.handle\('desktop:set-tocktutor-active',[\s\S]+assertTrustedMainIpc\(event\)[\s\S]+typeof raw !== 'boolean'/u)
  assert.match(main, /function setTockTutorThemeActive\(active: boolean\)[\s\S]+setBackgroundColor\(active[\s\S]+\? '#ffffff'/u)
  assert.match(main, /if \(mainWindow === window\)[\s\S]+resetTockTutorTheme\(window\)[\s\S]+mainWindow = undefined/u)
  assert.match(main, /did-start-navigation[\s\S]+if \(isMainFrame\)[\s\S]+resetTockTutorTheme\(window\)/u)
  assert.match(main, /render-process-gone[\s\S]+resetTockTutorTheme\(window\)/u)
  assert.match(main, /function flushQueuedOpenRequests\(\)[\s\S]+flushQueuedPaths\(\)[\s\S]+flushQueuedProtocols\(\)/u)
  assert.match(main, /(?:mainWindow|window)\.loadURL\(runtimeUrl\.href\)(?:\.then\(flushQueuedOpenRequests\))?/u)
  assert.match(sidebar, /setTockTutorActive\(active\)/u)
  assert.match(sidebar, /setTockTutorActive\(false\)/u)
  assert.match(sidebar, /hidden=\{!active\}/u)
  assert.match(sidebar, /routeRoot\.current[\s\S]+node\.inert = !active/u)
  assert.match(tutorWorkbench, /active\?: boolean/u)
  assert.match(tutorWorkbench, /if \(!active\) return[\s\S]+controller\.syncLocation/u)
  assert.match(tutorWorkbench, /if \(!active \|\| snapshot\.path === null\) return/u)
  assert.match(tutorWorkbench, /titlebar !== null/u)
  assert.match(tutorWorkbench, /active && typeof document !== 'undefined'/u)
})

test('remembers the last TockTutor path across finite route switches', async () => {
  const routes = await import('../plugins/sidebar/src/client/tocktutor-route.ts')
  routes.rememberTockTutorPath({ hash: '#heading', pathname: '/tocktutor/Plan.md', search: '?mode=source' })
  assert.equal(routes.readLastTockTutorPath(), '/tocktutor/Plan.md?mode=source#heading')
  routes.rememberTockTutorPath({ hash: '', pathname: '/tockcoder', search: '' })
  assert.equal(routes.readLastTockTutorPath(), '/tocktutor/Plan.md?mode=source#heading')
})

test('independent Desktop and Sidebar bundles share the active TockTutor note', async () => {
  const moduleUrl = new URL('../plugins/sidebar/src/client/tocktutor-route.ts', import.meta.url)
  const sidebar = await import(`${moduleUrl.href}?bundle=sidebar`)
  const desktop = await import(`${moduleUrl.href}?bundle=desktop`)
  sidebar.rememberTockTutorPath({ hash: '#active', pathname: '/tocktutor/Active.md', search: '?mode=source' })
  assert.equal(desktop.readLastTockTutorPath(), '/tocktutor/Active.md?mode=source#active')
  desktop.rememberTockTutorPath({ hash: '', pathname: '/tocktutor/Returned.md', search: '' })
  assert.equal(sidebar.readLastTockTutorPath(), '/tocktutor/Returned.md')
})

test('resolves bounded same-origin navigation and preserves query/hash', () => {
  installWindow('http://127.0.0.1:3080/tocktutor')
  assert.deepEqual(readTockTutorRouteLocation(), {
    hash: '',
    pathname: '/tocktutor',
    search: '',
  })
  assert.equal(
    resolveTockTutorNavigation('/tocktutor/Plan.md?mode=source#heading')?.href,
    'http://127.0.0.1:3080/tocktutor/Plan.md?mode=source#heading',
  )
  assert.equal(resolveTockTutorNavigation('https://foreign.invalid/tocktutor'), undefined)
  assert.equal(resolveTockTutorNavigation('//foreign.invalid/tocktutor'), undefined)
  assert.equal(resolveTockTutorNavigation(`/${'x'.repeat(4_097)}`), undefined)
  assert.equal(resolveTockTutorNavigation('/tocktutor/unsafe\u0000path'), undefined)
})
