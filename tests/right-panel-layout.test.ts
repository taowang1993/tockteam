import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function sidebarTailwindSource(): string {
  return readFileSync(join(root, 'plugins/skins/src/client/tailwind.css'), 'utf8')
    .replaceAll('&[', 'html[')
    .replaceAll('& ', '')
}

test('desktop shell rail switches between TockCoder and TockTutor', () => {
  const workspace = readFileSync(
    join(root, 'plugins/sidebar/src/client/plugin.tsx'),
    'utf8',
  )
  const marketplace = readFileSync(
    join(root, 'plugins/plugin-marketplace/src/client/plugin.tsx'),
    'utf8',
  )
  const css = sidebarTailwindSource()

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
    workspace,
    /layout\.className = 'grid h-full min-h-0 w-full grid-cols-\[var\(--tockteam-rail-width\)_minmax\(0,1fr\)_0\] grid-rows-\[minmax\(0,1fr\)\]/u,
  )
  assert.match(
    css,
    /#tockteam-embedded-layout > #root\s*\{[^}]*--dsw-specific-sidebar-fill: var\(--tockteam-shell-chrome\);[^}]*--dsw-alias-border-l1: var\(--tockteam-shell-divider\);[^}]*min-height: 0;[^}]*overflow: hidden;/s,
  )
  assert.match(workspace, /rail\.className = '[^']*w-\[var\(--tockteam-rail-width\)\][^']*bg-\[var\(--tockteam-shell-chrome\)\][^']*pt-0'/u)
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
  assert.match(workspace, /<nav className="tockteam-app-rail flex h-full box-border [^"]+" aria-label="App Navigation">/u)
  assert.match(workspace, /aria-label="TockCoder"/)
  assert.doesNotMatch(workspace, /DeepSeek Harness/)
  assert.match(workspace, /aria-label="TockTutor"/)
  assert.match(workspace, /navigate\(TOCKCODER_ROUTE_PREFIX\)/)
  assert.match(workspace, /<AppRailIcon kind="agent" \/>/)
  assert.match(workspace, /<AppRailIcon kind="notebook" \/>/)
  assert.match(workspace, /return <Notebook aria-hidden="true" \/>/)
  assert.match(workspace, /<div className="mt-auto flex flex-col gap-1 pb-1">\s*<DesktopLauncherFallback t=\{t\} \/>\s*\{pluginsAvailable && \([\s\S]*aria-label="Plugins"[\s\S]*aria-label="Settings"/u)
  assert.doesNotMatch(workspace, /\{tockCoderActive && \(\s*<>[\s\S]*aria-label="Plugins"/u)
  assert.equal(workspace.match(/if \(!tockCoderActive\) navigate\(TOCKCODER_ROUTE_PREFIX\)/gu)?.length, 2)
  assert.match(workspace, /className="mt-auto flex flex-col gap-1 pb-1"/)
  assert.match(workspace, /<Blocks aria-hidden="true" \/>/)
  assert.match(workspace, /<Settings aria-hidden="true" \/>/)
  assert.match(workspace, /document\.querySelector\('\[data-tockteam-marketplace-nav\]'\)/)
  assert.match(workspace, /document\.querySelector\('\[data-slot="settings\.trigger"\]'\)/)
  assert.match(workspace, /M10 5\.5C6\.96243 5\.5/)
  assert.doesNotMatch(workspace, /location\.pathname !== '\/'/)
  assert.match(workspace, /appRoot\.inert = true/)
  assert.match(workspace, /sidebarRoot\.inert = true/)
  assert.match(workspace, /appRoot\.inert = appRootWasInert/)
  assert.match(workspace, /sidebarRoot\.inert = sidebarRootWasInert/)
  assert.match(workspace, /dataset\.tockteamTocktutorActive === 'true'/)
  assert.match(workspace, /createPortal\(\s*<div className="tockteam-tocktutor-route [^"]+"[\s\S]*?document\.body,/u)
  assert.match(workspace, /\[inset:var\(--tockteam-titlebar-height,0\)_0_0_var\(--tockteam-rail-width\)\]/u)
  assert.match(
    workspace,
    /`var\(--tockteam-rail-width\) minmax\(0, 1fr\) \$\{String\(track\)\}px`/,
  )
  assert.match(workspace, /\[&_button\[aria-current='page'\]\]:bg-\[color-mix/u)
  assert.match(
    css,
    /\[data-slot='sidebar'\] button:has\(\[data-slot='settings\.trigger'\]\)[\s\S]*?\[data-slot='sidebar'\] \[data-tockteam-marketplace-nav\][\s\S]*?display: none !important;/s,
  )
  assert.match(workspace, /function installPrimarySidebarAdapter\(\): \(\) => void/)
  assert.match(workspace, /replace\(\/\^\[\\d\.\]\+px\/u, '0px'\)/)
  assert.match(workspace, /next\.stopImmediatePropagation\(\)/)
  assert.match(workspace, /requestAnimationFrame\(render\)/)
  assert.match(workspace, /new PointerEvent\('pointermove'/)
  assert.match(marketplace, /const rail = document\.getElementById\('tockteam-rail-root'\)/)
  assert.match(marketplace, /Math\.round\(rail\.getBoundingClientRect\(\)\.right\)/)
  assert.match(marketplace, /className="absolute inset-y-0 right-0 left-\[var\(--tockteam-marketplace-left,0px\)\]/)
  assert.doesNotMatch(marketplace, /top-\[var\(--tockteam-titlebar-height/)
})

test('desktop titlebar matches Tockbot chrome and stays draggable', () => {
  const main = readFileSync(join(root, 'src/main.ts'), 'utf8')
  const desktopShell = readFileSync(join(root, 'src/client.ts'), 'utf8')
  const tailwind = readFileSync(join(root, 'plugins/skins/src/client/tailwind.css'), 'utf8')
  const workspace = readFileSync(
    join(root, 'plugins/sidebar/src/client/plugin.tsx'),
    'utf8',
  )
  const css = sidebarTailwindSource()
  const tockTutor = `${readFileSync(
    join(root, 'plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx'),
    'utf8',
  )}\n${tailwind}`

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
  assert.match(workspace, /<header className="tockteam-window-titlebar [^"]+">/u)
  assert.match(workspace, /<span className="tockteam-window-title [^"]+">TockCoder<\/span>/u)
  assert.match(workspace, /<div className="[^"]+" id="tockteam-window-titlebar-slot" \/>/u)
  assert.match(tockTutor, /document\.getElementById\('tockteam-window-titlebar-slot'\) \?\? document\.body/)
  assert.doesNotMatch(workspace, /displayTitle/)
  assert.match(workspace, /props\.showDesktopChrome && createPortal\(/)
  assert.match(workspace, /surface\.kind === 'desktop'/)
  assert.match(
    tailwind,
    /\[data-slot='sidebar'\] button:is\([\s\S]*?aria-label='Collapse sidebar'[\s\S]*?aria-label='收起侧边栏'[\s\S]*?\)\s*\{[^}]*display: none !important;/s,
  )
  assert.match(
    tailwind,
    /\[data-slot='sidebar'\] button:is\([\s\S]*?aria-label='Open sidebar'[\s\S]*?aria-label='打开侧边栏'[\s\S]*?\) > svg:last-child\s*\{[^}]*display: none !important;/s,
  )
  assert.match(
    tailwind,
    /\[data-slot='sidebar'\] button:is\([\s\S]*?aria-label='New session'[\s\S]*?aria-label='新建会话'[\s\S]*?\)\s*\{[^}]*display: none !important;/s,
  )
  assert.doesNotMatch(tailwind, /aria-label='新建会话'\]\):not\(:has\(\[data-slot='sidebar\.brand\.name'\]\)\)/s)
  assert.match(
    tailwind,
    /\[data-slot='sidebar'\] \*:has\(> button \[data-slot='sidebar\.brand\.name'\]\),[\s\S]*?display: none !important;/s,
  )
  assert.match(workspace, /panels\.toggleSidebar\(\)/)
  assert.match(
    workspace,
    /createPortal\(\s*<>\s*<DesktopWindowTitlebar[\s\S]*?\/>\s*<DesktopPanelToolbar[\s\S]*?<\/>,\s*document\.body/,
  )
  assert.match(workspace, /tockteam-window-titlebar fixed top-0[^"\n]+h-\[var\(--tockteam-titlebar-height,40px\)\][^"\n]+\[-webkit-app-region:drag\]/u)
  assert.match(workspace, /tockteam-window-title[^"\n]+text-sm[^"\n]+font-normal[^"\n]+text-\[color-mix/u)
  assert.match(workspace, /rail\.className = '[^']*border-r[^']*border-\[var\(--tockteam-shell-divider\)\]/u)
  assert.match(workspace, /tockteam-window-titlebar[^"\n]+border-b[^"\n]+border-\[var\(--tockteam-shell-divider\)\][^"\n]+bg-\[var\(--tockteam-shell-chrome\)\]/u)
  assert.match(css, /--tockteam-primary-sidebar-width: 280px;/)
  assert.match(workspace, /const TOCKTEAM_PRIMARY_SIDEBAR_MIN_WIDTH = 200/u)
  assert.match(workspace, /const DSH_PRIMARY_SIDEBAR_MIN_WIDTH = 264/u)
  assert.match(
    workspace,
    /function primarySidebarContent\(frame: HTMLElement\): HTMLElement \| null \{\s*return frame\.querySelector<HTMLElement>\('\[data-slot="sidebar"\] > :first-child'\)\s*\}/u,
  )
  assert.equal(workspace.match(/primarySidebarContent\(frame\)/gu)?.length, 2)
  assert.doesNotMatch(workspace, /frame\.children\.item\(0\)\?\.firstElementChild/u)
  assert.match(
    workspace,
    /document\.documentElement\.style\.setProperty\(\s*'--tockteam-primary-sidebar-width',\s*`\$\{String\(width\)\}px`,?\s*\)/u,
  )
  assert.match(workspace, /const width = Number\.parseFloat\(frame\.style\.gridTemplateColumns\)/u)
  assert.doesNotMatch(workspace, /frame\.children\.item\(0\)\?\.getBoundingClientRect\(\)\.width/u)
  assert.match(workspace, /document\.documentElement\.style\.removeProperty\('--tockteam-primary-sidebar-width'\)/u)
  assert.match(workspace, /className="hidden \[html\[data-tockteam-tocktutor-active='true'\]_&\]:absolute[^"\n]+\]:block" id="tockteam-window-titlebar-slot"/u)
  assert.match(workspace, /tockteam-panel-toolbar[^"\n]+\[html\[data-tockteam-tocktutor-active='true'\]_&\]:hidden/u)
  assert.match(tockTutor, /tocktutor-titlebar absolute top-0/u)
  assert.match(tockTutor, /tocktutor-grid relative grid h-full min-h-0 grid-cols-\[var\(--tockteam-primary-sidebar-width,280px\)_minmax\(0,1fr\)_auto_auto\] transition-\[grid-template-columns\] duration-300 ease-out/u)
  assert.match(tockTutor, /tocktutor-right-panel[^"\n]+transition-\[width,opacity,transform,visibility\][^"\n]+\[transition-duration:420ms,300ms,460ms,0s\]/u)
  assert.doesNotMatch(tockTutor, /tocktutor-right-panel[^"\n]+fixed/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+h-full[^"\n]+w-\[var\(--tockteam-primary-sidebar-width\)\]/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+items-center[^"\n]+justify-end/u)
  assert.match(workspace, /tockteam-titlebar-leading ml-\[var\(--tockteam-rail-width\)\]/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+border-r/u)
  assert.match(workspace, /\[body:has\(\[data-sidebar-collapsed\]\)_&\]:w-\[84px\][^"\n]+\[body:has\(\[data-sidebar-collapsed\]\)_&\]:border-r-0/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+pr-1[^"\n]+\[&_button\]:size-9/u)
  assert.match(tockTutor, /tocktutor-titlebar-sidebar[^"\n]+pr-1/u)
  assert.match(tockTutor, /aria-label="Toggle Files Sidebar"[^>]+className="[^"]*size-9/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+\[&_svg\]:size-\[18px\]/u)
  assert.match(workspace, /tockteam-panel-toolbar[^"\n]+\[&_svg\]:size-\[18px\]/u)
  assert.match(workspace, /tockteam-app-rail[^"\n]+\[&_svg\]:size-\[18px\]/u)
  assert.match(workspace, /tockteam-titlebar-leading[^"\n]+\[&_button\]:\[-webkit-app-region:no-drag\]/u)
  assert.match(workspace, /tockteam-panel-toolbar fixed top-\[5px\] right-3\.5[^"\n]+border-0 bg-transparent p-0 shadow-none/u)
  assert.match(tockTutor, /tocktutor-titlebar-main[^"\n]+pl-2 pr-3\.5/u)
})

test('review, pinned summary, and embedded side tools keep distinct layouts', () => {
  const summary = readFileSync(join(root, 'plugins/pinned-summary/src/client.ts'), 'utf8')
  const workspace = readFileSync(join(root, 'plugins/sidebar/src/client/plugin.tsx'), 'utf8')
  const workspaceCss = sidebarTailwindSource()
  const sideTools = readFileSync(join(root, 'plugins/sidebar/src/client/SideToolsPanel.tsx'), 'utf8')
  const sideToolsCss = workspaceCss

  assert.match(workspace, /if \(open\) this\.pinnedSummary\.setOpen\(false\)/)
  assert.match(workspace, /if \(this\.state\.open\) this\.pinnedSummary\.setOpen\(false\)/)
  assert.match(workspace, /tockteamRightPanelOwner = 'sidebar'/)
  assert.match(summary, /tockteamRightPanelOwner = 'pinned-summary'/)
  assert.match(summary, /'pr-\[312px\]'/)
  assert.match(summary, /absolute right-3 top-\[calc\(var\(--tockteam-titlebar-height,40px\)\+12px\)\]/)
  assert.match(summary, /h-\[calc\(\(100%-var\(--tockteam-titlebar-height,40px\)-24px\)\/2\)\]/)
  assert.doesNotMatch(summary, /100vh-var\(--tockteam-titlebar-height/)
  assert.match(workspaceCss, /#tockteam-chrome-layer > \[data-tockteam-pinned-summary\] \{[\s\S]*top: 12px;[\s\S]*height: calc\(\(100% - 24px\) \/ 2\);/)
  assert.doesNotMatch(summary, /height: min\(360px/)
  assert.doesNotMatch(workspace, /aria-label="Toggle review panel"/)
  assert.match(workspace, /className="tockteam-review-view flex min-h-0 flex-1 flex-col/u)
  assert.doesNotMatch(workspace, /tockteam-review-panel/)
  assert.doesNotMatch(workspace, /const embeddedWidth/)
  assert.match(workspace, /const track = this\.state\.open && !this\.narrowViewport\.matches \? this\.state\.width : 0/)
  assert.doesNotMatch(workspaceCss, /\.tockteam-review-view/u)
  assert.match(sideTools, /props\.sidebar\.getTabs\(\)/)
  assert.match(sideTools, /props\.sidebar\.getTab\(activeTab\.type\)/)
  assert.match(sideTools, /descriptor\.render\(renderProps\)/)
  assert.match(sideTools, /<TabStrip sidebar=\{props\.sidebar\} t=\{props\.t\} \/>/)
  assert.match(workspace, /function registerBuiltinSidebarTools/)
  assert.match(workspace, /sidebar\.registerTab\(\{[\s\S]*id: 'review'/)
  assert.match(workspace, /sidebar\.registerViewer\(\{[\s\S]*id: 'binary'/)
  assert.match(workspace, /desktopSidebar\.setSession\(sessions\.list\.getSnapshot\(\)\.current \?\? null\)/)
  assert.match(sideTools, /tockteam-side-panel[^"\n]+w-full[^"\n]+shadow-none/u)
  assert.match(workspace, /const sideOpen = workspaceState\.open/)
  assert.match(workspace, /\{sideOpen\s*\?\s*\(/)
  assert.doesNotMatch(workspace, /\{workspaceState\.open\s*\?\s*\(/)
  assert.match(workspace, /service\.setOpen\(false\); pinnedSummary\.toggle\(\)/)
  assert.match(workspace, /summary: ListFilter/)
  assert.match(sideTools, /tockteam-workspace-panel[^"\n]+data-\[open=true\]:visible[^"\n]+data-\[open=true\]:opacity-100/u)
  assert.match(sideTools, /layout\.style\.transitionDuration = '0ms'/u)
  assert.match(sideTools, /requestAnimationFrame\(render\)/u)
  assert.match(summary, /data-\[open=true\]:visible/)
})
