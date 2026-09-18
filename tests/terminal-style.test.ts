import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('terminal viewport cannot expose xterm default black behind the themed screen', () => {
  const panel = readFileSync(join(root, 'plugins/panel-controls/src/terminal/TerminalPanel.tsx'), 'utf8')
  const view = readFileSync(join(root, 'plugins/panel-controls/src/terminal/TerminalView.tsx'), 'utf8')

  assert.match(view, /\[&_\.xterm-viewport\]:!bg-surface/)
  assert.match(panel, /border-\[var\(--tockteam-shell-divider,/)
  assert.match(view, /px-3 py-\[9px\]/)
  assert.doesNotMatch(view, /\[&_\.xterm\]:p[xy]?-/)
  assert.match(view, /const requestedCwd = cwdRef\.current\?\.trim\(\)/)
  assert.doesNotMatch(view, /\}, \[props\.cwd, props\.sessionId, props\.tabId\]\)/)
})

test('TockTutor owns keyboard focus while its route is active', () => {
  const panel = readFileSync(
    join(root, 'plugins/panel-controls/src/terminal/TerminalPanel.tsx'),
    'utf8',
  )

  assert.match(
    panel,
    /dataset\.tockteamTocktutorActive === 'true'[\s\S]*?\|\| !event\.ctrlKey \|\| event\.key !== '`'/,
  )
})

test('terminal is controlled only by the shared desktop toolbar', () => {
  const plugin = readFileSync(
    join(root, 'plugins/panel-controls/src/terminal/plugin.tsx'),
    'utf8',
  )
  const mounts = readFileSync(
    join(root, 'plugins/panel-controls/src/terminal/mount-utils.ts'),
    'utf8',
  )

  assert.doesNotMatch(plugin, /TerminalTrigger|terminal-trigger-root/)
  assert.doesNotMatch(mounts, /terminal-trigger-root/)
  assert.match(mounts, /\[\.\.\.record\.removedNodes\]\.some\(isOwnedRoot\)/u)
  assert.match(plugin, /sessionId === undefined\s*\? undefined/u)
  assert.doesNotMatch(plugin, /new-session/u)
  assert.match(plugin, /key=\{surface\.scopeKey\}/u)
  assert.match(plugin, /if \(changed\) this\.renderDock\(\)/u)
})
