import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage, TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'
// @ts-expect-error JavaScript proof helper is executed against the real renderer.
import { installedCommandReady, waitForInstalledCommand } from '../scripts/trusted-raycast-can-i-use-installed-proof.mjs'

// Reuse the workspace's existing DOM test dependency; no new test stack.
const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
for (const extensionId of ['google-translate', 'kaomoji-search', 'can-i-use'] as const) {
  test(`${extensionId} installed proof accepts the actual renderer and rejects failed shells`, async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, runScripts: 'outside-only' })
    const document = dom.window.document as Document
    // jsdom has no layout; supply only its missing visibility measurement.
    dom.window.HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
      return this.closest('[hidden]') || this.style.display === 'none' ? [] : [{}]
    }
    const events: TrustedRaycastViewEvent[] = []
    const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => {
      events.push(event)
      if (event.kind === 'searchChanged') queueMicrotask(() => view.update({ ...ready, type: 'patch', revision: 1 }))
    } } as unknown as LauncherPreloadBridge, () => {})
    document.body.append(view.element)
    const children: TrustedRaycastViewNode[] = extensionId === 'google-translate' ? [
      { type: 'raycast-dropdown', props: { value: 'default' }, children: [{ type: 'raycast-dropdown-item', props: { value: 'default', title: 'Default' }, children: [] }] },
      { type: 'raycast-action', props: { title: 'Go to Previous Language Set', actionEventId: 'previous' }, children: [] },
    ] : Array.from({ length: 64 }, (_, i) => ({ type: 'raycast-list-item', props: { title: `Source Item ${i}` }, children: [] }))
    const ready: TrustedRaycastViewMessage = { type: 'ready', extensionId, sessionId: 's', generation: 'g', revision: 0,
      root: { type: 'raycast-list', props: { searchEventId: 'search', searchText: '', searchBarPlaceholder: 'Enter text to translate', queryCurrent: true, visibleCount: 64, matchCount: 581, totalCount: 581 }, children } }
    try {
      assert.equal(installedCommandReady(document, extensionId), false, 'unmounted permanent shell is not a command')
      view.update(ready)
      assert.equal(installedCommandReady(document, extensionId), true, 'healthy real renderer must pass')
      if (extensionId === 'google-translate') {
        const wait = async (fetch: () => Promise<unknown>, predicate: (value: unknown) => boolean) => {
          for (let attempt = 0; attempt < 10; attempt++) { const value = await fetch(); if (predicate(value)) return value; await new Promise(resolve => setImmediate(resolve)) }
          throw new Error('Command is not ready')
        }
        const launcher = { evaluate: async (expression: string) => dom.window.eval(expression) }
        await waitForInstalledCommand(launcher, wait, extensionId)
        assert.deepEqual(events, [], 'the idle command is ready without synthetic input')
        view.update({ type: 'toast', extensionId, sessionId: 's', generation: 'g', revision: 0, style: 'failure', title: 'Selected Text Unavailable', message: 'Selected text is disabled in the bounded visual proof. Manual input is available.' })
        await assert.rejects(waitForInstalledCommand(launcher, wait, extensionId), /Command is not ready/)
        assert.deepEqual(events, [], 'the smoke must not hide a regressed startup error')
        view.update({ ...ready, type: 'patch', revision: 1 })
      }
      const section = view.element
      const input = document.querySelector('input')!
      input.disabled = true
      assert.equal(installedCommandReady(document, extensionId), false)
      input.disabled = false
      section.hidden = true
      assert.equal(installedCommandReady(document, extensionId), false)
      section.hidden = false
      section.dataset.view = 'preference-setup'
      assert.equal(installedCommandReady(document, extensionId), false)
      section.dataset.view = 'extension-first-use'
      assert.equal(installedCommandReady(document, extensionId), false)
      delete section.dataset.view
      section.setAttribute('aria-busy', 'true')
      assert.equal(installedCommandReady(document, extensionId), false)
      section.setAttribute('aria-busy', 'false')
      view.update({ type: 'error', extensionId, sessionId: 's', generation: 'g', revision: 99, message: 'The child failed' })
      assert.equal(installedCommandReady(document, extensionId), false, 'actual runtime-error projection must fail')
      for (const element of section.querySelectorAll('select, button, li')) element.remove()
      assert.equal(installedCommandReady(document, extensionId), false, 'permanent search/list shells are not loaded content')
    } finally { view.dispose(); dom.window.close() }
  })
}
