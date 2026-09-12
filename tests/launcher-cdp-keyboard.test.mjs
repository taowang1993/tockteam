import assert from 'node:assert/strict'
import test from 'node:test'
import { CdpPage } from '../scripts/launcher-packaged-smoke.mjs'

test('Enter text belongs to keyDown so a prevented keydown cannot submit the next view', async () => {
  const page = new CdpPage()
  const events = []
  page.call = async (method, params) => { assert.equal(method, 'Input.dispatchKeyEvent'); events.push(params) }
  await page.pressKey('Enter')
  assert.deepEqual(events.map(event => event.type), ['keyDown', 'keyUp'])
  assert.equal(events[0].text, '\r')
  assert.equal(events[1].text, undefined)
})
