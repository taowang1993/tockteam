import assert from 'node:assert/strict'
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

test('locks the Desktop TockTutor route seat and recognizes nested paths', () => {
  assert.equal(TOCKTUTOR_ROUTE_SLOT, 'tockteam.tocktutor.route')
  assert.equal(isTockTutorPath('/tocktutor'), true)
  assert.equal(isTockTutorPath('/tocktutor/notes/Plan.md'), true)
  assert.equal(isTockTutorPath('/tocktutors'), false)
  assert.equal(isTockTutorPath('/'), false)
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
