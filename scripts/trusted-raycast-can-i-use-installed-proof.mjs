import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'

/** Real packaged renderer/main/child flow. The caller owns the disposable app and cleanup. */
export async function runCanIUseInstalledSmoke(launcher, userData, { waitFor, clickExactText }, { firstUseOnly = false, clickSelector = selector => launcher.clickSelector(selector) } = {}) {
  if (process.platform === 'win32') return Object.freeze({ verified: false, reason: 'Trusted runtime extraction requires /usr/bin/tar' })
  const wait = expression => waitFor(() => launcher.evaluate(expression), value => value === true, 15000)
  const input = (selector, value) => launcher.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) throw Error('Expected input is missing'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const click = async text => {
    await wait(`([...document.querySelectorAll('button, summary')].some(element => element.textContent?.trim() === ${JSON.stringify(text)} && element.getClientRects().length && !element.matches(':disabled')))`)
    assert.equal(await clickExactText(launcher, text), true, `Could not click ${text}`)
  }
  const open = async (query, id) => {
    await input('#launcher-search', query)
    await wait(`document.querySelector('[data-result-id="trusted-raycast:${id}"]') !== null`)
    await launcher.pressKey('Enter')
  }
  const trust = () => launcher.evaluate(`window.tockteamLauncher.getTrustedRaycastTrust('can-i-use')`)
  const legacyPaths = (['google-translate', 'kaomoji-search']).flatMap(id => {
    const paths = trustedRaycastDataPaths(userData, id)
    return [paths.preferencesFile, paths.stateFile, paths.trustFile]
  })
  const legacy = () => Promise.all(legacyPaths.map(path => readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })))
  const before = await legacy()
  await open('Can I Use', 'can-i-use:index')
  const initial = await trust()
  assert.equal(initial.candidateAvailable, true, 'packaged Can I Use candidate is missing')
  assert.equal(initial.candidateDigest, trustedRaycastDescriptors['can-i-use'].artifactSha256)
  assert.equal(initial.installed, true, 'bundled Can I Use was not installed on first launch')
  assert.equal(initial.digestApproved, true, 'bundled Can I Use did not pass digest admission')
  assert.equal(initial.enabled, true, 'bundled Can I Use was not enabled on first launch')
  assert.equal(await launcher.evaluate(`([...document.querySelectorAll('button')].some(button => button.textContent === 'Approve and Open'))`), false, 'bundled Can I Use unexpectedly requested approval')
  await wait(`document.querySelector('input[aria-label="Browser Targets"]') !== null || document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 64 of 581 matches.') === true`)
  if (await launcher.evaluate(`document.querySelector('input[aria-label="Browser Targets"]') !== null`)) {
    await input('input[aria-label="Browser Targets"]', 'chrome 100')
    assert.equal(await clickSelector('input[aria-label="Browser Targets"]'), true, 'Can I Use preference field is not actionable')
    await launcher.pressKey('Enter')
  }
  await wait(`document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 64 of 581 matches.') === true`)
  await input('#trusted-raycast-search', 'textcontent')
  await wait(`document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 1 of 1 matches.') === true`)
  assert.equal(await clickSelector('button[aria-label="Show Details"]'), true, 'Can I Use Show Details is not actionable')
  await wait(`document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 14 of 14 browsers.') === true`)
  if (firstUseOnly) {
    assert.equal(await clickSelector('button[aria-label="Open in Browser"]'), true, 'Can I Use browser effect is not actionable')
    await wait(`document.querySelector('[role="alert"]')?.textContent?.includes('Browser opening is disabled') === true`)
  }
  await launcher.pressKey('Escape')
  await wait(`document.querySelector('#trusted-raycast-search')?.value === 'textcontent' && document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 1 of 1 matches.') === true`)
  await launcher.pressKey('Escape')
  await wait(`document.querySelector('section[aria-label="Can I Use"]') === null`)
  let warmReopen = false
  if (firstUseOnly) {
    await open('Can I Use', 'can-i-use:index')
    await wait(`document.querySelector('section[aria-label="Can I Use"]') !== null`)
    assert.equal(await launcher.evaluate(`[...document.querySelectorAll('button')].some(button => button.textContent === 'Approve and Open')`), false, 'warm Can I Use unexpectedly requested approval')
    await launcher.pressKey('Escape')
    await wait(`document.querySelector('section[aria-label="Can I Use"]') === null`)
    warmReopen = true
  }
  const paths = trustedRaycastDataPaths(userData, 'can-i-use')
  const preferences = JSON.parse(await readFile(paths.preferencesFile, 'utf8'))
  assert.equal(preferences.defaultQuery, 'chrome 100')
  const identity = JSON.parse(await readFile(join(paths.installRoot, 'current/build.json'), 'utf8'))
  assert.equal(identity.artifactSha256, trustedRaycastDescriptors['can-i-use'].artifactSha256)
  assert.deepEqual(await legacy(), before)
  return Object.freeze({ verified: true, artifactSha256: identity.artifactSha256, childSha256: identity.childSha256, detailRows: 14, preferencesPersisted: true, backPreservedQuery: true, legacyPreferencesUnchanged: true, externalEffectsInvoked: false, ...(firstUseOnly ? { warmReopen } : {}) })
}
