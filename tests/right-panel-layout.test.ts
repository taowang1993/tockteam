import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('desktop shell keeps the navigation rail without duplicate tool buttons', () => {
  const workspace = readFileSync(
    join(root, 'plugins/sidebar/src/client/plugin.tsx'),
    'utf8',
  )
  const css = readFileSync(
    join(root, 'plugins/sidebar/src/client/sidebar.css'),
    'utf8',
  )

  assert.match(css, /--oh-dsh-rail-width: 40px;/)
  assert.match(
    css,
    /#oh-dsh-embedded-layout\s*\{[^}]*grid-template-columns:\s*var\(--oh-dsh-rail-width\) minmax\(0, 1fr\) 0;[^}]*grid-template-rows: minmax\(0, 1fr\);/s,
  )
  assert.match(
    css,
    /#oh-dsh-embedded-layout > #root\s*\{[^}]*min-height: 0;[^}]*overflow: hidden;/s,
  )
  assert.match(css, /#oh-dsh-rail-root\s*\{[^}]*width: var\(--oh-dsh-rail-width\);/s)
  assert.match(workspace, /rail\.id = 'oh-dsh-rail-root'/)
  assert.match(workspace, /layout\.append\(rail, appRoot, this\.element\)/)
  assert.doesNotMatch(workspace, /createRoot\(rail\)|DesktopToolRail/)
  assert.match(
    workspace,
    /`var\(--oh-dsh-rail-width\) minmax\(0, 1fr\) \$\{String\(track\)\}px`/,
  )
})

test('desktop titlebar matches Tockbot chrome and stays draggable', () => {
  const main = readFileSync(join(root, 'src/main.ts'), 'utf8')
  const desktopShell = readFileSync(join(root, 'src/client.ts'), 'utf8')
  const workspace = readFileSync(
    join(root, 'plugins/sidebar/src/client/plugin.tsx'),
    'utf8',
  )
  const css = readFileSync(
    join(root, 'plugins/sidebar/src/client/sidebar.css'),
    'utf8',
  )

  assert.match(
    main,
    /titleBarStyle: 'hidden' as const, trafficLightPosition: \{ x: 16, y: 12 \}/,
  )
  assert.match(
    main,
    /screen\.getAllDisplays\(\)[\s\S]*?display\.internal === false[\s\S]*?display\.id !== primaryDisplay\.id[\s\S]*?x: targetDisplay\.bounds\.x,[\s\S]*?y: targetDisplay\.bounds\.y,/s,
  )
  assert.match(main, /if \(options\.preview !== true\) window\.maximize\(\)/)
  assert.match(workspace, /<header className="oh-dsh-window-titlebar">/)
  assert.match(workspace, /className="oh-dsh-window-title"/)
  assert.match(
    desktopShell,
    /\[data-slot='sidebar'\] button:is\([\s\S]*?aria-label='Collapse sidebar'[\s\S]*?aria-label='收起侧边栏'[\s\S]*?\)\s*\{[^}]*display: none !important;/s,
  )
  assert.match(
    desktopShell,
    /\[data-slot='sidebar'\] button:is\([\s\S]*?aria-label='Open sidebar'[\s\S]*?aria-label='打开侧边栏'[\s\S]*?\) > svg:last-child\s*\{[^}]*display: none !important;/s,
  )
  assert.match(workspace, /panels\.toggleSidebar\(\)/)
  assert.match(
    workspace,
    /createPortal\(\s*<>\s*<DesktopWindowTitlebar[\s\S]*?\/>\s*<DesktopPanelToolbar[\s\S]*?<\/>,\s*document\.body/,
  )
  assert.match(
    css,
    /\.oh-dsh-window-titlebar\s*\{[^}]*position: fixed;[^}]*height: var\(--oh-dsh-titlebar-height, 40px\);[^}]*-webkit-app-region: drag;/s,
  )
  assert.match(
    css,
    /\.oh-dsh-titlebar-leading\s*\{[^}]*width: 280px;[^}]*height: 100%;[^}]*align-items: center;[^}]*justify-content: flex-end;[^}]*margin-left: var\(--oh-dsh-rail-width\);[^}]*padding-right: 4px;[^}]*border-right: 1px solid/s,
  )
  assert.match(
    css,
    /body:has\(\[data-sidebar-collapsed\]\) \.oh-dsh-titlebar-leading\s*\{[^}]*width: 56px;[^}]*border-right: 0;/s,
  )
  assert.match(
    css,
    /\.oh-dsh-titlebar-leading button\s*\{[^}]*width: 36px;[^}]*height: 36px;/s,
  )
  assert.match(
    css,
    /\.oh-dsh-titlebar-leading svg\s*\{[^}]*width: 20px;[^}]*height: 20px;/s,
  )
  assert.doesNotMatch(
    css,
    /\.oh-dsh-titlebar-leading\s*\{[^}]*-webkit-app-region: no-drag;/s,
  )
  assert.match(
    css,
    /\.oh-dsh-titlebar-leading button,[\s\S]*?\{[^}]*-webkit-app-region: no-drag;/,
  )
  assert.match(
    css,
    /\.oh-dsh-panel-toolbar\s*\{[^}]*position: fixed;[^}]*top: 5px;[^}]*right: 14px;[^}]*padding: 0;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s,
  )
  assert.doesNotMatch(
    css,
    /\.oh-dsh-panel-toolbar button(?:\[[^\]]+\])?[^,{]*\{[^}]*background: (?!transparent)/s,
  )
})

test('review, pinned summary, and embedded side tools keep distinct layouts', () => {
  const summary = readFileSync(join(root, 'plugins/pinned-summary/src/client.ts'), 'utf8')
  const workspace = readFileSync(join(root, 'plugins/sidebar/src/client/plugin.tsx'), 'utf8')
  const workspaceCss = readFileSync(join(root, 'plugins/sidebar/src/client/sidebar.css'), 'utf8')
  const sideTools = readFileSync(join(root, 'plugins/sidebar/src/client/SideToolsPanel.tsx'), 'utf8')
  const sideToolsCss = readFileSync(join(root, 'plugins/sidebar/src/client/side-tools.css'), 'utf8')

  assert.match(workspace, /if \(open\) this\.pinnedSummary\.setOpen\(false\)/)
  assert.match(workspace, /if \(this\.state\.open\) this\.pinnedSummary\.setOpen\(false\)/)
  assert.match(workspace, /ohDshRightPanelOwner = 'sidebar'/)
  assert.match(summary, /ohDshRightPanelOwner = 'pinned-summary'/)
  assert.match(summary, /calc\(var\(--oh-dsh-pinned-summary-width\) \+ 24px\)/)
  assert.match(summary, /height: calc\(\(100vh - var\(--oh-dsh-titlebar-height, 40px\) - 24px\) \/ 2\);/)
  assert.doesNotMatch(summary, /height: min\(360px/)
  assert.doesNotMatch(workspace, /aria-label="Toggle review panel"/)
  assert.match(workspace, /className="oh-dsh-review-view"/)
  assert.doesNotMatch(workspace, /oh-dsh-review-panel/)
  assert.doesNotMatch(workspace, /const embeddedWidth/)
  assert.match(workspace, /const track = this\.state\.open && !this\.narrowViewport\.matches \? this\.state\.width : 0/)
  assert.match(workspaceCss, /\.oh-dsh-review-view\s*\{[^}]*display: flex;[^}]*flex: 1;[^}]*flex-direction: column;/s)
  assert.match(sideTools, /props\.sidebar\.getTabs\(\)/)
  assert.match(sideTools, /props\.sidebar\.getTab\(activeTab\.type\)/)
  assert.match(sideTools, /descriptor\.render\(renderProps\)/)
  assert.match(sideTools, /<TabStrip sidebar=\{props\.sidebar\} t=\{props\.t\} \/>/)
  assert.match(workspace, /function registerBuiltinSidebarTools/)
  assert.match(workspace, /sidebar\.registerTab\(\{[\s\S]*id: 'review'/)
  assert.match(workspace, /sidebar\.registerViewer\(\{[\s\S]*id: 'binary'/)
  assert.match(workspace, /desktopSidebar\.setSession\(sessions\.list\.getSnapshot\(\)\.current \?\? null\)/)
  assert.match(sideToolsCss, /\.oh-dsh-side-panel\s*\{[^}]*width: 100% !important;[^}]*border-radius: 0;[^}]*box-shadow: none;/s)
  assert.match(workspace, /const sideOpen = workspaceState\.open/)
  assert.match(workspace, /\{sideOpen\s*\?\s*\(/)
  assert.doesNotMatch(workspace, /\{workspaceState\.open\s*\?\s*\(/)
  assert.match(workspace, /service\.setOpen\(false\); pinnedSummary\.toggle\(\)/)
  assert.match(workspace, /kind === 'summary'[\s\S]{0,200}M9 5h7M4 10h12/)
  assert.match(workspaceCss, /\.oh-dsh-workspace-panel\[data-open='true'\]/)
  assert.match(summary, /\[data-oh-dsh-pinned-summary\]\[data-open='true'\]/)
})
