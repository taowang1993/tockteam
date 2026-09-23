import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { build, stop } from 'esbuild'
import { buildTailwindCss } from './tailwind.mjs'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'
import { focusProofDescendants, readFocusProofProcessSnapshot } from './trusted-raycast-focus-proof-client.ts'

// Render the actual settings component with isolated stores; no Desktop authority or user data.
const repo = resolve(import.meta.dirname, '..')
const evidence = await mkdtemp(join(tmpdir(), 'sidebar-settings-proof-'))
const session = `sidebar-settings-${process.pid}`
const execFile = promisify(execFileCallback)
const observed = new Map()
const observe = async () => {
  const rows = await readFocusProofProcessSnapshot()
  for (const root of rows.filter(row => row.command.includes(session))) {
    for (const row of [root, ...focusProofDescendants(rows, root.pid)]) observed.set(row.pid, row)
  }
}
const cli = async (...args) => {
  const { stdout, stderr } = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 2 * 1024 * 1024 }).catch(error => { throw new Error(error.stdout || error.message) })
  await observe()
  await writeFile(join(evidence, 'interactions.txt'), stdout + stderr, { flag: 'a' })
  if (stdout.includes('### Error')) throw new Error(stdout)
  return stdout
}
const source = await readFile(join(repo, 'plugins/sidebar/src/client/plugin.tsx'), 'utf8')
const component = source.slice(source.indexOf('function sidebarLabel('), source.indexOf('\nfunction syncSidebarSettings('))
assert.ok(component.includes('function SidebarSettingsRow('))
const fixture = `
import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { Switch } from '@tockteam/ui/switch';
import { WORKSPACE_MESSAGES } from './src/client/i18n.ts';
import { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from './src/sidebar-preferences.ts';
import { SidebarRuntimeSettingsService } from './src/client/runtime-settings.ts';
${component}
let preferences = { agentTerminalTools:false, bottomPanelAutoTerminal:true, browserInterceptLinks:true, interceptOpenPath:true };
let revision = 0;
const runtime = new SidebarRuntimeSettingsService({
  settingsGet: async () => ({value:preferences,revision}),
  settingsUpdate: async patch => { if(window.proof.pauseSave) await new Promise(resolve => {window.proof.resumeSave=resolve}); if(window.proof.failSave) throw Error('fixture save failure'); preferences = {...preferences,...patch}; return {value:preferences,revision:++revision}; },
});
window.proof = { runtime, failSave:false };
await runtime.start();
const t = (key, values = {}) => Object.entries(values).reduce((text,[name,value]) => text.replace('{'+name+'}',String(value)),WORKSPACE_MESSAGES.en[key]);
const descriptors = names => names.map(title => ({id:title,title}));
const sidebar = {getTabs:() => descriptors(['Review','Terminal','Browser','Files','Side Chat','Trajectory']), getViewers:() => descriptors(['Binary File','HTML Preview','Markdown Preview','Text Preview'])};
function Harness() {
 const [state,setState] = useState({openByDefault:false,width:300,tabsEnabled:{},viewersEnabled:{}});
 return <SidebarSettingsRow runtime={runtime} sidebar={sidebar} t={t} useStore={selector => selector(state)}
  setOpenByDefault={openByDefault => setState(s => ({...s,openByDefault}))}
  setWidth={width => setState(s => ({...s,width}))}
  setTabEnabled={(id,value) => setState(s => ({...s,tabsEnabled:{...s.tabsEnabled,[id]:value}}))}
  setViewerEnabled={(id,value) => setState(s => ({...s,viewersEnabled:{...s.viewersEnabled,[id]:value}}))}
  reset={() => {setState({openByDefault:false,width:300,tabsEnabled:{},viewersEnabled:{}});void runtime.reset();}} />;
}
const root = createRoot(document.querySelector('main'));
root.render(<Harness/>);
window.proof.switchRef = React.createRef();
window.proof.renderSmallSwitches = () => root.render(<div>
  <Switch size="sm" aria-label="Small Off" ref={window.proof.switchRef}/>
  <Switch size="sm" aria-label="Small On" defaultChecked/>
  <Switch size="sm" aria-label="Small Disabled" disabled/>
  <Switch size="sm" aria-label="Small Invalid" aria-invalid="true"/>
</div>);
`
const css = await buildTailwindCss(repo)
// Use the pinned runtime's real palette and global corner-shape rule, not synthetic tokens.
const themeSource = await readFile(join(repo, '.stage/dsh-runtime/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'), 'utf8')
const themeSheets = [...themeSource.matchAll(/^\s*var \w+_css_default = (".*");$/gm)].map(([, literal]) => JSON.parse(literal))
assert.equal(themeSheets.length, 6, 'load all six pinned DSH global theme sheets')
const html = `<!doctype html><html style="color-scheme:dark"><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>${themeSheets.join('\n')}</style><style>
body { margin:0; font:var(--dsw-font-s-14); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary) } button,input { font:inherit;color:inherit } main {max-width:1120px;margin:32px auto;padding:0 32px} @media(max-width:760px){ main{padding:0 20px} }
</style><style>${css}</style></head><body data-ds-dark-theme><main></main><script type="module" src="/fixture.js"></script></body></html>`
let js
const server = createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/fixture.js') { response.writeHead(404).end(); return }
  response.setHeader('Content-Type', request.url === '/' ? 'text/html' : 'text/javascript')
  response.end(request.url === '/' ? html : js)
})
try {
  console.log(JSON.stringify({ evidence, rootPid: process.pid, session }))
  const result = await build({ stdin: { contents: fixture, resolveDir: join(repo, 'plugins/sidebar'), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', write: false })
  js = result.outputFiles[0].contents
  stop()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  await writeFile(join(evidence, 'playwright.json'), JSON.stringify({ browser: { browserName: 'chromium', launchOptions: { channel: 'chromium', headless: true, args: ['--use-mock-keychain'] }, contextOptions: { viewport: { width:1512,height:949 }, deviceScaleFactor:2, colorScheme:'dark' } } }))
  await cli('open', `http://127.0.0.1:${server.address().port}`, `--config=${join(evidence, 'playwright.json')}`)
  const output = await cli('run-code', `async page => {
    const check = (value,message) => {if(!value) throw Error(message)};
    const errors = []; page.on('pageerror',error => errors.push(error.message)); page.on('console',message => {if(message.type()==='error') errors.push(message.text())});
    await page.reload();
    await page.getByRole('switch').first().waitFor();
    const facts = await page.evaluate(() => {
      const root = document.querySelector('.tockteam-sidebar-settings');
      const switches = [...root.querySelectorAll('[role=switch]')].map(el => {const track=el.getBoundingClientRect(),thumb=el.firstElementChild.getBoundingClientRect();return {state:el.dataset.state,width:track.width,height:track.height,padding:getComputedStyle(el).padding,left:thumb.left-track.left,right:track.right-thumb.right,thumb:thumb.width,shadow:getComputedStyle(el.firstElementChild).boxShadow,trackColor:getComputedStyle(el).backgroundColor,thumbColor:getComputedStyle(el.firstElementChild).backgroundColor,trackCorner:getComputedStyle(el).cornerShape,thumbCorner:getComputedStyle(el.firstElementChild).cornerShape,trackRadius:parseFloat(getComputedStyle(el).borderTopLeftRadius),thumbRadius:parseFloat(getComputedStyle(el.firstElementChild).borderTopLeftRadius)}});
      return {width:innerWidth,height:innerHeight,scale:devicePixelRatio,theme:document.documentElement.style.colorScheme,skin:document.body.dataset.tockteamSkin??document.documentElement.dataset.tockteamSkin??null,bodyDark:document.body.hasAttribute('data-ds-dark-theme'),mode:'isolated Side Panel with pinned DSH theme CSS',route:location.pathname,titles:[...root.querySelectorAll('strong')].map(el=>parseFloat(getComputedStyle(el).fontSize)),descriptions:[...root.querySelectorAll('p,small')].map(el => parseFloat(getComputedStyle(el).fontSize)),rowHeights:[...root.querySelectorAll('.tockteam-sidebar-settings-row')].map(el=>el.getBoundingClientRect().height),switches};
    });
    console.log(JSON.stringify(facts));
    check(facts.width===1512 && facts.height===949 && facts.scale===2,'exact screenshot geometry');
    check(facts.theme==='dark' && facts.bodyDark && facts.skin===null,'built-in dark appearance without an active skin');
    await page.screenshot({path:${JSON.stringify(join(evidence, 'side-panel-dark.png'))}});
    check(facts.switches.every(s=>s.trackColor!==s.thumbColor),'visible contrasting switch thumbs under the real DSH dark palette');
    check(facts.switches.every(s=>['round','superellipse(1)'].includes(s.trackCorner) && ['round','superellipse(1)'].includes(s.thumbCorner) && s.trackRadius>=s.height/2 && s.thumbRadius>=s.thumb/2),'pill-shaped tracks and circular thumbs, not DSH superellipses: '+JSON.stringify(facts.switches[0]));
    check(facts.titles.every(size=>size===14) && facts.descriptions.every(size=>size===12),'match General settings typography: 14px labels and 12px descriptions');
    check(facts.switches.every(s=>s.width===32 && Math.abs(s.height-18.4)<0.1 && s.thumb===16 && !/[1-9][0-9.]*px/.test(s.shadow)),'original shadcn radix-nova switch geometry, without custom thumb shadows: '+JSON.stringify(facts.switches));
    check(facts.switches.every(s=>s.left>=1 && s.right>=1 && Math.abs((s.state==='checked'?s.right:s.left)-1)<0.1),'switch thumbs align inside tracks in both states: '+JSON.stringify(facts.switches));
    check(facts.rowHeights.every(height=>height>=52),'settings rows need breathing room');
    const motion = [];
    const checkMotion = async control => {
      await page.emulateMedia({reducedMotion:'no-preference'});
      for (const checked of [true,false]) {
        await control.click();
        const sample = await control.evaluate(el => {
          const thumb = el.firstElementChild;
          const animation = thumb.getAnimations().find(a=>a.transitionProperty==='translate');
          if (!animation) return null;
          animation.pause();
          const duration = animation.effect.getTiming().duration;
          const positions = [0,duration/2,duration].map(time=>{animation.currentTime=time;return thumb.getBoundingClientRect().left-el.getBoundingClientRect().left});
          animation.finish();
          return {size:el.dataset.size,checked:el.getAttribute('aria-checked')==='true',duration,positions};
        });
        check(sample && sample.duration===200,'thumb slides over 200ms: '+JSON.stringify(sample));
        const [start,middle,end] = sample.positions;
        check(sample.checked===checked && (checked?start<middle && middle<end:start>middle && middle>end),'thumb interpolates in both directions');
        motion.push(sample);
      }
    };
    const open = page.getByRole('switch',{name:/Open at Launch/});
    await checkMotion(open);
    await open.focus(); await open.press('Space'); check(await open.isChecked(),'keyboard toggle');
    await page.waitForFunction(()=>document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).boxShadow.includes('3px'));
    const focus = await open.evaluate(el=>getComputedStyle(el).boxShadow);
    await page.getByText('Open at Launch',{exact:true}).click(); check(!await open.isChecked(),'label toggles switch');
    const agent = page.getByRole('switch',{name:/Terminal Tools for Agents/i});
    await page.evaluate(()=>window.proof.pauseSave=true); await agent.click();
    check(await agent.isDisabled(),'switch disabled during save');
    await page.evaluate(()=>{window.proof.pauseSave=false;window.proof.resumeSave()});
    await page.waitForFunction(()=>!window.proof.runtime.getSnapshot().busy && window.proof.runtime.getSnapshot().preferences.agentTerminalTools===true);
    await page.getByRole('switch',{name:'Review',exact:true}).click(); check(!await page.getByRole('switch',{name:'Review',exact:true}).isChecked(),'tool preference');
    await page.getByRole('switch',{name:'HTML Preview',exact:true}).click(); check(!await page.getByRole('switch',{name:'HTML Preview',exact:true}).isChecked(),'viewer preference');
    await page.getByRole('button',{name:'Reset',exact:true}).click(); await page.waitForFunction(()=>!window.proof.runtime.getSnapshot().busy);
    check(!await agent.isChecked() && await page.getByRole('switch',{name:'Review',exact:true}).isChecked(),'reset restores defaults');
    await page.evaluate(()=>window.proof.failSave=true); await agent.click(); await page.getByRole('alert').waitFor(); check(!await agent.isChecked(),'failed save restores switch');
    await page.evaluate(()=>window.proof.failSave=false); await page.getByRole('button',{name:'Reset',exact:true}).click(); await page.getByRole('alert').waitFor({state:'detached'});
    await page.emulateMedia({reducedMotion:'reduce'});
    check(await open.evaluate(el=>getComputedStyle(el).transitionProperty==='none' && getComputedStyle(el.firstElementChild).transitionProperty==='none'),'reduced motion');
    for (const checked of [true,false]) {
      await open.click();
      check(await open.evaluate((el,checked)=>el.getAttribute('aria-checked')===String(checked) && el.firstElementChild.getAnimations().length===0,checked),'reduced-motion toggles instantly');
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:${JSON.stringify(join(evidence, 'side-panel-dark.png'))}});
    await page.evaluate(()=>{document.documentElement.style.colorScheme='light';document.body.removeAttribute('data-ds-dark-theme')});
    await page.screenshot({path:${JSON.stringify(join(evidence, 'side-panel-light.png'))}});
    await page.setViewportSize({width:600,height:949});
    check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'no narrow overflow');
    check(await page.locator('.tockteam-sidebar-settings-list').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length===1),'narrow single column');
    const themes = [];
    for (const skin of [{id:null,colorScheme:'light',tokens:{}},...${JSON.stringify(TOCKTEAM_SKINS.map(({ id, colorScheme, tokens }) => ({ id, colorScheme, tokens })))}]) {
      await page.evaluate(skin=>{
        document.documentElement.style.cssText='color-scheme:'+skin.colorScheme;
        document.body.style.cssText='';
        document.body.toggleAttribute('data-ds-dark-theme',skin.colorScheme==='dark');
        if(skin.id) document.body.dataset.tockteamSkin=skin.id; else delete document.body.dataset.tockteamSkin;
        for(const [key,value] of Object.entries(skin.tokens)) document.body.style.setProperty(key,value);
      },skin);
      const switches = await page.getByRole('switch').evaluateAll(elements=>elements.map(el=>({state:el.dataset.state,track:getComputedStyle(el).backgroundColor,thumb:getComputedStyle(el.firstElementChild).backgroundColor,width:el.getBoundingClientRect().width})));
      check(switches.every(s=>s.width===32 && s.track!==s.thumb && s.track!=='rgba(0, 0, 0, 0)'), 'switches remain visible in '+(skin.id??'light'));
      themes.push({id:skin.id,colorScheme:skin.colorScheme,switches});
    }
    await page.evaluate(()=>window.proof.renderSmallSwitches());
    const small = page.getByRole('switch',{name:'Small Off',exact:true});
    await small.waitFor();
    const smallGeometry = await page.getByRole('switch').evaluateAll(elements=>elements.map(el=>{const track=el.getBoundingClientRect(),thumb=el.firstElementChild.getBoundingClientRect();return {width:track.width,height:track.height,thumb:thumb.width,left:thumb.left-track.left,right:track.right-thumb.right}}));
    check(smallGeometry.every(s=>s.width===24 && s.height===14 && s.thumb===12 && s.left>=1 && s.right>=1),'upstream small switch geometry');
    await checkMotion(small);
    check(await small.evaluate(el=>el===window.proof.switchRef.current),'React 18 ref forwarding');
    await small.focus(); await small.press('Space'); check(await small.isChecked(),'small switch keyboard toggle');
    check(await page.getByRole('switch',{name:'Small Disabled'}).isDisabled(),'disabled small switch');
    check(await page.getByRole('switch',{name:'Small Invalid'}).evaluate(el=>getComputedStyle(el).boxShadow.includes('3px')),'invalid switch has an error ring');
    check(errors.length===0,JSON.stringify(errors));
    return {facts,focus,themes,smallGeometry,motion,errors,keyboard:true,label:true,save:true,disabled:true,rollback:true,reset:true,narrow:true};
  }`)
  await writeFile(join(evidence, 'result.txt'), output)
  for (const name of ['side-panel-dark.png', 'side-panel-light.png']) {
    const png = await readFile(join(evidence, name))
    assert.equal(png.readUInt32BE(16), 3024)
    assert.equal(png.readUInt32BE(20), 1898)
  }
  console.log(output)
} finally {
  await observe()
  await cli('close').catch(() => undefined)
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  stop()
  await new Promise(resolve => setTimeout(resolve, 500))
  const remaining = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  for (const row of remaining) { try { process.kill(row.pid, 'SIGTERM') } catch {} }
  await new Promise(resolve => setTimeout(resolve, 200))
  const residue = (await readFocusProofProcessSnapshot()).filter(row => observed.has(row.pid))
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootPid:process.pid, observed:[...observed.keys()], residue, serverClosed:true }))
  assert.deepEqual(residue, [], 'owned browser process tree must stop')
}
