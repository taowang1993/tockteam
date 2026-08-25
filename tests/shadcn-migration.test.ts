import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = join(import.meta.dirname, '..')
const migratedReactFiles = [
  'plugins/panel-controls/src/terminal/TerminalPanel.tsx',
  'plugins/plugin-marketplace/src/client/plugin.tsx',
  'plugins/sidebar/src/client/SideToolsPanel.tsx',
  'plugins/sidebar/src/client/plugin.tsx',
  'plugins/skins/src/client/plugin.tsx',
  'plugins/tocktutor/packages/tockbot-note-desktop/src/client-actions.tsx',
  'plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx',
  'plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/assistant-panel.tsx',
  'plugins/tocktutor/packages/tockteam-tocktutor-import-export/src/review-panel.tsx',
  'plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx',
]

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

test('browser React controls use the shared shadcn source components', () => {
  for (const path of migratedReactFiles) {
    const source = read(path)
    assert.doesNotMatch(source, /<(?:button|dialog|input|label|option|select|textarea)\b/, path)
    assert.match(source, /from '@tockteam\/ui\//, path)
  }
})

test('shared controls retain native semantics for parity migrations', () => {
  assert.match(read('plugins/ui/src/alert.tsx'), /data-slot="alert"/)
  assert.match(read('plugins/ui/src/badge.tsx'), /data-slot="badge"/)
  assert.match(read('plugins/ui/src/button.tsx'), /data-slot="button"/)
  assert.match(read('plugins/ui/src/card.tsx'), /data-slot="card"/)
  assert.match(read('plugins/ui/src/checkbox.tsx'), /data-slot="checkbox"/)
  assert.match(read('plugins/ui/src/dialog.tsx'), /data-slot="dialog-content"/)
  assert.match(read('plugins/ui/src/empty.tsx'), /data-slot="empty"/)
  assert.match(read('plugins/ui/src/input.tsx'), /data-slot="input"/)
  assert.match(read('plugins/ui/src/label.tsx'), /data-slot="label"/)
  assert.match(read('plugins/ui/src/textarea.tsx'), /data-slot="textarea"/)
  assert.match(read('plugins/ui/src/native-select.tsx'), /data-slot="native-select"/)
  assert.match(read('plugins/ui/src/skeleton.tsx'), /data-slot="skeleton"/)
  assert.match(read('plugins/ui/src/spinner.tsx'), /data-slot="spinner"/)
  assert.match(read('plugins/ui/src/switch.tsx'), /data-slot="switch"/)
})
