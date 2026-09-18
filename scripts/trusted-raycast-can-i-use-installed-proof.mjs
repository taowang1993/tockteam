import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TRUSTED_RAYCAST_EXTENSION_IDS, trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { trustedRaycastDataPaths } from '../src/trusted-raycast-paths.ts'

const BUNDLED_TRUSTED_RAYCAST_IDS = TRUSTED_RAYCAST_EXTENSION_IDS

/** Serialized into the renderer; permanent search/list shells alone are not proof. */
export function installedCommandReady(document, extensionId) {
  const labels = { 'google-translate': 'Google Translate', 'kaomoji-search': 'Kaomoji Search', 'can-i-use': 'Can I Use' }
  const visible = element => element !== null && !element.closest('[hidden]') && element.getClientRects().length > 0
  const section = document.querySelector(`section[aria-label="${labels[extensionId]}"]`)
  const input = section?.querySelector('#trusted-raycast-search') ?? null
  if (!visible(section) || !visible(input) || input.disabled || section.getAttribute('aria-busy') !== 'false'
    || document.querySelector('section[data-view="preference-setup"], section[data-view="extension-first-use"]')
    || [...section.querySelectorAll('[role="alert"]')].some(visible)) return false
  if (extensionId === 'google-translate') {
    const languages = section.querySelector('select[aria-label="Language Set"]')
    const empty = section.querySelector('.launcher-command-empty > p')
    const actions = [...section.querySelectorAll('footer button')].find(button => button.firstChild?.textContent === 'Actions') ?? null
    return input.placeholder === 'Enter text to translate' && input.value === ''
      && visible(languages) && languages.options.length > 0 && visible(empty) && empty.textContent === 'No Results'
      && visible(actions) && !actions.disabled
  }
  const rows = [...section.querySelectorAll('li.launcher-command-row')]
  const status = section.querySelector('[role="status"]')
  const expected = extensionId === 'kaomoji-search' ? 'Showing 64 results. Search all 1,822 kaomoji.' : 'Showing 64 of 581 matches.'
  return rows.length === 64 && rows.every(visible) && visible(status) && status.textContent.includes(expected)
}

/** Dismiss only the intentional selected-text denial by using empty manual input. */
export async function waitForInstalledCommand(launcher, waitFor, extensionId) {
  const ready = `(${installedCommandReady.toString()})(document, ${JSON.stringify(extensionId)})`
  const wait = expression => waitFor(() => launcher.evaluate(expression), value => value === true, 15000)
  if (extensionId === 'google-translate') {
    const expectedDenial = `document.querySelector('section[aria-label="Google Translate"] [role="alert"]')?.textContent === 'Selected Text Unavailable: Selected text is disabled in the bounded visual proof. Manual input is available.'`
    await wait(`(${ready}) || (${expectedDenial})`)
    if (!await launcher.evaluate(ready)) {
      assert.equal(await launcher.evaluate(`(() => { const input = document.querySelector('section[aria-label="Google Translate"] #trusted-raycast-search'); if (!(input instanceof HTMLInputElement) || input.disabled || !input.getClientRects().length) return false; input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`), true, 'Google manual input is not available after the expected selected-text denial')
    }
  }
  await wait(ready)
}

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
  assert.equal(await launcher.evaluate(`document.querySelector('section[data-view="extension-first-use"]') !== null`), false, 'bundled Can I Use unexpectedly opened approval')
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
  await wait(`document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 64 of 581 matches.') === true && document.querySelector('section[data-view="preference-setup"]') === null`)
  assert.equal(await launcher.evaluate(`document.querySelector('section[data-view="preference-setup"]') === null && document.querySelector('section[aria-label="Can I Use"] #trusted-raycast-search') !== null`), true, 'Can I Use proof stopped at preferences instead of loading the command')
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
    await wait(`document.querySelector('section[aria-label="Can I Use"] [role="status"]')?.textContent?.includes('Showing 64 of 581 matches.') === true && document.querySelector('section[data-view="preference-setup"]') === null`)
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

async function installedTrustState(launcher, extensionId) {
  return await launcher.evaluate(`window.tockteamLauncher.getTrustedRaycastTrust(${JSON.stringify(extensionId)})`)
}

async function assertBundledTrust(launcher, userData, expectedEnabled) {
  const states = {}
  const identities = {}
  for (const extensionId of BUNDLED_TRUSTED_RAYCAST_IDS) {
    const descriptor = trustedRaycastDescriptors[extensionId]
    const state = await installedTrustState(launcher, extensionId)
    assert.equal(state.active, true, `${extensionId} capability is inactive in the packaged app`)
    assert.equal(state.candidateAvailable, true, `packaged ${extensionId} candidate is missing`)
    assert.equal(state.candidateDigest, descriptor.artifactSha256, `packaged ${extensionId} candidate digest drifted`)
    assert.equal(state.installed, true, `${extensionId} was not installed before discovery`)
    assert.equal(state.digestApproved, true, `${extensionId} did not pass digest admission`)
    assert.equal(state.digest, descriptor.artifactSha256, `${extensionId} installed digest drifted`)
    assert.equal(state.enabled, expectedEnabled[extensionId], `${extensionId} enablement drifted`)
    assert.equal(state.recovery, '', `${extensionId} entered recovery during bundled bootstrap`)
    const paths = trustedRaycastDataPaths(userData, extensionId)
    const identity = JSON.parse(await readFile(join(paths.installRoot, 'current', 'build.json'), 'utf8'))
    assert.equal(identity.artifactSha256, descriptor.artifactSha256, `${extensionId} current identity is not the reviewed artifact`)
    states[extensionId] = state
    identities[extensionId] = identity
  }
  return Object.freeze({ states: Object.freeze(states), identities: Object.freeze(identities) })
}

/** Real packaged cold/warm command entry for every bundled extension; mutations stay in the main-owned trust view. */
export async function runBundledTrustedRaycastInstalledSmoke(launcher, userData, { waitFor, clickExactText }, { clickSelector = selector => launcher.clickSelector(selector) } = {}) {
  if (process.platform === 'win32') return Object.freeze({ verified: false, reason: 'Trusted runtime extraction requires /usr/bin/tar' })
  const wait = expression => waitFor(() => launcher.evaluate(expression), value => value === true, 15000)
  const input = (selector, value) => launcher.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) throw Error('Expected input is missing'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const click = async text => {
    await wait(`([...document.querySelectorAll('button, summary')].some(element => { const label = element.textContent?.trim() ?? ''; return (label === ${JSON.stringify(text)} || label.startsWith(${JSON.stringify(text)})) && element.getClientRects().length && !element.matches(':disabled') }))`)
    if (await clickExactText(launcher, text)) return
    assert.equal(await launcher.evaluate(`(() => { const element = [...document.querySelectorAll('button, summary')].find(candidate => (candidate.textContent?.trim() ?? '').startsWith(${JSON.stringify(text)}) && candidate.getClientRects().length && !candidate.matches(':disabled')); if (!(element instanceof HTMLElement)) return false; element.click(); return true })()`), true, `Could not click ${text}`)
  }
  const clickElement = async selector => {
    assert.equal(await clickSelector(selector), true, `Could not click ${selector}`)
  }
  const open = async (query, id, section) => {
    await input('#launcher-search', query)
    await wait(`document.querySelector('[data-result-id="trusted-raycast:${id}"]') !== null`)
    await launcher.pressKey('Enter')
    await wait(`document.querySelector(${JSON.stringify(section)}) !== null`)
    assert.equal(await launcher.evaluate(`document.querySelector('section[data-view="extension-first-use"]') !== null`), false, `${query} unexpectedly opened approval`)
  }
  const assertLoaded = extensionId => waitForInstalledCommand(launcher, waitFor, extensionId)
  const close = async section => {
    await launcher.pressKey('Escape')
    await wait(`document.querySelector(${JSON.stringify(section)}) === null`)
  }
  const enabled = Object.fromEntries(BUNDLED_TRUSTED_RAYCAST_IDS.map(extensionId => [extensionId, true]))
  const cold = await assertBundledTrust(launcher, userData, enabled)

  await open('Translate', 'google-translate:translate', 'section[aria-label="Google Translate"]')
  await wait(`document.querySelector('section[data-view="preference-setup"]') !== null || (${installedCommandReady.toString()})(document, 'google-translate')`)
  if (await launcher.evaluate(`document.querySelector('section[data-view="preference-setup"]') !== null`)) {
    await click('Continue')
    await wait(`document.querySelector('section[aria-label="Google Translate"] #trusted-raycast-search') !== null`)
  }
  await assertLoaded('google-translate')
  await close('section[aria-label="Google Translate"]')
  await open('Translate', 'google-translate:translate', 'section[aria-label="Google Translate"]')
  await assertLoaded('google-translate')
  await close('section[aria-label="Google Translate"]')

  await open('Search Kaomoji', 'kaomoji-search:index', 'section[aria-label="Kaomoji Search"]')
  await assertLoaded('kaomoji-search')
  await close('section[aria-label="Kaomoji Search"]')
  await open('Search Kaomoji', 'kaomoji-search:index', 'section[aria-label="Kaomoji Search"]')
  await assertLoaded('kaomoji-search')
  await close('section[aria-label="Kaomoji Search"]')

  await open('Extensions', 'trust', 'section[aria-label="Extensions"]')
  await clickElement('[role="tab"][data-extension-id="kaomoji-search"]')
  await wait(`document.querySelector('section[aria-label="Extensions"] [role="status"]')?.textContent?.includes('Installed · Enabled') === true`)
  await click('Disable Extension')
  await wait(`document.querySelector('section[aria-label="Extensions"] [role="status"]')?.textContent?.includes('Installed · Disabled') === true`)
  await click('Back to Results')
  await wait(`document.querySelector('section[aria-label="Extensions"]') === null`)
  await input('#launcher-search', 'Search Kaomoji')
  await wait(`document.querySelector('[data-result-id="trusted-raycast:setup:kaomoji-search"]') !== null`)
  assert.equal(await launcher.evaluate(`document.querySelector('[data-result-id="trusted-raycast:kaomoji-search:index"]') !== null`), false, 'disabled Kaomoji remained a runnable command')
  const disabled = await installedTrustState(launcher, 'kaomoji-search')
  assert.equal(disabled.enabled, false, 'Kaomoji disablement was not persisted by the trust view')

  return Object.freeze({
    verified: true,
    cold,
    translate: Object.freeze({ directEntry: true, warmReopen: true, externalEffectsInvoked: false }),
    kaomoji: Object.freeze({ directEntry: true, warmReopen: true, externalEffectsInvoked: false }),
    disablement: Object.freeze({ extensionId: 'kaomoji-search', installed: disabled.installed, enabled: disabled.enabled, setupVisible: true }),
  })
}

/** Reopen the same packaged app after an explicit disablement and prove bootstrap did not re-enable it. */
export async function runTrustedRaycastInstalledRestartSmoke(launcher, userData, { waitFor }) {
  if (process.platform === 'win32') return Object.freeze({ verified: false, reason: 'Trusted runtime extraction requires /usr/bin/tar' })
  const wait = expression => waitFor(() => launcher.evaluate(expression), value => value === true, 15000)
  const input = (selector, value) => launcher.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) throw Error('Expected input is missing'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const expectedEnabled = Object.fromEntries(BUNDLED_TRUSTED_RAYCAST_IDS.map(extensionId => [extensionId, extensionId !== 'kaomoji-search']))
  const trust = await assertBundledTrust(launcher, userData, expectedEnabled)
  for (const [query, command, extensionId] of [['Translate', 'google-translate:translate', 'google-translate'], ['Can I Use', 'can-i-use:index', 'can-i-use']]) {
    await input('#launcher-search', query)
    await wait(`document.querySelector('[data-result-id="trusted-raycast:${command}"]') !== null`)
    await launcher.pressKey('Enter')
    await waitForInstalledCommand(launcher, waitFor, extensionId)
    await launcher.pressKey('Escape')
    await wait(`document.querySelector('#trusted-raycast-search') === null`)
  }
  await input('#launcher-search', 'Search Kaomoji')
  await wait(`document.querySelector('[data-result-id="trusted-raycast:setup:kaomoji-search"]') !== null`)
  assert.equal(await launcher.evaluate(`document.querySelector('[data-result-id="trusted-raycast:kaomoji-search:index"]') !== null`), false, 'restart bootstrap re-enabled disabled Kaomoji')
  await input('#launcher-search', 'Extensions')
  await wait(`document.querySelector('[data-result-id="trusted-raycast:trust"]') !== null`)
  await launcher.pressKey('Enter')
  await wait(`document.querySelector('section[aria-label="Extensions"]') !== null`)
  assert.equal(await launcher.evaluate(`(() => { const tab = document.querySelector('[role="tab"][data-extension-id="kaomoji-search"]'); if (!(tab instanceof HTMLElement)) return false; tab.click(); return true })()`), true, 'restart trust management omitted Kaomoji')
  await wait(`document.querySelector('section[aria-label="Extensions"] [role="status"]')?.textContent?.includes('Installed · Disabled') === true`)
  await launcher.pressKey('Escape')
  await wait(`document.querySelector('section[aria-label="Extensions"]') === null`)
  return Object.freeze({ verified: true, persisted: true, enabledCommandsDirect: true, disabledCommandSetup: true, managementAccessible: true, trust })
}
