import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { TOCKTUTOR_ROUTE_SLOT } from '@tockteam/desktop/client'
import { TockTutorRoute } from '../dist/route.js'
import type { TockTutorAssistantPanelOwnerProps } from '../src/assistant-panel.ts'

const TOCKTUTOR_ASSISTANT_PANEL_SLOT = 'tockteam.tocktutor.workbench.assistant'
const vault = {
  generation: 17,
  id: `vault:${'7'.repeat(64)}`,
}

const exactOwner = {
  activePath: 'Notes/Bounded.md',
  vault,
} satisfies TockTutorAssistantPanelOwnerProps

const rejectedOwner: TockTutorAssistantPanelOwnerProps = {
  activePath: null,
  vault: null,
  // @ts-expect-error Source content is never part of the Assistant panel owner contract.
  source: '# private source',
}
void rejectedOwner

test('exports the exact bounded Assistant panel contract without content or Agent identity', async () => {
  const client = await import('../dist/client-api.js') as unknown as Pick<
    typeof import('../src/client.ts'),
    'TOCKTUTOR_ASSISTANT_PANEL_SLOT'
  >
  assert.equal(client.TOCKTUTOR_ASSISTANT_PANEL_SLOT, TOCKTUTOR_ASSISTANT_PANEL_SLOT)
  assert.deepEqual(exactOwner, { activePath: 'Notes/Bounded.md', vault })
  assert.deepEqual(Object.keys(exactOwner).sort(), ['activePath', 'vault'])

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  })
  assert.equal(dependencyNames.some(name => /assistant/iu.test(name)), false)
})

test('route dispatches only bounded owner props into an accessible Assistant aside', () => {
  let dispatched: { key: string; owner: unknown } | undefined
  const html = renderToStaticMarkup(createElement(TockTutorRoute, {
    location: { hash: '', pathname: '/tocktutor', search: '' },
    navigate() {},
    remote: {},
    renderSlot(key: string, owner: unknown) {
      if (key !== TOCKTUTOR_ASSISTANT_PANEL_SLOT) return null
      dispatched = { key, owner }
      return createElement('p', null, 'Assistant Entry')
    },
  } as never))
  assert.deepEqual(dispatched, {
    key: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    owner: { activePath: null, vault: null },
  })
  assert.equal(JSON.stringify(dispatched).includes('source'), false)
  assert.equal(JSON.stringify(dispatched).includes('content'), false)
  assert.match(html, /<aside[^>]+aria-label="Assistant Panel"/u)
  assert.match(html, /Assistant Entry/u)
})

test('route-owned declaration collapses Assistant entries across unload and replacement', () => {
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
    },
    name: TOCKTUTOR_ROUTE_SLOT,
    registrant: '@tockteam/tocktutor-workbench',
  })

  const disposeRoute = mountRoute()
  const disposeAssistant = register({
    name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    registrant: '@tockteam/tockbot-note-assistant',
  })
  assert.deepEqual(core.spec(TOCKTUTOR_ASSISTANT_PANEL_SLOT), { kind: 'single', scope: 'root' })
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 1)

  disposeRoute()
  assert.equal(core.spec(TOCKTUTOR_ASSISTANT_PANEL_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 0)
  disposeAssistant()

  const disposeReplacement = mountRoute()
  register({
    name: TOCKTUTOR_ASSISTANT_PANEL_SLOT,
    registrant: '@tockteam/tockbot-note-assistant',
  })
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 1)

  disposeDesktop()
  assert.equal(core.spec(TOCKTUTOR_ROUTE_SLOT), undefined)
  assert.equal(core.spec(TOCKTUTOR_ASSISTANT_PANEL_SLOT), undefined)
  assert.equal(core.entries(TOCKTUTOR_ASSISTANT_PANEL_SLOT).length, 0)
  disposeReplacement()
})
