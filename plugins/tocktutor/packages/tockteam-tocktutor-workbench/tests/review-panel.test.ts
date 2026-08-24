import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlotCore, type SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { TOCKTUTOR_ROUTE_SLOT } from '@tockteam/desktop/client'
import { TockTutorRoute } from '../dist/route.js'
import type { TockTutorReviewPanelOwnerProps } from '../src/review-panel.ts'

const TOCKTUTOR_ASSISTANT_PANEL_SLOT = 'tockteam.tocktutor.workbench.assistant'
const TOCKTUTOR_NATIVE_ACTIONS_SLOT = 'tockteam.tocktutor.workbench.native-actions'
const TOCKTUTOR_REVIEW_PANEL_SLOT = 'tockteam.tocktutor.workbench.review'
const vault = {
  generation: 23,
  id: `vault:${'8'.repeat(64)}`,
}

const exactOwner = {
  activePath: 'Imports/Review.md',
  vault,
} satisfies TockTutorReviewPanelOwnerProps

const rejectedOwner: TockTutorReviewPanelOwnerProps = {
  activePath: null,
  vault: null,
  // @ts-expect-error Review entries never receive note content or Host authority.
  source: '# private source',
}
void rejectedOwner

const exactSpec = {
  kind: 'list',
  scope: 'root',
} satisfies Pick<SlotMap[typeof TOCKTUTOR_REVIEW_PANEL_SLOT], 'kind' | 'scope'>

test('exports a distinct bounded root list contract for reviewed workflows', async () => {
  const client = await import('../dist/client-api.js') as unknown as Pick<
    typeof import('../src/client.ts'),
    'TOCKTUTOR_ASSISTANT_PANEL_SLOT' | 'TOCKTUTOR_REVIEW_PANEL_SLOT'
  >
  assert.equal(client.TOCKTUTOR_REVIEW_PANEL_SLOT, TOCKTUTOR_REVIEW_PANEL_SLOT)
  assert.equal(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT, TOCKTUTOR_ASSISTANT_PANEL_SLOT)
  assert.notEqual(client.TOCKTUTOR_REVIEW_PANEL_SLOT, client.TOCKTUTOR_ASSISTANT_PANEL_SLOT)
  assert.deepEqual(exactSpec, { kind: 'list', scope: 'root' })
  assert.deepEqual(exactOwner, { activePath: 'Imports/Review.md', vault })
  assert.deepEqual(Object.keys(exactOwner).sort(), ['activePath', 'vault'])
})

test('route renders an accessible empty Review panel without using the Assistant seat', () => {
  const dispatched: Array<{ key: string; options: unknown; owner: unknown }> = []
  const html = renderToStaticMarkup(createElement(TockTutorRoute, {
    location: { hash: '', pathname: '/tocktutor', search: '' },
    navigate() {},
    remote: {},
    renderSlot(key: string, owner: unknown, options?: { fallback?: unknown }) {
      dispatched.push({ key, options, owner })
      if (key === TOCKTUTOR_ASSISTANT_PANEL_SLOT) return null
      return options?.fallback
    },
  } as never))
  assert.deepEqual(dispatched.map(entry => entry.key), [
    TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    TOCKTUTOR_REVIEW_PANEL_SLOT,
    TOCKTUTOR_NATIVE_ACTIONS_SLOT,
  ])
  assert.deepEqual(dispatched[1]?.owner, { activePath: null, vault: null })
  assert.equal(JSON.stringify(dispatched).includes('source'), false)
  assert.equal(JSON.stringify(dispatched).includes('content'), false)
  assert.match(html, /<aside[^>]+aria-label="Assistant Panel"/u)
  assert.match(html, /<section[^>]+aria-label="Shared Review Panel"/u)
  assert.match(html, /<p[^>]+role="status">No review workflow is active\.<\/p>/u)
})

test('Review panel preserves contribution order while inactive entries render nothing', () => {
  const html = renderToStaticMarkup(createElement(TockTutorRoute, {
    location: { hash: '', pathname: '/tocktutor', search: '' },
    navigate() {},
    remote: {},
    renderSlot(key: string) {
      if (key !== TOCKTUTOR_REVIEW_PANEL_SLOT) return null
      return [
        createElement('article', { key: 'import' }, 'Import Review'),
        null,
        createElement('article', { key: 'restore' }, 'Restore Review'),
      ]
    },
  } as never))
  assert.ok(html.indexOf('Import Review') < html.indexOf('Restore Review'))
  assert.doesNotMatch(html, /No review workflow is active\./u)
  assert.match(html, /<section[^>]+aria-label="Shared Review Panel"/u)
})

test('route declaration orders multiple Review entries and collapses them independently', () => {
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
      [TOCKTUTOR_REVIEW_PANEL_SLOT]: { kind: 'list', scope: 'root' },
    },
    name: TOCKTUTOR_ROUTE_SLOT,
    registrant: '@tockteam/tocktutor-workbench',
  })

  const disposeRoute = mountRoute()
  assert.deepEqual(core.spec(TOCKTUTOR_ASSISTANT_PANEL_SLOT), { kind: 'single', scope: 'root' })
  assert.deepEqual(core.spec(TOCKTUTOR_REVIEW_PANEL_SLOT), { kind: 'list', scope: 'root' })
  assert.equal(core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)

  const disposeLate = register({
    id: 'restore',
    name: TOCKTUTOR_REVIEW_PANEL_SLOT,
    order: 20,
    registrant: '@tockteam/tocktutor-restore',
  })
  const disposeFirst = register({
    id: 'import',
    name: TOCKTUTOR_REVIEW_PANEL_SLOT,
    order: 10,
    registrant: '@tockteam/tocktutor-import-export',
  })
  const disposeAssistant = register({
    name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    registrant: '@tockteam/tockbot-note-assistant',
  })
  assert.deepEqual(
    core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).map(entry => entry.options.id),
    ['import', 'restore'],
  )
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 1)

  disposeFirst()
  assert.deepEqual(
    core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).map(entry => entry.options.id),
    ['restore'],
  )
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 1)

  disposeRoute()
  assert.equal(core.spec(TOCKTUTOR_REVIEW_PANEL_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)
  assert.equal(core.spec(TOCKTUTOR_ASSISTANT_PANEL_SLOT), undefined)
  disposeLate()
  disposeAssistant()

  const disposeReplacement = mountRoute()
  register({
    id: 'import',
    name: TOCKTUTOR_REVIEW_PANEL_SLOT,
    registrant: '@tockteam/tocktutor-import-export',
  })
  assert.equal(core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).length, 1)
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 0)

  disposeDesktop()
  assert.equal(core.spec(TOCKTUTOR_ROUTE_SLOT), undefined)
  assert.equal(core.spec(TOCKTUTOR_REVIEW_PANEL_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_REVIEW_PANEL_SLOT).length, 0)
  disposeReplacement()
})
