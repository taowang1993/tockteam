import assert from 'node:assert/strict'
import { test } from 'node:test'
import { colorPickerMenu } from '../src/user-raycast-menu.ts'

test('the separate Color Picker menu exposes saved colors but never the unsupported native picker', () => {
  const invoked: string[] = []
  const root = { type: 'root', props: {}, children: [{ type: 'raycast-menu-bar', props: { icon: 'EyeDropper' }, children: [
    { type: 'raycast-menu-item', props: { title: 'Pick Color', actionEventId: 'native-picker' }, children: [] },
    { type: 'raycast-menu-section', props: { title: 'Favorites' }, children: [{ type: 'raycast-menu-item', props: { title: '#FF6363', actionEventId: 'favorite-copy' }, children: [] }, { type: 'raycast-menu-item', props: { title: 'View All Favorite Colors', actionEventId: 'unsupported-command' }, children: [] }] },
    { type: 'raycast-menu-section', props: { title: 'Recent Colors' }, children: [{ type: 'raycast-menu-item', props: { title: '#334455', actionEventId: 'recent-copy' }, children: [] }] },
    { type: 'raycast-menu-section', props: {}, children: [{ type: 'raycast-menu-item', props: { title: 'Configure Command', actionEventId: 'preferences' }, children: [] }] },
  ] }] }
  const menu = colorPickerMenu(root, id => invoked.push(id))
  assert.equal(menu[0]?.label, 'Pick Color (Unsupported)')
  assert.equal(menu[0]?.enabled, false)
  assert.deepEqual(menu.filter(item => item.submenu).map(item => item.label), ['Favorites', 'Recent Colors'])
  const favorite = menu[1]?.submenu?.[0]
  assert.equal(favorite?.label, '#FF6363')
  assert.equal(menu[1]?.submenu?.length, 1, 'unsupported command-launching rows stay unavailable')
  favorite?.click?.()
  assert.deepEqual(invoked, ['favorite-copy'])
  assert.doesNotMatch(JSON.stringify(menu.map(({ label }) => label)), /Configure Command/)
})

test('empty or malformed menu data offers no executable item', () => {
  const menu = colorPickerMenu({ type: 'root', props: {}, children: [] }, () => { throw Error('invoked') })
  assert.ok(menu.every(item => !item.click && (item.enabled === false || item.submenu?.every(child => child.enabled === false))))
})
