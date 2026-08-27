import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLauncherFileSearchTool } from '../src/launcher-file-search-tool.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { LauncherPublicResultItem } from '../src/launcher-actions.ts'

class FakeDocument {
  activeElement: FakeElement | null = null
  createElement(tagName: string): FakeElement { return new FakeElement(this, tagName) }
}

class FakeElement {
  readonly attributes = new Map<string, string>()
  readonly children: FakeElement[] = []
  readonly listeners = new Map<string, Array<(event: unknown) => void>>()
  className = ''
  hidden = false
  maxLength = 0
  textContent: string | null = null
  type = ''
  value = ''
  readonly document: FakeDocument
  readonly tagName: string
  constructor(document: FakeDocument, tagName: string) {
    this.document = document
    this.tagName = tagName
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  append(...children: FakeElement[]): void { this.children.push(...children) }
  prepend(...children: FakeElement[]): void { this.children.unshift(...children) }
  dispatch(type: string, event: unknown = {}): void { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  focus(): void { this.document.activeElement = this }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  querySelectorAll<T extends FakeElement>(selector: string): T[] {
    const matches = selector === '[data-file-search-result-id]'
      ? this.children.filter(child => child.attributes.has('data-file-search-result-id'))
      : []
    return [...matches, ...this.children.flatMap(child => child.querySelectorAll<T>(selector))] as T[]
  }
  replaceChildren(...children: FakeElement[]): void { this.children.splice(0, this.children.length, ...children) }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
}

function find(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const match = find(child, predicate)
    if (match !== undefined) return match
  }
  return undefined
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

const options = { fuzziness: 0.5, maxSearchResultItems: 20, searchEngineId: 'fuzzysort' as const }

test('non-hiding reveal rerender restores keyboard focus to the live action menu', async () => {
  const item: LauncherPublicResultItem = {
    additionalActions: [{ actionId: 'launcher-action:reveal', description: 'Show in Finder', hideWindowAfterInvocation: false }],
    defaultAction: { actionId: 'launcher-action:open', description: 'Open file', hideWindowAfterInvocation: true },
    description: 'File',
    details: '/home/max',
    id: 'file-search-result:report',
    name: 'report.txt',
    sourceExtension: 'FileSearch',
  }
  const bridge = {
    dismiss: async () => undefined,
    invokeAction: async () => ({ ok: true as const }),
    search: async () => ({ before: [], after: [item], resultSetId: 'launcher-results:1', status: { indexedItemCount: 1, rescanStatus: 'idle' as const } }),
  } as unknown as LauncherPreloadBridge
  const document = new FakeDocument()
  const tool = createLauncherFileSearchTool({ bridge, document: document as unknown as Document, onClose: () => undefined, searchOptions: options }) as unknown as FakeElement
  const input = find(tool, element => element.tagName === 'input')!
  input.value = 'report'
  input.dispatch('input')
  await flush()
  const toggle = find(tool, element => element.getAttribute('data-file-search-result-id') === item.id)!
  toggle.dispatch('click')
  const reveal = find(tool, element => element.getAttribute('role') === 'menuitem' && element.getAttribute('aria-label') === 'Show in Finder')!
  reveal.dispatch('click')
  await flush()
  await flush()
  assert.equal(document.activeElement?.getAttribute('data-file-search-result-id'), item.id)
})
