import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { addModelSelectionSearch } from '../scripts/model-selection-search.mjs'
import { buildTailwindCss } from '../scripts/tailwind.mjs'
import { loadInstalledPlaywright } from '../scripts/launcher-installed-smoke.mjs'

const endpoint = process.env.TOCKCODER_TEST_CDP_URL
const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repository, 'node_modules', '.pnpm', '@deepseek-ai+dsh-client-ui-model-selection@0.1.2-rc.1_@deepseek-ai+cordis@4.0.1', 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection')

// Render the actual staged browser plugin with a controlled DSH directory. No
// model credential or live profile is touched; the same Host-selection face is exercised.
test('Synara-style TockCoder picker selects, filters, stars and changes effort', {
  timeout: 60_000, skip: !endpoint && 'Requires an owned extended_display CDP endpoint in TOCKCODER_TEST_CDP_URL',
}, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'tockteam-model-menu-'))
  const packageRoot = join(temp, 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection')
  mkdirSync(join(packageRoot, 'lib'), { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), readFileSync(join(source, 'package.json')))
  writeFileSync(join(packageRoot, 'lib', 'client.js'), readFileSync(join(source, 'lib', 'client.js')))
  addModelSelectionSearch(temp)
  const model = readFileSync(join(packageRoot, 'lib', 'client.js'), 'utf8')
    .replace('exports.apply = apply;', 'exports.ModelSelect = ModelSelect; exports.apply = apply;')
  const react = join(repository, 'plugins', 'sidebar', 'node_modules', 'react')
  const reactDom = join(repository, 'plugins', 'sidebar', 'node_modules', 'react-dom')
  const styles = await buildTailwindCss(repository)
  const bundle = await build({
    stdin: {
      contents: `import * as React from ${JSON.stringify(react)};
import { createRoot } from ${JSON.stringify(join(reactDom, 'client'))};
import * as jsx from ${JSON.stringify(join(react, 'jsx-runtime'))};
const groups = [
  {id:'openai',name:'OpenAI',models:[
    {id:'astra',name:'GPT-6 Astra',reasoning:{defaultEffort:'max',efforts:[{id:'low',name:'Low'},{id:'medium',name:'Medium'},{id:'high',name:'High'},{id:'max',name:'Max'}]}},
    {id:'sol',name:'GPT-6 Sol',reasoning:{defaultEffort:'max',efforts:[{id:'low',name:'Low'},{id:'medium',name:'Medium'},{id:'high',name:'High'},{id:'max',name:'Max'}]}},
    {id:'luna',name:'GPT-6 Luna'}, {id:'sol-5',name:'GPT-5.6 Sol'},
    {id:'terra',name:'GPT-5.6 Terra'}, {id:'luna-5',name:'GPT-5.6 Luna'},
    {id:'daybreak',name:'Daybreak Blue'}
  ]},
  {id:'anthropic',name:'Claude',models:[{id:'opus',name:'Claude Opus'}]}
];
let snapshot = { groups, current:{provider:'openai',model:'sol',reasoningEffort:'max'},status:'ready',failures:[],error:null };
const listeners = new Set();
const directory = {subscribe(fn){listeners.add(fn);return () => listeners.delete(fn)},getSnapshot(){return snapshot}};
const selections = [];
function update(next){snapshot={...snapshot,...next};for(const fn of listeners)fn()}
const dictionaries = {en:{'trigger.selectAria':'Select Model','trigger.aria':'Select model, current {model}','trigger.ariaEffort':'Select model, current {model}, reasoning effort {effort}','trigger.fallback':'Select Model','menu.aria':'Model and Reasoning Effort','menu.sources':'Model Sources','menu.starred':'Starred','menu.addProviders':'Add Providers','menu.search':'Search Models','menu.searchPlaceholder':'Search models…','menu.effort':'Effort','action.star':'Star {model}','action.unstar':'Remove {model} from Starred','action.resetEffort':'Reset Effort','empty.models':'No models available.','empty.search':'No matching models.','empty.favorites':'Star a model to pin it here.','effort.providerDefault':'Default','status.loading':'Refreshing model list…'}};
const t=(key,params={})=>(dictionaries.en[key]??key).replace(/\\{(.*?)\\}/g,(_,name)=>params[name]??'');
const icon=(d)=>jsx.jsx('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:jsx.jsx('path',{d})});
window.__ModuleLoader__={load({factory}){
  const exports=factory(name=>{
    if(name==='react')return React;
    if(name==='react/jsx-runtime')return jsx;
    if(name==='@deepseek-ai/cordis')return {Service:class{}};
    if(name==='@deepseek-ai/dsh-client-store')return {};
    if(name==='@deepseek-ai/dsh-client-ui-primitives')return {
      IconChevronDownOutline14:()=>icon('m6 9 6 6 6-6'),
      IconSearchOutline16:()=>icon('m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'),
      IconPlusOutline16:()=>icon('M12 5v14M5 12h14'),
      IconRefreshOutline14:()=>icon('M20 11a8 8 0 0 0-14.93-4M4 4v4h4M4 13a8 8 0 0 0 14.93 4M20 20v-4h-4'),
      IconWarningOutline16:()=>null, Toast:()=>null
    };
    throw Error('Unexpected dependency: '+name);
  });
  createRoot(document.getElementById('root')).render(jsx.jsx(exports.ModelSelect,{
    locked:false,available:true,directory,
    load:()=>{},select:selection=>window.proof.select(selection),t
  }));
}};
window.proof={directory,select:selection=>{selections.push(selection);update({current:selection});return Promise.resolve(true)},selections,groups};
`, resolveDir: repository, sourcefile: 'model-picker-fixture.jsx', loader: 'jsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
  })
  const server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(bundle.outputFiles[0].text)
    } else if (request.url === '/model.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(model)
    } else if (request.url === '/styles.css') {
      response.setHeader('content-type', 'text/css')
      response.end(styles)
    } else {
      response.setHeader('content-type', 'text/html')
      response.end(`<!doctype html><html style="color-scheme:light"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><style>
:root{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;--dsw-specific-menu:#fff;--dsw-alias-label-primary:#171717;--dsw-alias-label-secondary:#505050;--dsw-alias-label-tertiary:#aaa;--dsw-alias-label-caption:#999;--dsw-alias-border-l1:#e7e7e7;--dsw-alias-border-l3:#7e9df5;--dsw-alias-interactive-bg-hover:#f1f1f1;--dsw-elevation-prominent:0 8px 25px #0002;--dsw-alias-brand-primary:#2966cc}body{margin:0;background:#fff}#root{position:absolute;left:51%;bottom:130px;width:240px}#root button{font-family:inherit}#title{position:absolute;left:42%;top:40%;font-size:26px;font-weight:500}
</style></head><body><span id="title">TockCoder</span><nav class="tockteam-app-rail" hidden><button aria-label="Settings" onclick="window.proof.settingsOpened=true"></button></nav><div id="root"></div><script src="/fixture.js"></script><script src="/model.js"></script></body></html>`)
    }
  })
  let browser
  let page
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await (await loadInstalledPlaywright()).connectOverCDP(endpoint)
    page = browser.contexts()[0]?.pages()[0]
    assert.ok(page, 'the guarded Electron window must already exist')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    await page.emulateMedia({ colorScheme: 'light' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`http://127.0.0.1:${server.address().port}/tockcoder`)
    await page.getByRole('button', { name: /Select model, current/i }).click()
    await page.getByRole('dialog', { name: 'Model and Reasoning Effort' }).waitFor()
    assert.equal(await page.getByRole('tab', { name: 'OpenAI' }).getAttribute('aria-selected'), 'true')
    await page.getByRole('tab', { name: 'OpenAI' }).focus()
    await page.getByRole('tab', { name: 'OpenAI' }).press('ArrowRight')
    assert.equal(await page.getByRole('tab', { name: 'Claude' }).getAttribute('tabindex'), '0')
    await page.getByRole('tab', { name: 'Claude' }).press('ArrowLeft')
    assert.equal(await page.getByRole('tab', { name: 'OpenAI' }).getAttribute('tabindex'), '0')
    assert.equal(await page.getByRole('tab', { name: 'OpenAI' }).locator('svg path').count(), 1, 'the reference provider glyph is rendered')
    await page.getByRole('tab', { name: 'Claude' }).click()
    assert.equal(await page.getByRole('tab', { name: 'Claude' }).locator('svg path').count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Claude Opus', exact: true }).count(), 1)
    await page.getByRole('tab', { name: 'OpenAI' }).click()
    await page.getByRole('button', { name: 'Star GPT-6 Astra' }).click()
    await page.getByRole('tab', { name: 'Starred' }).click()
    assert.equal(await page.getByRole('button', { name: 'GPT-6 Astra', exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Remove GPT-6 Astra from Starred' }).click()
    await page.getByRole('tab', { name: 'OpenAI' }).click()
    await page.getByRole('searchbox', { name: 'Search Models' }).fill('terra')
    assert.equal(await page.getByRole('button', { name: 'GPT-5.6 Terra', exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'GPT-6 Astra', exact: true }).count(), 0)
    await page.getByRole('searchbox', { name: 'Search Models' }).fill('')
    await page.getByRole('slider', { name: 'Effort' }).fill('2')
    assert.equal(await page.evaluate(() => window.proof.selections.at(-1).reasoningEffort), 'high')
    assert.equal(await page.getByRole('slider', { name: 'Effort' }).getAttribute('aria-valuetext'), 'High')
    await page.getByRole('button', { name: 'Reset Effort' }).click()
    assert.equal(await page.evaluate(() => window.proof.selections.at(-1).reasoningEffort), 'max')
    await page.getByRole('searchbox', { name: 'Search Models' }).press('Meta+3')
    assert.deepEqual(await page.evaluate(() => window.proof.selections.at(-1)), { provider: 'openai', model: 'luna' })
    assert.equal(await page.getByRole('dialog').count(), 0, 'a model without an effort ladder closes the picker')
    await page.getByRole('button', { name: /Select model, current GPT-6 Luna/i }).click()
    await page.getByRole('tab', { name: 'OpenAI' }).click()
    await page.getByRole('button', { name: 'GPT-6 Sol', exact: true }).click()
    await page.getByRole('slider', { name: 'Effort' }).waitFor()
    await page.getByRole('searchbox', { name: 'Search Models' }).press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.match(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), /Select model, current GPT-6 Sol/i)
    await page.getByRole('button', { name: /Select model, current GPT-6 Sol/i }).click()
    assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, route: location.pathname, theme: document.documentElement.style.colorScheme, skin: document.documentElement.dataset.tockteamSkin ?? null })), { width: 1512, height: 949, scale: 2, route: '/tockcoder', theme: 'light', skin: null })
    await page.mouse.move(100, 100)
    const screenshot = await page.screenshot()
    assert.deepEqual([screenshot.readUInt32BE(16), screenshot.readUInt32BE(20)], [3024, 1898])
    assert.deepEqual(errors, [])
    console.log('Verified controlled /tockcoder model seat: light mode, visible picker, 1512×949 CSS at 2×, 3024×1898 PNG, no runtime errors')
    if (process.env.TOCKCODER_SCREENSHOT_PATH) writeFileSync(process.env.TOCKCODER_SCREENSHOT_PATH, screenshot)
    await page.getByRole('button', { name: 'Add Providers' }).click()
    assert.equal(await page.evaluate(() => window.proof.settingsOpened), true, 'the add action uses TockTeam’s Settings trigger')
  } finally {
    await page?.goto('about:blank').catch(() => {})
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    rmSync(temp, { recursive: true, force: true })
  }
})
