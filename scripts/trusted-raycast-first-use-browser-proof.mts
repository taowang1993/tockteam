import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, extname } from 'node:path'
import { promisify } from 'node:util'
import { build, stop } from 'esbuild'
import { focusProofDescendants, readFocusProofProcessSnapshot, type ProofProcessRow } from './trusted-raycast-focus-proof-client.ts'

// Renderer-only fault injection over the real launcher bundle. Host/store/runtime proof is separate.
const repo = resolve('.')
const evidence = await mkdtemp(join(tmpdir(), 'extension-first-use-browser-'))
const session = `extension-first-use-${process.pid}`
const execFile = promisify(execFileCallback)
const observed = new Map<number, ProofProcessRow>()
const observe = async () => {
  const rows = await readFocusProofProcessSnapshot()
  const roots = rows.filter(row => row.command.includes(session))
  for (const root of roots) for (const row of [root, ...focusProofDescendants(rows, root.pid)]) observed.set(row.pid, row)
}
const cli = async (...args: string[]) => {
  const output = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
  await observe()
  await writeFile(join(evidence, 'interactions.txt'), output.stdout + output.stderr, { flag: 'a' })
  if (output.stdout.includes('### Error')) throw new Error(output.stdout)
  return output.stdout
}
const fixture = `
import { trustedRaycastCatalog, trustedRaycastCommands } from '${repo}/src/trusted-raycast-catalog.ts';
import { trustedRaycastDescriptors } from '${repo}/src/trusted-raycast-descriptors.ts';
const states = Object.fromEntries(trustedRaycastCommands.map(command => [command.extensionId, { active:true, candidateAvailable:true, candidateDigest:trustedRaycastDescriptors[command.extensionId].artifactSha256, digest:'', digestApproved:false, installed:false, enabled:false, hasPrevious:false, previewed:false, recovery:'', staged:false }]));
let listener, themeListener, actions = new Map(), counter = 0, releaseClose, releaseInvoke;
const proof = window.firstUseProof = { states, approvals:[], launches:[], deferReady:false, deferInvoke:false, pending:undefined, failIPC:false, closes:0,
  pauseClose() { this.closeBarrier = new Promise(resolve => { releaseClose = resolve }); },
  releaseClose() { releaseClose(); this.closeBarrier = undefined; },
  emitPending() { listener(this.pending); this.pending = undefined; },
  releaseInvoke() { releaseInvoke(); this.deferInvoke=false; },
  theme(mode) { themeListener({mode,skinId:null,revision:++counter}); },
};
function ready(id) {
  proof.launches.push(id);
  const message = { type:'ready', extensionId:id, sessionId:'session-'+(++counter), generation:'generation-'+counter, revision:0, root:{type:'raycast-list', props:{searchBarPlaceholder:'Search '+id,searchEventId:'search'}, children:[]} };
  if (proof.deferReady) proof.pending = message; else listener(message);
}
window.tockteamLauncher = {
  onTheme: fn => { themeListener = fn; }, getTheme: async () => ({mode:'dark',skinId:null,revision:0}), onLocale: () => {},
  getSurfaceSettings: async () => { throw Error('Use launcher defaults'); }, recordSearch: async () => { throw Error('History unavailable in fixture'); },
  onTrustedRaycastView: fn => { listener = fn; }, getTrustedRaycastTrust: async id => ({...states[id]}),
  search: async (searchTerm) => {
    const items = trustedRaycastCatalog(true, states['google-translate'], states['kaomoji-search'], states['can-i-use']).filter(item => (item.name+' '+item.description).toLowerCase().includes(searchTerm.toLowerCase())).map(item => {
      const actionId = 'action-'+(++counter); actions.set(actionId, item); return {...item, defaultAction:{...item.defaultAction, actionId}};
    });
    return {before:[],after:items,sections:[{id:'commands',items}],resultSetId:'results-'+counter,status:{indexedItemCount:items.length,rescanStatus:'idle'}};
  },
  invokeAction: async actionId => { const item = actions.get(actionId); if (!item) throw Error('expired'); const command = trustedRaycastCommands.find(command => command.id === item.id); if(command) { ready(command.extensionId); if(proof.deferInvoke) await new Promise(resolve => { releaseInvoke = resolve }); } return {ok:true}; },
  trustedRaycastFirstUse: async request => {
    proof.approvals.push(request); if(proof.failIPC) throw Error('IPC disconnected');
    const state = states[request.extensionId]; Object.assign(state, {installed:true,enabled:true,digestApproved:true,digest:request.digest});
    ready(request.extensionId); return {extensionId:request.extensionId,ok:true,state:{...state}};
  },
  trustedRaycastClose: async () => { proof.closes++; await proof.closeBarrier; return {ok:true}; },
  trustedRaycastTrustAction: async (id, action) => { states[id].enabled = action === 'enable'; return {extensionId:id,ok:true,state:{...states[id]}}; },
  trustedRaycastEvent: async () => ({ok:true}), dismiss: async () => {}, openSettings: async () => {},
};
await import('${repo}/src/launcher.ts');
`
const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/' ? 'launcher.html' : request.url!.slice(1)
    if (path.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(path)) { response.writeHead(404).end(); return }
    let bytes = await readFile(join(path === 'fixture.js' ? evidence : join(repo, 'dist'), path))
    if (path === 'launcher.html') bytes = Buffer.from(bytes.toString().replace('./launcher.js', './fixture.js'))
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream')
    response.end(bytes)
  } catch { response.writeHead(404).end() }
})
let sampler: ReturnType<typeof setInterval> | undefined
let sampling = Promise.resolve()
try {
  console.log(JSON.stringify({ evidence, rootPid: process.pid, session }))
  await build({ stdin: { contents: fixture, resolveDir: repo, loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', outfile: join(evidence, 'fixture.js') }); stop()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await writeFile(join(evidence, 'playwright.json'), JSON.stringify({ browser: { browserName: 'chromium', launchOptions: { channel: 'chromium', headless: true } } }))
  sampler = setInterval(() => { sampling = sampling.then(observe) }, 100)
  await cli('open', `http://127.0.0.1:${(server.address() as { port: number }).port}`, `--config=${join(evidence, 'playwright.json')}`)
  const output = await cli('run-code', `async page => {
    const check = (value, message) => { if(!value) throw Error(message); };
    await page.setViewportSize({width:750,height:475});
    await page.waitForFunction(() => document.documentElement.dataset.launcherReady === 'true');
    const search = page.locator('#launcher-search');
    const open = async query => { await search.fill(query); await page.getByRole('option').first().waitFor(); await search.press('Enter'); };
    await open('Can I Use'); await page.getByRole('button',{name:'Approve and Open',exact:true}).waitFor();
    await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    await page.locator('#trusted-raycast-search').waitFor();
    check((await page.evaluate(() => window.firstUseProof.approvals.length)) === 1,'explicit single approval');
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    check(await search.inputValue() === 'Can I Use','search restoration');
    await search.press('Enter'); await page.locator('#trusted-raycast-search').waitFor();
    check((await page.evaluate(() => window.firstUseProof.approvals.length)) === 1,'warm use bypasses consent');
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    await page.evaluate(() => { window.firstUseProof.deferReady=true; window.firstUseProof.deferInvoke=true; });
    await search.press('Enter'); await page.waitForFunction(() => !!window.firstUseProof.pending);
    await page.evaluate(() => window.firstUseProof.pauseClose());
    await search.press('Escape'); await search.waitFor({state:'visible'});
    await open('Translate');
    await page.evaluate(() => window.firstUseProof.emitPending());
    check(await page.locator('#trusted-raycast-search').count() === 0,'late old ready must not replace new intent');
    await page.evaluate(() => { window.firstUseProof.releaseInvoke(); window.firstUseProof.releaseClose(); window.firstUseProof.deferReady=false; });
    await page.getByRole('button',{name:'Approve and Open',exact:true}).waitFor();
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    check(await search.inputValue() === 'Translate','review Escape preserved search');
    await search.press('Enter'); await page.getByRole('button',{name:'Approve and Open',exact:true}).waitFor();
    await page.evaluate(() => { window.firstUseProof.failIPC=true; });
    await page.keyboard.press('Enter'); await page.getByRole('alert').filter({hasText:'IPC disconnected'}).waitFor();
    await page.screenshot({path:${JSON.stringify(join(evidence, 'approval-error-dark.png'))}});
    await page.evaluate(() => window.firstUseProof.theme('light'));
    await page.screenshot({path:${JSON.stringify(join(evidence, 'approval-error-light.png'))}});
    await page.evaluate(() => { window.firstUseProof.failIPC=false; });
    await page.keyboard.press('Enter'); await page.locator('#trusted-raycast-search').waitFor();
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    await open('Kaomoji'); await page.getByRole('button',{name:'Approve and Open',exact:true}).waitFor(); await page.keyboard.press('Enter'); await page.locator('#trusted-raycast-search').waitFor();
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    await page.evaluate(() => { window.firstUseProof.states['kaomoji-search'].enabled=false; });
    await open('Kaomoji'); await page.getByRole('button',{name:'Enable and Open',exact:true}).waitFor();
    check(!(await page.evaluate(() => window.firstUseProof.states['kaomoji-search'].enabled)),'ordinary Enter must not enable');
    await page.keyboard.press('Enter'); await page.locator('#trusted-raycast-search').waitFor();
    await page.keyboard.press('Escape'); await search.waitFor({state:'visible'});
    await open('Extensions'); await page.getByRole('tab',{name:'Google Translate',exact:true}).waitFor();
    await page.keyboard.press('ArrowDown');
    check(await page.getByRole('tab',{name:'Kaomoji Search',exact:true}).getAttribute('aria-selected') === 'true','keyboard management row');
    check(await page.getByRole('tab',{name:'Kaomoji Search',exact:true}).isEnabled(),'selected is not disabled');
    await page.waitForTimeout(150);
    await page.screenshot({path:${JSON.stringify(join(evidence, 'extensions-light.png'))}});
    await page.evaluate(() => window.firstUseProof.theme('dark')); await page.screenshot({path:${JSON.stringify(join(evidence, 'extensions-dark.png'))}});
    return {cold:true,warm:true,escape:true,lateReadyFenced:true,ipcRetry:true,sharedExtensions:true,disabledConsent:true,keyboardManagement:true};
  }`)
  await writeFile(join(evidence, 'result.txt'), output)
  console.log(output)
} catch (error) {
  await cli('run-code', 'async page => ({ text: await page.locator("body").innerText(), proof: await page.evaluate(() => window.firstUseProof), active: await page.evaluate(() => document.activeElement?.outerHTML) })').catch(() => undefined)
  await cli('screenshot', `--filename=${join(evidence, 'failure.png')}`).catch(() => undefined)
  throw error
} finally {
  if (sampler) clearInterval(sampler)
  await sampling; await observe()
  await cli('close').catch(() => undefined)
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); stop()
  for (let attempt = 0; attempt < 50; attempt++) {
    const rows = await readFocusProofProcessSnapshot()
    if (!rows.some(row => observed.has(row.pid))) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const remaining = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  // Only recorded owned browser descendants, never an ambient browser or app.
  for (const row of remaining) { try { process.kill(row.pid, 'SIGTERM') } catch {} }
  await new Promise(resolve => setTimeout(resolve, 200))
  const residue = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootPid: process.pid, observed: [...observed.keys()], residue, serverClosed: true }))
  assert.deepEqual(residue, [], 'owned browser process tree must stop')
}
