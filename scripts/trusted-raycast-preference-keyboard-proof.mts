import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { build, stop } from 'esbuild'
import { focusProofDescendants, readFocusProofProcessSnapshot, type ProofProcessRow } from './trusted-raycast-focus-proof-client.ts'

// Real DOM and keyboard events; the bridge only records submitted actions.
const evidence = await mkdtemp(join(tmpdir(), 'preference-keyboard-'))
const session = `preference-keyboard-${process.pid}`
const observed = new Map<number, ProofProcessRow>()
const execFile = promisify(execFileCallback)
const observe = async () => {
  const rows = await readFocusProofProcessSnapshot()
  for (const root of rows.filter(row => row.command.includes(session))) {
    for (const row of [root, ...focusProofDescendants(rows, root.pid)]) observed.set(row.pid, row)
  }
}
const cli = async (...args: string[]) => {
  const output = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
  await observe()
  await writeFile(join(evidence, 'interactions.txt'), output.stdout + output.stderr, { flag: 'a' })
  if (output.stdout.includes('### Error')) throw new Error(output.stdout)
  return output.stdout
}
const fixture = `
import { createTrustedRaycastView } from '${resolve('src/trusted-raycast-renderer.ts')}';
document.documentElement.style.colorScheme = 'dark';
const sent = [];
const view = createTrustedRaycastView(document, { trustedRaycastEvent: async event => { sent.push(event); } }, () => {});
document.body.append(view.element);
let revision = 0;
const render = () => view.update({ type: revision ? 'patch' : 'ready', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: revision++, root: { type: 'raycast-form', props: { preferenceSetup: true }, children: [
  ...['Translate from', 'Primary Language', 'Secondary Language'].map((title, index) => ({ type: 'raycast-form-dropdown', props: { title, value: index ? 'en' : 'auto', fieldEventId: 'field-' + index }, children: ['auto', 'en', 'zh-CN'].map(value => ({ type: 'raycast-form-dropdown-item', props: { title: value, value }, children: [] })) })),
  { type: 'raycast-action', props: { title: 'Continue', actionEventId: 'continue' }, children: [] }
] } });
window.proof = { sent, render, view, reset() { view.update({ type: 'outcome', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: revision - 1, eventId: 'continue', succeeded: true }); sent.length = 0; } };
render();
`
let javascript = ''
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/fixture.js' ? javascript : '<!doctype html><html><body><button id="outside">Outside</button><script type="module" src="/fixture.js"></script></body></html>')
})
try {
  console.log(JSON.stringify({ evidence, rootPid: process.pid, session }))
  const result = await build({ stdin: { contents: fixture, resolveDir: resolve('.'), loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false })
  javascript = result.outputFiles[0]!.text; stop()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await writeFile(join(evidence, 'playwright.json'), JSON.stringify({ browser: { browserName: 'chromium', launchOptions: { channel: 'chromium', headless: true, args: ['--use-mock-keychain'] }, contextOptions: { viewport: { width: 1512, height: 949 }, deviceScaleFactor: 2, colorScheme: 'dark' } } }))
  await cli('open', `http://127.0.0.1:${(server.address() as { port: number }).port}`, `--config=${join(evidence, 'playwright.json')}`)
  console.log(await cli('run-code', `async page => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const check = (value, message) => { if (!value) throw Error(message); };
    await page.getByRole('combobox', { name: 'Translate from', exact: true }).waitFor();
    const actions = () => page.evaluate(() => window.proof.sent.filter(event => event.kind === 'action'));
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 1, 'initial Command+Enter must submit');
    await page.evaluate(() => window.proof.reset());
    const secondary = page.getByRole('combobox', { name: 'Secondary Language', exact: true });
    await secondary.focus(); await secondary.selectOption('zh-CN');
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 1, 'Command+Enter after selecting a language must submit');
    await page.evaluate(() => window.proof.reset());
    await page.evaluate(() => window.proof.render());
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 1, 'Command+Enter after a form update must submit; focus=' + await page.evaluate(() => document.activeElement.tagName));
    await page.evaluate(() => window.proof.reset());
    await page.locator('h1').click();
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 1, 'Command+Enter after clicking blank form content must submit');
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 1, 'pending submission must not be duplicated');
    await page.evaluate(() => window.proof.reset());
    await page.keyboard.press('Enter');
    await page.keyboard.press('Meta+Shift+Enter');
    await page.keyboard.press('Meta+Alt+Enter');
    check((await actions()).length === 0, 'other key combinations must not submit');
    for (const flags of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
      const prevented = await page.evaluate(flags => { const event = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, cancelable: true, ...flags }); window.dispatchEvent(event); return event.defaultPrevented; }, flags);
      check(!prevented, 'composition/repeat must not be consumed');
    }
    check((await actions()).length === 0, 'composition/repeat must not submit');
    await page.keyboard.press('Control+Enter');
    check((await actions()).length === 1, 'Control+Enter fallback must remain supported');
    await page.evaluate(() => { window.proof.reset(); window.proof.view.element.remove(); });
    await page.keyboard.press('Meta+Enter');
    check((await actions()).length === 0, 'detached form must not submit');
    await page.evaluate(() => { document.body.append(window.proof.view.element); window.proof.view.dispose(); });
    const preventedAfterDispose = await page.evaluate(() => { const event = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
    check(!preventedAfterDispose && (await actions()).length === 0, 'disposed view must release the shortcut');
    check(errors.length === 0, JSON.stringify(errors));
    const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, colorScheme: document.documentElement.style.colorScheme, skin: document.documentElement.dataset.tockteamSkin ?? null }));
    check(geometry.width === 1512 && geometry.height === 949 && geometry.scale === 2 && geometry.colorScheme === 'dark' && geometry.skin === null, JSON.stringify(geometry));
    return { initial: true, changedLanguage: true, updatedForm: true, unfocusedForm: true, pendingGuard: true, modifierAndIMEGuards: true, disposed: true, errors, geometry };
  }`))
} finally {
  await observe()
  await cli('close').catch(() => undefined)
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); stop()
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await readFocusProofProcessSnapshot()).some(row => observed.has(row.pid))) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const remaining = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  for (const row of remaining) { try { process.kill(row.pid, 'SIGTERM') } catch {} }
  await new Promise(resolve => setTimeout(resolve, 200))
  const residue = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootPid: process.pid, observed: [...observed.keys()], residue, serverClosed: true }))
  assert.deepEqual(residue, [], 'owned browser process tree must stop')
}
