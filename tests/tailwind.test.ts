import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTailwindCss } from '../scripts/tailwind.mjs'

test('browser Tailwind utilities compile against DSH tokens without a global reset', async () => {
  const css = await buildTailwindCss()

  assert.match(css, /\.flex\{/)
  assert.match(css, /\.flex-col\{/)
  assert.match(css, /\.text-foreground\{color:var\(--dsw-alias-label-primary\)\}/)
  assert.doesNotMatch(css, /box-sizing:border-box/)
})
