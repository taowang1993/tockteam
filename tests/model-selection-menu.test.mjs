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
  {id:'anthropic',name:'Claude',models:[{id:'opus',name:'Claude Opus'}]},
  {id:'deepseek',name:'DeepSeek',models:[{id:'chat',name:'DeepSeek Chat'}]},
  {id:'openrouter',name:'OpenRouter',models:[
    {id:'aion',name:'AionLabs: Aion-2.0'}, {id:'nova-micro',name:'Amazon: Nova Micro 1.0'},
    ...Array.from({length:18},(_,index)=>({id:'other-'+index,name:'Other Model '+index}))
  ]}
];
let snapshot = { groups, current:{provider:'openai',model:'sol',reasoningEffort:'max'},status:'ready',failures:[],error:null };
const listeners = new Set();
const directory = {subscribe(fn){listeners.add(fn);return () => listeners.delete(fn)},getSnapshot(){return snapshot}};
const selections = [];
function update(next){snapshot={...snapshot,...next};for(const fn of listeners)fn()}
const dictionaries = {en:{'trigger.selectAria':'Select Model','trigger.aria':'Select model, current {model}','trigger.ariaEffort':'Select model, current {model}, reasoning effort {effort}','trigger.fallback':'Select Model','trigger.open':'Model & Effort','menu.aria':'Model and Reasoning Effort','menu.sources':'Model Sources','menu.starred':'Starred','menu.addProviders':'Add Providers','menu.modelsNav':'Models','menu.search':'Search Models','menu.searchPlaceholder':'Search models…','menu.effort':'Reasoning Level','effort.unavailable':'Not Available','action.star':'Star {model}','action.unstar':'Remove {model} from Starred','action.resetEffort':'Reset Effort','empty.models':'No models available.','empty.search':'No matching models.','empty.favorites':'Star a model to pin it here.','effort.providerDefault':'Default','status.loading':'Refreshing model list…'}};
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
window.proof={directory,select:selection=>{
  selections.push(selection);
  if(window.proof.holdEffort && selection.reasoningEffort){
    update({status:'selecting'});
    return new Promise(resolve=>{window.proof.finish=()=>{update({current:selection,status:'ready'});resolve(true)}});
  }
  update({current:selection});return Promise.resolve(true)
},selections,groups,addProviders:()=>update({groups:[...snapshot.groups,...['One','Two','Three','Four','Five'].map((name,index)=>({id:'additional-'+index,name:'Provider '+name,models:[{id:'model',name:'Model '+name}]}))]}),openSettings:()=>{
  setTimeout(()=>{
    const panel=document.createElement('div');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Settings');
    panel.innerHTML='<nav><button type="button" aria-current="true">General</button><button type="button">Models</button></nav><h2>General</h2>';
    panel.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>{
      panel.querySelector('h2').textContent=button.textContent;
      panel.querySelectorAll('nav button').forEach(row=>row.removeAttribute('aria-current'));
      button.setAttribute('aria-current','true');
    }));
    document.getElementById('settings-root').append(panel);
  },20);
}};
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
:root{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;--dsw-specific-menu:#fff;--dsw-alias-label-primary:#171717;--dsw-alias-label-secondary:#505050;--dsw-alias-label-tertiary:#aaa;--dsw-alias-label-dimmed:#999;--dsw-alias-label-caption:#999;--dsw-alias-border-l1:#e7e7e7;--dsw-alias-border-l3:#7e9df5;--dsw-alias-interactive-bg-hover:#f1f1f1;--dsw-elevation-prominent:0 8px 25px #0002;--dsw-alias-brand-primary:#2966cc}body{margin:0;background:#fff}#root{position:absolute;left:51%;bottom:130px;width:240px}#root button{font-family:inherit}#title{position:absolute;left:42%;top:40%;font-size:26px;font-weight:500}
</style></head><body><span id="title">TockCoder</span><nav class="tockteam-app-rail" hidden><button aria-label="Settings" onclick="window.proof.openSettings()"></button></nav><div id="settings-root"></div><div id="root"></div><script src="/fixture.js"></script><script src="/model.js"></script></body></html>`)
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
    assert.equal((await page.getByRole('button', { name: /Select model, current/i }).innerText()).trim(), 'Model & Effort', 'the open trigger labels the combined menu')
    assert.ok((await page.getByRole('searchbox', { name: 'Search Models' }).boundingBox()).height >= 40, 'search has a comfortable input height')
    await page.getByRole('searchbox', { name: 'Search Models' }).focus()
    const separators = await page.evaluate(() => {
      const top = getComputedStyle(document.querySelector('._7KE1Ra_tabs'))
      const bottom = getComputedStyle(document.querySelector('._7KE1Ra_searchRow'))
      return { top: [top.borderBottomWidth, top.borderBottomColor], bottom: [bottom.borderBottomWidth, bottom.borderBottomColor], extra: bottom.boxShadow }
    })
    assert.deepEqual(separators.bottom, separators.top, 'both separators use the same width and color')
    assert.equal(separators.extra, 'none', 'focused search must not double the bottom separator')
    assert.equal(await page.getByRole('searchbox', { name: 'Search Models' }).evaluate(element => getComputedStyle(element).outlineStyle), 'solid', 'search keeps a keyboard focus indicator')
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
    await page.getByRole('slider', { name: 'Reasoning Level' }).focus()
    await page.getByRole('slider', { name: 'Reasoning Level' }).press('ArrowLeft')
    assert.equal(await page.evaluate(() => window.proof.selections.at(-1).reasoningEffort), 'high')
    assert.equal(await page.getByRole('slider', { name: 'Reasoning Level' }).getAttribute('aria-valuetext'), 'High')
    await page.getByRole('button', { name: 'Reset Effort' }).click()
    assert.equal(await page.evaluate(() => window.proof.selections.at(-1).reasoningEffort), 'max')
    await page.evaluate(() => { window.proof.holdEffort = true })
    const effort = page.getByRole('slider', { name: 'Reasoning Level' })
    const modelOption = page.getByRole('button', { name: 'GPT-6 Sol', exact: true })
    const modelColor = await modelOption.evaluate(element => getComputedStyle(element).color)
    await effort.focus()
    await effort.press('ArrowLeft')
    assert.equal(await page.getByRole('dialog').count(), 1, 'saving a reasoning level must not close or flash the picker')
    assert.equal(await modelOption.evaluate(element => element.disabled), false, 'saving effort must not dim the model list')
    assert.equal(await modelOption.evaluate(element => getComputedStyle(element).color), modelColor)
    assert.equal(await modelOption.getAttribute('aria-disabled'), 'true', 'model selection still waits for the Host')
    const pendingSelections = await page.evaluate(() => window.proof.selections.length)
    await modelOption.dispatchEvent('click')
    assert.equal(await page.evaluate(() => window.proof.selections.length), pendingSelections, 'a model cannot change during an effort save')
    assert.equal(await effort.evaluate(element => element.disabled), false, 'the focused thumb must not be natively disabled mid-save')
    assert.equal(await effort.inputValue(), '2', 'the thumb must show the chosen level while DSH saves it')
    assert.equal(await effort.evaluate(element => document.activeElement === element), true)
    await page.evaluate(() => {
      window.proof.menu = document.querySelector('[role="dialog"]')
      window.proof.finish()
    })
    await page.waitForTimeout(200)
    assert.equal(await page.getByRole('dialog').count(), 1, 'the menu must remain open after the Host settles')
    assert.equal(await page.evaluate(() => window.proof.menu.isConnected), true, 'saving effort must not remount the menu')
    assert.equal(await modelOption.evaluate(element => getComputedStyle(element).color), modelColor, 'the model list must not flash when saving finishes')
    assert.equal(await effort.getAttribute('aria-valuetext'), 'High')
    await page.evaluate(() => { window.proof.holdEffort = false })
    const beforeDrag = await page.evaluate(() => window.proof.selections.length)
    const box = await effort.boundingBox()
    await page.mouse.move(box.x + box.width * .67, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .38, box.y + box.height / 2, { steps: 4 })
    await page.mouse.move(box.x + box.width * .06, box.y + box.height / 2, { steps: 4 })
    assert.equal(await page.evaluate(() => window.proof.selections.length), beforeDrag, 'dragging previews without a Host call per tick')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.proof.selections.length), beforeDrag + 1, 'releasing the thumb commits once')
    assert.equal(await page.evaluate(() => window.proof.selections.at(-1).reasoningEffort), 'low')
    await page.getByRole('searchbox', { name: 'Search Models' }).press('Meta+3')
    assert.deepEqual(await page.evaluate(() => window.proof.selections.at(-1)), { provider: 'openai', model: 'luna' })
    assert.equal(await page.getByRole('dialog').count(), 0, 'a model without an effort ladder closes the picker')
    await page.getByRole('button', { name: /Select model, current GPT-6 Luna/i }).click()
    await page.getByRole('tab', { name: 'OpenAI' }).click()
    await page.getByRole('button', { name: 'GPT-6 Sol', exact: true }).click()
    await page.getByRole('slider', { name: 'Reasoning Level' }).waitFor()
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
    if (process.env.TOCKCODER_SUPPORTED_SCREENSHOT_PATH) writeFileSync(process.env.TOCKCODER_SUPPORTED_SCREENSHOT_PATH, screenshot)
    await page.getByRole('slider', { name: 'Reasoning Level' }).focus()
    await page.getByRole('slider', { name: 'Reasoning Level' }).press('ArrowLeft')
    const track = await page.locator('._7KE1Ra_sliderWrap').evaluate(element => getComputedStyle(element).backgroundImage)
    assert.match(track, /rgb\(139, 92, 246\)/u, 'the enabled rail keeps its purple fill away from the last stop')
    await page.evaluate(() => {
      const root = document.documentElement
      root.style.colorScheme = 'dark'
      for (const [name, value] of Object.entries({
        '--dsw-specific-menu': '#323234', '--dsw-alias-label-primary': '#ffffff',
        '--dsw-alias-label-tertiary': '#aaa', '--dsw-alias-border-l1': '#454545',
        '--dsw-alias-interactive-bg-hover': '#444', '--dsw-alias-brand-primary': '#fff',
      })) root.style.setProperty(name, value)
      document.body.style.background = '#151517'
    })
    assert.match(await page.locator('._7KE1Ra_sliderWrap').evaluate(element => getComputedStyle(element).backgroundImage), /rgb\(139, 92, 246\)/u, 'dark DSH brand white must not replace purple')
    if (process.env.TOCKCODER_DARK_SCREENSHOT_PATH) {
      const dark = await page.screenshot()
      assert.deepEqual([dark.readUInt32BE(16), dark.readUInt32BE(20)], [3024, 1898])
      writeFileSync(process.env.TOCKCODER_DARK_SCREENSHOT_PATH, dark)
    }
    await page.getByRole('tab', { name: 'OpenRouter' }).click()
    assert.equal(await page.getByRole('tab', { name: 'DeepSeek' }).innerText(), 'DeepSeek', 'provider names must not collapse to initials')
    assert.equal(await page.getByRole('tab', { name: 'OpenRouter' }).innerText(), 'OpenRouter')
    await page.getByRole('button', { name: 'Amazon: Nova Micro 1.0', exact: true }).click()
    await page.getByRole('button', { name: /Select model, current Amazon: Nova Micro 1.0/i }).click()
    const slider = page.getByRole('slider', { name: 'Reasoning Level' })
    assert.equal(await slider.isDisabled(), true, 'unsupported models cannot change DSH reasoning')
    assert.equal(await page.getByText('Not Available', { exact: true }).count(), 1)
    await page.getByRole('searchbox', { name: 'Search Models' }).focus()
    const unsupportedSelections = await page.evaluate(() => window.proof.selections.length)
    const disabledBox = await slider.boundingBox()
    await page.mouse.click(disabledBox.x + disabledBox.width / 2, disabledBox.y + disabledBox.height / 2)
    assert.equal(await page.getByRole('dialog', { name: 'Model and Reasoning Effort' }).count(), 1, 'clicking an unavailable reasoning level must leave the menu open')
    assert.equal(await page.getByRole('searchbox', { name: 'Search Models' }).evaluate(element => document.activeElement === element), true, 'the disabled slider must not steal focus')
    await page.mouse.move(disabledBox.x + disabledBox.width / 4, disabledBox.y + disabledBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(disabledBox.x + disabledBox.width * 3 / 4, disabledBox.y + disabledBox.height / 2, { steps: 4 })
    await page.mouse.up()
    assert.equal(await page.getByRole('dialog', { name: 'Model and Reasoning Effort' }).count(), 1, 'dragging an unavailable reasoning level must leave the menu open')
    assert.equal(await page.evaluate(() => window.proof.selections.length), unsupportedSelections, 'unavailable reasoning must not send a Host selection')
    await page.mouse.click(100, 100)
    assert.equal(await page.getByRole('dialog', { name: 'Model and Reasoning Effort' }).count(), 0, 'a real outside click still dismisses the menu')
    await page.getByRole('button', { name: /Select model, current Amazon: Nova Micro 1\.0/i }).click()
    const geometry = await page.evaluate(() => {
      const menu = document.querySelector('.tockteam-model-picker').getBoundingClientRect()
      const footer = document.querySelector('._7KE1Ra_footer').getBoundingClientRect()
      return { width: menu.width, contained: footer.top >= menu.top && footer.bottom <= menu.bottom, viewport: menu.left >= 0 && menu.right <= innerWidth }
    })
    assert.ok(geometry.width >= 340, 'the menu should be wider than the original 268px')
    assert.equal(geometry.contained, true, 'the reasoning control must stay visible below long model lists')
    assert.equal(geometry.viewport, true)
    if (process.env.TOCKCODER_SCREENSHOT_PATH) writeFileSync(process.env.TOCKCODER_SCREENSHOT_PATH, await page.screenshot())
    await page.evaluate(() => window.proof.addProviders())
    const providerLayout = await page.evaluate(() => {
      const tabs = document.querySelector('._7KE1Ra_tabs')
      const rail = tabs.querySelector('._7KE1Ra_tabButtons')
      const add = tabs.querySelector('button[aria-label="Add Providers"]').getBoundingClientRect()
      const bounds = tabs.getBoundingClientRect()
      return { count: rail.querySelectorAll('[role="tab"]').length - 1, scrollable: rail.scrollWidth > rail.clientWidth, addVisible: add.left >= bounds.left && add.right <= bounds.right, outerScroll: tabs.scrollWidth > tabs.clientWidth }
    })
    assert.equal(providerLayout.count, 9, 'five additional providers appear alongside the existing four')
    assert.equal(providerLayout.scrollable, true, 'provider names scroll within their own region')
    assert.equal(providerLayout.addVisible, true, 'Add Providers stays visible without scrolling')
    assert.equal(providerLayout.outerScroll, false, 'the entire header must not scroll away')
    await page.getByRole('tab', { name: 'OpenRouter' }).focus()
    for (let index = 0; index < 5; index++) await page.locator('[role="tab"]:focus').press('ArrowRight')
    assert.equal(await page.getByRole('tab', { name: 'Provider Five' }).getAttribute('aria-selected'), 'true', 'keyboard navigation reaches hidden provider tabs')
    const lastTabVisible = await page.getByRole('tab', { name: 'Provider Five' }).evaluate(element => {
      const tab = element.getBoundingClientRect()
      const rail = element.closest('._7KE1Ra_tabButtons').getBoundingClientRect()
      return tab.left >= rail.left && tab.right <= rail.right
    })
    assert.equal(lastTabVisible, true, 'keyboard-selected provider scrolls into view')
    const underlineVisible = await page.getByRole('tab', { name: 'Provider Five' }).evaluate(element => {
      const indicator = getComputedStyle(element, '::after')
      const tab = element.getBoundingClientRect()
      const rail = element.parentElement.getBoundingClientRect()
      return indicator.content !== 'none' && parseFloat(indicator.bottom) >= 0 && tab.bottom <= rail.bottom + .5
    })
    assert.equal(underlineVisible, true, 'scrolling must not clip the selected provider underline')
    await page.getByRole('searchbox', { name: 'Search Models' }).focus()
    const extraProvidersScreenshot = process.env.TOCKCODER_EXTRA_PROVIDERS_SCREENSHOT_PATH ? await page.screenshot() : null
    if (extraProvidersScreenshot) assert.deepEqual([extraProvidersScreenshot.readUInt32BE(16), extraProvidersScreenshot.readUInt32BE(20)], [3024, 1898])
    await page.evaluate(() => { document.getElementById('root').style.cssText = 'right:12px;left:auto;width:min(240px,calc(100vw - 24px))' })
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 2, mobile: false })
    const narrow = await page.evaluate(() => {
      const menu = document.querySelector('.tockteam-model-picker').getBoundingClientRect()
      const footer = document.querySelector('._7KE1Ra_footer').getBoundingClientRect()
      return { width: menu.width, onScreen: menu.left >= 0 && menu.right <= innerWidth && menu.top >= 0 && footer.bottom <= menu.bottom }
    })
    assert.ok(narrow.width <= 296 && narrow.onScreen, 'the wider picker must still fit a narrow window')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 949, deviceScaleFactor: 2, mobile: false })
    await page.getByRole('button', { name: 'Add Providers' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('heading', { name: 'Models' }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: 'Settings' }).getByRole('heading', { name: 'General' }).count(), 0, 'the add action opens Models, not General')
    assert.deepEqual(errors, [])
    if (extraProvidersScreenshot) writeFileSync(process.env.TOCKCODER_EXTRA_PROVIDERS_SCREENSHOT_PATH, extraProvidersScreenshot)
  } finally {
    await page?.goto('about:blank').catch(() => {})
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    rmSync(temp, { recursive: true, force: true })
  }
})
