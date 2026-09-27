import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { installDesktopOnboarding } from '../src/desktop-onboarding.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function button(document: Document, label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(item => item.getAttribute('aria-label') === label || item.textContent?.trim() === label)
  assert.ok(found, `button ${label} is visible`)
  return found
}

test('Desktop shows workspace then recognizes a saved model key without revealing or replacing it', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const originalDocument = globalThis.document
  Object.assign(globalThis, { document: dom.window.document })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  let completed = 0
  let keyWrites = 0
  let dispose: (() => void) | undefined
  try {
    dispose = installDesktopOnboarding({
      bridge: {
        onboarding: { status: async () => false, complete: async () => { completed++ } },
        chooseWorkspace: async () => [],
      },
      credentials: {
        describe: async () => ({ ok: true as const, value: { OPENROUTER_API_KEY: { configured: true, writable: true } } }),
        set: async () => { keyWrites++; return { ok: true as const, value: undefined } },
      },
      openPaths: async () => {},
    })
    await tick()
    const dialog = dom.window.document.querySelector('dialog')!
    assert.equal(dialog.open, true)
    assert.ok(dialog.classList.contains('bg-background'), 'setup uses the application theme background, not the lighter popover layer')
    assert.equal(dialog.querySelector('h2')?.textContent, 'Choose a Workspace')
    button(dom.window.document, 'Continue').click()
    await tick()
    assert.equal(dialog.querySelector('h2')?.textContent, 'Set Up a Model')
    assert.match(dialog.textContent ?? '', /already connected/u)
    assert.equal(dialog.querySelector('input[type=password]'), null, 'a stored key must stay hidden')
    button(dom.window.document, 'Finish Setup').click()
    await tick()
    assert.equal(completed, 1)
    assert.equal(keyWrites, 0)
    assert.equal(dialog.open, false)
  } finally {
    dispose?.()
    dom.window.close()
    Object.assign(globalThis, { document: originalDocument })
  }
})

test('Desktop can choose a folder, save a missing model key, and finish only after the write succeeds', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const originalDocument = globalThis.document
  Object.assign(globalThis, { document: dom.window.document })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const opened: string[] = []
  const saved: [string, string][] = []
  let completed = 0
  let dispose: (() => void) | undefined
  try {
    dispose = installDesktopOnboarding({
      bridge: {
        onboarding: { status: async () => false, complete: async () => { completed++ } },
        chooseWorkspace: async () => ['/tmp/example-workspace'],
      },
      credentials: {
        describe: async () => ({ ok: true as const, value: { OPENROUTER_API_KEY: { configured: false, writable: true } } }),
        set: async (ref, value) => { saved.push([ref, value]); return { ok: true as const, value: undefined } },
      },
      openPaths: async paths => { opened.push(...paths) },
    })
    await tick()
    button(dom.window.document, 'Choose Folder').click()
    await tick()
    assert.deepEqual(opened, ['/tmp/example-workspace'])
    const dialog = dom.window.document.querySelector('dialog')!
    assert.equal(dialog.querySelector('h2')?.textContent, 'Set Up a Model')
    const input = dialog.querySelector('input[type=password]') as HTMLInputElement | null
    assert.ok(input, 'the missing key can be entered')
    assert.equal(button(dom.window.document, 'Save and Finish').disabled, true)
    input.value = 'bad key'
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    button(dom.window.document, 'Save and Finish').click()
    assert.deepEqual(saved, [], 'bad keys never reach the DSH credential service')
    assert.match(dialog.querySelector('[role=alert]')?.textContent ?? '', /without spaces/u)
    input.value = 'sk-test-onboarding'
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    button(dom.window.document, 'Save and Finish').click()
    await tick()
    assert.deepEqual(saved, [['OPENROUTER_API_KEY', 'sk-test-onboarding']])
    assert.equal(completed, 1)
    assert.equal(dialog.open, false)
  } finally {
    dispose?.()
    dom.window.close()
    Object.assign(globalThis, { document: originalDocument })
  }
})

test('a refused model-key write keeps setup open and retains the draft for retry', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const originalDocument = globalThis.document
  Object.assign(globalThis, { document: dom.window.document })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  let attempts = 0
  let completed = 0
  let dispose: (() => void) | undefined
  try {
    dispose = installDesktopOnboarding({
      bridge: {
        onboarding: { status: async () => false, complete: async () => { completed++ } },
        chooseWorkspace: async () => [],
      },
      credentials: {
        describe: async () => ({ ok: true as const, value: { OPENROUTER_API_KEY: { configured: false, writable: true } } }),
        set: async () => ++attempts === 1
          ? { ok: false as const, error: { message: 'temporarily unavailable' } }
          : { ok: true as const, value: undefined },
      },
      openPaths: async () => {},
    })
    await tick()
    button(dom.window.document, 'Continue').click()
    await tick()
    const dialog = dom.window.document.querySelector('dialog')!
    const input = dialog.querySelector('input[type=password]') as HTMLInputElement
    input.value = 'sk-test-onboarding'
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    button(dom.window.document, 'Save and Finish').click()
    await tick()
    assert.equal(completed, 0)
    assert.equal(dialog.open, true)
    assert.equal(input.value, 'sk-test-onboarding')
    assert.match(dialog.querySelector('[role=alert]')?.textContent ?? '', /Could not save/u)
    button(dom.window.document, 'Save and Finish').click()
    await tick()
    assert.equal(attempts, 2)
    assert.equal(completed, 1)
    assert.equal(dialog.open, false)
  } finally {
    dispose?.()
    dom.window.close()
    Object.assign(globalThis, { document: originalDocument })
  }
})
