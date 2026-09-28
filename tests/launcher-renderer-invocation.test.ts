import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { buildSync } from 'esbuild'
import { parseLauncherSurfaceSettings } from '../src/launcher-contract.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const renderer = buildSync({ entryPoints: [new URL('../src/launcher.ts', import.meta.url).pathname], bundle: true, format: 'iife', platform: 'browser', write: false }).outputFiles[0]!.text

for (const outcome of ['success', 'failure', 'cancel'] as const) {
  test(`workflow ${outcome} refreshes consumed actions before allowing another invocation`, async () => {
    const dom = new JSDOM(readFileSync(new URL('../src/launcher.html', import.meta.url), 'utf8'), { pretendToBeVisual: true, runScripts: 'outside-only' })
    const document = dom.window.document as Document
    const settings = parseLauncherSurfaceSettings({ fuzziness: 0.5, history: [], historyEnabled: false, historyLimit: 10, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
    let searches = 0
    let invocations = 0
    let settle!: () => void
    dom.window.tockteamLauncher = {
      onTheme() {}, onLocale() {}, onTrustedRaycastView() {},
      getTheme: async () => ({ mode: 'dark', skinId: null, revision: 0 }),
      getSurfaceSettings: async () => settings,
      recordSearch: async () => settings,
      search: async () => {
        searches++
        const item = { id: 'workflow:test', name: 'Test Workflow', description: 'Inert test workflow', sourceExtension: 'Workflow', defaultAction: { actionId: `launcher-action:${searches}`, description: 'Run Workflow' } }
        return { before: [], after: [item], sections: [{ id: 'results', items: [item] }], resultSetId: `launcher-results:${searches}`, status: { indexedItemCount: 1, rescanStatus: 'idle' } }
      },
      invokeAction: async () => {
        invocations++
        await new Promise<void>((resolve, reject) => { settle = outcome === 'success' ? resolve : () => reject(new Error('Workflow stopped')) })
        return { ok: true }
      },
      cancelAction: async () => { settle(); return { ok: true } },
    }
    const drain = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)) }
    try {
      dom.window.eval(renderer)
      await drain()
      assert.equal(document.documentElement.dataset.launcherReady, 'true')
      const search = document.querySelector<HTMLInputElement>('#launcher-search')!
      search.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await drain()
      assert.equal(invocations, 1)
      assert.equal(search.disabled, true)
      if (outcome === 'cancel') document.querySelector<HTMLButtonElement>('[data-testid="tocklauncher-cancel-workflow"]')!.click()
      else settle()
      await drain()
      assert.equal(search.disabled, false)
      assert.equal(searches, 2, 'settlement must replace the consumed result set')
      assert.equal(document.querySelector<HTMLButtonElement>('[role="option"]')!.disabled, false)
      if (outcome !== 'success') assert.match(document.querySelector('#launcher-status')!.textContent!, outcome === 'cancel' ? /canceled/i : /could not be completed/i)
    } finally { dom.window.close() }
  })
}
