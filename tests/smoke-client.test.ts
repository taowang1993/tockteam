import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import type { DesktopBridge } from '../src/contracts.ts'

const source = readFileSync(new URL('../scripts/smoke-client.cjs', import.meta.url), 'utf8')

test('Chromium smoke watchdog starts before navigation and renderer work', () => {
  const watchdog = source.indexOf('watchdog = setTimeout')
  const navigation = source.indexOf('await window.loadURL(runtimeUrl)')
  assert.ok(watchdog > 0)
  assert.ok(navigation > watchdog)
  assert.match(source, /clearTimeout\(watchdog\)/u)
})

test('Chromium smoke rejects the visible TockCoder Preview badge', () => {
  assert.match(source, /state\.previewBadgeVisible === true/u)
})

test('Chromium smoke preload supports the real route activation and cleanup facade', async () => {
  const exposed: { bridge?: Pick<DesktopBridge, 'syncWorkbenchDestination' | 'setTockTutorActive'> } = {}
  runInNewContext(readFileSync(new URL('../scripts/smoke-client-preload.cjs', import.meta.url), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, bridge: NonNullable<typeof exposed.bridge>) => { exposed.bridge = bridge } } }),
    process: { platform: 'linux' },
  })
  assert.ok(exposed.bridge)
  assert.equal(await exposed.bridge.syncWorkbenchDestination('tockcoder'), undefined)
  assert.equal(await exposed.bridge.setTockTutorActive(false), undefined)
  assert.equal(await exposed.bridge.syncWorkbenchDestination('tocktutor'), undefined)
  assert.equal(await exposed.bridge.setTockTutorActive(true), undefined)
  assert.equal(await exposed.bridge.setTockTutorActive(false), undefined)
})

type SmokeFixture = {
  missing?: string
  misaligned?: boolean
  overlap?: boolean
  offscreen?: boolean
  wrongIconSize?: boolean
  previewBadge?: boolean
  missingTailwind?: boolean
  hangNavigation?: boolean
}

// Run the real main/renderer smoke code with a deterministic clock and a small
// DOM fixture. No Electron process, network, user profile, or provider is used.
async function replaySmoke(options: SmokeFixture = {}) {
  class Element {
    className = ''
    style: Record<string, string> = {}
    textContent = ''
    hidden = false
    nextElementSibling: Element | null = null
    icon: Element | null = null
    children: Element[] = []
    label: string
    box: { left: number; top: number; width: number; height: number }
    constructor(label = '', box = { left: 0, top: 0, width: 0, height: 0 }) {
      this.label = label
      this.box = box
    }
    getAttribute(name: string) { return name === 'aria-label' ? this.label : null }
    getBoundingClientRect() { return { ...this.box, right: this.box.left + this.box.width, bottom: this.box.top + this.box.height } }
    querySelector(selector: string): Element | null {
      if (selector === 'svg') return this.icon
      return this.children.find(child => selector === `button[aria-label="${child.label}"]`) ?? null
    }
    querySelectorAll() { return this.children }
    remove() {}
    click() {}
  }
  const rail = new Element('App Navigation', { left: 0, top: 0, width: 40, height: 800 })
  for (const [index, label] of ['TockCoder', 'TockTutor', 'Settings'].entries()) {
    if (label === options.missing) continue
    const top = index === 2 ? 756 : 8 + index * 36
    const button = new Element(label, { left: 4, top, width: 32, height: 32 })
    button.icon = new Element('', { left: 11, top: top + 7, width: 18, height: 18 })
    rail.children.push(button)
  }
  const settings = rail.children.find(button => button.label === 'Settings')
  if (settings?.icon !== undefined && settings?.icon !== null) {
    if (options.misaligned) settings.icon.box.left += 3
    if (options.overlap) {
      settings.box.top = 42
      settings.icon.box.top = 49
    }
    if (options.offscreen) {
      settings.box.top = 800
      settings.icon.box.top = 807
    }
    if (options.wrongIconSize) settings.icon.box.width = 24
  }
  const headline = new Element()
  if (options.previewBadge) headline.nextElementSibling = new Element('', { left: 50, top: 50, width: 10, height: 10 })
  const document = {
    documentElement: { dataset: { tockteamDesktop: 'true' } },
    body: { innerText: 'Workbench', append() {} },
    createElement: () => new Element(),
    querySelector: (selector: string) => selector === 'nav[aria-label="App Navigation"]' ? rail
      : selector === '[data-tockteam-hero-headline]' ? headline : null,
    querySelectorAll: () => rail.children,
  }
  const renderer = {
    document, HTMLElement: Element, HTMLButtonElement: Element, SVGElement: Element,
    window: { innerWidth: 1280, innerHeight: 800 },
    getComputedStyle: () => ({ color: 'rgb(1, 2, 3)', display: options.missingTailwind ? 'block' : 'flex', flexDirection: 'column' }),
  }
  let clock = 0
  let nextTimer = 0
  let destroyed = false
  let output = ''
  let exitCode: number | undefined
  const timers = new Map<number, { at: number; callback: () => void }>()
  class BrowserWindow {
    webContents = {
      on() {},
      executeJavaScript: async (code: string) => runInNewContext(code, renderer),
    }
    async loadURL() { if (options.hangNavigation) await new Promise(() => {}) }
    destroy() { destroyed = true }
  }
  const app = {
    disableHardwareAcceleration() {}, commandLine: { appendSwitch() {} },
    whenReady: async () => {}, exit: (code: number) => { exitCode = code },
  }
  runInNewContext(source, {
    require: (name: string) => name === 'electron' ? { app, BrowserWindow } : { join },
    __dirname: '/synthetic-smoke',
    process: { env: { DSH_SMOKE_RUNTIME_URL: 'http://127.0.0.1/' }, stdout: { write: (text: string) => { output += text } }, stderr: { write: (text: string) => { output += text } } },
    Date: { now: () => clock },
    setTimeout: (callback: () => void, delay: number) => {
      timers.set(++nextTimer, { at: clock + delay, callback })
      return nextTimer
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  for (let tick = 0; tick < 250; tick++) {
    await new Promise(resolve => setImmediate(resolve))
    if (exitCode !== undefined) return { code: exitCode, output, destroyed, elapsed: clock }
    const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0]
    assert.ok(next, 'smoke must settle or retain a bounded timer')
    timers.delete(next[0])
    clock = next[1].at
    next[1].callback()
  }
  throw new Error('smoke did not settle within its deterministic timer budget')
}

test('Chromium smoke accepts the current app rail without a retired Plugins button', async () => {
  const result = await replaySmoke()
  assert.equal(result.code, 0, result.output)
  assert.equal(result.destroyed, true)
  assert.ok(result.elapsed >= 750 && result.elapsed < 20_000)
})

for (const [label, fixture, message] of [
  ['missing TockCoder', { missing: 'TockCoder' }, /timed out/],
  ['missing TockTutor', { missing: 'TockTutor' }, /timed out/],
  ['missing Settings', { missing: 'Settings' }, /timed out/],
  ['misaligned icons', { misaligned: true }, /App navigation/],
  ['overlapping buttons', { overlap: true }, /App navigation/],
  ['offscreen buttons', { offscreen: true }, /App navigation/],
  ['inconsistent icon frames', { wrongIconSize: true }, /App navigation/],
  ['a visible Preview badge', { previewBadge: true }, /Preview badge is visible/],
  ['missing Tailwind', { missingTailwind: true }, /timed out/],
  ['hung navigation', { hangNavigation: true }, /timed out/],
] as const) {
  test(`Chromium smoke rejects ${label} and destroys its window`, async () => {
    const result = await replaySmoke(fixture)
    assert.equal(result.code, 1)
    assert.equal(result.destroyed, true)
    assert.match(result.output, message)
    assert.ok(result.elapsed <= 20_000)
    if (message.source === 'timed out') {
      assert.equal(result.elapsed, 20_000)
      assert.match(result.output, /Last state:/)
    }
  })
}
