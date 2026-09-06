import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const exec = promisify(execFile)

/** Runs only inside the existing bounded Electron smoke, against real composed Desktop. */
export async function proveTrustedRaycast({ port, root, workbenchConnection, userData }) {
  const evidence = join(root, '.beads/reports/trusted-raycast-desktop/slice-2')
  await mkdir(evidence, { recursive: true })
  await workbenchConnection.evaluate(`window.dshDesktop.launcher.settings.updateSetting('window.hideWindowOn', [])`)
  const session = `raycast-${process.pid}`
  const cli = async (...args) => {
    const result = await exec('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 1024 * 1024 }).catch(error => { throw new Error(`${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`) })
    console.log(result.stdout)
    if (/### Error/.test(result.stdout)) throw new Error(result.stdout)
    return result.stdout
  }
  // Main writes this dev-only record after its Swift owner has verified and restored synchronously.
  const proofRecordPath = join(userData, 'launcher', 'trusted-raycast-clipboard-proof.json')
  const readProofRecord = async () => {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      try {
        const record = JSON.parse(await readFile(proofRecordPath, 'utf8'))
        if (typeof record === 'object' && record !== null && Number.isInteger(record.pid) && typeof record.restoration === 'string') return record
      } catch { /* proof record not written yet */ }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Main did not record a native Copy proof result')
  }
  try {
    await cli('attach', `--cdp=http://127.0.0.1:${port}`)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      if (!launcher) throw new Error('No real launcher');
      await launcher.bringToFront();
      await launcher.locator('#launcher-search').fill('Translate');
      const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' });
      await command.waitFor({ timeout: 15000 }); await command.click();
      await launcher.locator('#launcher-search').press('Enter');
      const input = launcher.locator('#trusted-raycast-search');
      await input.waitFor({ timeout: 15000 });
      if (await launcher.locator('#launcher-search-form').isVisible()) throw new Error('Catalog remained visible over command view');
      if (!(await input.evaluate(el => document.activeElement === el))) throw new Error('Translate input not focused');
      if (await launcher.evaluate(() => typeof window.require !== 'undefined' || typeof window.process !== 'undefined')) throw new Error('Renderer leaked Node');
      await input.fill('TockTeam compatibility tracer: hello world');
      const row = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').filter({ hasText: /[\\u3400-\\u9fff]/ }).first();
      await row.waitFor({ timeout: 16000 });
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'translation-actions.png'))} });
      return { sourceActions: await row.locator('details').innerText(), focused: await input.evaluate(el => document.activeElement === el) };
    }`)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const rows = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li');
      await rows.first().press('Meta+Enter');
      await launcher.getByRole('alert').filter({ hasText: /not available|暂不可用/ }).waitFor();
      await rows.first().press('Meta+k');
      if (!(await rows.first().getByRole('button', { name: 'Paste Translation (Unavailable)', exact: true }).isDisabled())) throw new Error('Deferred Paste was enabled');
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'source-actions-menu.png'))} });
      await rows.first().locator('summary').press('Escape');
      if (await rows.first().locator('details').evaluate(el => el.open)) throw new Error('Escape did not dismiss source actions');
      if (!(await rows.first().locator('summary').evaluate(el => document.activeElement === el))) throw new Error('Menu focus was not restored');
      await rows.first().press('Enter');
      await launcher.getByRole('status').filter({ hasText: /Action Completed|操作已完成/ }).waitFor();
      return { sourceCopyOutcome: true };
    }`)
    const record = await readProofRecord()
    if (record.restoration !== 'RESTORED') throw new Error(`Clipboard was not restored: ${JSON.stringify(record)}`)
    await writeFile(join(evidence, 'native-copy-record.json'), JSON.stringify(record), { mode: 0o600 })
    console.log('Main-owned Swift proof port copied, verified and restored synchronously; original clipboard bytes were never logged.')
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const rows = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li');
      await rows.first().press('Meta+k');
      await rows.first().getByRole('button', { name: 'Toggle Full Text', exact: true }).click();
      await launcher.getByLabel(/Full Text|全文/).first().waitFor();
      if (await launcher.getByLabel(/Full Text|全文/).first().innerText() !== await rows.first().locator('p').first().innerText()) throw new Error('Full source Detail mismatch');
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'full-text.png'))} });
      await launcher.locator('#trusted-raycast-search').press('Escape');
      await launcher.getByLabel(/Full Text|全文/).first().waitFor({ state: 'detached' });
      await launcher.getByRole('status').filter({ hasText: /Action Completed|操作已完成/ }).waitFor();
      await rows.first().press('Meta+k');
      const browserReady = page.context().waitForEvent('page');
      await rows.first().getByRole('button', { name: 'Open in Google Translate', exact: true }).click();
      const browser = await browserReady;
      try {
        await browser.waitForURL('https://translate.google.com/**', { timeout: 12000 });
        const text = await browser.evaluate(() => new URL(location.href).searchParams.get('text'));
        if (text !== 'TockTeam compatibility tracer: hello world') throw new Error('Wrong browser query');
        if (await browser.evaluate(() => typeof window.require !== 'undefined' || typeof window.process !== 'undefined' || typeof window.dshDesktop !== 'undefined')) throw new Error('Private browser authority leak');
        await launcher.getByRole('status').filter({ hasText: /Action Completed|操作已完成/ }).waitFor();
        console.log('PRIVATE_BROWSER_VALIDATED ' + browser.url());
      } finally { await browser.close(); }
      await launcher.bringToFront();
      const workbench = page.context().pages().find(p => p.url().includes('/tockcoder'));
      const originalSize = await launcher.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await launcher.emulateMedia({ reducedMotion: 'reduce' });
      await launcher.setViewportSize({ width: 480, height: 600 });
      for (const theme of [{ mode: 'light', skinId: null }, { mode: 'dark', skinId: null }, ...['deep-current', 'jade-circuit', 'porcelain', 'ember-dusk'].map(id => ({ mode: id === 'porcelain' ? 'light' : 'dark', skinId: 'tockteam-skin-' + id }))]) {
        await workbench.evaluate(async theme => await window.dshDesktop.syncLauncherTheme(theme), theme);
        if (await launcher.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Narrow translation view overflowed');
        if (theme.mode === 'light') await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'light-narrow.png'))} });
      }
      await workbench.evaluate(async () => await window.dshDesktop.syncLauncherTheme({ mode: 'dark', skinId: null }));
      await launcher.setViewportSize(originalSize);
      const input = launcher.locator('#trusted-raycast-search');
      await input.fill(''); await input.pressSequentially('Good morning', { delay: 35 });
      if (await input.inputValue() !== 'Good morning') throw new Error('Rapid input was lost');
      await rows.filter({ hasText: /早|上午/ }).first().waitFor({ timeout: 16000 });
      await input.press('Escape'); await input.waitFor({ state: 'detached' });
      await launcher.locator('#launcher-search').fill('');
      await launcher.getByRole('group', { name: 'Recent', exact: true }).waitFor();
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'closed.png'))} });
      return { copied: true, detail: true, browser: 'private test-owned browser; not OS default browser', closed: true };
    }`)
    console.log('Native Copy matched the actual source translation through the serial Swift proof owner.')
  } finally {
    await cli('detach').catch(() => {})
  }
}
