import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { build } from 'esbuild'
import { loadInstalledPlaywright } from '../scripts/launcher-installed-smoke.mjs'
import { stopChildProcess } from '../scripts/process-cleanup.mjs'

// Uses the same globally installed Playwright CLI/browser as the installed smoke.
test('TockCoder panels keep workspace, diff, and directory responses attached to their selection', { timeout: 60_000 }, async () => {
  const bundle = await build({
    entryPoints: [new URL('./fixtures/tockcoder-panel.ts', import.meta.url).pathname],
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  })
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text
      : '<!doctype html><html style="color-scheme:dark"><body><div id="root"></div><script src="/fixture.js"></script></body></html>')
  })
  let browserServer
  let browser
  let root
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const chromium = await loadInstalledPlaywright()
    browserServer = await chromium.launchServer({ headless: true, args: ['--use-mock-keychain'] })
    root = browserServer.process()
    console.log(`TockCoder panel browser root PID=${root.pid}`)
    browser = await chromium.connect(browserServer.wsEndpoint())
    const context = await browser.newContext({ viewport: { width: 1512, height: 949 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`http://127.0.0.1:${server.address().port}/tockcoder`)
    assert.deepEqual(await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scale: devicePixelRatio,
      route: location.pathname, theme: document.documentElement.style.colorScheme,
      skin: document.documentElement.dataset.tockteamSkin ?? null,
    })), { width: 1512, height: 949, scale: 2, route: '/tockcoder', theme: 'dark', skin: null })
    await page.waitForFunction(() => window.panelProof?.ready())
    await page.evaluate(() => { window.panelProof.holdFacts(); window.panelProof.open() })
    await page.waitForFunction(() => window.panelProof.factsPending() === 1)
    await page.evaluate(() => window.panelProof.select('second'))
    const branch = page.getByRole('combobox', { name: 'workspace.current-branch' })
    await page.waitForFunction(() => document.querySelector('select[aria-label="workspace.current-branch"]')?.value === 'second')
    await page.evaluate(() => window.panelProof.releaseFacts())
    // Drain the resolved request and React's resulting paint, not a wall-clock race.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await branch.inputValue(), 'second', 'old workspace response must not replace the active workspace')

    await page.evaluate(() => window.panelProof.holdDiffs())
    await page.getByRole('button', { name: /one\.ts/ }).click()
    await page.waitForFunction(() => window.panelProof.diffsPending() === 1)
    await page.getByRole('button', { name: /two\.ts/ }).click()
    await page.waitForFunction(() => document.querySelector('.tockteam-change-diff')?.textContent === 'diff for two.ts')
    await page.evaluate(() => window.panelProof.releaseDiffs())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.locator('.tockteam-change-diff').textContent(), 'diff for two.ts')
    const partial = page.getByRole('button', { name: /partial\.ts/ })
    assert.equal(await partial.count(), 2, 'both versions of a partially staged file must be reviewable')
    await partial.filter({ hasText: 'workspace.staged' }).click()
    await page.waitForFunction(() => document.querySelector('.tockteam-change-diff')?.textContent === 'staged partial.ts')
    assert.equal(await page.locator('.tockteam-change-diff').count(), 1)
    await partial.filter({ hasNotText: 'workspace.staged' }).click()
    await page.waitForFunction(() => document.querySelector('.tockteam-change-diff')?.textContent === 'unstaged partial.ts')
    assert.equal(await page.locator('.tockteam-change-diff').count(), 1)
    await page.evaluate(() => { window.panelProof.holdTrees(); window.panelProof.openFiles() })
    await page.waitForFunction(() => window.panelProof.treesPending() === 1)
    await page.evaluate(() => { window.panelProof.select('first'); window.panelProof.openFiles() })
    await page.getByRole('button', { name: 'first.ts', exact: true }).waitFor()
    await page.evaluate(() => window.panelProof.releaseTrees())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByRole('button', { name: 'first.ts', exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'second.ts', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'folder\\name', exact: true }).click()
    await page.getByRole('button', { name: 'child', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.tockteam-files-path')?.getAttribute('title') === '/first/folder\\name/child')
    const up = page.locator('.tockteam-files-path button').first()
    await up.click()
    await page.getByRole('button', { name: 'child', exact: true }).waitFor()
    assert.equal(await page.locator('.tockteam-files-path').getAttribute('title'), '/first/folder\\name')
    await up.click()
    await page.getByRole('button', { name: 'first.ts', exact: true }).waitFor()
    assert.equal(await up.isDisabled(), true, 'parent navigation stops at the workspace root')
    assert.equal(await page.getByText('Directory does not exist', { exact: true }).count(), 0)
    const longFilename = `${'a'.repeat(245)}.txt`
    await page.getByRole('button', { name: longFilename, exact: true }).click()
    await page.getByText('Long filename file contents', { exact: true }).waitFor()
    await page.waitForFunction(filename => window.panelProof.preferences().sessions.first?.tabs.some(
      tab => tab.resource === `/first/${filename}` && tab.title === filename.slice(0, 240),
    ), longFilename)
    assert.equal(await page.getByText('sidebar preferences save failed (400)', { exact: true }).count(), 0)
    const screenshot = await page.screenshot()
    assert.equal(screenshot.readUInt32BE(16), 3024)
    assert.equal(screenshot.readUInt32BE(20), 1898)
    console.log('Verified /tockcoder: 1512×949 CSS, 2× scale, 3024×1898 PNG, dark theme, no skin')
    assert.deepEqual(errors, [])
    await page.evaluate(() => window.panelProof.dispose())
  } finally {
    await browser?.close()
    await browserServer?.close()
    if (root) {
      await stopChildProcess(root, 1_000, 1_000)
      assert.ok(root.exitCode !== null || root.signalCode !== null, 'browser root must be stopped')
    }
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
