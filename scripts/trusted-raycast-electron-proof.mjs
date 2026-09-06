import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
const exec = promisify(execFile)

/** Runs only inside the existing bounded Electron smoke, against real composed Desktop. */
export async function proveTrustedRaycast({ port, root, workbenchConnection }) {
  const evidence = join(root, '.beads/reports/trusted-raycast-desktop')
  await mkdir(evidence, { recursive: true })
  await workbenchConnection.evaluate(`window.dshDesktop.launcher.settings.updateSetting('window.hideWindowOn', [])`)
  const session = `raycast-${process.pid}`
  const cli = async (...args) => {
    const result = await exec('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 1024 * 1024 }).catch(error => { throw new Error(`${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`) })
    console.log(result.stdout)
    if (/### Error/.test(result.stdout)) throw new Error(result.stdout)
    return result.stdout
  }
  try {
    await cli('attach', `--cdp=http://127.0.0.1:${port}`)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      if (!launcher) throw new Error('No real launcher');
      await launcher.bringToFront();
      await launcher.locator('#launcher-search').fill('Translate');
      const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' });
      console.log(await launcher.locator('body').innerText());
      await command.waitFor({ timeout: 15000 });
      await command.click();
      await launcher.locator('#launcher-search').press('Enter');
      const input = launcher.locator('#trusted-raycast-search');
      await input.waitFor({ timeout: 15000 });
      if (await launcher.locator('#launcher-search-form').isVisible()) throw new Error('Catalog remained visible over command view');
      if (!(await input.evaluate(el => document.activeElement === el))) throw new Error('Translate input not focused');
      if (await launcher.evaluate(() => typeof window.require !== 'undefined' || typeof window.process !== 'undefined')) throw new Error('Renderer leaked Node');
      await input.fill('TockTeam compatibility tracer: hello world');
      await launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').filter({ hasText: /[\\u3400-\\u9fff]/ }).first().waitFor({ timeout: 16000 });
      const facts = { url: launcher.url(), input: await input.inputValue(), translations: await launcher.getByRole('list', { name: /Translations|翻译结果/ }).innerText(), focused: await input.evaluate(el => document.activeElement === el) };
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'translation.png'))} });
      await launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').first().press('Enter');
      await launcher.getByRole('alert').filter({ hasText: /not supported|暂不可用/ }).waitFor();
      await input.fill('');
      await input.pressSequentially('Good morning', { delay: 35 });
      if (await input.inputValue() !== 'Good morning') throw new Error('Rapid input was lost');
      await launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').filter({ hasText: /早|上午/ }).first().waitFor({ timeout: 16000 });
      const second = await launcher.getByRole('list', { name: /Translations|翻译结果/ }).innerText();
      await input.press('Escape');
      await input.waitFor({ state: 'detached' });
      await launcher.locator('#launcher-search').fill('');
      await launcher.getByRole('group', { name: 'Recent', exact: true }).waitFor();
      const closed = await launcher.locator('#launcher-results').innerText();
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'closed.png'))} });
      return { ...facts, second, closed };
    }`)
  } finally { await cli('detach').catch(() => {}) }
}
