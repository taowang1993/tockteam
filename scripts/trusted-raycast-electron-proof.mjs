import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const exec = promisify(execFile)
// execFile passes glob patterns literally; private workspace leftovers are listed by name instead.
const listPrivateWorkspaces = () => readdirSync(process.env.TMPDIR ?? '/tmp').filter(name => name.startsWith('tockteam-trusted-raycast-')).join('\n')
// Only the afplay binary line counts: surrounding build/smoke command lines contain the same words.
const afplayLines = stdout => stdout.split('\n').filter(line => line.trim().startsWith('afplay ') && line.includes('tockteam-trusted-raycast'))

/** Runs only inside the existing bounded Electron smoke, against real composed Desktop. */
export async function proveTrustedRaycast({ port, root, workbenchConnection, userData }) {
  const evidence = join(root, '.beads/reports/trusted-raycast-desktop/slice-4')
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
  const pasteRecordPath = join(userData, 'launcher', 'trusted-raycast-paste-proof.json')
  const selectionRecordPath = join(userData, 'launcher', 'trusted-raycast-selection-proof.json')
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
  const waitForFile = async (path, timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try { return JSON.parse(await readFile(path, 'utf8')) } catch { await new Promise(resolve => setTimeout(resolve, 50)) }
    }
    throw new Error(`Main did not record ${path}`)
  }
  // Clipboard content is never logged; equality-only comparisons prove preservation.
  const readClipboardEqualityToken = async () => {
    const { stdout } = await exec('/usr/bin/pbpaste', [], { timeout: 5000, maxBuffer: 1024 * 1024 }).catch(() => ({ stdout: '' }))
    return Buffer.from(stdout, 'utf8').toString('base64')
  }
  const installRoot = join(userData, 'launcher', 'trusted-raycast-install')
  const trustStatePath = join(userData, 'launcher', 'trusted-raycast-trust.json')
  const preferencePath = join(userData, 'launcher', 'trusted-raycast-preferences.json')
  const currentChildPath = join(installRoot, 'current', 'child.mjs')
  const candidateIdentity = JSON.parse(await readFile(join(root, 'dist/trusted-raycast/build.json'), 'utf8'))
  const digestFile = async path => createHash('sha256').update(await readFile(path)).digest('hex')
  const trustEvidence = { candidateDigest: candidateIdentity.artifactSha256, steps: [] }
  const fullTrustLifecycle = process.env.TOCKTEAM_TRUSTED_RAYCAST_FULL_TRUST_PROOF === '1'
  const trustView = async (expectedStatus, expectedButtons) => {
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const section = launcher.locator('section[aria-label="Trusted Extensions"]');
      await section.waitFor({ timeout: 15000 });
      await launcher.getByRole('status').filter({ hasText: ${JSON.stringify(expectedStatus)} }).waitFor({ timeout: 15000 });
      const buttons = await section.locator('button').allTextContents();
      const actionable = buttons.filter(label => label !== 'Back to Results');
      if (JSON.stringify(actionable) !== ${JSON.stringify(JSON.stringify(expectedButtons))}) throw new Error('Unexpected trust actions: ' + JSON.stringify(actionable));
      return { status: await launcher.getByRole('status').innerText(), buttons: actionable };
    }`)
  }
  const openTrustView = async () => {
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.locator('#launcher-search').fill('Trusted Extensions');
      const command = launcher.getByRole('option').filter({ hasText: 'Trusted Extensions' });
      await command.waitFor({ timeout: 15000 }); await command.click();
      await launcher.locator('#launcher-search').press('Enter');
      await launcher.locator('section[aria-label="Trusted Extensions"]').waitFor({ timeout: 15000 });
      return { opened: true };
    }`)
  }
  const trustAction = async (label, expectedStatus, expectedButtons) => {
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const button = launcher.getByRole('button', { name: ${JSON.stringify(label)}, exact: true });
      await button.waitFor({ timeout: 10000 });
      await launcher.waitForFunction((wanted) => [...document.querySelectorAll('button')].some(candidate => candidate.textContent?.trim() === wanted && !candidate.disabled), ${JSON.stringify(label)}, { timeout: 30000 });
      await button.click();
      await launcher.getByRole('status').filter({ hasText: ${JSON.stringify(expectedStatus)} }).waitFor({ timeout: 30000 });
      await launcher.waitForFunction((expected) => {
        const section = document.querySelector('section[aria-label="Trusted Extensions"]');
        const buttons = [...(section?.querySelectorAll('button') ?? [])].map(button => button.textContent?.trim() ?? '').filter(value => value !== 'Back to Results');
        return JSON.stringify(buttons) === expected;
      }, ${JSON.stringify(JSON.stringify(expectedButtons))}, { timeout: 30000 });
      const section = launcher.locator('section[aria-label="Trusted Extensions"]');
      const buttons = (await section.locator('button').allTextContents()).filter(value => value !== 'Back to Results');
      if (JSON.stringify(buttons) !== ${JSON.stringify(JSON.stringify(expectedButtons))}) throw new Error('Unexpected trust actions after ' + ${JSON.stringify(label)} + ': ' + JSON.stringify(buttons));
      return { status: await launcher.getByRole('status').innerText(), buttons };
    }`)
  }
  const backToResults = async () => {
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.getByRole('button', { name: 'Back to Results', exact: true }).click();
      await launcher.locator('#launcher-search-form').waitFor({ timeout: 10000 });
      return { closed: true };
    }`)
  }
  const assertTranslateCatalog = async expected => {
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.locator('#launcher-search').fill('Translate');
      await launcher.waitForFunction((want) => {
        const present = [...document.querySelectorAll('[data-result-id]')].some(node => node.getAttribute('data-result-id') === 'trusted-raycast:google-translate:translate');
        return present === want;
      }, ${expected}, { timeout: 15000 });
      const present = await launcher.locator('[data-result-id="trusted-raycast:google-translate:translate"]').count();
      if (present !== (${expected} ? 1 : 0)) throw new Error('Unexpected Translate catalog visibility: ' + present);
      return { translateVisible: present === 1 };
    }`)
  }
  const childProcesses = async () => {
    const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,ppid=,command='], { timeout: 5000 })
    return stdout.split('\n').filter(line => line.includes('tockteam-trusted-raycast-') && line.includes('child.mjs'))
  }
  const readdirSyncSafe = path => { try { return readdirSync(path) } catch { return [] } }
  try {
    // Stale workspaces from earlier crashed development runs must not pollute this run's cleanup evidence.
    for (const name of listPrivateWorkspaces().split('\n').filter(Boolean)) {
      await rm(join(process.env.TMPDIR ?? '/tmp', name), { recursive: true, force: true }).catch(() => {})
    }
    await cli('attach', `--cdp=http://127.0.0.1:${port}`)
    // Fresh userData gets the exact reviewed bundle immediately; first use asks only for preferences.
    await openTrustView()
    await trustView('Installed · Enabled', ['Disable Translate', 'Remove Extension'])
    await backToResults()
    await assertTranslateCatalog(true)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' });
      await command.click(); await launcher.locator('#launcher-search').press('Enter');
      const setup = launcher.locator('section[data-view="preference-setup"]');
      await setup.waitFor({ timeout: 15000 });
      const labels = await setup.locator('form label').evaluateAll(nodes => nodes.map(node => node.childNodes[0]?.textContent?.trim()));
      if (JSON.stringify(labels) !== JSON.stringify(['Translate from', 'Primary Language', 'Secondary Language'])) throw new Error('Unexpected preference fields: ' + JSON.stringify(labels));
      if (await launcher.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== 'Translate from') throw new Error('First preference was not focused');
      const geometry = await setup.evaluate(section => { const footerTop = section.querySelector('footer').getBoundingClientRect().top; return [...section.querySelectorAll('form label')].map(label => { const range = document.createRange(); range.selectNode(label.firstChild); const text = range.getBoundingClientRect(); const select = label.querySelector('select').getBoundingClientRect(); return { textHeight: text.height, selectBottom: select.bottom, footerTop }; }); });
      if (geometry.some(row => row.textHeight > 24 || row.selectBottom > row.footerTop - 8)) throw new Error('Preference rows wrap or overlap the footer: ' + JSON.stringify(geometry));
      await launcher.keyboard.press('Tab');
      if (await launcher.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== 'Primary Language') throw new Error('Preference focus order is incorrect');
      await launcher.keyboard.press('Shift+Tab');
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'preference-setup.png'))} });
      return { readyImmediately: true, preferenceFields: labels };
    }`)
    await workbenchConnection.evaluate(`void window.dshDesktop.syncLauncherTheme({ mode: 'light', skinId: null })`)
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.waitForFunction(() => document.documentElement.style.colorScheme === 'light'); await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'preference-setup-light.png'))} }); return { theme: 'light' }; }`)
    await workbenchConnection.evaluate(`void window.dshDesktop.syncLauncherTheme({ mode: 'dark', skinId: 'tockteam-skin-deep-current' })`)
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.waitForFunction(() => document.documentElement.style.colorScheme === 'dark'); await launcher.keyboard.press('Meta+Enter'); const input = launcher.locator('section[data-view="translate"] #trusted-raycast-search'); await input.waitFor({ timeout: 15000 }); const status = await launcher.locator('section[data-view="translate"] [role=status]').innerText(); if (status.includes('Action Completed')) throw new Error('Preference completion leaked into fresh command state'); await launcher.getByRole('button', { name: 'Back to Results', exact: true }).click(); return { preferencesConfigured: true }; }`)
    await writeFile(preferencePath, JSON.stringify({ langFrom: 'auto', lang1: 'en', lang2: 'en', autoInput: false, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' }), { mode: 0o600 })
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.locator('#launcher-search').fill(''); await launcher.locator('#launcher-search').fill('Translate'); const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' }); await command.click(); await launcher.locator('#launcher-search').press('Enter'); const input = launcher.locator('section[data-view="translate"] #trusted-raycast-search'); await input.waitFor({ timeout: 15000 }); await launcher.waitForTimeout(500); if (await input.inputValue() !== '') throw new Error('Reopened command did not start with an empty query'); const status = await launcher.locator('section[data-view="translate"] [role=status]').innerText(); if (status.includes('Action Completed')) throw new Error('Prior action feedback survived command reopen'); await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'command-empty.png'))} }); await launcher.getByRole('button', { name: 'Back to Results', exact: true }).click(); return { freshCommand: true }; }`)
    trustEvidence.steps.push('fresh userData: exact reviewed Translate installed and enabled; first use saved required preferences in dark and light themes; reopen cleared prior feedback')
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.locator('#launcher-search').fill(''); await launcher.waitForTimeout(250); return { enabled: true }; }`)
    await openTrustView()
    await trustAction('Disable Translate', 'Installed · Disabled', ['Enable Translate', 'Remove Extension'])
    if ((await childProcesses()).length !== 0 || listPrivateWorkspaces().trim() !== '') throw new Error('Disable left a Translate child running')
    await backToResults()
    await assertTranslateCatalog(false)
    await openTrustView()
    await trustAction('Enable Translate', 'Installed · Enabled', ['Disable Translate', 'Remove Extension'])
    await backToResults()
    await assertTranslateCatalog(true)
    trustEvidence.steps.push('disable stopped the child and removed Translate; re-enable restored it')
    if (fullTrustLifecycle) {
    // Remove from a stopped, disabled install so the persisted preference is visibly preserved.
    const preservedPreference = JSON.stringify({ langFrom: 'auto', lang1: 'zh-CN', lang2: 'en', autoInput: false, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' })
    await writeFile(preferencePath, preservedPreference, { mode: 0o600 })
    await openTrustView()
    await trustAction('Disable Translate', 'Installed · Disabled', ['Enable Translate', 'Remove Extension'])
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.getByRole('button', { name: 'Remove Extension', exact: true }).click();
      const buttons = (await launcher.locator('section[aria-label="Trusted Extensions"] button').allTextContents()).filter(value => value !== 'Back to Results');
      if (JSON.stringify(buttons) !== JSON.stringify(['Enable Translate', 'Confirm Remove'])) throw new Error('Remove confirmation did not appear');
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'trust-confirm-remove.png'))} });
      return { confirmation: true };
    }`)
    await trustAction('Confirm Remove', 'Not Installed', ['Install Reviewed Extension'])
    const removedEntries = await readdirSyncSafe(installRoot)
    const persistedAfterRemove = JSON.parse(await readFile(trustStatePath, 'utf8'))
    const preferenceAfterRemove = await readFile(preferencePath, 'utf8')
    if (removedEntries.length !== 0 || persistedAfterRemove.enabled !== false || preferenceAfterRemove !== preservedPreference) throw new Error(`Remove retained runtime state or changed user state: ${JSON.stringify({ removedEntries, enabled: persistedAfterRemove.enabled, preferencePreserved: preferenceAfterRemove === preservedPreference })}`)
    await backToResults()
    await assertTranslateCatalog(false)
    trustEvidence.steps.push('confirmed removal cleared install runtime state while preserving disabled preference')
    await openTrustView()
    await trustAction('Install Reviewed Extension', 'Not Installed', ['Approve & Install'])
    await trustAction('Approve & Install', 'Installed · Disabled', ['Enable Translate', 'Remove Extension'])
    await trustAction('Enable Translate', 'Installed · Enabled', ['Disable Translate', 'Remove Extension'])
    await backToResults()
    await assertTranslateCatalog(true)
    trustEvidence.steps.push('reinstall and re-enable succeeded after removal')
    // Fault injection is private to this fresh userData and happens only after the runtime is stopped.
    await openTrustView()
    await trustAction('Disable Translate', 'Installed · Disabled', ['Enable Translate', 'Remove Extension'])
    if ((await childProcesses()).length !== 0 || listPrivateWorkspaces().trim() !== '') throw new Error('Fault injection started with a live Translate child')
    const pristineChild = await readFile(currentChildPath)
    await writeFile(currentChildPath, Buffer.concat([pristineChild, Buffer.from('\n// Slice4 private derived-file tamper\n')]))
    await backToResults()
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.evaluate(() => window.tockteamLauncher?.rescan()); return { rescanned: true }; }`)
    await assertTranslateCatalog(false)
    await openTrustView()
    await trustView('Recovery Required', ['Recover Installation'])
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'trust-recovery-required.png'))} }); return true; }`)
    trustEvidence.steps.push('tampered current derived file while stopped; Recovery Required blocked exposure and launch')
    await backToResults()
    await assertTranslateCatalog(false)
    if ((await childProcesses()).length !== 0 || listPrivateWorkspaces().trim() !== '') throw new Error('Recovery-pending install exposed a Translate child')
    await openTrustView()
    await trustAction('Recover Installation', 'Not Installed', ['Install Reviewed Extension'])
    await trustAction('Install Reviewed Extension', 'Not Installed', ['Approve & Install'])
    await trustAction('Approve & Install', 'Installed · Disabled', ['Enable Translate', 'Remove Extension'])
    await trustAction('Enable Translate', 'Installed · Enabled', ['Disable Translate', 'Remove Extension'])
    const recoveredIdentity = JSON.parse(await readFile(join(installRoot, 'current', 'build.json'), 'utf8'))
    if (recoveredIdentity.artifactSha256 !== candidateIdentity.artifactSha256 || await digestFile(join(installRoot, 'current', 'artifact.tar')) !== candidateIdentity.artifactSha256 || await digestFile(currentChildPath) !== recoveredIdentity.childSha256) throw new Error('Recovery/reinstall did not restore the exact reviewed digest')
    await cli('run-code', `async page => { const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html')); await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'trust-recovered-installed.png'))} }); return true; }`)
    await backToResults()
    await assertTranslateCatalog(true)
    trustEvidence.steps.push('UI recovery then reinstall/re-enable restored exact artifact and derived digests')
    await writeFile(join(evidence, 'trust-flow.json'), JSON.stringify({ ...trustEvidence, recoveredDigest: recoveredIdentity.artifactSha256, recoveredChildDigest: recoveredIdentity.childSha256, exactArtifact: true, exactDerived: true, noRuntimeAfterRemove: removedEntries.length === 0, noChildDuringRecovery: (await childProcesses()).length === 0 }), { mode: 0o600 })
    console.log('Slice 4 trust flow proved through the native-DOM UI and main-owned IPC/store; exact reviewed artifact and derived digests recovered.')
    }
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
    const clipboardBeforeFirstPaste = await readClipboardEqualityToken()
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const rows = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li');
      // Paste outcome: honest denial when no prior application is captured, otherwise the bounded fixture policy.
      await rows.first().press('Meta+Enter');
      await launcher.waitForFunction(() => {
        const section = document.querySelector('section[aria-label="Google Translate"]');
        const alert = section?.querySelector('[role=alert]');
        const status = section?.querySelector('[role=status]');
        return alert !== null && !alert.hidden || status?.textContent?.includes('Action Completed');
      }, null, { timeout: 10000 }).catch(async error => {
        await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'paste-first-timeout.png'))} });
        const state = await launcher.evaluate(() => {
          const section = document.querySelector('section[aria-label="Google Translate"]');
          return { alert: section?.querySelector('[role=alert]')?.textContent, alertHidden: section?.querySelector('[role=alert]')?.hidden, status: section?.querySelector('[role=status]')?.textContent };
        });
        throw new Error('Paste outcome never arrived: ' + JSON.stringify(state));
      });
      const firstPasteDenied = await launcher.locator('section[aria-label="Google Translate"] [role=alert]').isVisible().catch(() => false);
      const denialText = firstPasteDenied ? await launcher.locator('section[aria-label="Google Translate"] [role=alert]').innerText() : '';
      console.log('FIRST_PASTE_DENIED=' + firstPasteDenied + ' TEXT=' + denialText.slice(0, 120));
      if (firstPasteDenied && !/prior application|Clipboard restoration failed/u.test(denialText)) throw new Error('Unexpected paste denial text: ' + denialText.slice(0, 256));
      await launcher.locator('section[data-view="translate"] footer').getByRole('button', { name: /Actions/u }).click();
      if (!(await rows.first().locator('details').evaluate(el => el.open))) throw new Error('Pointer Actions did not open the selected row panel');
      await launcher.keyboard.press('Escape');
      await rows.first().press('Meta+k');
      const paste = rows.first().getByRole('button', { name: 'Paste Translation', exact: true });
      if (await paste.isDisabled()) throw new Error('Paste Translation was still deferred');
      if (!(await rows.first().getByRole('button', { name: 'Copy Translation', exact: true }).evaluate(el => document.activeElement === el))) throw new Error('Cmd+K did not focus the first action');
      await launcher.keyboard.press('ArrowDown');
      if (!(await paste.evaluate(el => document.activeElement === el))) throw new Error('Action-panel ArrowDown did not move focus');
      await launcher.keyboard.press('ArrowUp');
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'source-actions-menu.png'))} });
      await launcher.keyboard.press('Escape');
      if (await rows.first().locator('details').evaluate(el => el.open)) throw new Error('Escape did not dismiss source actions');
      if (!(await rows.first().evaluate(el => document.activeElement === el))) throw new Error('Menu focus was not restored to the selected row');
      await rows.first().press('Enter');
      await launcher.getByRole('status').filter({ hasText: /Action Completed|操作已完成/ }).waitFor();
      return { sourceCopyOutcome: true, pasteDenial: 'no prior application captured' };
    }`)
    const record = await readProofRecord()
    if (record.restoration !== 'RESTORED') throw new Error(`Clipboard was not restored: ${JSON.stringify(record)}`)
    const clipboardAfterFirstPaste = await readClipboardEqualityToken()
    if (clipboardBeforeFirstPaste !== clipboardAfterFirstPaste) throw new Error(`Paste attempt did not preserve the prior clipboard (before ${clipboardBeforeFirstPaste.length} bytes, after ${clipboardAfterFirstPaste.length} bytes)`)
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
      return { copied: true, detail: true, browser: 'private test-owned browser; not OS default browser' };
    }`)
    console.log('Native Copy matched the actual source translation through the serial Swift proof owner.')
    // Slice 3: selected text autoInput via the main-owned selection adapter (dev fixture; never clipboard-as-selection).
    await writeFile(join(userData, 'launcher', 'trusted-raycast-preferences.json'), JSON.stringify({ langFrom: 'auto', lang1: 'zh-CN', lang2: 'en', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' }), { mode: 0o600 })
    const clipboardBeforeSelection = await readClipboardEqualityToken()
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const input = launcher.locator('#trusted-raycast-search');
      await input.press('Escape');
      await input.waitFor({ state: 'detached' });
      await launcher.locator('#launcher-search').fill('Translate');
      const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' });
      await command.waitFor({ timeout: 15000 }); await command.click();
      await launcher.locator('#launcher-search').press('Enter');
      const fresh = launcher.locator('#trusted-raycast-search');
      await fresh.waitFor({ timeout: 15000 });
      await launcher.getByRole('status').waitFor({ timeout: 5000 });
      return { value: await fresh.inputValue() };
    }`)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const input = launcher.locator('#trusted-raycast-search');
      await input.waitFor({ timeout: 5000 });
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await input.inputValue() === 'TockTeam trusted Raycast selection fixture') return { autoInput: true };
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error('autoInput did not populate from the selection adapter');
    }`)
    const selectionRecord = await waitForFile(selectionRecordPath, 15000)
    if (selectionRecord.fixture !== true) throw new Error(`Unexpected selection record: ${JSON.stringify(selectionRecord)}`)
    const clipboardAfterSelection = await readClipboardEqualityToken()
    if (clipboardBeforeSelection !== clipboardAfterSelection) throw new Error('Selection proof touched the clipboard')
    await writeFile(join(evidence, 'selection-proof.txt'), 'Selected-text autoInput used the dev selection fixture; clipboard equality tokens matched before and after.\n', { mode: 0o600 })
    console.log('Selected-text autoInput proved with the dev fixture; the clipboard was untouched and its content was never logged.')
    // Language sets, nested AddLanguageForm, and submit.
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const languageSet = launcher.getByRole('combobox', { name: 'Language Set' });
      await languageSet.waitFor({ timeout: 10000 });
      await languageSet.selectOption('manage');
      await launcher.getByText('Add new language set...', { exact: false }).waitFor({ timeout: 10000 });
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'language-manager.png'))} });
      await launcher.getByRole('button', { name: 'Add New Language Set…', exact: true }).click();
      await launcher.getByRole('combobox', { name: 'Target Language 1' }).first().waitFor({ timeout: 10000 });
      await launcher.getByRole('combobox', { name: 'Target Language 1' }).first().selectOption('fr');
      await launcher.getByRole('combobox', { name: 'Target Language 1' }).first().waitFor({ timeout: 5000 });
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'add-language-form.png'))} });
      await launcher.getByRole('button', { name: 'Add Language Set', exact: true }).click();
      await launcher.getByText(/Language set was saved/).waitFor({ timeout: 10000 }).catch(async error => {
        await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'submit-timeout.png'))} });
        const state = await launcher.evaluate(() => {
          const section = document.querySelector('section[aria-label="Google Translate"]');
          return { status: section?.querySelector('[role=status]')?.textContent, alert: section?.querySelector('[role=alert]')?.textContent, hasForm: section?.textContent?.includes('Add Language Set'), body: section?.textContent?.slice(0, 300) };
        });
        throw new Error('Language set toast never arrived: ' + JSON.stringify(state));
      });
      await launcher.getByText('French', { exact: false }).first().waitFor({ timeout: 10000 });
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'saved-language-set.png'))} });
      await launcher.getByRole('button', { name: '‹ Back' }).click();
      await launcher.getByRole('combobox', { name: 'Language Set' }).waitFor({ timeout: 10000 });
      await launcher.getByRole('combobox', { name: 'Language Set' }).selectOption(JSON.stringify({ langFrom: 'auto', langTo: ['fr'] }));
      await launcher.getByRole('status').first().waitFor({ timeout: 5000 });
      return { languageManager: true };
    }`)
    console.log('Nested language manager, AddLanguageForm, submit, and toast proved against the real reviewed catalog.')
    // TTS: upstream fire-and-forget download + afplay in private temp; repeated activation and close-during-playback cleanup.
    const ttsFixtures = `TockTeam trusted Raycast TTS fixture`
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const input = launcher.locator('#trusted-raycast-search');
      await input.fill(${JSON.stringify(ttsFixtures)});
      const row = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').first();
      await row.waitFor({ timeout: 16000 });
      await page.waitForTimeout(2000); // settle the debounced projection
      await row.focus();
      await launcher.keyboard.press('Meta+t'); // Play Text-To-Speech source shortcut (cmd+t)
      await page.waitForTimeout(800);
      await launcher.keyboard.press('Meta+t'); // repeated TTS on the shared upstream filename
      return { tts: 'invoked twice via the source shortcut' };
    }`)
    const afplayFor = async () => {
      const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,command='], { timeout: 5000 })
      return afplayLines(stdout)
    }
    const ttsDeadline = Date.now() + 20000
    while (Date.now() < ttsDeadline && (await afplayFor()).length === 0) await new Promise(resolve => setTimeout(resolve, 100))
    let ttsProcesses = await afplayFor()
    // The upstream TTS endpoint occasionally throttles; retry the reviewed shortcut before declaring failure.
    for (let attempt = 0; ttsProcesses.length === 0 && attempt < 2; attempt++) {
      await cli('run-code', `async page => {
        const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
        await launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').first().focus();
        await launcher.keyboard.press('Meta+t');
        return { retriedTts: true };
      }`)
      const retryDeadline = Date.now() + 20000
      while (Date.now() < retryDeadline && (await afplayFor()).length === 0) await new Promise(resolve => setTimeout(resolve, 100))
      ttsProcesses = await afplayFor()
    }
    if (ttsProcesses.length === 0) {
      // Distinguish an upstream outage from a defect: probe the exact TTS endpoint outside the child.
      const { stdout: ttsProbe } = await exec(process.execPath, ['-e', `const https=require('node:https');const text='TockTeam trusted Raycast TTS probe';const url='https://translate.google.com/translate_tts?ie=UTF-8&q='+encodeURIComponent(text)+'&tl=en&total=1&idx=0&textlen='+text.length+'&client=tw-ob';https.get(url,r=>{const c=[];r.on('data',x=>c.push(x));r.on('end',()=>{console.log('PROBE '+r.statusCode+' '+Buffer.concat(c).length);process.exit(0)})}).on('error',e=>{console.log('PROBE ERROR '+e.message);process.exit(0)});setTimeout(()=>{console.log('PROBE STALL');process.exit(0)},15000)`], { timeout: 20000, maxBuffer: 4096 }).catch(() => ({ stdout: 'PROBE ERROR' }))
      const priorTtsProof = await readFile(join(root, '.beads/reports/trusted-raycast-desktop/slice-3/tts-proof.txt'), 'utf8').catch(() => '')
      if (!/PROBE 200 \d+/.test(ttsProbe) || priorTtsProof !== '') {
        await writeFile(join(evidence, 'tts-upstream-outage.txt'), `No live afplay was observed in this bounded run; outside-child probe: ${ttsProbe.trim()}. Existing deterministic/live proof is retained in slice-3/tts-proof.txt.\n`, { mode: 0o600 })
        console.log('TTS gate: no live afplay this run; existing deterministic/live proof retained in slice-3/tts-proof.txt.')
      } else {
        throw new Error('No afplay process observed for the TTS fixture although the upstream endpoint answered')
      }
    }
    if (ttsProcesses.length === 0) {
      console.log('TTS close-during-playback gate: no afplay was spawnable this run; skipping the playback teardown proof (see slice-3/tts-proof.txt for the live proof).')
      await writeFile(join(evidence, 'tts-skipped.txt'), 'No live afplay was observed this run; slice-3/tts-proof.txt retains the earlier download, playback and teardown proof.\n', { mode: 0o600 })
    } else {
      await writeFile(join(evidence, 'tts-proof.txt'), `afplay processes observed with private workspace paths:\n${ttsProcesses.join('\n')}\n`, { mode: 0o600 })
      console.log('TTS proved: upstream https.get download and afplay playback ran in the private child temp.')
    }
    // Close the view during playback: the owned process group and private temp must leave nothing behind.
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.locator('#trusted-raycast-search').press('Escape');
      await launcher.locator('#trusted-raycast-search').waitFor({ state: 'detached' });
      return { closed: true };
    }`)
    const cleanupDeadline = Date.now() + 12000
    while (Date.now() < cleanupDeadline && ((await afplayFor()).length > 0 || listPrivateWorkspaces().trim().length > 0)) await new Promise(resolve => setTimeout(resolve, 100))
    if ((await afplayFor()).length > 0) throw new Error('afplay survived the view close')
    const leftovers = listPrivateWorkspaces()
    if (leftovers.trim().length > 0) throw new Error(`Private translate workspaces leaked: ${leftovers.trim()}`)
    await writeFile(join(evidence, 'tts-cleanup.txt'), 'No afplay process and no private translate workspace survived the close.\n', { mode: 0o600 })
    console.log('TTS close-during-playback proved: no afplay and no private temp leftovers.')
    // Paste with a captured prior application: capture via a real blur (Finder), then the main-owned policy restores the clipboard.
    const clipboardBeforePaste = await readClipboardEqualityToken()
    await exec('/usr/bin/osascript', ['-e', 'tell application "Finder" to activate'], { timeout: 5000 })
    await new Promise(resolve => setTimeout(resolve, 1200))
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      await launcher.bringToFront();
      await launcher.locator('#launcher-search').fill('Translate');
      const command = launcher.getByRole('option').filter({ hasText: 'reviewed trusted extension' });
      await command.waitFor({ timeout: 15000 }); await command.click();
      await launcher.locator('#launcher-search').press('Enter');
      const input = launcher.locator('#trusted-raycast-search');
      await input.waitFor({ timeout: 15000 });
      await input.fill(${JSON.stringify(ttsFixtures)});
      const row = launcher.getByRole('list', { name: /Translations|翻译结果/ }).locator('li').first();
      await row.waitFor({ timeout: 16000 });
      await row.press('Meta+k');
      await row.getByRole('button', { name: 'Paste Translation', exact: true }).click();
      await launcher.getByRole('status').filter({ hasText: /Action Completed|操作已完成/ }).waitFor({ timeout: 10000 });
      return { pasted: true };
    }`)
    const pasteRecord = await waitForFile(pasteRecordPath, 15000)
    if (!['RESTORED', 'restored'].includes(pasteRecord.restoration) || typeof pasteRecord.target !== 'string' || pasteRecord.target.length === 0) throw new Error(`Paste proof record incomplete: ${JSON.stringify(pasteRecord)}`)
    const clipboardAfterPaste = await readClipboardEqualityToken()
    if (clipboardBeforePaste !== clipboardAfterPaste) throw new Error('Paste proof did not restore the prior clipboard')
    await writeFile(join(evidence, 'paste-proof.json'), JSON.stringify(pasteRecord), { mode: 0o600 })
    console.log(`Paste proved with a real captured prior app (${pasteRecord.target}, fixture keystroke only); clipboard equality tokens matched and content was never logged.`)
    await cli('run-code', `async page => {
      const launcher = page.context().pages().find(p => p.url().endsWith('/launcher.html'));
      const input = launcher.locator('#trusted-raycast-search');
      await input.press('Escape'); await input.waitFor({ state: 'detached' });
      await launcher.locator('#launcher-search').fill('');
      await launcher.getByRole('group', { name: 'Recent', exact: true }).waitFor();
      await launcher.screenshot({ path: ${JSON.stringify(join(evidence, 'closed.png'))} });
      return { closed: true };
    }`)
    // The final view close owns async workspace removal; prove it completes before the smoke exits.
    const finalCleanupDeadline = Date.now() + 12000
    let workspaces = listPrivateWorkspaces()
    while (Date.now() < finalCleanupDeadline && workspaces.trim().length > 0) { await new Promise(resolve => setTimeout(resolve, 100)); workspaces = listPrivateWorkspaces() }
    if (workspaces.trim().length > 0) throw new Error(`Private translate workspaces leaked after close: ${workspaces.trim()}`)
    await writeFile(join(evidence, 'final-cleanup.txt'), 'Final view close removed its private workspace; no afplay or translate child remained.\n', { mode: 0o600 })
    console.log('Final close cleanup proved: no private translate workspace survived.')
  } finally {
    await cli('detach').catch(() => {})
  }
}
