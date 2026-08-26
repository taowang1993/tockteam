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
  assert.match(read('plugins/ui/src/popover.tsx'), /data-slot="popover-content"/)
  assert.match(read('plugins/ui/src/skeleton.tsx'), /data-slot="skeleton"/)
  assert.match(read('plugins/ui/src/spinner.tsx'), /data-slot="spinner"/)
  assert.match(read('plugins/ui/src/switch.tsx'), /data-slot="switch"/)
  assert.match(read('plugins/ui/src/tooltip.tsx'), /data-slot="tooltip-content"/)
})

test('remaining browser placeholders and counters use shared presentation components', () => {
  const sidebar = read('plugins/sidebar/src/client/plugin.tsx')
  const sideTools = read('plugins/sidebar/src/client/SideToolsPanel.tsx')

  assert.doesNotMatch(sidebar, /<div className="tockteam-workspace-(?:empty|muted)/)
  assert.doesNotMatch(sideTools, /<div className="tockteam-side-(?:empty|muted)/)
  assert.doesNotMatch(sidebar, /<span className="tockteam-workspace-count/)
  assert.match(sidebar, /<Badge unstyled className="tockteam-workspace-count/)
})

test('rich floating controls use shared popovers and tooltips', () => {
  const assistant = read('plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/assistant-panel.tsx')
  const terminal = read('plugins/panel-controls/src/terminal/TerminalPanel.tsx')

  assert.match(assistant, /from '@tockteam\/ui\/popover'/)
  assert.match(assistant, /from '@tockteam\/ui\/tooltip'/)
  assert.doesNotMatch(assistant, /tocktutor-assistant-add-menu absolute/)
  assert.match(terminal, /from '@tockteam\/ui\/popover'/)
  assert.match(terminal, /from '@tockteam\/ui\/tooltip'/)
  assert.doesNotMatch(terminal, /role="dialog" aria-label=\{t\('terminal\.font-settings'\)\}/)
})

test('icon-only actions use shared tooltips instead of native titles', () => {
  const marketplace = read('plugins/plugin-marketplace/src/client/plugin.tsx')
  const sidebar = read('plugins/sidebar/src/client/plugin.tsx')
  const sideTools = read('plugins/sidebar/src/client/SideToolsPanel.tsx')
  const workbench = read('plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx')

  for (const source of [marketplace, sidebar, sideTools, workbench]) {
    assert.match(source, /from '@tockteam\/ui\/tooltip'/)
    assert.match(source, /<TooltipProvider>/)
  }
  assert.match(marketplace, /<TooltipContent>\{t\('close'\)\}<\/TooltipContent>/)
  assert.match(marketplace, /<TooltipContent>\{t\('search\.clear'\)\}<\/TooltipContent>/)
  assert.doesNotMatch(marketplace, /title=\{t\('close'\)\}/)
  for (const message of ['side.back', 'workspace.refresh', 'workspace.add', 'workspace.close-review', 'workspace.remove-comment']) {
    assert.match(sidebar, new RegExp(`<TooltipContent>\\{t\\('${message.replace('.', '\\.')}'\\)\\}<\\/TooltipContent>`))
  }
  for (const label of ['TockCoder', 'TockTutor']) {
    assert.match(sidebar, new RegExp(`<TooltipContent side="right">${label}<\\/TooltipContent>`))
    assert.doesNotMatch(sidebar, new RegExp(`title="${label}"`))
  }
  assert.match(sideTools, /<TooltipContent>\{t\('side\.close-tab'\)\}<\/TooltipContent>/)
  for (const label of ['Search Notes', 'Toggle Files Sidebar', 'New Note', 'Toggle Assistant Panel', 'Close Search', 'More Note Actions', 'Open Assistant', 'Close More Options', 'Add Pane']) {
    assert.match(workbench, new RegExp(`<TooltipContent>${label}<\\/TooltipContent>`))
  }
  for (const label of ['Search Notes', 'New Note', 'Add Pane']) {
    assert.match(workbench, new RegExp(`<span className="inline-flex">\\s*<Button unstyled aria-label="${label}"`))
  }
})
