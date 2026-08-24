import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = join(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

test('all first-party interface icons use Lucide except product marks', () => {
  const desktop = read('src/client.ts')
  const splash = read('src/splash.html')
  const sidebar = read('plugins/sidebar/src/client/plugin.tsx')
  const sideTools = read('plugins/sidebar/src/client/SideToolsPanel.tsx')
  const marketplace = read('plugins/plugin-marketplace/src/client/plugin.tsx')
  const terminal = read('plugins/panel-controls/src/terminal/TerminalPanel.tsx')
  const skins = read('plugins/skins/src/client/plugin.tsx')
  const summary = read('plugins/pinned-summary/src/client.ts')
  const tockTutor = read('plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx')
  const webClip = read('plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx')

  for (const source of [sidebar, sideTools, marketplace, terminal, skins, tockTutor, webClip]) {
    assert.match(source, /from 'lucide-react'/u)
  }
  assert.match(summary, /from 'lucide'/u)

  assert.equal([...sidebar.matchAll(/<svg\b/gu)].length, 1, 'only the product mark may remain inline')
  assert.match(sidebar, /<svg\b[^>]*data-tockteam-product-mark="true"/u)
  assert.match(desktop, /<svg\b[^>]*data-tockteam-product-mark="true"/u)
  assert.match(splash, /<svg\b[^>]*data-tockteam-product-mark="true"/u)
  for (const source of [sideTools, marketplace, terminal, skins, tockTutor, webClip]) {
    assert.doesNotMatch(source, /<svg\b/u)
  }
  for (const source of [sidebar, sideTools, marketplace, terminal, skins, summary, tockTutor, webClip]) {
    assert.doesNotMatch(source, />\s*[‹↻×−+✓⌃⌄←→↑↓↥▭▣◷▱⑂♩]\s*</u)
  }
})
