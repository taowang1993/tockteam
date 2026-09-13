import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../plugins/pinned-summary/src/client.ts', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../plugins/sidebar/src/client/plugin.tsx', import.meta.url), 'utf8')

test('pinned summary reconciles a replaced binding under the same session ID', () => {
  assert.match(source, /#currentSession: ObservableSnapshot<unknown> \| undefined/u)
  assert.match(source, /currentId !== this\.#currentId \|\| currentSession !== this\.#currentSession/u)
  assert.match(source, /this\.#currentSession = currentSession/u)
  assert.match(source, /this\.#expanded = false/u)
  assert.match(source, /this\.#unsubscribeSession = currentSession\.subscribe/u)
})

test('pinned summary owns stable dialog relationships and closed-state inertness', () => {
  assert.match(source, /PINNED_SUMMARY_PANEL_ID = 'tockteam-pinned-summary'/u)
  assert.match(source, /panel\.setAttribute\('role', 'dialog'\)/u)
  assert.match(source, /panel\.setAttribute\('aria-modal', 'false'\)/u)
  assert.match(source, /panel\.setAttribute\('aria-labelledby', SUMMARY_HEADING_ID\)/u)
  assert.doesNotMatch(source, /panel\.setAttribute\('aria-label'/u)
  assert.match(source, /this\.#panel\.toggleAttribute\('inert', !this\.#open\)/u)
  assert.match(sidebar, /data-tockteam-summary-toggle=""/u)
  assert.match(sidebar, /aria-haspopup="dialog"/u)
  assert.match(sidebar, /aria-controls="tockteam-pinned-summary"/u)
  assert.doesNotMatch(sidebar, /title=\{t\('summary\.title'\)\}/u)
})

test('pinned summary wires bounded actions and invalidates stale copy feedback', () => {
  assert.match(source, /navigator\.clipboard\?\.writeText === undefined/u)
  assert.match(source, /navigator\.clipboard\.writeText\(text\)/u)
  assert.match(source, /this\.#currentText === text/u)
  assert.match(source, /&& this\.#open/u)
  assert.match(source, /else \{\s+this\.setFeedback\(\)/u)
  assert.match(source, /summary\.copy-success/u)
  assert.match(source, /summary\.copy-failure/u)
  assert.match(source, /this\.#expanded = !this\.#expanded/u)
  assert.match(source, /aria-expanded/u)
})

test('pinned summary cleans global listeners and restores focus on close or unload', () => {
  assert.match(source, /#returnFocus: HTMLElement \| null = null/u)
  assert.match(source, /event\.key !== 'Escape'/u)
  assert.match(source, /event\.stopPropagation\(\)/u)
  assert.match(source, /this\.focusPanel\(\)/u)
  assert.match(source, /this\.#currentSession === session/u)
  assert.match(source, /returnFocus\.focus\(\)/u)
  assert.match(source, /document\.removeEventListener\('keydown', this\.#handleDocumentKeyDown, true\)/u)
  assert.doesNotMatch(source, /pointerdown/u)
  assert.doesNotMatch(source, /if \(this\.#open\) this\.focusPanel\(\)/u)
  assert.match(source, /this\.#listeners\.clear\(\)/u)
})
