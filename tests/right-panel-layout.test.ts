import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('desktop shell rail switches between DeepSeek Harness and TockTutor', () => {
  const workspace = readFileSync(
    join(root, 'plugins/sidebar/src/client/plugin.tsx'),
    'utf8',
  )
  const css = readFileSync(
    join(root, 'plugins/sidebar/src/client/sidebar.css'),
    'utf8',
  )

  assert.match(css, /--tockteam-rail-width: 40px;/)
  assert.match(
    css,
    /body\s*\{[^}]*--tockteam-main-pane: var\(--dsw-alias-bg-layer-1, var\(--dsw-alias-bg-base, #fff\)\);[^}]*--tockteam-shell-chrome: color-mix\(in srgb, var\(--dsw-alias-bg-base, #fff\) 96%, var\(--dsw-alias-label-primary, #1f2328\)\);[^}]*--tockteam-shell-divider: color-mix\(in srgb, var\(--dsw-alias-label-primary, #1f2328\) 9%, transparent\);/s,
  )
  assert.match(
    css,
    /body\[data-ds-dark-theme\]\s*\{[^}]*--tockteam-shell-chrome: var\(--dsw-alias-bg-base\);/s,
  )
  assert.match(
    css,
    /#tockteam-embedded-layout\s*\{[^}]*grid-template-columns:\s*var\(--tockteam-rail-width\) minmax\(0, 1fr\) 0;[^}]*grid-template-rows: minmax\(0, 1fr\);/s,
  )
  assert.match(
    css,
    /#tockteam-embedded-layout > #root\s*\{[^}]*--dsw-specific-sidebar-fill: var\(--tockteam-shell-chrome\);[^}]*--dsw-alias-border-l1: var\(--tockteam-shell-divider\);[^}]*min-height: 0;[^}]*overflow: hidden;/s,
  )
  assert.match(css, /#tockteam-rail-root\s*\{[^}]*width: var\(--tockteam-rail-width\);[^}]*padding-top: 0;/s)
  assert.match(
    css,
    /#tockteam-rail-root\s*\{[^}]*background: var\(--tockteam-shell-chrome\);/s,
  )
  assert.doesNotMatch(css, /html\[data-tockteam-tocktutor-active='true'\]\s*\{[^}]*--tockteam-rail-width:/s)
  assert.doesNotMatch(css, /html\[data-tockteam-tocktutor-active='true'\] #tockteam-rail-root/)
  assert.match(
    css,
    /#tockteam-embedded-layout > #root \[data-phase\]\s*\{[^}]*--dsw-alias-bg-base: var\(--tockteam-main-pane\);[^}]*background: var\(--tockteam-main-pane\);/s,
  )
  assert.match(
    css,
    /#tockteam-embedded-layout > #root \[data-phase='hero'\] \[data-composer-seat\] svg\[viewBox='0 0 1051 468'\]\s*\{[^}]*display: none;/s,
  )
  assert.match(workspace, /rail\.id = 'tockteam-rail-root'/)
  assert.match(workspace, /layout\.append\(rail, appRoot, this\.element\)/)
  assert.doesNotMatch(workspace, /createRoot\(rail\)/)
  assert.match(workspace, /function DesktopAppRail/)
  assert.match(workspace, /<nav className="tockteam-app-rail" aria-label="App Navigation">/)
  assert.match(workspace, /aria-label="DeepSeek Harness"/)
  assert.match(workspace, /aria-label="TockTutor"/)
  assert.match(workspace, /<AppRailIcon kind="agent" \/>/)
  assert.match(workspace, /<AppRailIcon kind="notebook" \/>/)
  assert.match(workspace, /return <Notebook aria-hidden="true" \/>/)
  assert.match(workspace, /M10 5\.5C6\.96243 5\.5/)
  assert.doesNotMatch(workspace, /location\.pathname !== '\/'/)
  assert.match(workspace, /appRoot\.inert = true/)
  assert.match(workspace, /sidebarRoot\.inert = true/)
  assert.match(workspace, /appRoot\.inert = appRootWasInert/)
  assert.match(workspace, /sidebarRoot\.inert = sidebarRootWasInert/)
  assert.match(workspace, /dataset\.tockteamTocktutorActive === 'true'/)
  assert.match(workspace, /createPortal\(\s*<div className="tockteam-tocktutor-route"[\s\S]*?document\.body,/)
  assert.match(
    css,
    /\.tockteam-tocktutor-route\s*\{[^}]*inset: var\(--tockteam-titlebar-height, 0\) 0 0 var\(--tockteam-rail-width\);/s,
  )
  assert.match(
    workspace,
    /`var\(--tockteam-rail-width\) minmax\(0, 1fr\) \$\{String\(track\)\}px`/,
  )
  assert.match(
    css,
    /\.tockteam-app-rail button\[aria-current='page'\]\s*\{[^}]*background:/s,
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
  const tockTutor = readFileSync(
    join(root, 'plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx'),
    'utf8',
  )

  assert.match(
    main,
    /titleBarStyle: 'hidden' as const, trafficLightPosition: \{ x: 16, y: 12 \}/,
  )
  assert.match(desktopShell, /document\.documentElement\.dataset\.tockteamDesktop = 'true'/)
  assert.doesNotMatch(desktopShell, /dataset\.tockTeamDesktop/)
  assert.match(
    main,
    /screen\.getAllDisplays\(\)[\s\S]*?display\.internal === false[\s\S]*?display\.id !== primaryDisplay\.id[\s\S]*?x: targetDisplay\.bounds\.x,[\s\S]*?y: targetDisplay\.bounds\.y,/s,
  )
  assert.match(main, /if \(options\.preview !== true\) window\.maximize\(\)/)
  assert.match(workspace, /<header className="tockteam-window-titlebar">/)
  assert.match(workspace, /<span className="tockteam-window-title">TockTeam<\/span>/)
  assert.match(workspace, /<div id="tockteam-window-titlebar-slot" \/>/)
  assert.match(tockTutor, /document\.getElementById\('tockteam-window-titlebar-slot'\) \?\? document\.body/)
  assert.doesNotMatch(workspace, /displayTitle/)
  assert.match(workspace, /props\.showDesktopChrome && createPortal\(/)
  assert.match(workspace, /surface\.kind === 'desktop'/)
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
    /\.tockteam-window-titlebar\s*\{[^}]*position: fixed;[^}]*height: var\(--tockteam-titlebar-height, 40px\);[^}]*-webkit-app-region: drag;/s,
  )
  assert.match(
    css,
    /\.tockteam-window-title\s*\{[^}]*color: color-mix\(in srgb, var\(--dsw-alias-label-primary, #1f2328\) 90%, var\(--tockteam-shell-chrome, #fff\) 10%\);[^}]*font-size: 14px;[^}]*font-weight: 400;/s,
  )
  assert.match(css, /#tockteam-rail-root\s*\{[^}]*border-right: 1px solid var\(--tockteam-shell-divider\);/s)
  assert.match(css, /\.tockteam-window-titlebar\s*\{[^}]*border-bottom: 1px solid var\(--tockteam-shell-divider\);[^}]*background: var\(--tockteam-shell-chrome\);/s)
  assert.match(css, /--tockteam-primary-sidebar-width: 280px;/)
  assert.match(css, /#tockteam-window-titlebar-slot\s*\{[^}]*display: none;/s)
  assert.match(css, /html\[data-tockteam-tocktutor-active='true'\] #tockteam-window-titlebar-slot\s*\{[^}]*display: block;/s)
  assert.match(css, /html\[data-tockteam-tocktutor-active='true'\] \.tockteam-panel-toolbar\s*\{[^}]*display: none;/s)
  assert.match(tockTutor, /\.tocktutor-titlebar\s*\{[^}]*top: 0;/s)
  assert.match(tockTutor, /\.tocktutor-grid\s*\{[^}]*grid-template-columns: var\(--tockteam-primary-sidebar-width, 280px\) minmax\(0, 1fr\) auto auto;[^}]*transition: grid-template-columns 300ms ease-out;/s)
  assert.match(tockTutor, /\.tocktutor-right-panel\s*\{[^}]*transition: width 420ms cubic-bezier\(\.16, 1, \.3, 1\), opacity 300ms/s)
  assert.doesNotMatch(tockTutor, /\.tocktutor-right-panel\s*\{[^}]*position: fixed;/s)
  assert.match(css, /\.tockteam-titlebar-leading\s*\{[^}]*border-right: 1px solid var\(--tockteam-shell-divider\);/s)
  assert.match(
    css,
    /\.tockteam-titlebar-leading\s*\{[^}]*width: var\(--tockteam-primary-sidebar-width\);[^}]*height: 100%;[^}]*align-items: center;[^}]*justify-content: flex-end;[^}]*margin-left: var\(--tockteam-rail-width\);[^}]*padding-right: 4px;[^}]*border-right: 1px solid/s,
  )
  assert.match(
    css,
    /body:has\(\[data-sidebar-collapsed\]\) \.tockteam-titlebar-leading\s*\{[^}]*width: 84px;[^}]*border-right: 0;/s,
  )
  assert.match(
    css,
    /\.tockteam-titlebar-leading button\s*\{[^}]*width: 36px;[^}]*height: 36px;/s,
  )
  assert.match(
    css,
    /\.tockteam-titlebar-leading svg,\s*\.tockteam-panel-toolbar svg\s*\{[^}]*width: 18px;[^}]*height: 18px;/s,
  )
  assert.match(
    css,
    /\.tockteam-app-rail svg\s*\{[^}]*width: 18px;[^}]*height: 18px;/s,
  )
  assert.doesNotMatch(
    css,
    /\.tockteam-titlebar-leading\s*\{[^}]*-webkit-app-region: no-drag;/s,
  )
  assert.match(
    css,
    /\.tockteam-titlebar-leading button,[\s\S]*?\{[^}]*-webkit-app-region: no-drag;/,
  )
  assert.match(
    css,
    /\.tockteam-panel-toolbar\s*\{[^}]*position: fixed;[^}]*top: 5px;[^}]*right: 14px;[^}]*padding: 0;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s,
  )
  assert.doesNotMatch(
    css,
    /\.tockteam-panel-toolbar button(?:\[[^\]]+\])?[^,{]*\{[^}]*background: (?!transparent)/s,
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
  assert.match(workspace, /tockteamRightPanelOwner = 'sidebar'/)
  assert.match(summary, /tockteamRightPanelOwner = 'pinned-summary'/)
  assert.match(summary, /calc\(var\(--tockteam-pinned-summary-width\) \+ 24px\)/)
  assert.match(summary, /height: calc\(\(100vh - var\(--tockteam-titlebar-height, 40px\) - 24px\) \/ 2\);/)
  assert.doesNotMatch(summary, /height: min\(360px/)
  assert.doesNotMatch(workspace, /aria-label="Toggle review panel"/)
  assert.match(workspace, /className="tockteam-review-view"/)
  assert.doesNotMatch(workspace, /tockteam-review-panel/)
  assert.doesNotMatch(workspace, /const embeddedWidth/)
  assert.match(workspace, /const track = this\.state\.open && !this\.narrowViewport\.matches \? this\.state\.width : 0/)
  assert.match(workspaceCss, /\.tockteam-review-view\s*\{[^}]*display: flex;[^}]*flex: 1;[^}]*flex-direction: column;/s)
  assert.match(sideTools, /props\.sidebar\.getTabs\(\)/)
  assert.match(sideTools, /props\.sidebar\.getTab\(activeTab\.type\)/)
  assert.match(sideTools, /descriptor\.render\(renderProps\)/)
  assert.match(sideTools, /<TabStrip sidebar=\{props\.sidebar\} t=\{props\.t\} \/>/)
  assert.match(workspace, /function registerBuiltinSidebarTools/)
  assert.match(workspace, /sidebar\.registerTab\(\{[\s\S]*id: 'review'/)
  assert.match(workspace, /sidebar\.registerViewer\(\{[\s\S]*id: 'binary'/)
  assert.match(workspace, /desktopSidebar\.setSession\(sessions\.list\.getSnapshot\(\)\.current \?\? null\)/)
  assert.match(sideToolsCss, /\.tockteam-side-panel\s*\{[^}]*width: 100% !important;[^}]*border-radius: 0;[^}]*box-shadow: none;/s)
  assert.match(workspace, /const sideOpen = workspaceState\.open/)
  assert.match(workspace, /\{sideOpen\s*\?\s*\(/)
  assert.doesNotMatch(workspace, /\{workspaceState\.open\s*\?\s*\(/)
  assert.match(workspace, /service\.setOpen\(false\); pinnedSummary\.toggle\(\)/)
  assert.match(workspace, /summary: ListFilter/)
  assert.match(workspaceCss, /\.tockteam-workspace-panel\[data-open='true'\]/)
  assert.match(summary, /\[data-tockteam-pinned-summary\]\[data-open='true'\]/)
})
