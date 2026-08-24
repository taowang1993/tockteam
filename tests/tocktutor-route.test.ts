import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
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
  assert.equal(isTockTutorPath('/tocktutor'), true)
  assert.equal(isTockTutorPath('/tocktutor/notes/Plan.md'), true)
  assert.equal(isTockTutorPath('/tocktutors'), false)
  assert.equal(isTockTutorPath('/'), false)
})

test('TockTutor route synchronizes the trusted native frame without widening IPC', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  const preload = readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../plugins/sidebar/src/client/plugin.tsx', import.meta.url), 'utf8')

  assert.match(preload, /ipcRenderer\.invoke\('desktop:set-tocktutor-active', active\)/u)
  assert.match(main, /ipcMain\.handle\('desktop:set-tocktutor-active',[\s\S]+assertTrustedMainIpc\(event\)[\s\S]+typeof raw !== 'boolean'/u)
  assert.match(main, /setBackgroundColor\(raw[\s\S]+\? '#ffffff'/u)
  assert.match(sidebar, /setTockTutorActive\(active\)/u)
  assert.match(sidebar, /setTockTutorActive\(false\)/u)
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
