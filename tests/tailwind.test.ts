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
  assert.match(css, /\.tockteam-pane-divider\{[^}]*touch-action:none;[^}]*-webkit-app-region:no-drag;/u, 'pane dividers retain pointer ownership outside the draggable titlebar')
  assert.match(css, /\.tockteam-pane-divider:after\{[^}]*background:var\(--dsw-alias-border-l1\);[^}]*inset-block:0;[^}]*width:1px;/u, 'idle divider line is thin and confined to the pane-local handle')
  assert.match(css, /\.tockteam-pane-divider:is\(:hover,:active,:focus-visible\):after\{[^}]*background:var\(--tockteam-pane-divider-accent\);[^}]*width:2px;/u, 'pointer and keyboard feedback share the theme accent, not the neutral button brand')
  assert.match(css, /--tockteam-pane-divider-accent:var\(--dsw-specific-markdown-accent\)/u, 'built-in dividers inherit the existing purple accent')
  assert.doesNotMatch(css, /body\[data-tockteam-skin\]\{--tockteam-pane-divider-accent:/u, 'changing skins does not change the purple split highlight')
  assert.match(css, /\.tockteam-pane-divider\[aria-orientation=horizontal\]:is\(:hover,:active,:focus-visible\):after\{[^}]*height:2px;/u, 'lower splits receive the same thin highlight')
  assert.doesNotMatch(css, /url\([^)]*fonts\/KaTeX/u, 'Crepe math fonts must be bundled, not requested from nonexistent application routes')
  assert.match(css, /\.flex-col\{/)
  assert.match(css, /\.text-foreground\{color:var\(--dsw-alias-label-primary\)\}/)
  assert.match(css, /\.bg-primary(?:,[^{]+)?\{background-color:var\(--dsw-alias-button-primary-fill\)\}/)
  assert.match(css, /\.text-primary-foreground\{color:var\(--dsw-alias-label-primary-foreground\)\}/)
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
  const builtinDark = css.match(/\.tockteam-sidebar-styles body\[data-ds-dark-theme\]:not\(\[data-tockteam-skin\]\)\{([^}]*)\}/)?.[1] ?? ''
  assert.match(builtinDark, /--dsw-alias-bg-layer-1:#1e1e1e/, 'the built-in dark shell uses the former note color')
  assert.match(builtinDark, /--tockteam-shell-chrome:var\(--dsw-alias-bg-layer-1\)/)
  assert.match(builtinDark, /--tockteam-main-pane:var\(--dsw-alias-bg-base\)/, 'the editor uses the former dark sidebar color')
  const namedSkin = css.match(/\.tockteam-sidebar-styles body\[data-tockteam-skin\]\{([^}]*)\}/)?.[1] ?? ''
  assert.match(namedSkin, /--tockteam-shell-chrome:var\(--dsw-alias-bg-layer-1\)/, 'named skins use their lighter layer for shell chrome')
  assert.match(namedSkin, /--tockteam-main-pane:var\(--dsw-alias-bg-base\)/, 'named skins use their darker base for the editor')
  assert.match(css, /#tockteam-embedded-layout>#root \.wSkVaW_root\[data-phase\]\{--dsw-alias-bg-base:var\(--tockteam-main-pane\);background:var\(--tockteam-main-pane\)\}/u, 'only the conversation canvas receives the editor background')
  assert.doesNotMatch(css, /#tockteam-embedded-layout>#root \[data-phase\]\{/u, 'composer input phases must not paint a dark rectangle inside the card')
  assert.match(css, /body \.tocktutor-editor\{--tt-panel:var\(--tockteam-main-pane\)\}/, 'all note canvases follow the shared editor surface')
  assert.match(css, /body \.tocktutor-titlebar\{--tt-panel:var\(--tockteam-main-pane\)\}/, 'active note tabs join the editor surface in every skin')
  const settingsSurface = css.match(/\[data-tockteam-settings-page-surface\]\{([^}]*)\}/)?.[1] ?? ''
  assert.match(settingsSurface, /background:var\(--tockteam-main-pane\)!important/, 'every Settings page shares the editor canvas')
  const settingsNav = css.match(/\[data-tockteam-settings-page-surface\]>nav\{([^}]*)\}/)?.[1] ?? ''
  assert.match(settingsNav, /background:var\(--dsw-specific-sidebar-fill\)!important/, 'Settings navigation retains its sidebar surface')
  const editorTheme = css.match(/\.tocktutor-crepe-editor \.milkdown\{([^}]*)\}/)?.[1] ?? ''
  assert.match(editorTheme, /--crepe-color-background:var\(--tt-panel\)/, 'title and article share the document canvas')
  assert.match(editorTheme, /--crepe-color-outline:var\(--dsw-alias-border-l2\)/, 'the editor outline remains bound to the inherited border token')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror\{[^}]*caret-color:currentColor/, 'the native rich-editor caret matches the note text')
  for (const [level, size] of [[1, 26], [2, 24], [3, 20], [4, 19], [5, 17], [6, 16]]) {
    assert.match(css, new RegExp(`\\.tocktutor-crepe-editor \\.milkdown \\.ProseMirror h${level}\\{[^}]*font-size:${size}px`), `Live Preview H${level} matches the descending Reading View heading scale`)
  }
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror a\{color:var\(--dsw-specific-markdown-accent\);font-weight:500/, 'Live Preview links use the checked-box purple with enough ink to look equally bright')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror table\{[^}]*table-layout:auto;[^}]*width:max-content;[^}]*max-width:100%/, 'Live Preview tables take their content width instead of filling the note')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-table-block :is\(th,td\)\{border-color:color-mix\(in srgb, var\(--dsw-alias-label-secondary\) 60%, var\(--tt-panel\)\)/, 'table cell borders remain visible on the dark canvas')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block :is\(\.cm-activeLine,\.cm-activeLineGutter\)\{background:0 0\}/, 'syntax colors are readable without a permanent selected-line stripe')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror :is\(h2,h3,h4,h5,h6\)\{[^}]*margin-bottom:16px/, 'headings separate from their content')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror hr\{[^}]*background-color:var\(--dsw-alias-border-l3\)/, 'authored dividers use the slightly clearer border token without changing other editor outlines')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block\{[^}]*margin:16px 0 24px/, 'code blocks breathe before and after adjacent text')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block \.tools\{[^}]*margin-right:-10px/, 'both code controls shift right together')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror dl\[data-type=footnote_definition\]\{[^}]*display:flex/, 'footnote labels sit in front of their definition text')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block \.tools:before\{[^}]*content:attr\(data-display-language\)/, 'the full language name stays visible without a picker')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block \.tools \.language-button\[hidden\]\{display:none/, 'the vendor language dropdown is not an invisible focus target')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror sup\[data-type=footnote_reference\]\{[^}]*color:var\(--dsw-alias-label-tertiary\);[^}]*font-family:inherit/, 'inline footnote references use the muted note font')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.ProseMirror dl\[data-type=footnote_definition\] dt\{[^}]*color:var\(--dsw-alias-label-tertiary\);[^}]*font-size:12px;[^}]*top:-4px/, 'footnote definition labels align optically with the body text')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block \.tools \.tools-button-group button\.copy-button\{[^}]*opacity:1/, 'the copy control remains visible next to the language')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.milkdown-code-block:has\(\.cm-focused\):before\{[^}]*data-code-language/, 'editing shows the authored code fence language')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper \.label\.ordered\{color:var\(--tt-text\)/, 'ordered list numbers match the note text')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper \.label\.bullet svg\{fill:var\(--tt-text\)/, 'nested bullet glyphs match the note text')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper \.label:is\(\.checked,\.unchecked\) svg\{[^}]*width:21\.333px;[^}]*height:21\.333px/, '18/24 SVG glyph renders at the frontmatter checkbox’s 16px size')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper \.label\.unchecked svg\{fill:color-mix\(in srgb, var\(--tt-text\) 55%, transparent\)/, 'unchecked task outlines stay legible')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper \.label\.checked svg\{[^}]*var\(--dsw-specific-markdown-accent\)/, 'checked task icons use the purple accent')
  assert.match(css, /\.tocktutor-crepe-editor \.milkdown \.label-wrapper:has\(>\.checked\)\+\.children>\.content-dom>p\{text-decoration:line-through\}/u, 'completed task text is crossed out without crossing out unchecked nested tasks')
  const desktopSummary = css.match(/\.tockteam-desktop-shell #tockteam-chrome-layer>\[data-tockteam-pinned-summary\]\{([^}]*)\}/)?.[1] ?? ''
  assert.match(desktopSummary, /height:calc\(50% - 12px\)/)
  assert.match(desktopSummary, /top:12px/)
})

test('shared browser controls use a quieter two-pixel keyboard focus ring', async () => {
  const css = await buildTailwindCss()
  assert.match(css, /\.focus-visible\\:ring-ring:focus-visible\{--tw-ring-color:color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 78%, var\(--dsw-alias-bg-base\)\)\}/u)
  assert.match(css, /\.focus-visible\\:ring-2:focus-visible\{[^}]*calc\(2px \+ var\(--tw-ring-offset-width\)\)/u)
  const theme = readFileSync(join(root, 'plugins/skins/src/client/tailwind.css'), 'utf8')
  assert.match(theme, /--color-ring: color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 78%, var\(--dsw-alias-bg-base\)\)/u)
  for (const name of ['accordion', 'badge', 'button', 'checkbox', 'input', 'native-select', 'slider', 'switch', 'textarea', 'toggle']) {
    const source = readFileSync(join(root, `plugins/ui/src/${name}.tsx`), 'utf8')
    assert.doesNotMatch(source, /focus-visible:ring-3/u, `${name} keeps a visible but not oversized focus ring`)
    assert.match(source, /focus-visible:ring-2/u)
  }
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
      'tockteam-model-picker', 'tockteam-pane-divider', 'tocktutor-note-links',
      'launcher-settings-nav-row', 'launcher-command-surface', 'launcher-command-header', 'launcher-command-search', 'launcher-command-content', 'launcher-command-list',
      'launcher-command-field', 'launcher-command-control', 'launcher-command-select-content', 'launcher-command-select-item', 'launcher-command-status', 'launcher-command-empty', 'launcher-command-error', 'launcher-command-group-title',
      'launcher-command-row', 'launcher-command-row-icon', 'launcher-command-footer', 'launcher-command-footer-identity', 'launcher-command-footer-actions', 'launcher-command-footer-action',
      'launcher-command-menu', 'launcher-command-menu-item',
      'launcher-local-tool', 'launcher-local-tool-header', 'launcher-local-tool-identity', 'launcher-local-tool-content',
      'launcher-local-tool-field', 'launcher-local-tool-status', 'launcher-local-tool-error', 'launcher-secondary-button', 'launcher-primary-button',
      'tockteam-desktop-shell', 'tockteam-sidebar-styles', 'tocktutor-editor', 'tocktutor-crepe-editor',
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
