import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlotCore, type SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { TOCKTUTOR_ROUTE_SLOT } from '@tockteam/desktop/client'
import { TockTutorRoute } from '../dist/route.js'
import type {
  TockTutorNativeActionsDispatchEvent,
  TockTutorNativeActionsOwnerProps,
  TockTutorProtocolRequest,
} from '../src/native-actions.ts'

const TOCKTUTOR_ASSISTANT_PANEL_SLOT = 'tockteam.tocktutor.workbench.assistant'
const TOCKTUTOR_WEB_VIEWER_PANEL_SLOT = 'tockteam.tocktutor.workbench.web-viewer'
const TOCKTUTOR_REVIEW_PANEL_SLOT = 'tockteam.tocktutor.workbench.review'
const TOCKTUTOR_NATIVE_ACTIONS_SLOT = 'tockteam.tocktutor.workbench.native-actions'
const vault = {
  generation: 29,
  id: `vault:${'9'.repeat(64)}`,
}

const exactProtocol = {
  action: 'open',
  file: 'Native/Actions.md',
} satisfies TockTutorProtocolRequest

const exactEvent = {
  kind: 'protocol',
  operationId: 'native-operation',
  request: exactProtocol,
} satisfies TockTutorNativeActionsDispatchEvent

const exactOwner = {
  activePath: 'Native/Actions.md',
  async handleDispatch(event: TockTutorNativeActionsDispatchEvent) {
    return event.operationId === exactEvent.operationId ? 'handled' as const : 'failed' as const
  },
  vault,
} satisfies TockTutorNativeActionsOwnerProps

const rejectedEvent: TockTutorNativeActionsDispatchEvent = {
  action: 'search',
  kind: 'quick-action',
  operationId: 'bounded',
  // @ts-expect-error Native dispatch events never expose Desktop session or window identity.
  sessionId: 'desktop-session',
}
void rejectedEvent

const rejectedOwner: TockTutorNativeActionsOwnerProps = {
  activePath: null,
  async handleDispatch() { return 'failed' },
  vault: null,
  // @ts-expect-error Native actions never receive content or Host/session authority.
  source: '# private source',
}
void rejectedOwner

const exactSpec = {
  kind: 'list',
  scope: 'root',
} satisfies Pick<SlotMap[typeof TOCKTUTOR_NATIVE_ACTIONS_SLOT], 'kind' | 'scope'>

test('exports a distinct bounded root list contract for native actions', async () => {
  const client = await import('../dist/client-api.js') as unknown as Pick<
    typeof import('../src/client.ts'),
    | 'TOCKTUTOR_ASSISTANT_PANEL_SLOT'
    | 'TOCKTUTOR_NATIVE_ACTIONS_SLOT'
    | 'TOCKTUTOR_REVIEW_PANEL_SLOT'
  >
  assert.equal(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT, TOCKTUTOR_NATIVE_ACTIONS_SLOT)
  assert.notEqual(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT, client.TOCKTUTOR_ASSISTANT_PANEL_SLOT)
  assert.notEqual(client.TOCKTUTOR_NATIVE_ACTIONS_SLOT, client.TOCKTUTOR_REVIEW_PANEL_SLOT)
  assert.deepEqual(exactSpec, { kind: 'list', scope: 'root' })
  assert.equal(await exactOwner.handleDispatch(exactEvent), 'handled')
  assert.equal(exactOwner.activePath, 'Native/Actions.md')
  assert.equal(exactOwner.vault, vault)
  assert.deepEqual(Object.keys(exactOwner).sort(), ['activePath', 'handleDispatch', 'vault'])
})

test('route renders an accessible Native Actions area with bounded owner props', () => {
  const dispatched: Array<{ key: string; options: unknown; owner: unknown }> = []
  const html = renderToStaticMarkup(createElement(TockTutorRoute, {
    location: { hash: '', pathname: '/tocktutor', search: '' },
    navigate() {},
    remote: {},
    renderSlot(key: string, owner: unknown, options?: { fallback?: unknown }) {
      dispatched.push({ key, options, owner })
      return options?.fallback
    },
  } as never))
  assert.deepEqual(dispatched.map(entry => entry.key), [
    TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    TOCKTUTOR_WEB_VIEWER_PANEL_SLOT,
    TOCKTUTOR_REVIEW_PANEL_SLOT,
    TOCKTUTOR_NATIVE_ACTIONS_SLOT,
  ])
  assert.deepEqual(Object.keys(dispatched[3]?.owner as object).sort(), [
    'activePath',
    'handleDispatch',
    'saveCurrent',
    'storeAudio',
    'vault',
  ])
  assert.equal(typeof (dispatched[3]?.owner as { handleDispatch?: unknown }).handleDispatch, 'function')
  assert.equal(typeof (dispatched[3]?.owner as { saveCurrent?: unknown }).saveCurrent, 'function')
  assert.equal(typeof (dispatched[3]?.owner as { storeAudio?: unknown }).storeAudio, 'function')
  assert.equal(JSON.stringify(dispatched).includes('source'), false)
  assert.equal(JSON.stringify(dispatched).includes('content'), false)
  assert.equal(JSON.stringify(dispatched).includes('session'), false)
  assert.match(html, /<section[^>]+aria-label="Native Actions"/u)
  assert.match(html, /data-slot="alert"[^>]+role="status">No native actions are available\.<\/div>/u)
})

test('Native Actions preserves contribution order while inactive entries render nothing', () => {
  const html = renderToStaticMarkup(createElement(TockTutorRoute, {
    location: { hash: '', pathname: '/tocktutor', search: '' },
    navigate() {},
    remote: {},
    renderSlot(key: string) {
      if (key !== TOCKTUTOR_NATIVE_ACTIONS_SLOT) return null
      return [
        createElement('button', { key: 'reveal' }, 'Show in Folder'),
        null,
        createElement('button', { key: 'print' }, 'Print'),
      ]
    },
  } as never))
  assert.ok(html.indexOf('Show in Folder') < html.indexOf('Print'))
  assert.doesNotMatch(html, /No native actions are available\./u)
  assert.match(html, /<section[^>]+aria-label="Native Actions"/u)
})

test('route declaration removes and restores ordered Native Actions entries', () => {
  const core = new SlotCore()
  const register = (options: object): (() => void) =>
    (core.register as unknown as (options: object, component: () => null) => () => void)
      .call(core, options, () => null)
  const disposeDesktop = register({
    children: {
      [TOCKTUTOR_ROUTE_SLOT]: { kind: 'single', scope: 'root' },
    },
    name: 'root',
    registrant: '@tockteam/desktop',
  })
  const mountRoute = (): (() => void) => register({
    children: {
      [TOCKTUTOR_ASSISTANT_PANEL_SLOT]: { kind: 'single', scope: 'root' },
      [TOCKTUTOR_NATIVE_ACTIONS_SLOT]: { kind: 'list', scope: 'root' },
      [TOCKTUTOR_REVIEW_PANEL_SLOT]: { kind: 'list', scope: 'root' },
    },
    name: TOCKTUTOR_ROUTE_SLOT,
    registrant: '@tockteam/tocktutor-workbench',
  })

  const disposeRoute = mountRoute()
  assert.deepEqual(core.spec(TOCKTUTOR_NATIVE_ACTIONS_SLOT), { kind: 'list', scope: 'root' })
  const disposePrint = register({
    id: 'print',
    name: TOCKTUTOR_NATIVE_ACTIONS_SLOT,
    order: 20,
    registrant: '@tockteam/desktop',
  })
  const disposeReveal = register({
    id: 'reveal',
    name: TOCKTUTOR_NATIVE_ACTIONS_SLOT,
    order: 10,
    registrant: '@tockteam/desktop',
  })
  assert.deepEqual(
    core.entries(TOCKTUTOR_NATIVE_ACTIONS_SLOT).map(entry => entry.options.id),
    ['reveal', 'print'],
  )

  disposeRoute()
  assert.equal(core.spec(TOCKTUTOR_NATIVE_ACTIONS_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 0)
  disposePrint()
  disposeReveal()

  const disposeReplacement = mountRoute()
  register({
    id: 'reveal',
    name: TOCKTUTOR_NATIVE_ACTIONS_SLOT,
    registrant: '@tockteam/desktop',
  })
  assert.equal(core.entries(TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 1)

  disposeDesktop()
  assert.equal(core.spec(TOCKTUTOR_ROUTE_SLOT), undefined)
  assert.equal(core.spec(TOCKTUTOR_NATIVE_ACTIONS_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_NATIVE_ACTIONS_SLOT).length, 0)
  disposeReplacement()
})
