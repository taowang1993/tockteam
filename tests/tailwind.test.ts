import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildTailwindCss } from '../scripts/tailwind.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const ignoredDirectories = new Set(['.cache', '.stage', 'dist', 'lib', 'node_modules', 'test', 'tests', 'upstream'])

function sourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...sourceFiles(join(directory, entry.name)))
    } else if (entry.isFile()) {
      files.push(join(directory, entry.name))
    }
  }
  return files
}

test('browser Tailwind utilities compile against DSH tokens without a global reset', async () => {
  const css = await buildTailwindCss()

  assert.match(css, /\.flex\{/)
  assert.match(css, /\.flex-col\{/)
  assert.match(css, /\.text-foreground\{color:var\(--dsw-alias-label-primary\)\}/)
  assert.doesNotMatch(css, /@layer utilities/)
  assert.doesNotMatch(css, /\*,:before,:after\{box-sizing:border-box/)
  assert.match(css, /grid-template-columns:minmax\(10rem,\.?8fr\) minmax\(0,1\.8fr\)/)
  assert.match(css, /\.tockteam-desktop-shell body\[data-scroll-locked\]\{[^}]*padding-top:var\(--tockteam-titlebar-height\)/)
  const chromeLayer = css.match(/(?:^|})#tockteam-chrome-layer\{([^}]*)\}/)?.[1] ?? ''
  assert.match(chromeLayer, /pointer-events:none/)
  assert.match(chromeLayer, /position:fixed/)
  assert.match(chromeLayer, /inset:0/)
  assert.match(chromeLayer, /z-index:8900/)
  assert.match(css, /\.tockteam-desktop-shell #tockteam-chrome-layer\{[^}]*top:var\(--tockteam-titlebar-height\)/)
  assert.match(css, /--dsw-specific-markdown-accent:light-dark\(#705dcf,#a68af9\)/)
  assert.match(css, /--dsw-specific-markdown-highlight:#ffd00066/)
  assert.match(css, /--dsw-specific-markdown-inline-code:color-mix\(in srgb, var\(--dsw-alias-label-primary,currentColor\) 9%, transparent\)/)
  const desktopSummary = css.match(/\.tockteam-desktop-shell #tockteam-chrome-layer>\[data-tockteam-pinned-summary\]\{([^}]*)\}/)?.[1] ?? ''
  assert.match(desktopSummary, /height:calc\(50% - 12px\)/)
  assert.match(desktopSummary, /top:12px/)
})

test('splash Tailwind build scans only the standalone loading document', async () => {
  const css = await buildTailwindCss(root, [{ base: root, negated: false, pattern: 'src/splash.html' }])

  assert.match(css, /\.animate-spin\{/)
  assert.doesNotMatch(css, /\.tockteam-sidebar-styles/)
})

test('owned browser components use Tailwind utilities in markup', () => {
  const tailwind = readFileSync(join(root, 'plugins', 'skins', 'src', 'client', 'tailwind.css'), 'utf8')
  assert.match(tailwind, /@source .*src\/launcher-workflow-settings\.tsx/u)
  assert.match(tailwind.match(/@utility launcher-command-menu-item \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? '', /font-size: 0\.875rem/u, 'shared action menus keep the compact 14px type size')
  assert.ok(tailwind.indexOf('@utility launcher-command-error') > tailwind.indexOf('@utility launcher-command-empty'), 'error color must override the shared empty-state color')
  assert.doesNotMatch(tailwind, /#launcher-root \[data-view='preference-setup'\] \{\s*background:/u, 'preference setup must expose the same command-surface material as the first screen')
  const preferenceSurface = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceSurface, /--tockteam-preference-control-light:[\s\S]*?4%/u, 'light preference materials share the selector color')
  const preferenceHeader = tailwind.match(/#launcher-root \[data-view='preference-setup'\] > \.launcher-command-header \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceHeader, /height: 4rem/u, 'preference setup keeps Raycast’s 64px top region')
  const footerActions = tailwind.match(/@utility launcher-command-footer-action \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(footerActions, /justify-content: center/u, 'fixed and content-sized footer actions center their contents')
  const preferenceFields = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-command-field \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceFields, /gap: 1\.4375rem/u, 'preference labels and controls keep Raycast’s 23px gutter')
  assert.match(preferenceFields, /font-size: 0\.84375rem/u, 'preference row titles match the introduction type size')
  const preferenceControls = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-command-control \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceControls, /height: 2\.125rem/u, 'preference controls keep Raycast’s 34px height')
  assert.match(preferenceControls, /border-radius: 0\.875rem/u, 'preference controls keep Raycast’s radius')
  assert.match(preferenceControls, /var\(--tockteam-preference-control-light\)/u, 'light selectors consume the shared preference material')
  assert.match(preferenceControls, /21%/u, 'dark preference controls preserve Raycast’s contrast against the token-derived surface')
  assert.match(preferenceControls, /font-size: 0\.875rem/u)
  assert.match(preferenceControls, /padding-inline: 0\.75rem 2rem/u, 'selector text has a readable leading inset and clears the Lucide arrow')
  const preferenceFocus = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-command-control:focus-visible \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceFocus, /outline: none/u, 'preference controls replace the prominent ring with a tokenized border')
  assert.match(preferenceFocus, /--dsw-alias-border-l3/u, 'keyboard focus remains visibly indicated')
  const selectContent = tailwind.match(/@utility launcher-command-select-content \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(selectContent, /box-sizing: border-box/u, 'select menu edges align with their trigger without relying on a global reset')
  assert.match(selectContent, /position: fixed/u, 'select menus must not enlarge or scroll their owning form when opened')
  assert.match(selectContent, /var\(--dsw-alias-bg-overlay/u, 'shadcn-style select menus derive their surface from DSH')
  assert.match(selectContent, /max-height: 12rem/u, 'select menus stay bounded')
  const selectItem = tailwind.match(/@utility launcher-command-select-item \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(selectItem, /var\(--dsw-alias-bg-hover/u, 'select options use the shared hover material')
  const preferenceFooterMaterial = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-command-footer-identity,\n#launcher-root \[data-view='preference-setup'\] \.launcher-command-footer-action \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceFooterMaterial, /border-color: color-mix\(/u, 'setup identity and actions share one outlined footer treatment')
  assert.match(preferenceFooterMaterial, /var\(--tockteam-preference-control-light\)/u, 'light setup identity and actions match the selector material')
  const preferenceLogoMaterial = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-preference-logo \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceLogoMaterial, /var\(--tockteam-preference-control-light\)/u, 'the light logo disc matches the controls')
  const preferenceAboutMaterial = tailwind.match(/#launcher-root \[data-view='preference-setup'\] details > summary \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceAboutMaterial, /var\(--tockteam-preference-control-light\)/u, 'the light About pill matches the controls')
  const preferenceBack = tailwind.match(/#launcher-root \[data-view='preference-setup'\] > \.launcher-command-header \.launcher-command-footer-action \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceBack, /background: transparent/u, 'the preference back button rests directly on the shared surface')
  assert.match(preferenceBack, /border-color: transparent/u, 'the preference back button has no resting ring')
  const preferenceIdentity = tailwind.match(/#launcher-root \[data-view='preference-setup'\] \.launcher-command-footer-identity \{(?<recipe>[\s\S]*?)\n\}/u)?.groups?.recipe ?? ''
  assert.match(preferenceIdentity, /padding-inline: 0\.625rem/u, 'setup identity keeps the wider Raycast footer pill')

  assert.deepEqual(
    [...tailwind.matchAll(/^@utility ([\w-]+)/gmu)].map(match => match[1]),
    [
      'launcher-settings-nav-row', 'launcher-command-surface', 'launcher-command-header', 'launcher-command-search', 'launcher-command-content', 'launcher-command-list',
      'launcher-command-field', 'launcher-command-control', 'launcher-command-select-content', 'launcher-command-select-item', 'launcher-command-status', 'launcher-command-empty', 'launcher-command-error', 'launcher-command-group-title',
      'launcher-command-row', 'launcher-command-row-icon', 'launcher-command-footer', 'launcher-command-footer-identity', 'launcher-command-footer-actions', 'launcher-command-footer-action',
      'launcher-command-menu', 'launcher-command-menu-item',
      'launcher-local-tool', 'launcher-local-tool-header', 'launcher-local-tool-identity', 'launcher-local-tool-content',
      'launcher-local-tool-field', 'launcher-local-tool-status', 'launcher-local-tool-error', 'launcher-secondary-button', 'launcher-primary-button',
      'tockteam-desktop-shell', 'tockteam-sidebar-styles', 'tocktutor-live-preview-styles',
    ],
  )
})

test('Tailwind is the only first-party browser stylesheet', () => {
  const files = [
    ...sourceFiles(join(root, 'src')),
    ...sourceFiles(join(root, 'web')),
    ...sourceFiles(join(root, 'plugins')),
  ]
  const localStylesheets = files
    .filter(file => file.endsWith('.css'))
    .map(file => relative(root, file).split(sep).join('/'))
    .sort()
  assert.deepEqual(localStylesheets, ['plugins/skins/src/client/tailwind.css'])

  const browserSources = files.filter(file => /\.(?:html|ts|tsx)$/u.test(file))
  const embeddedCss = browserSources.filter(file => (
    /const [A-Z][A-Z0-9_]*_CSS\s*=/u.test(readFileSync(file, 'utf8'))
  ))
  assert.deepEqual(embeddedCss, [])
  const styleElements = browserSources
    .filter(file => /<style[\s>]/u.test(readFileSync(file, 'utf8')))
    .map(file => relative(root, file).split(sep).join('/'))
  assert.deepEqual(styleElements, ['src/splash.html'])
  assert.match(readFileSync(join(root, 'src', 'splash.html'), 'utf8'), /__TOCKTEAM_TAILWIND_CSS__/u)
})
