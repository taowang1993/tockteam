import test from 'node:test'
import assert from 'node:assert/strict'
import { selectTrustedProofPage, TRUSTED_PROOF_PAGE_SELECTOR_SOURCE, waitForTrustedProofPage } from '../scripts/trusted-raycast-proof-pages.ts'

type FakePage = Readonly<{ id: string; title(): Promise<string>; url(): string }>
const page = (id: string, title: string, url: string, delay = 0): FakePage => ({ id, url: () => url, title: () => new Promise(resolve => setTimeout(() => resolve(title), delay)) })

test('resolves delayed titles before selecting unique trusted workbench and launcher pages', async () => {
  const workbench = page('workbench', 'TockCoder', 'http://127.0.0.1:43123/tockcoder?capability=opaque', 15)
  const localhost = page('localhost', 'TockCoder', 'http://localhost:43124/tockcoder', 5)
  const launcher = page('launcher', 'TockLauncher', 'file:///tmp/TockTeam/dist/launcher.html', 5)
  const unrelated = page('other', 'Other', 'https://example.com', 1)
  assert.equal(await selectTrustedProofPage([launcher, unrelated, workbench], 'workbench'), workbench)
  assert.equal(await selectTrustedProofPage([workbench, launcher, unrelated], 'launcher'), launcher)
  assert.equal(await selectTrustedProofPage([localhost], 'workbench'), localhost)
  const selectFromEmittedSource = Function(`${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE}; return selectTrustedProofPage`)() as typeof selectTrustedProofPage
  assert.equal(await selectFromEmittedSource([launcher, unrelated, workbench], 'workbench'), workbench)
  const selectWithoutGlobalUrl = Function('URL', `${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE}; return selectTrustedProofPage`)(undefined) as typeof selectTrustedProofPage
  assert.equal(await selectWithoutGlobalUrl([launcher, unrelated, workbench], 'workbench'), workbench)
})

test('boundedly polls through a splash transition with the same trusted predicate', async () => {
  const splash = page('splash', 'TockCoder', 'file:///tmp/TockTeam/dist/splash.html')
  const workbench = page('workbench', 'TockCoder', 'http://localhost:43124/tockcoder')
  let reads = 0
  assert.equal(await waitForTrustedProofPage(() => [reads++ === 0 ? splash : workbench], 'workbench', 100, 1), workbench)
  assert.equal(reads, 2)
  const waitFromEmittedSource = Function(`${TRUSTED_PROOF_PAGE_SELECTOR_SOURCE}; return waitForTrustedProofPage`)() as typeof waitForTrustedProofPage
  reads = 0
  assert.equal(await waitFromEmittedSource(() => [reads++ === 0 ? splash : workbench], 'workbench', 100, 1), workbench)
})

test('times out on a perpetual splash with payload-free diagnostics', async () => {
  const token = 'secret-capability-token'
  const splash = page('splash', 'TockCoder', `file:///tmp/splash.html?token=${token}`)
  await assert.rejects(() => waitForTrustedProofPage(() => [splash], 'workbench', 5, 1), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /title matches 1; scheme classes file; host classes local-file; path classes other/u)
    assert.doesNotMatch(error.message, new RegExp(token, 'u'))
    assert.doesNotMatch(error.message, /file:\/\/\//u)
    return true
  })
})

test('rejects zero, duplicate, and untrusted workbench origins and paths', async () => {
  const workbench = page('workbench', 'TockCoder', 'http://127.0.0.1:43123/tockcoder')
  const duplicate = page('duplicate', 'TockCoder', 'http://[::1]:43124/tockcoder')
  await assert.rejects(() => selectTrustedProofPage([], 'workbench'), /exactly one trusted workbench page/u)
  await assert.rejects(() => selectTrustedProofPage([workbench, duplicate], 'workbench'), /exactly one trusted workbench page/u)
  for (const url of ['https://example.com/tockcoder', 'http://sub.localhost:43123/tockcoder', 'http://user:pass@localhost:43123/tockcoder', 'http://localhost:0/tockcoder', 'http://localhost:43123/', 'http://localhost:43123/tockcoder/']) {
    await assert.rejects(() => selectTrustedProofPage([page('invalid', 'TockCoder', url)], 'workbench'), /exactly one trusted workbench page/u)
  }
  await assert.rejects(() => selectTrustedProofPage([page('remote-file', 'TockLauncher', 'file://example.com/tmp/launcher.html')], 'launcher'), /exactly one trusted launcher page/u)
})
