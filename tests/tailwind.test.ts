import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
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
})

test('splash Tailwind build scans only the standalone loading document', async () => {
  const css = await buildTailwindCss(root, [{ base: root, negated: false, pattern: 'src/splash.html' }])

  assert.match(css, /\.animate-spin\{/)
  assert.doesNotMatch(css, /\.tockteam-sidebar-styles/)
})

test('owned browser components use Tailwind utilities in markup', () => {
  const tailwind = readFileSync(join(root, 'plugins', 'skins', 'src', 'client', 'tailwind.css'), 'utf8')

  assert.doesNotMatch(tailwind, /@utility tocktutor-(?:assistant|import-export|native-actions)-styles/u)
})

test('Tailwind is the only first-party browser stylesheet', () => {
  const files = [
    ...sourceFiles(join(root, 'src')),
    ...sourceFiles(join(root, 'web')),
    ...sourceFiles(join(root, 'plugins')),
  ]
  const localStylesheets = files
    .filter(file => file.endsWith('.css'))
    .map(file => relative(root, file))
    .sort()
  assert.deepEqual(localStylesheets, ['plugins/skins/src/client/tailwind.css'])

  const browserSources = files.filter(file => /\.(?:html|ts|tsx)$/u.test(file))
  const embeddedCss = browserSources.filter(file => (
    /const [A-Z][A-Z0-9_]*_CSS\s*=/u.test(readFileSync(file, 'utf8'))
  ))
  assert.deepEqual(embeddedCss, [])
  const styleElements = browserSources
    .filter(file => /<style[\s>]/u.test(readFileSync(file, 'utf8')))
    .map(file => relative(root, file))
  assert.deepEqual(styleElements, ['src/splash.html'])
  assert.match(readFileSync(join(root, 'src', 'splash.html'), 'utf8'), /__TOCKTEAM_TAILWIND_CSS__/u)
})
