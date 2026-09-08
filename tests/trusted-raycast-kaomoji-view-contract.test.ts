import assert from 'node:assert/strict'
import test from 'node:test'
import { isTrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'

const svg = (text: string, fill: '#000' | '#fff'): string => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" >\n  <text dominant-baseline="middle" x="45" y="45" text-anchor="middle" fill="${fill}" font-size="8px" text-length="90" length-adjust="spacing">\n    ${[...text].map(value => `&#${value.charCodeAt(0)};`).join('')}\n  </text>\n</svg>`).toString('base64')}`
const action = { type: 'raycast-action', props: { actionEventId: 'copy', icon: 'Clipboard', title: 'Copy to Clipboard' }, children: [] }
const item = {
  type: 'raycast-grid-item',
  props: { contentDark: svg('(^_^)', '#fff'), contentLight: svg('(^_^)', '#000'), title: 'Happy Face' },
  children: [{ type: 'raycast-action-panel', props: {}, children: [action] }],
}
const root = {
  type: 'raycast-grid',
  props: { isLoading: false, querySequence: 0, searchBarPlaceholder: 'Search by name...', searchEventId: 'search', searchable: true },
  children: [{ type: 'raycast-section', props: { subtitle: '1', title: 'emotion' }, children: [item] }],
}
const message = { type: 'ready', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 0, root }

test('Kaomoji admits only finite Grid/Section projection with theme-bounded data SVGs', () => {
  assert.equal(isTrustedRaycastViewMessage(message), true)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, extra: true } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, props: { ...root.props, arbitrary: 'value' } } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], type: 'div' }] } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], children: [{ ...item, props: { ...item.props, contentDark: 'https://example.com/icon.svg' } }] }] } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], children: [{ ...item, props: { ...item.props, contentDark: svg('<script>', '#fff') } }] }] } }), true, 'text is encoded as numeric entities, never markup')
  const foreign = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>bad</foreignObject></svg>').toString('base64')}`
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], children: [{ ...item, props: { ...item.props, contentDark: foreign } }] }] } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], children: [{ ...item, props: { ...item.props, contentDark: svg('x'.repeat(2000), '#fff') } }] }] } }), false)
})

test('Grid and fixed Kaomoji icons cannot cross extension or capability boundaries', () => {
  assert.equal(isTrustedRaycastViewMessage({ ...message, extensionId: 'google-translate' }), false)
  const unknownIcon = { ...item, children: [{ type: 'raycast-action-panel', props: {}, children: [{ ...action, props: { ...action.props, icon: 'Terminal' } }] }] }
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, children: [{ ...root.children[0], children: [unknownIcon] }] } }), false)
  const list = { ...root, type: 'raycast-list', children: [{ ...root.children[0], children: [{ type: 'raycast-list-item', props: { accessories: '[{"text":"Happy Face"}]', subtitle: '', title: '(^_^)' }, children: [action] }] }] }
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: list }), true)
})
