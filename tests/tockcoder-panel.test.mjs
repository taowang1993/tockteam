import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { build } from 'esbuild'
import { loadInstalledPlaywright } from '../scripts/launcher-installed-smoke.mjs'
import { stopChildProcess } from '../scripts/process-cleanup.mjs'

// Uses the same globally installed Playwright CLI/browser as the installed smoke.
test('TockCoder review keeps workspace and diff responses attached to their selection', { timeout: 60_000 }, async () => {
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
    await page.goto(`http://127.0.0.1:${server.address().port}/tockcoder`)
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
