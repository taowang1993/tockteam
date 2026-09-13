import assert from 'node:assert/strict'
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
const root = join(import.meta.dirname, '..')
const read = (path: string): string => {
  const absolute = join(root, path)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
}
const pluginSource = read('plugins/save-as-image/src/SaveAsImageAction.tsx')
const captureSource = read('plugins/save-as-image/src/capture.ts')
const clientSource = read('plugins/save-as-image/src/client.ts')
const hostSource = read('plugins/save-as-image/src/index.ts')
const localeSource = read('plugins/save-as-image/src/locales.ts')
const notices = read('THIRD_PARTY_NOTICES.md')
const manifest = JSON.parse(read('plugins/save-as-image/package.json') || '{}') as {
  name?: string
  version?: string
  dsh?: { client?: { inject?: string[]; platform?: string; immediately?: boolean } }
  dependencies?: Record<string, string>
}

function currentChatRendererSource(): string {
  const entry = readdirSync(join(root, 'node_modules', '.pnpm'))
    .find(name => name.startsWith('@deepseek-ai+dsh-client-ui-chat@0.1.2-rc.1_'))
  assert.ok(entry, 'the pinned DSH RC.1 chat package is installed')
  return readFileSync(join(
    root,
    'node_modules',
    '.pnpm',
    entry,
    'node_modules',
    '@deepseek-ai',
    'dsh-client-ui-chat',
    'lib',
    'client.js',
  ), 'utf8')
}

test('the response-image package declares its browser-only contract', () => {
  assert.equal(manifest.name, '@tockteam/save-as-image')
  assert.equal(manifest.version, '0.1.5')
  assert.deepEqual(manifest.dsh?.client, {
    inject: [
      '@deepseek-ai/dsh-client-ui-chat',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-slots',
    ],
    platform: 'web',
    immediately: true,
  })
  assert.equal(manifest.dependencies?.['html-to-image'], '1.11.13')
  assert.match(notices, /## html-to-image[\s\S]*Version: `1\.11\.13`[\s\S]*Declared license: MIT/u)
  assert.match(pluginSource, /conversation\.chat\.assistant-actions/u)
  assert.match(pluginSource, /id: 'save-as-image'/u)
  assert.match(pluginSource, /order: 20/u)
  assert.match(pluginSource, /aria-label=\{label\}/u)
  assert.match(pluginSource, /status\.capturing/u)
  assert.match(pluginSource, /status\.saved/u)
  assert.match(pluginSource, /status\.failed/u)
  assert.match(pluginSource, /role="status"/u)
  assert.match(captureSource, /data-chat-flow-kind/u)
  assert.match(captureSource, /data-turn-tail/u)
  assert.match(captureSource, /previousElementSibling/u)
  assert.match(captureSource, /URL\.revokeObjectURL/u)
  assert.match(clientSource, /SaveAsImageAction\.tsx/u)
  assert.match(hostSource, /export function apply\(\): void \{\}/u)
})

test('the RC.1 renderer only dispatches assistant actions from a finalized turn tail', () => {
  const renderer = currentChatRendererSource()
  assert.match(renderer, /const messageId = closing\.finalNode\.messageId/u)
  assert.match(renderer, /messageId === void 0 \? null : renderSlot\("conversation\.chat\.assistant-actions", \{ messageId \}\)/u)
  assert.match(renderer, /"data-chat-flow-kind": routedNode\.kind/u)
  assert.match(renderer, /"data-turn-tail": data\.turn/u)
  assert.match(renderer, /"assistant-step"/u)
})

test('structural lookup captures the assistant row, not the action strip or neighboring tool row', async () => {
  const { findAssistantStep } = await import('../plugins/save-as-image/src/capture.ts') as {
    findAssistantStep(anchor: Element): HTMLElement
  }
  const assistant: {
    kind: string
    previousElementSibling: unknown
    getAttribute: (name: string) => string | null
  } = {
    kind: 'assistant-step',
    previousElementSibling: null,
    getAttribute: name => name === 'data-chat-flow-kind' ? 'assistant-step' : null,
  }
  const tool: {
    kind: string
    previousElementSibling: unknown
    getAttribute: (name: string) => string | null
  } = {
    kind: 'tool',
    previousElementSibling: assistant,
    getAttribute: name => name === 'data-chat-flow-kind' ? 'tool' : null,
  }
  const tail: {
    kind: string
    previousElementSibling: { kind: string; previousElementSibling: unknown } | null
    closest: (selector: string) => unknown
    getAttribute: (name: string) => string | null
    querySelector: (selector: string) => unknown
  } = {
    kind: 'turn-tail',
    previousElementSibling: tool,
    closest: () => tail,
    getAttribute: name => name === 'data-chat-flow-kind' ? 'turn-tail' : null,
    querySelector: selector => selector === '[data-turn-tail]' ? tail : null,
  }
  assert.equal(findAssistantStep(tail as unknown as Element), assistant)
})

test('filenames remain bounded and cannot escape the download name', async () => {
  const { captureFileName } = await import('../plugins/save-as-image/src/capture.ts') as {
    captureFileName(messageId: string): string
  }
  assert.equal(captureFileName('message-42'), 'tockteam-response-message-42.png')
  const fileName = captureFileName('../..\\secret/\u0000very long response '.repeat(20))
  assert.match(fileName, /^tockteam-response-[a-zA-Z0-9._-]+\.png$/u)
  assert.equal(fileName.includes('/'), false)
  assert.equal(fileName.includes('\\'), false)
  assert.ok(fileName.length <= 140)
})

class FakeCanvasContext {
  fillStyle = ''
  readonly fillCalls: string[] = []
  readonly drawCalls: Array<{ source: unknown; x: number; y: number }> = []
  private readonly rendered: boolean
  constructor(rendered = false) {
    this.rendered = rendered
  }
  clearRect(): void {}
  fillRect(): void { this.fillCalls.push(this.fillStyle) }
  getImageData(_x: number, top: number, width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let row = 0; row < height; row += 1) {
      const content = this.rendered && top + row === 20
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4
        data[index] = content ? 255 : 12
        data[index + 1] = content ? 255 : 34
        data[index + 2] = content ? 255 : 56
        data[index + 3] = 255
      }
    }
    return { data, width, height } as ImageData
  }
  drawImage(source: unknown, x: number, y: number): void {
    this.drawCalls.push({ source, x, y })
  }
}

class FakeCanvas {
  readonly context: FakeCanvasContext
  width: number
  height: number
  constructor(width: number, height: number, rendered = false) {
    this.width = width
    this.height = height
    this.context = new FakeCanvasContext(rendered)
  }
  getContext(kind: string): FakeCanvasContext | null {
    return kind === '2d' ? this.context : null
  }
  toBlob(callback: (blob: Blob | null) => void): void {
    callback(new Blob(['png'], { type: 'image/png' }))
  }
}

test('capture retries at normal scale, paints the active background, and crops to measured content', async () => {
  const { captureAssistantStep } = await import('../plugins/save-as-image/src/capture.ts') as {
    captureAssistantStep(node: HTMLElement, adapter: unknown): Promise<Blob>
  }
  const node = {
    getBoundingClientRect: () => ({ width: 80, height: 200 }),
  }
  let created = 0
  const colorCanvas = new FakeCanvas(1, 1)
  const croppedCanvases: FakeCanvas[] = []
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousComputedStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag: string): unknown {
        assert.equal(tag, 'canvas')
        created += 1
        if (created === 1) return colorCanvas
        const cropped = new FakeCanvas(0, 0)
        croppedCanvases.push(cropped)
        return cropped
      },
    },
  })
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({
      getPropertyValue: (name: string) => name === '--dsw-alias-bg-base' ? 'rgb(12, 34, 56)' : '',
      paddingBottom: '12px',
    }),
  })
  const renders: Array<Record<string, unknown>> = []
  try {
    const blob = await captureAssistantStep(node as unknown as HTMLElement, {
      getFontEmbedCSS: async () => { throw new Error('font fetch unavailable') },
      toCanvas: async (_target: HTMLElement, options: Record<string, unknown>) => {
        renders.push(options)
        if (renders.length === 1) throw new Error('canvas limit')
        return new FakeCanvas(100, 100, true)
      },
    })
    assert.equal(blob.type, 'image/png')
    assert.deepEqual(renders.map(render => render.pixelRatio), [2, 1])
    assert.equal(renders[0]?.skipFonts, true)
    assert.equal(renders[0]?.backgroundColor, 'rgb(12, 34, 56)')
    assert.equal(croppedCanvases.length, 1)
    assert.equal(croppedCanvases[0]?.width, 108)
    assert.equal(croppedCanvases[0]?.height, 25)
    assert.deepEqual(croppedCanvases[0]?.context.fillCalls, ['rgb(12, 34, 56)'])
    assert.equal(croppedCanvases[0]?.context.drawCalls.length, 1)
  } finally {
    if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document
    else Object.defineProperty(globalThis, 'document', previousDocument)
    if (previousComputedStyle === undefined) delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle
    else Object.defineProperty(globalThis, 'getComputedStyle', previousComputedStyle)
  }
})

test('download creates and revokes exactly one object URL after the navigation turn', async () => {
  const { downloadBlob } = await import('../plugins/save-as-image/src/capture.ts') as {
    downloadBlob(blob: Blob, fileName: string): void
  }
  const clicked: Array<{ href?: string; download?: string }> = []
  const revoked: string[] = []
  let timer: (() => void) | undefined
  let throwOnClick = false
  let urlIndex = 0
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag: string): unknown {
        assert.equal(tag, 'a')
        const anchor = {
          href: '',
          download: '',
          click() {
            clicked.push(anchor)
            if (throwOnClick) throw new Error('blocked download')
          },
        }
        return anchor
      },
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout(callback: () => void): number { timer = callback; return 1 } },
  })
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: {
      createObjectURL: () => `blob:test-${String(++urlIndex)}`,
      revokeObjectURL: (url: string) => { revoked.push(url) },
    },
  })
  try {
    downloadBlob(new Blob(['png'], { type: 'image/png' }), 'response.png')
    assert.equal(clicked.length, 1)
    assert.equal(clicked[0]?.href, 'blob:test-1')
    assert.equal(clicked[0]?.download, 'response.png')
    assert.deepEqual(revoked, [])
    timer?.()
    assert.deepEqual(revoked, ['blob:test-1'])

    timer = undefined
    throwOnClick = true
    assert.throws(
      () => downloadBlob(new Blob(['png'], { type: 'image/png' }), 'blocked.png'),
      /blocked download/u,
    )
    assert.equal(timer, undefined)
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2'])
  } finally {
    if (previousDocument === undefined) delete (globalThis as { document?: unknown }).document
    else Object.defineProperty(globalThis, 'document', previousDocument)
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', previousWindow)
    if (previousUrl === undefined) delete (globalThis as { URL?: unknown }).URL
    else Object.defineProperty(globalThis, 'URL', previousUrl)
  }
})

test('the action keeps idle, capture, saved, and failure copy accessible', () => {
  assert.match(pluginSource, /disabled=\{phase === 'capturing'\}/u)
  assert.match(pluginSource, /alive\.current = true/u)
  assert.match(pluginSource, /const blob = await captureAssistantStep\(node\)\s+if \(!alive\.current\) return\s+downloadBlob/u)
  assert.match(pluginSource, /if \(button === null \|\| capturing\.current\) return/u)
  assert.match(pluginSource, /data-tockteam-save-as-image/u)
  assert.match(pluginSource, /role="status"/u)
  assert.match(localeSource, /'action\.saveAsImage'/u)
  assert.match(localeSource, /'status\.capturing'/u)
  assert.match(localeSource, /'status\.saved'/u)
  assert.match(localeSource, /'status\.failed'/u)
  assert.match(localeSource, /'action\.saveAsImage': 'Save as Image'/u)
})

test('composition enrolls the plugin once on Desktop and Web while TUI stays absent', () => {
  const rootPackage = JSON.parse(read('package.json')) as { dsh?: { client?: { inject?: string[] } } }
  const webPackage = JSON.parse(read('web/package.json')) as { dsh?: { client?: { inject?: string[] } } }
  const rootPatch = read('cordis.patch.yml')
  const webPatch = read('web/cordis.patch.yml')
  const tuiPatch = read('plugins/tui/cordis.patch.yml')
  const build = read('scripts/build.mjs')
  const stage = read('scripts/stage-dsh.mjs')
  const pluginId = '@tockteam/save-as-image'
  const patchId = 'tockteam-save-as-image'
  assert.equal(rootPackage.dsh?.client?.inject?.filter(id => id === pluginId).length, 1)
  assert.equal(webPackage.dsh?.client?.inject?.filter(id => id === pluginId).length, 1)
  assert.equal((rootPatch.match(new RegExp(`id: ${patchId}`, 'g')) ?? []).length, 1)
  assert.equal((webPatch.match(new RegExp(`id: ${patchId}`, 'g')) ?? []).length, 1)
  assert.match(rootPatch, new RegExp(`name: '${pluginId.replace('/', '\\/')}'`))
  assert.match(webPatch, new RegExp(`name: '${pluginId.replace('/', '\\/')}'`))
  assert.match(build, /directory: 'save-as-image'/u)
  assert.match(stage, /directory.*save-as-image|save-as-image.*directory/su)
  assert.doesNotMatch(tuiPatch, /save-as-image/u)
  assert.doesNotMatch(`${clientSource}\n${hostSource}`, /dsh-client-ui-primitives|0\.1\.2-alpha/u)
})
