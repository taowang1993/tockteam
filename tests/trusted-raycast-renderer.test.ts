import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedRaycastCanIUsePreferenceForm } from '../src/trusted-raycast-can-i-use-preference-form.ts'
import { createTrustedRaycastView } from '../src/trusted-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { TrustedRaycastViewEvent, TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

class Element extends EventTarget {
  static activeElement: Element | undefined
  children: Element[] = []
  attributes = new Map<string, string>()
  value = ''; textContent = ''; placeholder = ''; hidden = false; disabled = false; isConnected = true; tabIndex = 0; open = false
  className = ''
  classList = { toggle: (token: string, force: boolean) => { this.className = force ? `${this.className} ${token}`.trim() : this.className.split(/\s+/u).filter(value => value && value !== token).join(' ') } }
  style = { color: '' }
  id = ''; tagName = ''
  focused = false
  focusOptions: FocusOptions | undefined
  get options(): Element[] { return this.children }
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string) { return this.attributes.get(name) ?? null }
  replaceChildren() { this.children = [] }
  focus(options?: FocusOptions) { Element.activeElement = this; this.focused = true; this.focusOptions = options }
  contains() { return false }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const projection = (revision: number): TrustedRaycastViewMessage => ({ type: revision ? 'patch' : 'ready', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision, root: { type: 'raycast-list', props: { searchEventId: `e${revision}` }, children: [] } })
const inputOf = (nodes: Element[]): Element => nodes.find(node => node.id === 'trusted-raycast-search')!
const errorOf = (nodes: Element[]): Element => nodes.find(node => node.getAttribute('role') === 'alert')!
const kaomojiSvg = (fill: '#000' | '#fff', text: string): string => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" >\n  <text dominant-baseline="middle" x="45" y="45" text-anchor="middle" fill="${fill}" font-size="8px" text-length="90" length-adjust="spacing">\n    ${[...text].map(value => `&#${value.charCodeAt(0)};`).join('')}\n  </text>\n</svg>`).toString('base64')}`

test('Can I Use discloses visible, matching and total feature counts with its own identity', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  for (const [revision, visible, matches] of [[0, 64, 581], [1, 1, 1], [2, 0, 0]]) {
    view.update({ type: revision ? 'patch' : 'ready', extensionId: 'can-i-use', sessionId: 'can', generation: 'g', revision: revision!,
      root: { type: 'raycast-list', props: { queryCurrent: true, searchEventId: `search-${revision}`, visibleCount: visible!, matchCount: matches!, totalCount: 581 },
        children: Array.from({ length: visible! }, (_, index) => ({ type: 'raycast-list-item', props: { title: `Feature ${index}` }, children: [] })) } })
    assert.equal(view.element.getAttribute('aria-label'), 'Can I Use')
    const status = nodes.find(node => node.getAttribute('role') === 'status')!
    assert.equal(status.hidden, false)
    assert.equal(status.textContent, `Showing ${visible} of ${matches} matches. Search covers all 581 features.`)
    assert.ok(nodes.some(node => node.textContent === 'Search Web Features'))
  }
  view.dispose()
})

test('Can I Use changes theme once per actual change and retires the old interaction state', async () => {
  const nodes: Element[] = []; const sent: TrustedRaycastViewEvent[] = []
  const document = { documentElement: { style: { colorScheme: 'dark' } }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0,
    root: { type: 'raycast-list', props: { themeEventId: 'theme', searchEventId: 'search', searchText: 'css-grid' }, children: [] } })
  assert.equal(inputOf(nodes).value, 'css-grid')
  view.refreshTheme(); assert.deepEqual(sent, [])
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme(); await flush()
  assert.deepEqual(sent, [{ extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, kind: 'themeChanged', eventId: 'theme' }])
  assert.equal(inputOf(nodes).disabled, true)
  assert.equal(view.element.getAttribute('aria-busy'), 'true')
  view.refreshTheme(); await flush(); assert.equal(sent.length, 1)
  view.dispose()
})

test('Can I Use opens preferences with the current Host-owned action handle', async () => {
  const nodes: Element[] = []; const sent: TrustedRaycastViewEvent[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0,
    root: { type: 'raycast-list', props: { preferencesEventId: 'settings' }, children: [] } })
  const button = nodes.find(node => node.textContent === 'Preferences')
  assert.ok(button)
  button.dispatchEvent(new Event('click')); await flush()
  assert.deepEqual(sent[0], { extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, kind: 'action', eventId: 'settings' })
  view.dispose()
})

test('Can I Use sends the full browser-target draft before keyboard submission', async () => {
  const nodes: Element[] = []; const sent: TrustedRaycastViewEvent[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  const root = createTrustedRaycastCanIUsePreferenceForm({ defaultQuery: 'chrome 100', showReleaseDate: true, showPartialSupport: false, briefMode: false, path: '', environment: 'production' }, { defaultQuery: 'query', showReleaseDate: 'date', showPartialSupport: 'partial', briefMode: 'brief' }, 'save')
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, root })
  const query = nodes.find(node => node.getAttribute('aria-label') === 'Browser Targets')!
  query.value = Array.from({ length: 15 }, (_, index) => `chrome ${100 + index}`).join(',')
  query.dispatchEvent(new Event('input')); await flush()
  assert.equal(sent.at(-1)?.value, query.value, 'do not silently truncate to the legacy 128-character field limit')
  assert.equal(sent.at(-1)?.eventId, 'query')
  const submit = new Event('keydown', { cancelable: true }); Object.assign(submit, { key: 'Enter', metaKey: true })
  view.element.dispatchEvent(submit); await flush()
  assert.equal(sent.at(-1)?.eventId, 'save')
  assert.equal(sent.at(-1)?.kind, 'action')
  view.dispose()
})

test('first-use identity and fields share one scroll region', () => {
  const nodes: Element[] = []
  const document = { createElement(tagName: string) { const node = new Element(); node.tagName = tagName; nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const root = createTrustedRaycastCanIUsePreferenceForm({ defaultQuery: 'chrome 100', showReleaseDate: true, showPartialSupport: false, briefMode: false, path: '', environment: 'production' }, { defaultQuery: 'query', showReleaseDate: 'date', showPartialSupport: 'partial', briefMode: 'brief' }, 'save')
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, root })

  const content = nodes.find(node => node.className.includes('launcher-command-content'))!
  const heading = nodes.find(node => node.tagName === 'h1' && node.textContent === 'Can I Use')!
  const hero = nodes.find(node => node.children.includes(heading))!
  assert.ok(content.children.includes(hero), 'the logo, title, description, and fields must scroll together')
  view.dispose()
})

test('Can I Use preference dropdowns use shadcn-style listboxes with pointer and keyboard selection', async () => {
  const nodes: Element[] = []; const sent: TrustedRaycastViewEvent[] = []
  const createElement = (tagName: string): Element => { const node = new Element(); node.tagName = tagName; nodes.push(node); return node }
  const document = { get activeElement() { return Element.activeElement }, createElement, createElementNS(_namespace: string, tagName: string) { return createElement(tagName) } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  const root = createTrustedRaycastCanIUsePreferenceForm({ defaultQuery: 'chrome 100', showReleaseDate: true, showPartialSupport: false, briefMode: false, path: '', environment: 'production' }, { defaultQuery: 'query', showReleaseDate: 'date', showPartialSupport: 'partial', briefMode: 'brief' }, 'save')
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, root })

  assert.equal(nodes.filter(node => node.tagName === 'select' && ['Show Release Dates', 'Show Partial Support', 'Brief Mode'].includes(node.getAttribute('aria-label') ?? '')).length, 0)
  const triggers = nodes.filter(node => node.getAttribute('data-slot') === 'select-trigger')
  assert.equal(triggers.length, 3)
  const releaseDate = triggers.find(node => node.getAttribute('aria-label') === 'Show Release Dates')!
  const content = nodes.find(node => node.getAttribute('data-slot') === 'select-content' && node.getAttribute('aria-label') === 'Show Release Dates')!
  assert.ok(releaseDate.children.at(-1)?.getAttribute('class')?.includes('absolute right-3 top-1/2'), 'the chevron matches the Google Translate selector right gutter')
  assert.equal(releaseDate.getAttribute('aria-haspopup'), 'listbox')
  assert.equal(releaseDate.getAttribute('aria-expanded'), 'false')
  assert.equal(content.hidden, true)
  const submitShortcut = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', metaKey: true, ctrlKey: false, altKey: false })
  releaseDate.dispatchEvent(submitShortcut)
  assert.equal(submitShortcut.defaultPrevented, false, 'the select trigger leaves the form submit shortcut to its owner')
  releaseDate.dispatchEvent(new Event('click'))
  assert.equal(content.hidden, false)
  assert.equal(releaseDate.getAttribute('aria-expanded'), 'true')
  const no = nodes.find(node => node.getAttribute('data-slot') === 'select-item' && node.textContent === 'No' && node.getAttribute('aria-selected') === 'false')!
  no.dispatchEvent(new Event('click'))
  await flush()
  assert.deepEqual(sent.at(-1), { extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision: 0, kind: 'fieldChanged', eventId: 'date', value: 'false' })
  assert.equal(content.hidden, true)
  assert.equal(releaseDate.getAttribute('aria-expanded'), 'false')
  assert.equal(releaseDate.children.find(node => node.getAttribute('data-slot') === 'select-value')?.textContent, 'No')
  assert.equal(Element.activeElement, releaseDate)

  releaseDate.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowUp' }))
  assert.equal(Element.activeElement, no)
  const yes = nodes.find(node => node.getAttribute('data-slot') === 'select-item' && node.textContent === 'Yes')!
  no.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowUp' }))
  assert.equal(Element.activeElement, yes)
  yes.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' }))
  await flush()
  assert.equal(sent.at(-1)?.value, 'true')
})

test('Can I Use details show support, preserve counts, and go back with Backspace', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  view.update({ type: 'ready', extensionId: 'can-i-use', sessionId: 'can', generation: 'g', revision: 0,
    root: { type: 'raycast-list', props: { navigationDepth: 0, searchEventId: 'search', visibleCount: 1, matchCount: 1, totalCount: 581 }, children: [
      { type: 'raycast-list-item', props: { title: 'CSS Grid' }, children: [{ type: 'raycast-action', props: { title: 'Show Details', actionEventId: 'details' }, children: [] }] },
    ] } })
  nodes.find(node => node.textContent === 'Show Details' && node.className.includes('launcher-command-menu-item'))!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(view.element.getAttribute('aria-busy'), 'true')
  view.update({ type: 'patch', extensionId: 'can-i-use', sessionId: 'can', generation: 'g', revision: 1,
    root: { type: 'raycast-list', props: { navigationDepth: 1, navigationTitle: 'CSS Grid', navigationEventId: 'pop-1', visibleCount: 1, matchCount: 1, totalCount: 1 }, children: [
      { type: 'raycast-list-item', props: { title: 'Chrome', accessories: JSON.stringify([{ text: 'Supported since version 57' }, { icon: { source: 'Checkmark', tintColor: 'Green' }, tooltip: 'Supported' }]) },
        children: [{ type: 'raycast-action', props: { title: 'Open in Browser', actionEventId: 'browser' }, children: [] }] },
    ] } })
  assert.equal(view.element.getAttribute('aria-busy'), 'false')
  assert.ok(nodes.some(node => node.textContent === 'CSS Grid' && node.className.includes('font-semibold')))
  const support = nodes.find(node => node.getAttribute('role') === 'img' && node.getAttribute('aria-label') === 'Supported')!
  assert.ok(support)
  assert.equal(support.getAttribute('style'), null, 'CSP forbids inline style attributes')
  assert.equal(support.style.color, 'light-dark(#15803d, #4ade80)')
  const status = nodes.find(node => node.getAttribute('role') === 'status')!
  assert.equal(status.textContent, 'Showing 1 of 1 browsers.')
  nodes.findLast(node => node.textContent === 'Open in Browser' && node.className.includes('launcher-command-menu-item'))!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(sent.at(-1)!.eventId, 'browser')
  view.update({ type: 'outcome', extensionId: 'can-i-use', sessionId: 'can', generation: 'g', revision: 1, eventId: 'browser', succeeded: true, message: '' })
  assert.equal(status.textContent, 'Showing 1 of 1 browsers.')
  const backspace = new Event('keydown', { cancelable: true }); Object.assign(backspace, { key: 'Backspace', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
  view.element.dispatchEvent(backspace); await flush()
  assert.equal(backspace.defaultPrevented, true)
  assert.deepEqual(sent.at(-1), { extensionId: 'can-i-use', sessionId: 'can', generation: 'g', revision: 1, kind: 'navigation', eventId: 'pop-1', value: 'can-i-use:pop' })
  view.dispose()
})

test('Kaomoji Grid refreshes the same bounded images across theme changes without disturbing interaction state', () => {
  Element.activeElement = undefined
  const nodes: Element[] = []
  const document = { documentElement: { style: { colorScheme: 'dark' } }, get activeElement() { return Element.activeElement }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  const dark = kaomojiSvg('#fff', '(^_^)'); const light = kaomojiSvg('#000', '(^_^)')
  view.update({ type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 0, root: { type: 'raycast-grid', props: { queryCurrent: true, searchEventId: 'search' }, children: [{ type: 'raycast-grid-item', props: { contentDark: dark, contentLight: light, title: 'Happy' }, children: [{ type: 'raycast-action', props: { actionEventId: 'copy', title: 'Copy to Clipboard' }, children: [] }] }] } })
  const image = nodes.find(node => node.getAttribute('src') === dark)!
  const row = nodes.find(node => node.className.includes('launcher-command-row'))!; row.focus()
  const input = inputOf(nodes); input.value = 'unchanged query'
  const trigger = nodes.findLast(node => node.textContent === 'Actions' && node.className.includes('launcher-command-footer-action'))!; trigger.dispatchEvent(new Event('click'))
  const menu = nodes.find(node => node.className === 'relative' && node.open)!
  const focused = Element.activeElement
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme()
  assert.equal(image.getAttribute('src'), light); assert.equal(Element.activeElement, focused); assert.equal(menu.open, true); assert.equal(input.value, 'unchanged query'); assert.deepEqual(sent, [])
  document.documentElement.style.colorScheme = 'dark'; view.refreshTheme()
  assert.equal(image.getAttribute('src'), dark); assert.equal(Element.activeElement, focused); assert.equal(menu.open, true); assert.equal(input.value, 'unchanged query'); assert.deepEqual(sent, [])
  view.update({ type: 'patch', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 1, status: 'ready', root: { type: 'raycast-list', props: { queryCurrent: true, searchEventId: 'search-1' }, children: [] } })
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme(); assert.equal(image.getAttribute('src'), dark, 'a newer List projection releases old Grid image references')
  document.documentElement.style.colorScheme = 'dark'; view.update({ type: 'patch', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 2, status: 'ready', root: { type: 'raycast-grid', props: { queryCurrent: true, searchEventId: 'search-2' }, children: [{ type: 'raycast-grid-item', props: { contentDark: dark, contentLight: light, title: 'Happy' }, children: [] }] } })
  const erroredImage = nodes.findLast(node => node.getAttribute('src') === dark)!; view.update({ type: 'error', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 3, message: 'closed' })
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme(); assert.equal(erroredImage.getAttribute('src'), dark, 'an error releases current Grid image references')
  document.documentElement.style.colorScheme = 'dark'; view.update({ type: 'patch', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 4, status: 'ready', root: { type: 'raycast-grid', props: { queryCurrent: true, searchEventId: 'search-4' }, children: [{ type: 'raycast-grid-item', props: { contentDark: dark, contentLight: light, title: 'Happy' }, children: [] }] } })
  const disposedImage = nodes.findLast(node => node.getAttribute('src') === dark)!; view.dispose(); document.documentElement.style.colorScheme = 'light'; view.refreshTheme(); assert.equal(disposedImage.getAttribute('src'), dark, 'closing the view releases current Grid image references')
})

test('Kaomoji theme refresh retains at most 64 admitted image references', () => {
  const nodes: Element[] = []
  const document = { documentElement: { style: { colorScheme: 'dark' } }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, {} as LauncherPreloadBridge, () => {})
  const dark = kaomojiSvg('#fff', '(^_^)'); const light = kaomojiSvg('#000', '(^_^)')
  view.update({ type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 0, root: { type: 'raycast-grid', props: { queryCurrent: true, searchEventId: 'search' }, children: Array.from({ length: 65 }, (_, index) => ({ type: 'raycast-grid-item' as const, props: { contentDark: dark, contentLight: light, title: `Happy ${index}` }, children: [] })) } })
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme()
  assert.equal(nodes.filter(node => node.getAttribute('src') === light).length, 64)
  assert.equal(nodes.filter(node => node.getAttribute('src') === '').length, 1)
})

test('Translate theme refresh is an interaction no-op', () => {
  Element.activeElement = undefined
  const nodes: Element[] = []; const sent: TrustedRaycastViewEvent[] = []
  const document = { documentElement: { style: { colorScheme: 'dark' } }, get activeElement() { return Element.activeElement }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  view.update(projection(0)); const input = inputOf(nodes); input.value = 'translate query'; view.focus(); const focused = Element.activeElement
  document.documentElement.style.colorScheme = 'light'; view.refreshTheme()
  assert.equal(Element.activeElement, focused); assert.equal(input.value, 'translate query'); assert.deepEqual(sent, [])
})

test('Kaomoji Grid renders bounded theme image data and extension identity', () => {
  const nodes: Element[] = []
  const document = { documentElement: { style: { colorScheme: 'light' } }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, {} as LauncherPreloadBridge, () => {})
  const dark = kaomojiSvg('#fff', '(^_^)'); const light = kaomojiSvg('#000', '(^_^)')
  view.update({
    type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 0,
    root: { type: 'raycast-grid', props: { queryCurrent: true, searchEventId: 'search' }, children: [{ type: 'raycast-section', props: { subtitle: '15', title: 'animal' }, children: Array.from({ length: 64 }, (_, index) => ({ type: 'raycast-grid-item' as const, props: { contentDark: dark, contentLight: light, title: `Happy Face ${index}` }, children: [{ type: 'raycast-action' as const, props: { actionEventId: `copy-${index}`, title: 'Copy to Clipboard' }, children: [] }] })) }] },
  })
  assert.equal((view.element as unknown as Element).getAttribute('aria-label'), 'Kaomoji Search')
  assert.ok(nodes.some(node => node.textContent === 'Search Kaomoji'))
  const results = nodes.find(node => node.getAttribute('aria-label') === 'Kaomoji Results' && node.getAttribute('role') === 'list')!
  assert.ok(results.className.includes('launcher-command-list'), 'grid extensions share the launcher scrollbar behavior')
  assert.ok(nodes.some(node => node.getAttribute('src') === light))
  const sectionHeading = nodes.find(node => node.textContent === 'animal')!
  assert.ok(sectionHeading.children.some(node => node.textContent === '15'), 'section heading shows the source category count')
  assert.ok(nodes.some(node => node.getAttribute('aria-label') === 'Happy Face 0'))
  const resultCount = nodes.find(node => node.textContent === 'Showing 64 results. Search all 1,822 kaomoji.')!
  assert.ok(resultCount.className.includes('mt-2'), 'result disclosure is separated from the search header')
})

test('launcher focus requests target the visible Translate search control', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, {} as LauncherPreloadBridge, () => {})
  view.update(projection(0))
  const input = inputOf(nodes)
  input.focused = false
  view.focus()
  assert.equal(input.focused, true)
})

test('latest typed input is coalesced and retried when a newer projection overtakes delivery', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const completions: { resolve: () => void; reject: (error: Error) => void }[] = []
  const bridge = { trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event); return new Promise<void>((resolve, reject) => completions.push({ resolve, reject })) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const input = inputOf(nodes)
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')) }
  view.update(projection(0))
  type('old'); type('intermediate'); type('latest')
  view.update({ type: 'toast', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, querySequence: 0, style: 'failure', title: 'Old Query Failed', message: 'obsolete' })
  assert.equal(errorOf(nodes).hidden, true, 'old service toast cannot overtake pending input')
  assert.equal(sent.length, 1, 'one in-flight input, not a queue of obsolete queries')
  completions[0]!.reject(new Error("Error invoking remote method: Translate event is stale"))
  await flush()
  assert.equal(sent.length, 1, 'do not spin on the same stale handle')
  view.update(projection(1))
  assert.equal(sent[1]?.value, 'latest')
  assert.equal(sent[1]?.revision, 1)
  // The next projection may arrive before the rejection of the previous event.
  type('final')
  view.update(projection(2))
  completions[1]!.reject(new Error('Translate event is stale'))
  await flush()
  assert.equal(sent[2]?.value, 'final')
  assert.equal(sent[2]?.eventId, 'e2')
  completions[2]!.resolve(); await flush()
  view.update(projection(3)); await flush()
  assert.equal(sent.length, 3, 'accepted input must not be sent for every render')
  type('closing')
  view.update({ type: 'error', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 4, message: 'closed' })
  completions[3]!.reject(new Error('Translate event is stale')); await flush()
  assert.equal(sent.length, 4)
  assert.equal(input.disabled, true)
})

test('source action outcomes remain visible when React commits after callback completion', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: '<img src=x onerror=alert(1)>' }, children: [{ type: 'raycast-action', props: { title: 'Copy Translation', actionEventId: 'copy' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Copy Translation')!.dispatchEvent(new Event('click'))
  assert.equal((view.element as unknown as Element).getAttribute('aria-busy'), 'true')
  await flush()
  assert.equal(sent[0]?.eventId, 'copy')
  view.update({ type: 'outcome', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, eventId: 'copy', succeeded: true, message: '' })
  assert.equal((view.element as unknown as Element).getAttribute('aria-busy'), 'false')
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'completion status is visible')
  view.update({ ...message, type: 'patch', revision: 1, status: 'ready' })
  assert.ok(nodes.some(node => node.textContent === 'Action Completed'), 'outcome-before-commit must not disappear')
  assert.ok(nodes.some(node => node.textContent === '<img src=x onerror=alert(1)>'), 'translation rendered as text, not HTML')
})

test('footer actions share one pill with theme-aware keycaps, follow selection, open by pointer, and clamp after results shrink', () => {
  const nodes: Element[] = []
  const document = { createElement(tagName: string) { const node = new Element(); node.tagName = tagName; nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const item = (title: string, action: string, eventId: string): NonNullable<TrustedRaycastViewMessage['root']> => ({ type: 'raycast-list-item', props: { title }, children: [{ type: 'raycast-action', props: { title: action, actionEventId: eventId, shortcut: JSON.stringify({ macOS: { key: 'c', modifiers: ['cmd', 'shift'] } }) }, children: [] }] })
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [item('Hello', 'Copy Translation', 'copy-translation'), item('Source', 'Copy', 'copy')] } })
  const resultRows = nodes.filter(node => node.className.includes('launcher-command-row'))
  let primary = nodes.find(node => node.getAttribute('aria-label') === 'Copy Translation' && node.className.includes('launcher-command-footer-action'))!
  const footerGroup = nodes.find(node => node.getAttribute('aria-label') === 'Command Actions')!
  assert.equal(footerGroup.className, 'launcher-command-footer-actions', 'related footer actions share the established launcher pill')
  assert.equal(primary.className, 'launcher-command-footer-action', 'the group owns one shared background')
  const keycaps = nodes.filter(node => node.tagName === 'kbd' && ['↵', '⌘', 'K'].includes(node.textContent))
  assert.deepEqual(keycaps.map(node => node.textContent), ['↵', '⌘', 'K'])
  assert.ok(keycaps.every(node => node.className.includes('var(--dsw-alias-label-primary,CanvasText)_9%,transparent')), 'semantic foreground mixing darkens light keycaps and lightens dark keycaps')
  resultRows[1]!.dispatchEvent(new Event('focusin'))
  assert.equal(primary.getAttribute('aria-label'), 'Copy')
  const trigger = nodes.find(node => node.textContent === 'Actions' && node.className.includes('launcher-command-footer-action'))!
  const menus = nodes.filter(node => node.children.some(child => child.textContent === 'Actions' && child.className === 'sr-only'))
  trigger.dispatchEvent(new Event('click', { bubbles: true }))
  assert.equal(menus[1]!.open, true)
  assert.ok(nodes.some(node => node.textContent === '⌘ ⇧ C'), 'action panels show Raycast-like trailing shortcuts')
  const copyAction = nodes.find(node => node.textContent === 'Copy' && node.className.includes('launcher-command-menu-item'))
  assert.equal(copyAction?.getAttribute('aria-label'), null, 'action text remains the accessible name')
  assert.equal(copyAction?.getAttribute('aria-keyshortcuts'), 'Meta+Shift+C', 'decorative glyphs retain a semantic keyboard shortcut')
  assert.equal(nodes.find(node => node.textContent === '⌘ ⇧ C')?.getAttribute('aria-hidden'), 'true', 'shortcut glyphs stay decorative')
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [item('Hello', 'Copy Translation', 'copy-translation')] } })
  primary = nodes.findLast(node => node.getAttribute('aria-label') === 'Copy Translation' && node.className.includes('launcher-command-footer-action'))!
  assert.equal(primary.disabled, false)
})

test('Kaomoji action semantics ignore shortcut glyphs and restore row or searchbox focus by layer', () => {
  const nodes: Element[] = []
  const document = { get activeElement() { return Element.activeElement }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const action = (title: string, key: string) => ({ type: 'raycast-action' as const, props: { actionEventId: title, shortcut: JSON.stringify({ macOS: { key, modifiers: ['cmd'] } }), title }, children: [] })
  view.update({ type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 0, root: { type: 'raycast-list', props: { queryCurrent: true, searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'Happy' }, children: [action('Paste in Active App', 'enter'), action('Copy to Clipboard', 'c'), action('Pin to Favorites', 'p'), action('Open Extension Preferences', ',')] }] } })
  const row = nodes.find(node => node.className.includes('launcher-command-row'))!
  const trigger = nodes.findLast(node => node.textContent === 'Actions' && node.className.includes('launcher-command-footer-action'))!
  trigger.dispatchEvent(new Event('click'))
  const buttons = nodes.filter(node => node.className.includes('launcher-command-menu-item'))
  assert.deepEqual(buttons.map(button => button.textContent), ['Paste in Active App', 'Copy to Clipboard', 'Pin to Favorites', 'Open Extension Preferences'])
  assert.ok(buttons.every(button => button.getAttribute('aria-label') === null && button.children.every(child => child.getAttribute('aria-hidden') === 'true')))
  assert.equal(Element.activeElement, buttons[0])
  ;(view.element as unknown as Element).dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowDown', isComposing: false, keyCode: 40, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
  assert.equal(Element.activeElement, buttons[1])
  ;(view.element as unknown as Element).dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape', isComposing: false, keyCode: 27, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
  assert.equal(Element.activeElement, row)
  const input = inputOf(nodes); trigger.dispatchEvent(new Event('click')); input.focus(); (view.element as unknown as Element).dispatchEvent(new Event('click'))
  assert.equal(Element.activeElement, input)
})

test('empty results stay centered and retain root language-set actions', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search', searchBarPlaceholder: 'Enter text to translate' }, children: [
    { type: 'raycast-empty', props: { title: 'No Results' }, children: [] },
    { type: 'raycast-action', props: { title: 'Next Language Set', actionEventId: 'next' }, children: [] },
  ] } })
  assert.ok(nodes.some(node => node.textContent === 'No Results' && node.className.includes('font-medium')))
  assert.equal(inputOf(nodes).placeholder, 'Enter text to translate')
  const trigger = nodes.findLast(node => node.textContent === 'Actions' && node.className.includes('launcher-command-footer-action'))!
  assert.equal(trigger.disabled, false)
  trigger.dispatchEvent(new Event('click', { bubbles: true }))
  const menu = nodes.findLast(node => node.children.some(child => child.textContent === 'Actions' && child.className === 'sr-only'))!
  assert.equal(menu.open, true)
})

test('EmptyView renders explicit Hourglass and neutral implicit search icons', () => {
  const nodes: Element[] = []
  const document = {
    createElement() { const node = new Element(); nodes.push(node); return node },
    createElementNS(_namespace: string, tag: string) { const node = new Element(); node.setAttribute('tag', tag); nodes.push(node); return node },
  } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const chromePaths = nodes.filter(node => node.getAttribute('tag') === 'path').length
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-empty', props: { title: 'Translating…', icon: 'Hourglass' }, children: [] }] } })
  assert.equal(nodes.filter(node => node.getAttribute('tag') === 'path').length - chromePaths, 4)
  assert.equal(nodes.some(node => node.getAttribute('tag') === 'circle'), false)
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [{ type: 'raycast-empty', props: { title: 'No Results' }, children: [] }] } })
  assert.equal(nodes.some(node => node.getAttribute('tag') === 'circle'), true)
})

test('result accessories are bounded text and malformed values stay inert', () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  const row = (accessories: string): NonNullable<TrustedRaycastViewMessage['root']> => ({ type: 'raycast-list-item', props: { title: 'Hello', accessories }, children: [{ type: 'raycast-action', props: { title: 'Copy', actionEventId: 'copy' }, children: [] }] })
  view.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [row(JSON.stringify([{ text: 'French → English', tooltip: 'French to English' }]))] } })
  const accessory = nodes.find(node => node.textContent === 'French → English')!
  assert.equal((accessory as unknown as { title: string }).title, 'French to English')
  const oversized = 'x'.repeat(257)
  view.update({ ...projection(1), root: { type: 'raycast-list', props: { searchEventId: 'search-1' }, children: [row(JSON.stringify([{ text: oversized }]))] } })
  assert.equal(nodes.some(node => node.textContent === oversized), false)
})

test('terminal errors clear query and action busy state', () => {
  const actionNodes: Element[] = []
  const actionDocument = { createElement() { const node = new Element(); actionNodes.push(node); return node } } as unknown as Document
  const actionView = createTrustedRaycastView(actionDocument, { trustedRaycastEvent: () => new Promise<void>(() => {}) } as unknown as LauncherPreloadBridge, () => {})
  actionView.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Copy', actionEventId: 'copy' }, children: [] }] }] } })
  actionNodes.find(node => node.textContent === 'Copy')!.dispatchEvent(new Event('click'))
  assert.equal((actionView.element as unknown as Element).getAttribute('aria-busy'), 'true')
  actionView.update({ type: 'error', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 1, message: 'closed' })
  assert.equal((actionView.element as unknown as Element).getAttribute('aria-busy'), 'false')

  const queryNodes: Element[] = []
  const queryDocument = { createElement() { const node = new Element(); queryNodes.push(node); return node } } as unknown as Document
  const queryView = createTrustedRaycastView(queryDocument, { trustedRaycastEvent: () => new Promise<void>(() => {}) } as unknown as LauncherPreloadBridge, () => {})
  queryView.update({ ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search', queryCurrent: false }, children: [{ type: 'raycast-empty', props: { title: 'Translating…', icon: 'Hourglass' }, children: [] }] } })
  const queryResults = queryNodes.find(node => node.getAttribute('aria-label') === 'Translations')!
  const queryInput = inputOf(queryNodes)
  const languageSet = queryNodes.find(node => node.getAttribute('aria-label') === 'Language Set')!
  const status = queryNodes.find(node => node.getAttribute('role') === 'status')!
  const panelActions = queryNodes.find(node => node.className.startsWith('flex flex-wrap items-start'))!
  const footerActions = queryNodes.find(node => node.getAttribute('aria-label') === 'Command Actions')!
  assert.equal(footerActions.getAttribute('role'), 'group')
  assert.equal(queryResults.children.length, 1)
  assert.equal((queryView.element as unknown as Element).getAttribute('aria-busy'), 'true')
  queryView.update({ type: 'error', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 1, message: 'closed' })
  assert.equal((queryView.element as unknown as Element).getAttribute('aria-busy'), 'false')
  assert.equal(queryInput.disabled, true)
  assert.equal(languageSet.disabled, true)
  assert.equal(status.textContent, '')
  assert.equal(status.hidden, true)
  assert.equal(queryResults.children.length, 0, 'terminal errors replace the stale Hourglass projection')
  assert.equal(panelActions.hidden, true)
  assert.equal(footerActions.children.length, 0)
  const alert = errorOf(queryNodes)
  assert.equal(alert.hidden, false)
  assert.match(alert.className, /launcher-command-empty/u)
  assert.equal(alert.textContent, 'closed')
})

test('internal stale or busy action rejections surface as a neutral retry message, not runtime text', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event); return Promise.reject(new Error('Translate event is stale')) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Play Text-To-Speech', actionEventId: 'play' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Play Text-To-Speech')!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(sent[0]?.eventId, 'play')
  const alert = errorOf(nodes)
  assert.equal(alert.hidden, false, 'a visible retry message exists')
  assert.equal(alert.textContent.includes('stale'), false, 'internal stale text must not leak')
  assert.match(alert.textContent, /try again|重试/)
})

test('internal stale or busy child outcomes also surface as the neutral retry message', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const bridge = { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const message: TrustedRaycastViewMessage = { ...projection(0), root: { type: 'raycast-list', props: { searchEventId: 'search' }, children: [{ type: 'raycast-list-item', props: { title: 'result' }, children: [{ type: 'raycast-action', props: { title: 'Play Text-To-Speech', actionEventId: 'play' }, children: [] }] }] } }
  view.update(message)
  nodes.find(node => node.textContent === 'Play Text-To-Speech')!.dispatchEvent(new Event('click'))
  await flush()
  view.update({ type: 'outcome', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, eventId: 'play', succeeded: false, message: 'Translate action is stale or busy' })
  const alert = errorOf(nodes)
  assert.equal(alert.hidden, false)
  assert.equal(alert.textContent.includes('stale'), false)
  assert.match(alert.textContent, /try again|重试/)
})

test('language-set ArrowUp and ArrowDown stay native while result rows retain navigation', () => {
  Element.activeElement = undefined
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async () => {} } as unknown as LauncherPreloadBridge, () => {})
  view.update({ ...projection(0), root: {
    type: 'raycast-list', props: { searchEventId: 'search' }, children: [
      { type: 'raycast-dropdown', props: { value: 'first', fieldEventId: 'language-set' }, children: [
        { type: 'raycast-dropdown-item', props: { title: 'First', value: 'first' }, children: [] },
        { type: 'raycast-dropdown-item', props: { title: 'Second', value: 'second' }, children: [] },
      ] },
      { type: 'raycast-list-item', props: { title: 'First Result' }, children: [] },
      { type: 'raycast-list-item', props: { title: 'Second Result' }, children: [] },
    ],
  } })
  const select = nodes.find(node => node.getAttribute('aria-label') === 'Language Set')!
  const rows = nodes.filter(node => node.className.includes('launcher-command-row'))
  const keydown = (target: Element, key: string): Event => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key, isComposing: false, keyCode: key === 'ArrowDown' ? 40 : 38, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
    Object.defineProperty(event, 'target', { configurable: true, value: target })
    view.element.dispatchEvent(event)
    return event
  }
  const activeBeforeNativeArrow = Element.activeElement
  const nativeArrow = keydown(select, 'ArrowDown')
  assert.equal(nativeArrow.defaultPrevented, false, 'native language selection keeps ownership of arrow keys')
  assert.equal(Element.activeElement, activeBeforeNativeArrow, 'native language selection does not steal focus')
  const rowArrow = keydown(rows[0]!, 'ArrowDown')
  assert.equal(rowArrow.defaultPrevented, true)
  assert.equal(Element.activeElement, rows[1])
  view.dispose()
})

test('language set dropdown change sends a bounded fieldChanged event', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const root: TrustedRaycastViewMessage['root'] = {
    type: 'raycast-list', props: { searchEventId: 'search' },
    children: [
      { type: 'raycast-dropdown', props: { value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }), fieldEventId: 'manage-dropdown' }, children: [
        { type: 'raycast-dropdown-item', props: { title: 'Manage language sets...', value: 'manage' }, children: [] },
        { type: 'raycast-dropdown-item', props: { title: 'Auto -> Simplified Chinese', value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }) }, children: [] },
      ] },
    ],
  }
  view.update({ ...projection(0), root })
  const select = nodes.find(node => node.getAttribute('aria-label') === 'Language Set')!
  assert.equal(select.hidden, false)
  select.value = 'manage'
  select.dispatchEvent(new Event('change'))
  await flush()
  assert.equal(sent[0]?.kind, 'fieldChanged')
  assert.equal(sent[0]?.eventId, 'manage-dropdown')
  assert.equal(sent[0]?.value, 'manage')
})

test('first-run preferences use the Raycast-like centered hierarchy and keyboard submit', async () => {
  const nodes: Element[] = []
  const sent: TrustedRaycastViewEvent[] = []
  const document = {
    createElement() { const node = new Element(); nodes.push(node); return node },
    createElementNS() { const node = new Element(); nodes.push(node); return node },
  } as unknown as Document
  const view = createTrustedRaycastView(document, { trustedRaycastEvent: async (event: TrustedRaycastViewEvent) => { sent.push(event) } } as unknown as LauncherPreloadBridge, () => {})
  const options = [{ type: 'raycast-form-dropdown-item', props: { title: 'English', value: 'en' }, children: [] }] as const
  view.update({ ...projection(0), root: { type: 'root', props: { preferenceSetup: true }, children: [{ type: 'raycast-form', props: {}, children: [
    { type: 'raycast-form-dropdown', props: { title: 'Translate from', value: 'auto', fieldEventId: 'from' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'Auto-Detect', value: 'auto' }, children: [] }] },
    { type: 'raycast-form-dropdown', props: { title: 'Primary Language', value: 'en', fieldEventId: 'primary' }, children: options },
    { type: 'raycast-form-dropdown', props: { title: 'Secondary Language', value: 'en', fieldEventId: 'secondary' }, children: options },
    { type: 'raycast-action', props: { title: 'Continue', actionEventId: 'continue' }, children: [] },
  ] }] } })
  assert.equal(view.element.getAttribute('data-view'), 'preference-setup')
  assert.ok(nodes.some(node => node.getAttribute('alt') === 'Google Translate'))
  assert.ok(nodes.some(node => node.textContent === 'Google Translate'))
  assert.ok(nodes.some(node => node.textContent === 'Google Translate' && node.className.includes('tracking-[0.025em]')))
  const intro = nodes.find(node => node.textContent === 'Before you can start using this extension, you have to set the following preferences:')
  assert.ok(intro?.className.includes('text-[0.84375rem]'))
  assert.ok(intro?.className.includes('max-w-[33.0625rem]'), 'the preference introduction aligns with the control grid')
  const continueButton = nodes.find(node => node.textContent === 'Continue')
  assert.ok(continueButton)
  assert.ok(!continueButton.className.includes('bg-['), 'setup action delegates its material to the shared footer recipe')
  assert.ok(continueButton.className.includes('!px-2') && continueButton.className.includes('!gap-1'), 'setup action keeps compact padding with a visible label-to-shortcut gap')
  assert.ok(nodes.some(node => node.className.includes('launcher-command-header')))
  const preferenceContent = nodes.find(node => node.className.includes('launcher-command-content'))!
  assert.equal(preferenceContent.className.includes('!overflow-hidden'), false, 'overflowing setup fields remain scrollable')
  assert.ok(nodes.some(node => node.className.includes('launcher-command-field')))
  assert.equal(nodes.find(node => node.textContent === 'Translate from')?.className, 'text-right', 'preference labels align to the control edge')
  const preferenceControls = ['Translate from', 'Primary Language', 'Secondary Language'].map(name => nodes.find(node => node.getAttribute('aria-label') === name)!)
  assert.ok(preferenceControls.every(node => node.className.includes('appearance-none') && node.className.includes('pr-8')), 'custom selector chevrons preserve a visible right gutter')
  assert.equal(nodes.filter(node => node.getAttribute('class')?.includes('pointer-events-none') && node.getAttribute('class')?.includes('right-3')).length, 3)
  view.focus()
  assert.deepEqual(preferenceControls[0]?.focusOptions, { focusVisible: false }, 'programmatic setup focus does not paint a ring; keyboard focus remains visible')
  assert.ok(nodes.some(node => node.className.includes('launcher-command-footer')))
  assert.ok(nodes.some(node => node.className.includes('launcher-command-footer-identity')))
  const preferenceForm = nodes.find(node => node.className.includes('w-[33.0625rem]') && node.className.includes('ml-[1.6875rem]'))
  assert.ok(preferenceForm?.className.includes('ml-[1.6875rem]'), 'the preference grid matches Raycast’s left anchor')
  assert.ok(preferenceForm?.className.includes('gap-[1.375rem]'), 'the preference rows match Raycast’s vertical rhythm')
  assert.ok(preferenceForm?.className.includes('pt-5'), 'the first preference row clears the introduction')
  const logoFrame = nodes.find(node => node.className.includes('rounded-full'))
  assert.ok(logoFrame?.className.includes('mb-5'))
  assert.ok(logoFrame?.className.includes('launcher-preference-logo') && !logoFrame.className.includes('bg-['), 'the logo disc delegates theme material to the shared preference recipe')
  assert.ok(!logoFrame?.className.includes(' border '), 'the Raycast logo disc has no extra ring')
  const heroLogo = nodes.find(node => node.getAttribute('alt') === 'Google Translate')
  assert.ok(heroLogo?.className.includes('size-8'), 'the packaged logo keeps breathing room inside its disc')
  const aboutInfo = nodes.find(node => node.textContent === 'ⓘ')
  assert.ok(aboutInfo?.className.includes('ml-1.5'), 'the About label separates its info icon from the final character')
  const shortcutGroup = nodes.find(node => node.className.includes('gap-px'))
  assert.ok(shortcutGroup && !shortcutGroup.className.includes('ml-'), 'setup keycaps do not add space beyond the compact button gap')
  const keycaps = nodes.filter(node => node.className.includes('rounded-[0.25rem]'))
  assert.deepEqual(keycaps.map(node => node.textContent), ['⌘', '↵'])
  assert.ok(keycaps.every(node => node.className.includes('box-border') && node.className.includes('size-5') && node.className.includes('text-sm') && node.className.includes('justify-center')), 'setup keycaps are smaller while their glyphs are larger and centered')
  assert.ok(keycaps.every(node => node.className.includes('border-[var(--dsw-alias-border-l2,CanvasText)]')), 'setup keycaps remain distinct without changing the theme')
  const submit = Object.assign(new Event('keydown'), { key: 'Enter', isComposing: false, keyCode: 13, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })
  view.element.dispatchEvent(submit)
  await flush()
  assert.equal(sent.at(-1)?.kind, 'action')
  assert.equal(sent.at(-1)?.eventId, 'continue')
  view.update(projection(1))
  view.update({ type: 'outcome', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 1, eventId: 'continue', succeeded: true })
  assert.ok(!nodes.some(node => node.getAttribute('role') === 'status' && node.textContent === 'Action Completed'), 'setup completion does not leak into a fresh command view')
})

test('nested AddLanguageForm renders fields and submits through the source action', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const formRoot: TrustedRaycastViewMessage['root'] = {
    type: 'raycast-form', props: { navigationDepth: 1 },
    children: [
      { type: 'raycast-form-dropdown', props: { title: 'Source Language', value: 'auto', fieldEventId: 'from' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'Auto Detect', value: 'auto' }, children: [] }] },
      { type: 'raycast-form-dropdown', props: { title: 'Target Language 1', value: 'en', fieldEventId: 'to0' }, children: [{ type: 'raycast-form-dropdown-item', props: { title: 'English', value: 'en' }, children: [] }, { type: 'raycast-form-dropdown-item', props: { title: 'French', value: 'fr' }, children: [] }] },
      { type: 'raycast-action', props: { title: 'Add Language Set', actionEventId: 'submit-action' }, children: [] },
    ],
  }
  view.update(projection(0))
  view.update({ ...projection(1), root: formRoot })
  const search = inputOf(nodes)
  assert.equal(search.hidden, false, 'stub lacks real layout: search row visibility comes from searchEventId')
  const from = nodes.findLast(node => node.getAttribute('aria-label') === 'Source Language')!
  assert.equal(from.value, 'auto')
  assert.equal(from.focused, true, 'an action-generated form patch focuses its first control')
  from.value = 'en'; from.dispatchEvent(new Event('change'))
  await flush()
  assert.equal(sent[0]?.kind, 'fieldChanged')
  assert.equal(sent[0]?.eventId, 'from')
  assert.equal(sent[0]?.value, 'en')
  nodes.find(node => node.textContent === 'Add Language Set')!.dispatchEvent(new Event('click'))
  await flush()
  assert.equal(sent[1]?.kind, 'action')
  assert.equal(sent[1]?.eventId, 'submit-action')
})

test('Kaomoji preference Escape accepts the current pop event and restores a newer searchable view', async () => {
  Element.activeElement = undefined
  const nodes: Element[] = []
  let view: ReturnType<typeof createTrustedRaycastView>
  let accepted = false
  const document = { get activeElement() { return Element.activeElement }, createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) {
    assert.deepEqual(event, { extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 7, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' })
    accepted = true
    view.update({ type: 'patch', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 8, status: 'ready', root: { type: 'raycast-list', props: { navigationDepth: 0, queryCurrent: true, querySequence: 0, searchable: true, searchEventId: 'search-8' }, children: [] } })
  } } as unknown as LauncherPreloadBridge
  view = createTrustedRaycastView(document, bridge, () => assert.fail('nested Escape closed the trusted view'))
  view.update({ type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 7, root: { type: 'raycast-form', props: { navigationDepth: 1, preferenceSetup: true }, children: [{ type: 'raycast-form-dropdown', props: { fieldEventId: 'display', title: 'Display Mode', value: 'list' }, children: [] }] } })
  const select = nodes.find(node => node.getAttribute('aria-label') === 'Display Mode')!
  assert.equal(Element.activeElement, select)
  view.element.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape', isComposing: false, keyCode: 27, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
  await flush()
  const searchRow = nodes.find(node => node.className === 'flex min-w-0 flex-1 items-center gap-3')!
  assert.equal(accepted, true)
  assert.equal(searchRow.hidden, false)
  assert.equal(Element.activeElement, inputOf(nodes))
})

test('Escape pops a nested view instead of closing the command', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  let closed = false
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => { closed = true })
  const root: TrustedRaycastViewMessage['root'] = { type: 'raycast-list', props: { navigationDepth: 1 }, children: [] }
  view.update({ ...projection(0), root })
  const event = Object.assign(new Event('keydown'), { key: 'Escape', isComposing: false, keyCode: 27, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
  view.element.dispatchEvent(event)
  await flush()
  assert.equal(sent[0]?.kind, 'navigation')
  assert.equal(sent[0]?.value, 'language:pop')
  assert.equal(closed, false, 'nested Escape must not close the command')
})

test('Backspace pops one generic navigation level per distinct keypress', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const bridge = { async trustedRaycastEvent(event: TrustedRaycastViewEvent) { sent.push(event) } } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const root = (navigationDepth: number): NonNullable<TrustedRaycastViewMessage['root']> => ({ type: 'raycast-list', props: { navigationDepth }, children: [] })
  const key = (repeat: boolean) => Object.assign(new Event('keydown', { cancelable: true }), { key: 'Backspace', repeat, isComposing: false, keyCode: 8, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
  view.update({ ...projection(0), root: root(2) })

  view.element.dispatchEvent(key(false))
  view.element.dispatchEvent(key(false))
  view.element.dispatchEvent(key(true))
  await flush()
  assert.equal(sent.length, 1, 'one projection can request only one pop')

  view.update({ ...projection(1), root: root(1) })
  view.element.dispatchEvent(key(true))
  assert.equal(sent.length, 1, 'a held key cannot pop the next level after projection')
  view.element.dispatchEvent(key(false))
  await flush()
  assert.deepEqual(sent.map(event => [event.revision, event.value]), [[0, 'language:pop'], [1, 'language:pop']])
})

test('rejected navigation releases its own fence without releasing a newer pop', async () => {
  const document = { createElement() { return new Element() } } as unknown as Document
  const sent: TrustedRaycastViewEvent[] = []
  const reject: Array<(error: Error) => void> = []
  const view = createTrustedRaycastView(document, { trustedRaycastEvent(event: TrustedRaycastViewEvent) {
    sent.push(event)
    return new Promise<void>((_resolve, rejectEvent) => reject.push(rejectEvent))
  } } as unknown as LauncherPreloadBridge, () => {})
  const update = (revision: number, navigationDepth: number) => view.update({ type: revision ? 'patch' : 'ready', extensionId: 'can-i-use', sessionId: 's', generation: 'g', revision,
    root: { type: 'raycast-list', props: { navigationDepth, navigationEventId: `pop-${revision}` }, children: [] } })
  const back = () => view.element.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Backspace' }))
  update(0, 2)
  back()
  reject[0]!(new Error('action pending'))
  await flush()
  back()
  assert.equal(sent.length, 2, 'a rejected pop must be retryable')

  update(1, 1)
  back()
  assert.equal(sent.length, 3)
  reject[1]!(new Error('late rejection'))
  await flush()
  back()
  assert.equal(sent.length, 3, 'an older rejection cannot unlock the new pop')
  reject[2]!(new Error('stale view event'))
  await flush()
  back()
  assert.equal(sent.length, 4, 'a rejected current pop unlocks even without a depth change')
  view.dispose()
})

test('source-initiated search text (autoInput or pop restore) syncs into the input', async () => {
  const nodes: Element[] = []
  const document = { createElement() { const node = new Element(); nodes.push(node); return node } } as unknown as Document
  const bridge = { async trustedRaycastEvent() {} } as unknown as LauncherPreloadBridge
  const view = createTrustedRaycastView(document, bridge, () => {})
  const root: TrustedRaycastViewMessage['root'] = { type: 'raycast-list', props: { searchEventId: 'search', searchText: 'TockTeam trusted Raycast selection fixture' }, children: [] }
  view.update({ ...projection(0), root })
  assert.equal(inputOf(nodes).value, 'TockTeam trusted Raycast selection fixture')
})
