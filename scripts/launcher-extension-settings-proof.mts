import assert from 'node:assert/strict'
import { spawn, execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, writeFile, readFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { build, stop } from 'esbuild'
import { buildTailwindCss } from './tailwind.mjs'
import { LauncherPersistenceRepository } from '../src/launcher-persistence.ts'
import { createLauncherLocalExtensions } from '../src/launcher-local-extensions.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { TrustedRaycastTrustStore } from '../src/trusted-raycast-trust.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { createTrustedRaycastCanIUseRuntime } from '../src/trusted-raycast-can-i-use-runtime.ts'
import { loadTrustedRaycastPreferences } from '../src/trusted-raycast-preferences.ts'
import { loadKaomojiPreferenceState } from '../src/trusted-raycast-kaomoji-preferences.ts'
import { loadTrustedRaycastCanIUsePreferences } from '../src/trusted-raycast-can-i-use-preference-store.ts'
import type { TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'
import { focusProofDescendants, readFocusProofProcessSnapshot, type ProofProcessRow } from './trusted-raycast-focus-proof-client.ts'

// A hidden Electron component harness: real preload, guarded IPC and real isolated preference files.
const evidence = await mkdtemp(join(tmpdir(), 'launcher-extension-settings-'))
const session = `extension-settings-${process.pid}`
const execFile = promisify(execFileCallback)
const uiRequire = createRequire(new URL('../plugins/ui/package.json', import.meta.url))
const root = resolve('.')
const assetsRoot = join(root, '.stage/dsh-runtime/node_modules/.pnpm/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
const assets = await readdir(assetsRoot)
const observed = new Map<number, ProofProcessRow>()
let child: ReturnType<typeof spawn> | undefined
const observe = async () => {
  const rows = await readFocusProofProcessSnapshot()
  for (const row of [...focusProofDescendants(rows, process.pid), ...rows.filter(row => row.pid === child?.pid || row.command.includes(session))]) for (const member of [row, ...focusProofDescendants(rows, row.pid)]) observed.set(member.pid, member)
}
const cli = async (...args: string[]) => {
  const output = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 90000, maxBuffer: 2 * 1024 * 1024 })
  await observe()
  await writeFile(join(evidence, 'interactions.txt'), output.stdout + output.stderr, { flag: 'a' })
  if (output.stdout.includes('### Error')) throw new Error(output.stdout)
  return output.stdout
}
const browser = `
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { Settings, Database, SlidersHorizontal, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { apply } from '${root}/src/launcher-settings.tsx';
import { launcherOriginalThemeTokens } from '${root}/src/launcher-theme.ts';
import { launcherExtensionPages } from '${root}/src/launcher-extension-settings.ts';
import { TOCKTEAM_SKINS } from '${root}/plugins/skins/src/skins.ts';
let state = { active: 'en', revision: 0 };
const listeners = new Set(); const messages = new Map();
const locale = { bind: namespace => key => messages.get(namespace)?.[state.active]?.[key] ?? key, getSnapshot: () => state,
  setLocale: active => { state = { active, revision: state.revision + 1 }; for (const listener of listeners) listener(); },
  register: (namespace, value) => { messages.set(namespace, value); return () => messages.delete(namespace); },
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
const entries = []; const cleanups = [];
const slots = { inject: (_, callback) => callback(), register: (options, component) => { const entry = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1); } };
let native;
window.__ModuleLoader__ = { load: ({ factory }) => { native = factory(name => ({ react: React, 'react/jsx-runtime': jsxRuntime, '@deepseek-ai/dsh-client-ui-slots': { resolveSlotLabel: label => typeof label === 'function' ? label() : label }, '@deepseek-ai/dsh-client-store': {}, '@deepseek-ai/dsh-client-ui-primitives': { IconSettingsOutline16: Settings, IconSettingsOutline14: Settings, IconDataOutline16: Database, IconAgentPresetOutline16: Settings, IconPersonalizationOutline16: SlidersHorizontal, IconCloseOutline16: X, ConnectionIndicator: () => null } })[name]); } };
const shellUrl = '/settings-shell.js'; await import(shellUrl);
const ctx = { effect: callback => cleanups.push(callback()), get: name => name === 'locale' ? locale : name === 'slots' ? slots : { reconnect() {} }, locale, slots, remote: { $host: { isLoopback: false } } };
native.apply(ctx); apply(ctx);
for (const [id, label] of [['models', 'Models'], ['plugins', 'Plugins'], ['agent-presets', 'Agent Presets'], ['side-panel', 'Side Panel']]) slots.register({ name: 'settings.section', id, label, order: entries.length }, () => React.createElement('h1', {}, label));
const renderRoot = createRoot(document.getElementById('root'));
const Root = entries.find(entry => entry.options.name === 'sidebar.settings').component;
const renderSlot = (name, props, filter) => entries.filter(entry => entry.options.name === name && (!filter || entry.options.id === filter.only)).map(entry => React.createElement(entry.component, { ...props, renderSlot, key: entry.options.id ?? name, t: locale.bind(entry.options.locale) }));
function Shell() { React.useSyncExternalStore(locale.subscribe, locale.getSnapshot); return React.createElement(Root, { wide: true, reconnect() {}, useConnectionState: select => select('connected'), useSessions: select => select({ phase: 'loading' }), useOnboardingSteps: select => select([]), useSections: select => select(entries.filter(entry => entry.options.name === 'settings.section').map(({ options }) => ({ ...options, label: typeof options.label === 'function' ? options.label() : options.label })).sort((a, b) => a.order - b.order)), renderSlot, t: locale.bind('settings') }); }
const render = () => renderRoot.render(React.createElement(Shell));
function theme(mode, skin = null) {
  document.documentElement.removeAttribute('style'); delete document.documentElement.dataset.tockteamSkin;
  for (const [key, value] of Object.entries(launcherOriginalThemeTokens(mode))) document.documentElement.style.setProperty(key, value);
  document.documentElement.style.colorScheme = mode;
  document.documentElement.style.setProperty('--tockteam-titlebar-height', '0px');
  document.documentElement.style.setProperty('--tockteam-rail-width', '0px');
  document.documentElement.style.setProperty('--tockteam-primary-sidebar-width', '280px');
  if (skin) { for (const [key, value] of Object.entries(skin.tokens)) document.documentElement.style.setProperty(key, value); document.documentElement.dataset.tockteamSkin = skin.id; }
}
document.documentElement.classList.add('tockteam-desktop-shell');
document.documentElement.dataset.tockteamSettingsPage = 'true';
new MutationObserver(() => { const panel = document.querySelector('[role="dialog"][aria-modal="true"]'); if (!panel || panel.dataset.tockteamSettingsPageSurface) return; panel.dataset.tockteamSettingsPageSurface = 'true'; panel.parentElement.dataset.tockteamSettingsPageShell = 'true'; const mask = panel.previousElementSibling; if (mask) mask.dataset.tockteamSettingsPageMask = 'true'; }).observe(document.getElementById('root'), { childList: true, subtree: true });
theme('dark'); render();
window.proof = { pages: launcherExtensionPages, locale, theme, skins: TOCKTEAM_SKINS, get closed() { return document.querySelector('[role="dialog"]') === null ? 1 : 0; }, reopen() { renderRoot.unmount(); location.reload(); } };
`
const electronMain = `
import { app, BrowserWindow, ipcMain } from 'electron';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerWorkbenchLauncherIpcHandlers } from '${root}/src/launcher-window-ipc.ts';
import { LauncherPersistenceRepository } from '${root}/src/launcher-persistence.ts';
import { createTrustedRaycastSettings } from '${root}/src/trusted-raycast-settings.ts';
import { loadTrustedRaycastPreferences, saveTrustedRaycastPreferences } from '${root}/src/trusted-raycast-preferences.ts';
import { loadKaomojiPreferenceState, saveKaomojiPreferences } from '${root}/src/trusted-raycast-kaomoji-preferences.ts';
import { loadTrustedRaycastCanIUsePreferences, saveTrustedRaycastCanIUsePreferences } from '${root}/src/trusted-raycast-can-i-use-preference-store.ts';
import { CAN_I_USE_SETTINGS_TARGETS } from '${root}/src/trusted-raycast-settings-catalog.ts';
import { DESKTOP_APP_UPDATE_CHANNELS, createDisabledDesktopAppUpdateState } from '${root}/src/desktop-app-update.ts';
const evidence = ${JSON.stringify(evidence)};
app.setPath('userData', join(evidence, 'profile')); app.setPath('sessionData', join(evidence, 'profile'));
app.commandLine.appendSwitch('use-mock-keychain'); app.commandLine.appendSwitch('force-device-scale-factor', '2');
if (process.platform === 'darwin') app.setActivationPolicy('prohibited');
void (async () => { await app.whenReady();
const repository = await LauncherPersistenceRepository.open({ userDataPath: join(evidence, 'profile'), secureStorageAvailable: false });
const preferencePath = id => join(evidence, id + '.json');
const trustState = { active: true, installed: true, enabled: false, candidateAvailable: true, candidateDigest: '', digest: 'a'.repeat(64), digestApproved: true, hasPrevious: false, previewed: true, recovery: '', staged: false };
const extensionSettings = createTrustedRaycastSettings({
  read: id => id === 'google-translate' ? loadTrustedRaycastPreferences(preferencePath(id)) : id === 'kaomoji-search' ? loadKaomojiPreferenceState(preferencePath(id)).values : loadTrustedRaycastCanIUsePreferences(preferencePath(id)),
  write: (id, values) => id === 'google-translate' ? saveTrustedRaycastPreferences(preferencePath(id), values) : id === 'kaomoji-search' ? saveKaomojiPreferences(preferencePath(id), values) : saveTrustedRaycastCanIUsePreferences(preferencePath(id), values, { canonicalTargets: CAN_I_USE_SETTINGS_TARGETS }),
  trust: () => trustState,
  setEnabled: async (_id, enabled) => { trustState.enabled = enabled; },
});
const files = new Map([['/settings-shell.js', 'settings-shell.js'], ['/fixture.js', 'fixture.js'], ['/react.js', 'react.js'], ['/react-dom.js', 'react-dom.js'], ['/react-dom-client.js', 'react-dom-client.js'], ['/jsx-runtime.js', 'jsx-runtime.js']]);
const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \\'self\\'; script-src \\'self\\' \\'unsafe-inline\\'; style-src \\'self\\' \\'unsafe-inline\\'; img-src \\'self\\' data:; font-src \\'self\\' data:"><link rel="stylesheet" href="/style.css"><script type="importmap">'+JSON.stringify({ imports: { react: '/react.js', 'react-dom': '/react-dom.js', 'react-dom/client': '/react-dom-client.js', 'react/jsx-runtime': '/jsx-runtime.js' } })+'</script></head><body class="bg-surface text-foreground" style="margin:0;overflow:hidden"><div id="root" style="padding:2px;box-sizing:border-box"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = createServer((request, response) => { const file = files.get(request.url); response.setHeader('Content-Type', file ? 'text/javascript' : request.url === '/style.css' ? 'text/css' : 'text/html'); response.end(file ? readFileSync(join(evidence, file)) : request.url === '/style.css' ? readFileSync(join(evidence, 'style.css')) : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const window = new BrowserWindow({ show: false, width: 1512, height: 949, useContentSize: true, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: '${root}/dist/preload.cjs' } });
const guard = event => { if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw Error('untrusted'); };
registerWorkbenchLauncherIpcHandlers({ ipcMain, assertTrustedMainIpc: guard, controller: { getState: () => ({ visible: false }), show: async () => {} }, extensionSettings, onRouteReady: () => {}, settings: {
 getSnapshot: () => ({ ...repository.snapshot(), secureStorageAvailable: false }), updateSetting: async (key, value) => { if (key === 'extension[Calculator].precision' && value === 13) throw Error('fixture rejected write'); await repository.updateSetting(key, value); return { ok: true }; },
 importSettings: async () => ({ ok: true, canceled: true }), exportSettings: async () => ({ ok: true, canceled: true }), resetSettings: async () => ({ ok: true, canceled: true }), selectExternalSettings: async () => ({ ok: true, canceled: true }), revokeExternalSettings: async () => ({ ok: true }), selectCustomBrowser: async () => ({ ok: true, canceled: true }), revokeCustomBrowser: async () => ({ ok: true }),
} });
ipcMain.handle('desktop:launch-on-start:get', event => { guard(event); return false; });
ipcMain.handle(DESKTOP_APP_UPDATE_CHANNELS.getState, event => { guard(event); return createDisabledDesktopAppUpdateState('0.0.0'); });
await window.loadURL(origin + '/settings/tocklauncher/extensions');
console.log('PROOF_READY');
app.on('before-quit', () => { server.closeAllConnections(); server.close(); });
})().catch(error => { console.error(error); app.exit(1); });
`
try {
  await writeFile(join(evidence, 'style.css'), (await Promise.all(assets.filter(file => file.endsWith('.css')).map(file => readFile(join(assetsRoot, file), 'utf8')))).join('\n') + '\n' + await buildTailwindCss(root))
  await writeFile(join(evidence, 'settings-shell.js'), await readFile(join(root, '.stage/dsh-runtime/node_modules/.pnpm/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js')))
  await mkdir(join(evidence, 'profile'))
  await writeFile(join(evidence, 'profile/skins.json'), JSON.stringify({ activeId: null, fallbackTheme: 'dark' }))
  await build({ stdin: { contents: browser, resolveDir: root, loader: 'tsx' }, outfile: join(evidence, 'fixture.js'), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], logLevel: 'silent' })
  for (const [specifier, filename] of [['react', 'react.js'], ['react-dom', 'react-dom.js'], ['react-dom/client', 'react-dom-client.js'], ['react/jsx-runtime', 'jsx-runtime.js']]) {
    const names = Object.keys(uiRequire(specifier!)).filter(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) && name !== 'default')
    const contents = `import runtime from ${JSON.stringify(uiRequire.resolve(specifier!))}; export const { ${names.join(',')} } = runtime; export default runtime;`
    const banner = specifier === 'react' ? '' : `import React from 'react'; ${specifier === 'react-dom/client' ? "import ReactDOM from 'react-dom';" : ''} const require = name => { if (name === 'react') return React; ${specifier === 'react-dom/client' ? "if (name === 'react-dom') return ReactDOM;" : ''} throw Error(name); };`
    await build({ stdin: { contents, resolveDir: root }, outfile: join(evidence, filename!), bundle: true, format: 'esm', platform: 'browser', banner: { js: banner }, external: specifier === 'react' ? [] : ['react', 'react-dom'], define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' })
  }
  await build({ stdin: { contents: electronMain, resolveDir: root, loader: 'ts' }, outfile: join(evidence, 'main.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['electron'], logLevel: 'silent' }); stop()
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  child = spawn(join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), ['--use-mock-keychain', '--remote-debugging-port=0', join(evidence, 'main.mjs')], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''
  const endpoint = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Electron proof startup timed out: ' + stdout + stderr)), 30000)
    const check = () => { const match = /DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/u.exec(stderr); if (match && stdout.includes('PROOF_READY')) { clearTimeout(timer); resolve('http://' + match[1]) } }
    child!.stdout!.on('data', data => { stdout += data; check() }); child!.stderr!.on('data', data => { stderr += data; check() })
    child!.on('error', error => { clearTimeout(timer); reject(error) }); child!.on('exit', code => { clearTimeout(timer); reject(Error('Electron exited: ' + code + stderr)) })
  })
  console.log(JSON.stringify({ evidence, electronPid: child.pid, rootPid: process.pid }))
  await cli('attach', `--cdp=${endpoint}`)
  const result = await cli('run-code', `async page => {
    const check = (value, message) => { if (!value) throw Error(message); };
    const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', entry => { if (entry.type() === 'error' || entry.type() === 'warning') errors.push(entry.text()); });
    const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'TockLauncher', exact: true }).click();
    check(await page.locator('nav button[aria-expanded]').count() > 0, 'TockLauncher must be a sidebar disclosure');
    await page.getByRole('button', { name: 'Extensions', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search Extensions' }).waitFor();
    const pages = await page.evaluate(() => window.proof.pages);
    check(await page.locator('button[data-extension-id]').count() === 27, 'all 27 extensions');
    const sidebar = page.locator('[data-tocklauncher-navigation]');
    check(await page.locator('[data-testid="tocklauncher-settings"] nav').count() === 0, 'no duplicate in-page navigation');
    await sidebar.getByRole('button', { name: 'TockLauncher', exact: true }).focus(); await page.keyboard.press('Space');
    check(!(await sidebar.getByRole('button', { name: 'Extensions', exact: true }).isVisible()), 'parent collapses from keyboard');
    await page.keyboard.press('Space'); await sidebar.getByRole('button', { name: 'Extensions', exact: true }).click();
    check(await page.locator('button[data-extension-id]:visible').count() === 0, 'Extensions collapses independently');
    await sidebar.getByRole('button', { name: 'Extensions', exact: true }).click();
    const row = await page.locator('button[data-extension-id="google-translate"]').boundingBox(); check(row.height >= 30 && row.height <= 40, 'compact sidebar rows');
    const open = async id => { await page.locator('button[data-extension-id="' + id + '"]').click(); await page.locator('[data-extension-heading]').waitFor(); };
    const back = async () => { await page.locator('[data-tocklauncher-navigation]').getByRole('button', { name: 'General', exact: true }).click(); };
    for (const item of pages) { await open(item.id); check(await page.locator('[data-testid="tocklauncher-extension-detail"]').getAttribute('data-extension-id') === item.id, item.id); if (item.editor === 'compatibility') await page.getByRole('button', { name: 'Save Preferences', exact: true }).waitFor(); await back(); }
    await page.getByRole('searchbox').fill('precision'); check(await page.locator('button[data-extension-id]:visible').count() === 1, 'field search');
    await page.getByRole('searchbox').press('Tab'); await page.keyboard.press('Enter'); const precision = page.getByRole('spinbutton', { name: 'Calculator Precision', exact: true }); await precision.waitFor(); await precision.fill('4'); await precision.blur();
    await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getSnapshot()).values['extension[Calculator].precision'] === 4);
    await back(); check(await page.locator('[data-tocklauncher-navigation] [aria-current="page"]').innerText() === 'General', 'General is selected in the sidebar');
    await page.getByRole('searchbox').fill(''); await open('Calculator'); await precision.fill('13'); await precision.blur();
    await page.getByText('TockLauncher settings could not be saved.', { exact: true }).waitFor(); await back(); await open('Calculator'); check(await precision.inputValue() === '13', 'failed draft survives navigation');
    await page.getByRole('button', { name: 'Models', exact: true }).click(); await page.getByRole('alertdialog').waitFor(); await page.getByRole('button', { name: 'Keep Editing' }).click(); check(await precision.inputValue() === '13', 'leaving TockLauncher protects drafts');
    await page.keyboard.press('Escape'); await page.getByRole('alertdialog').waitFor(); await page.getByRole('button', { name: 'Keep Editing' }).click(); check(await precision.inputValue() === '13', 'cancel discard retains input');
    await precision.fill('6'); await precision.blur(); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getSnapshot()).values['extension[Calculator].precision'] === 6);
    await page.getByRole('button', { name: 'Models', exact: true }).click(); await page.getByRole('heading', { name: 'Models', exact: true }).waitFor();
    await open('Calculator'); check(await precision.inputValue() === '6', 'sidebar activates launcher from another section');
    await back(); await open('UuidGenerator'); const formats = page.getByRole('textbox', { name: 'UUID Search Result Formats', exact: true }); await formats.fill('{bad'); await formats.blur(); await back(); await open('UuidGenerator'); check(await formats.inputValue() === '{bad', 'invalid JSON survives navigation');
    await formats.fill('[]'); await formats.blur(); await page.waitForFunction(async () => JSON.stringify((await window.dshDesktop.launcher.settings.getSnapshot()).values['extension[UuidGenerator].searchResultFormats']) === '[]');
    await back(); await open('google-translate'); await page.getByRole('combobox', { name: 'Primary Language', exact: true }).selectOption('zh-CN');
    await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('google-translate')).values.lang1 === 'zh-CN');
    await page.getByText('Advanced', { exact: true }).click(); const proxy = page.getByRole('textbox', { name: 'Proxy Override', exact: true }); await proxy.fill('http://127.0.0.1:58309'); await proxy.blur();
    await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('google-translate')).values.proxy === 'http://127.0.0.1:58309');
    await page.getByRole('button', { name: 'Use System Proxy', exact: true }).click(); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('google-translate')).values.proxy === '');
    await page.evaluate(async () => { const before = await window.dshDesktop.launcher.settings.getExtension('google-translate'); await window.dshDesktop.launcher.settings.updateExtension({ extensionId: before.extensionId, revision: before.revision, patch: { lang2: 'fr' } }); });
    await page.getByRole('switch', { name: 'Enable google-translate', exact: true }).click(); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('google-translate')).state.enabled);
    await page.getByRole('combobox', { name: 'Primary Language', exact: true }).selectOption('de'); await page.getByText('Settings changed elsewhere. Refresh, review your edits, and save again.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refresh Settings', exact: true }).click(); await page.getByText('Latest settings loaded. Review your edits before saving.', { exact: true }).waitFor();
    check(await page.getByRole('combobox', { name: 'Primary Language', exact: true }).inputValue() === 'de', 'refresh preserves own edit'); check(await page.getByRole('combobox', { name: 'Secondary Language', exact: true }).inputValue() === 'fr', 'refresh merges external edit');
    await page.getByRole('button', { name: 'Save Preferences', exact: true }).click(); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('google-translate')).values.lang1 === 'de');
    await page.getByRole('status').filter({ hasText: 'Saved. Changes apply the next time you open this extension.' }).waitFor();
    await page.evaluate(() => { document.querySelector('[data-testid="tocklauncher-settings"]').scrollIntoView({ block: 'start' }); document.querySelector('[role="dialog"] > nav').scrollTop = 0; });
    await page.mouse.move(1450, 20);
    check(await page.locator('[data-extension-heading]').isVisible(), 'dedicated page has its own title');
    const capture = await page.evaluate(() => ({ layout: [...document.querySelectorAll('html, body, [role="dialog"], [role="dialog"] > nav, [data-testid="tocklauncher-settings"]')].map(node => ({ tag: node.tagName, width: node.clientWidth, scrollWidth: node.scrollWidth })), route: location.pathname, extensionId: document.querySelector('[data-testid="tocklauncher-extension-detail"]').dataset.extensionId, mode: 'Hidden Electron with Pinned DSH Settings Shell', saved: document.body.innerText.includes('Saved. Changes apply'), scrollY, colorScheme: document.documentElement.style.colorScheme, skin: document.documentElement.dataset.tockteamSkin ?? null }));
    const screenshot = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
    await back(); await open('kaomoji-search'); await page.getByRole('combobox', { name: 'Display Mode', exact: true }).selectOption('grid'); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('kaomoji-search')).values.displayMode === 'grid');
    await back(); await open('can-i-use'); const targets = page.getByRole('textbox', { name: 'Browser Targets', exact: true }); await targets.fill('defaults'); await targets.blur(); await page.getByRole('alert').filter({ hasText: 'These settings are invalid' }).waitFor(); check(await targets.inputValue() === 'defaults', 'invalid target draft preserved');
    await targets.fill('chrome 100, firefox 100'); await targets.blur(); await page.waitForFunction(async () => (await window.dshDesktop.launcher.settings.getExtension('can-i-use')).values.defaultQuery === 'chrome 100,firefox 100');
    await back(); await open('DeeplTranslator'); check(await page.getByRole('textbox', { name: 'DeepL API Key', exact: true }).count() === 0 || await page.locator('#tocklauncher-deepl-key').isDisabled(), 'unavailable secure storage blocks writes');
    await back(); await open('SystemCommands'); check(await page.getByText('This extension has no additional settings.', { exact: true }).isVisible(), 'no-options page');
    await back(); await open('Workflow'); await page.getByRole('button', { name: 'Add Workflow', exact: true }).click(); await back(); await open('Workflow'); check(await page.getByRole('textbox', { name: 'Workflow Name', exact: true }).isVisible(), 'workflow draft still mounted');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tockteam-launcher-settings-destination', { detail: 'google-translate' }))); await page.getByRole('combobox', { name: 'Primary Language', exact: true }).waitFor();
    const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, colorScheme: document.documentElement.style.colorScheme, skin: document.documentElement.dataset.tockteamSkin ?? null })); check(geometry.width === 1512 && geometry.height === 949 && geometry.scale === 2 && geometry.colorScheme === 'dark' && geometry.skin === null, JSON.stringify(geometry));
    await page.evaluate(() => window.proof.locale.setLocale('zh')); await page.getByRole('combobox', { name: '主要语言', exact: true }).waitFor();
    await page.getByRole('searchbox').fill('计算器'); check(await page.locator('button[data-extension-id]:visible').count() === 1, 'Chinese name search'); await page.getByRole('searchbox').fill(''); await open('google-translate');
    await page.evaluate(() => window.proof.locale.setLocale('en'));
    await sidebar.getByRole('button', { name: 'Google Translate', exact: true }).waitFor();
    const skins = await page.evaluate(() => window.proof.skins.map(skin => skin.id));
    for (const id of skins) { await page.evaluate(id => { const skin = window.proof.skins.find(skin => skin.id === id); window.proof.theme(skin.colorScheme, skin); }, id); check(await page.getByRole('combobox', { name: 'Primary Language', exact: true }).isVisible(), 'skin ' + id); }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 800, deviceScaleFactor: 2, mobile: false });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow layout has no horizontal overflow');
    await page.evaluate(() => window.proof.theme('light')); check(await page.getByRole('combobox', { name: 'Primary Language', exact: true }).isVisible(), 'light theme');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false }); await page.evaluate(() => window.proof.theme('dark'));
    await page.keyboard.press('Escape'); await page.getByRole('alertdialog').waitFor(); await page.getByRole('button', { name: 'Discard and Leave', exact: true }).click(); await page.waitForFunction(() => window.proof.closed === 1);
    await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'TockLauncher', exact: true }).click(); await page.getByRole('button', { name: 'Extensions', exact: true }).click(); await open('Calculator'); check(await precision.inputValue() === '6', 'accepted value survives reopen');
    check(errors.length === 0, JSON.stringify(errors)); return { screenshot, capture, pages: pages.map(item => item.id), geometry, skins, errors, ipc: true, isolatedPersistence: true, draftRecovery: true, localization: true, narrowLayout: true };
  }`)
  const proof = JSON.parse(result.split('### Result\n')[1]!.split('\n###')[0]!)
  await writeFile(join(evidence, 'translate-dark.png'), Buffer.from(proof.screenshot, 'base64')); delete proof.screenshot
  const persisted = (await LauncherPersistenceRepository.open({ userDataPath: join(evidence, 'profile'), secureStorageAvailable: false })).snapshot().values
  const calculator = createLauncherLocalExtensions({ enabledExtensionIds: () => ['Calculator'], getSetting: <T,>(key: string, fallback: T): T => (persisted[key] ?? fallback) as T, copyText: async () => {} })
  assert.equal((await calculator.searchInstant('1/3')).after.find(item => item.sourceExtension === 'Calculator')?.name, '0.333333')
  proof.runtime = { calculator: '0.333333' }
  for (const id of ['google-translate', 'kaomoji-search', 'can-i-use'] as const) {
    const path = join(evidence, `${id}.json`)
    const values = id === 'google-translate' ? loadTrustedRaycastPreferences(path) : id === 'kaomoji-search' ? loadKaomojiPreferenceState(path).values : loadTrustedRaycastCanIUsePreferences(path)
    const descriptor = trustedRaycastDescriptors[id]
    const runtimeRoot = join(evidence, 'runtime-' + id)
    const candidateDir = join(root, 'dist', id === 'google-translate' ? 'trusted-raycast' : id === 'kaomoji-search' ? 'trusted-raycast-kaomoji' : 'trusted-raycast-can-i-use')
    const messages: TrustedRaycastViewMessage[] = []; const errors: string[] = []
    let store: TrustedRaycastTrustStore
    const manager = new TrustedRaycastManager({ runtimeDir: () => store.runtimeDir(), nodePath: process.execPath, preferencesConfigured: () => true, readSelectedText: async () => ({ unavailable: 'No native selection in this proof.' }), onMessage: (_owner, message) => { messages.push(message) }, onError: (_owner, error) => { errors.push(error.message) } })
    store = new TrustedRaycastTrustStore({ descriptor, candidateDir, installRoot: join(runtimeRoot, 'install'), stateFile: join(runtimeRoot, 'trust.json'), preview: staged => manager.previewRuntime(staged, id) })
    try {
      store.stage(); await store.preview(); store.apply(); store.enable()
      await manager.start({ webContentsId: 123 }, { extensionId: id, command: descriptor.command, sessionId: session + id, generation: 'saved-settings', preferences: values })
      await observe()
      const projection = messages.findLast(message => message.root)?.root
      assert.ok(projection, id + ' published a real command projection')
      assert.deepEqual(errors, [])
      if (id === 'google-translate') assert.ok(JSON.stringify(projection).includes('Auto-Detect -> German, French'))
      if (id === 'kaomoji-search') assert.ok(JSON.stringify(projection).includes('"type":"raycast-grid"'))
      if (id === 'can-i-use') {
        const runtime = createTrustedRaycastCanIUseRuntime(join(root, 'plugins/trusted-raycast/vendor'), session, values)
        assert.deepEqual(JSON.parse(runtime.initialMessage).snapshot.targets, ['chrome 100', 'firefox 100']); runtime.close()
      }
      await writeFile(join(evidence, id + '-runtime.json'), JSON.stringify(projection, null, 2))
      proof.runtime[id] = { root: projection.type, errors }
    } finally { await observe(); await manager.close() }
  }
  await writeFile(join(evidence, 'proof.json'), JSON.stringify(proof, null, 2))
  const png = await readFile(join(evidence, 'translate-dark.png')); assert.equal(png.readUInt32BE(16), 3024); assert.equal(png.readUInt32BE(20), 1898)
  console.log(JSON.stringify(proof, null, 2))
} catch (error) {
  await cli('screenshot', '--filename=' + join(evidence, 'failure.png')).catch(() => undefined)
  throw error
} finally {
  await observe(); await cli('close').catch(() => undefined)
  if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
  stop()
  for (let attempt = 0; attempt < 50; attempt++) { if (!(await readFocusProofProcessSnapshot()).some(row => observed.has(row.pid))) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  const residue = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  for (const row of residue) { try { process.kill(row.pid, 'SIGKILL') } catch {} }
  await new Promise(resolve => setTimeout(resolve, 200))
  const remaining = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootPid: process.pid, electronPid: child?.pid, observed: [...observed.keys()], remaining }))
  assert.deepEqual(remaining, [], 'owned Electron/browser trees stopped')
  console.log('Evidence: ' + evidence)
}
