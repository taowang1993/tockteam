// Guard-free entrypoint: only Node builtins are imported before installing guards.
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import childProcess from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'
import dgram from 'node:dgram'

const sourceFiles = ['data', 'catalog', 'query', 'errors'].map(name => fileURLToPath(new URL(`../src/trusted-raycast-can-i-use-${name}.ts`, import.meta.url)))
const allowedReads = new Set([...sourceFiles, fileURLToPath(new URL('../package.json', import.meta.url))])
const counts = { forbiddenFilesystem: 0, forbiddenImports: 0, forbiddenProcesses: 0, forbiddenNetwork: 0, candidateEvaluations: 0 }
const loaded = new Set()
const loaderFds = new Set()
const deny = kind => { counts[kind]++; throw new Error(`SYNTHETIC_GUARD_${kind}`) }
const pathOf = value => value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value
function allowedPath(value) { const path = pathOf(value); return typeof path === 'string' && allowedReads.has(resolve(path)) }
// All filesystem functions are denied except exact first-party loader reads and stdout/stderr.
for (const api of [fs, fsp]) for (const name of Object.keys(api)) {
  if (typeof api[name] !== 'function') continue
  const original = api[name]
  Object.defineProperty(api,name,{configurable:true,enumerable:true,writable:true,value:function (...args) {
    if(name==='openSync' && allowedPath(args[0]) && (args[1]==='r' || args[1]===0)){const fd=Reflect.apply(original,this,args);loaderFds.add(fd);return fd}
    if(['readSync','fstatSync','closeSync'].includes(name) && loaderFds.has(args[0])){const result=Reflect.apply(original,this,args);if(name==='closeSync')loaderFds.delete(args[0]);return result}
    if (/^(?:readFile|stat|lstat|realpath|access)(?:Sync)?$/.test(name) && allowedPath(args[0])) return Reflect.apply(original, this, args)
    if (name === 'writeSync' && (args[0] === 1 || args[0] === 2)) return Reflect.apply(original, this, args)
    return deny('forbiddenFilesystem')
  }})
}
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) childProcess[name] = () => deny('forbiddenProcesses')
for (const name of ['dlopen','chdir']) process[name] = () => deny('forbiddenProcesses')
for (const [api,names] of [[http,['request','get','createServer']],[https,['request','get','createServer']],[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[dns,['lookup','resolve','resolve4','resolve6']],[dgram,['createSocket']]]) for (const name of names) api[name] = () => deny('forbiddenNetwork')
globalThis.eval = () => deny('candidateEvaluations')
globalThis.Function = function () { return deny('candidateEvaluations') }
globalThis.fetch = () => deny('forbiddenNetwork')
globalThis.WebSocket = class { constructor() { deny('forbiddenNetwork') } }
syncBuiltinESMExports()
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('file:')) return deny('forbiddenImports')
    const result = nextResolve(specifier, context)
    if (!result.url.startsWith('file:') || !sourceFiles.includes(fileURLToPath(result.url))) return deny('forbiddenImports')
    return result
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !sourceFiles.includes(fileURLToPath(url))) return deny('forbiddenImports')
    loaded.add(fileURLToPath(url))
    return nextLoad(url, context)
  },
})
after(() => {
  console.log('SYNTHETIC_ISOLATION ' + JSON.stringify({ ...counts, loaded: [...loaded].map(path => path.split('/').at(-1)).sort(), osSandbox: false }))
  assert.deepEqual(counts, { forbiddenFilesystem: 0, forbiddenImports: 0, forbiddenProcesses: 0, forbiddenNetwork: 0, candidateEvaluations: 0 })
})
const { createTrustedRaycastCanIUseData } = await import('../src/trusted-raycast-can-i-use-data.ts')

// Hand-authored synthetic acceptance identities from parent relay 0f70c67b (not a capsule read).
const identities = [
  ['ie','IE'],['edge','Edge'],['firefox','Firefox'],['chrome','Chrome'],['safari','Safari'],['opera','Opera'],['ios_saf','Safari on iOS'],['op_mini','Opera Mini'],['android','Android Browser'],['bb','Blackberry Browser'],['op_mob','Opera Mobile'],['and_chr','Chrome for Android'],['and_ff','Firefox for Android'],['ie_mob','IE Mobile'],['and_uc','UC Browser for Android'],['samsung','Samsung Internet'],['and_qq','QQ Browser'],['baidu','Baidu Browser'],['kaios','KaiOS Browser'],
]
const scope = ['and_chr','and_ff','and_qq','and_uc','android','chrome','edge','firefox','ios_saf','kaios','op_mini','op_mob','opera','safari','samsung']
const statuses = ['ls','rec','pr','cr','wd','other','unoff']
function fixture() {
  const agents = identities.map(([browser,label],sourceIndex) => {
    const versions = browser === 'chrome' ? Array.from({length:500},(_,i)=>String(i+1)) : browser === 'firefox' ? Array.from({length:130},(_,i)=>String(i+1)) : browser === 'op_mini' ? ['all'] : ['1']
    if (browser === 'android') versions.push('4.4.3-4.4.4')
    if (browser === 'safari') versions.push('TP')
    return {browser,label,sourceIndex,versions,release_date:{[versions[0]]:sourceIndex===0?null:100+sourceIndex}}
  })
  const canonicalTargets = agents.flatMap(agent=>agent.versions.map(version=>`${agent.browser} ${version}`)).sort()
  assert.equal(canonicalTargets.length,649)
  const targets = [...scope.map(browser=>`${browser} ${browser==='op_mini'?'all':'1'}`),...Array.from({length:21},(_,i)=>`chrome ${i+2}`)].sort()
  const catalog = Array.from({length:581},(_,sourceIndex)=>({slug:`feature-${sourceIndex}`,title:`Feature ${sourceIndex}`,status:statuses[sourceIndex%7],sourceIndex}))
  const flags={},stats={}
  for (const {slug} of catalog) {
    flags[slug]=Object.fromEntries(scope.map(browser=>[browser,browser==='op_mini'?{}:{y:1}]))
    stats[slug]=Object.fromEntries(agents.map(agent=>[agent.browser,Object.fromEntries(agent.versions.slice(0,22).map(version=>[version,'y']))]))
  }
  return {defaults:{epoch:1777030995000,selectors:['> 0.5%','last 2 versions','Firefox ESR','not dead'],targets},canonicalTargets,catalog,agents,support:{scope:[...scope],flags,stats}}
}
const id = (sourceIndex=0) => ({slug:`feature-${sourceIndex}`,sourceIndex})
const unavailable = fn => assert.throws(fn,error=>error.code==='DATA_UNAVAILABLE' && error.message==='DATA_UNAVAILABLE')
function frozen(value) { if(value && typeof value==='object'){assert(Object.isFrozen(value));for(const child of Object.values(value))frozen(child)} }

test('synthetic identity vectors match the exact parent-attested JSON-line pins',()=>{
  const sha=value=>createHash('sha256').update(JSON.stringify(value)+'\n').digest('hex')
  assert.equal(sha(scope),'fe2507e1882491c94b9555d7f979817c37e38d8f3e4350d2896e3c9101688f1f')
  assert.equal(sha(identities.map(([browser,label],sourceIndex)=>({browser,label,sourceIndex}))),'ff53003ab4abe4a6b1489b405e2a51636cdb1e4d2c34178b345e2262427623e7')
})

test('finite data preserves every catalog/status identity and keeps explicit defaults separate',()=>{
  const input=fixture(), data=createTrustedRaycastCanIUseData(input)
  assert.equal(data.catalog.totalCount,581)
  for(const row of input.catalog){assert.deepEqual(data.catalog.entries[row.sourceIndex],{slug:row.slug,title:row.title,sourceIndex:row.sourceIndex});assert.deepEqual(data.statusBySlug[row.slug],{slug:row.slug,sourceIndex:row.sourceIndex,status:row.status})}
  assert.deepEqual(data.defaultTargets,input.defaults.targets)
  assert.deepEqual(data.rootTargets,input.defaults.targets.filter(target=>target!=='op_mini all'))
  assert.equal(data.defaultTargets.length,36);assert.equal(data.rootTargets.length,35)
  frozen(data.catalog);frozen(data.statusBySlug);frozen(data.defaultTargets);frozen(data.rootTargets)
})

test('support uses exact raw y and hand-authored min-y/max-other aggregate vectors',()=>{
  const input=fixture()
  input.support.stats['feature-0'].chrome={'1':'n','2':'y','3':'a','4':'u','5':'y x','6':'a #1','7':'p','8':'d'}
  input.support.flags['feature-0'].chrome={y:2,a:6,x:5,u:4}
  const data=createTrustedRaycastCanIUseData(input)
  for(const [version,raw,supported] of [['1','n',false],['2','y',true],['3','a',false],['4','u',false],['5','y x',false],['6','a #1',false],['7','p',false],['8','d',false]]) {
    const result=data.support(id(),`chrome ${version}`)
    assert.deepEqual(result.targets,[{target:`chrome ${version}`,rawStatus:raw,supported}])
    assert.equal(result.allSupported,supported)
    assert.deepEqual(result.agents.find(row=>row.browser==='chrome').flags,{y:2,a:6,x:5,u:4})
    frozen(result)
  }
  assert.equal(data.support(id(),'chrome 2,firefox 1').allSupported,true)
  assert.equal(data.support(id(),'chrome 2,chrome 3').allSupported,false)
  unavailable(()=>data.support(id(),'chrome 9'))
  unavailable(()=>data.support(id(),'defaults'))
})

test('support retains fixed scope while detail omits only Opera Mini and exposes no version/date metadata',()=>{
  const data=createTrustedRaycastCanIUseData(fixture())
  const expected=identities.map(([browser,label],sourceIndex)=>({browser,label,sourceIndex})).filter(row=>scope.includes(row.browser))
  for(let i=0;i<581;i++) {
    const support=data.support(id(i),'chrome 1')
    assert.equal(support.agents.length,15)
    assert.deepEqual(support.agents.map(({flags,...row})=>row),expected)
    for(const row of support.agents) assert.deepEqual(row.flags,row.browser==='op_mini'?{y:null,a:null,x:null,u:null}:{y:1,a:null,x:null,u:null})
    const detail=data.detail(id(i))
    assert.deepEqual(Object.keys(detail).sort(),['agents','feature','status'])
    assert.deepEqual(detail.feature,id(i));assert.equal(detail.status,statuses[i%7])
    assert.equal(detail.agents.length,14)
    assert.deepEqual(detail.agents,support.agents.filter(row=>row.browser!=='op_mini'))
    for(const row of detail.agents)assert.deepEqual(Object.keys(row).sort(),['browser','flags','label','sourceIndex'])
    frozen(detail)
  }
  assert.deepEqual(data.support(id(),'firefox 1').agents,data.support(id(),'chrome 1').agents)
})

test('raw notes, nonnumeric buckets and three-component lower endpoints do not become exact-y support',()=>{
  const input=fixture()
  input.support.stats['feature-0'].android={'1':'n','4.4.3-4.4.4':'y x'}
  input.support.flags['feature-0'].android={y:4.4,x:4.4}
  input.support.stats['feature-0'].safari={'1':'y #1',TP:'y'}
  input.support.flags['feature-0'].safari={y:1}
  const data=createTrustedRaycastCanIUseData(input)
  assert.equal(data.support(id(),'android 4.4.3-4.4.4').allSupported,false)
  assert.deepEqual(data.support(id(),'android 4.4.3-4.4.4').agents.find(row=>row.browser==='android').flags,{y:4.4,a:null,x:4.4,u:null})
  assert.equal(data.support(id(),'safari 1').allSupported,false)
  assert.equal(data.support(id(),'safari TP').allSupported,true)
  assert.equal(data.support(id(),'op_mini all').allSupported,true)
})

test('adapter detaches every retained input and rejects forged feature identities',()=>{
  const input=fixture(),data=createTrustedRaycastCanIUseData(input)
  const before=data.support(id(),'chrome 1'),detail=data.detail(id())
  input.catalog[0].status='unoff';input.catalog[0].title='Changed';input.support.stats['feature-0'].chrome['1']='n';input.support.flags['feature-0'].chrome.y=999
  input.support.scope.reverse();input.agents[3].versions[0]='999';input.agents[3].release_date['1']=999;input.defaults.targets.reverse()
  assert.deepEqual(data.support(id(),'chrome 1'),before);assert.deepEqual(data.detail(id()),detail)
  assert.equal(data.statusBySlug['feature-0'].status,'ls');assert.equal(data.catalog.entries[0].title,'Feature 0')
  for(const feature of [{slug:'feature-0',sourceIndex:1},{slug:'missing',sourceIndex:0},{slug:'constructor',sourceIndex:0},{...id(),extra:true},null]) {
    unavailable(()=>data.support(feature,'chrome 1'));unavailable(()=>data.detail(feature))
  }
  assert.throws(()=>{before.agents[0].flags.y=999},TypeError)
  assert.throws(()=>{detail.agents.push({})},TypeError)
})

test('successful singleton normalization is reused across features but stays factory-local',()=>{
  const input=fixture();input.support.stats['feature-1'].chrome['1']='n';input.support.flags['feature-1'].chrome.y=2
  const first=createTrustedRaycastCanIUseData(input),second=createTrustedRaycastCanIUseData(fixture())
  const original=TextEncoder.prototype.encode;let encodes=0
  // Observe the normalizer's platform encoding work, not wall-clock time or an exposed cache API.
  TextEncoder.prototype.encode=function(...args){encodes++;return Reflect.apply(original,this,args)}
  try {
    assert.equal(first.support(id(),'chrome 1').allSupported,true)
    const warm=encodes;assert(warm>0)
    for(let i=0;i<581;i++)assert.equal(first.support(id(i),'chrome 1').allSupported,i!==1)
    assert.equal(encodes,warm)
    assert.equal(second.support(id(),'chrome 1').allSupported,true);assert(encodes>warm)
  } finally {TextEncoder.prototype.encode=original}
})

test('normalization cache holds at most 1024 strings with deterministic clear-on-capacity',()=>{
  const data=createTrustedRaycastCanIUseData(fixture())
  const original=TextEncoder.prototype.encode;let encodes=0
  TextEncoder.prototype.encode=function(...args){encodes++;return Reflect.apply(original,this,args)}
  try {
    for(let i=0;i<1024;i++)data.support(id(),'chrome 1'+' '.repeat(i))
    const full=encodes
    data.support(id(),'chrome 1');assert.equal(encodes,full)
    // A new successful raw string clears the full map, then occupies one slot.
    data.support(id(),'chrome 1'+' '.repeat(1024));assert(encodes>full)
    const cleared=encodes
    data.support(id(),'chrome 1');assert(encodes>cleared)
    const rewarmed=encodes
    data.support(id(2),'chrome 1');assert.equal(encodes,rewarmed)
  } finally {TextEncoder.prototype.encode=original}
})

test('normalization failures and nonstrings never populate or evict successful entries',()=>{
  const data=createTrustedRaycastCanIUseData(fixture())
  const original=TextEncoder.prototype.encode;let encodes=0
  TextEncoder.prototype.encode=function(...args){encodes++;return Reflect.apply(original,this,args)}
  try {
    for(let i=0;i<1024;i++)data.support(id(),'chrome 1'+' '.repeat(i))
    for(const query of ['defaults','chrome 999','chrome 1,',' '.repeat(4097)]) {
      const code=query==='defaults'?'DATA_UNAVAILABLE':query.length>4096?'LIMIT_EXCEEDED':'QUERY_UNSUPPORTED'
      for(let repeat=0;repeat<2;repeat++){const before=encodes;assert.throws(()=>data.support(id(),query),error=>error.code===code);assert(encodes>before)}
    }
    let coercions=0
    for(const query of [null,undefined,1,[],{},new String('chrome 1'),{toString(){coercions++;throw Error('secret')}}]) {
      assert.throws(()=>data.support(id(),query),error=>error.code==='QUERY_UNSUPPORTED')
    }
    assert.equal(coercions,0)
    const before=encodes;data.support(id(),'chrome 1');assert.equal(encodes,before)
    // A cached valid query still performs feature authentication on every call.
    unavailable(()=>data.support({slug:'feature-0',sourceIndex:1},'chrome 1'))
  } finally {TextEncoder.prototype.encode=original}
})

test('terminal newlines in raw statuses are invalid even when aggregate bindings are resealed',()=>{
  for(const raw of ['n\n','y\n']) {
    const input=fixture();input.support.stats['feature-0'].chrome={'1':raw};input.support.flags['feature-0'].chrome={}
    unavailable(()=>createTrustedRaycastCanIUseData(input))
  }
})

test('empty flags are distinct from missing data and prefixed/noted statuses never imply support',()=>{
  const input=fixture()
  input.support.stats['feature-0'].chrome={'1':'n','2':'p','3':'d'};input.support.flags['feature-0'].chrome={}
  input.support.stats['feature-1'].chrome={'1':'y #1','2':'y x','3':'u','4':'x','5':'u'};input.support.flags['feature-1'].chrome={y:1,x:4,u:5}
  const data=createTrustedRaycastCanIUseData(input)
  assert.deepEqual(data.support(id(),'chrome 1').agents.find(row=>row.browser==='chrome').flags,{y:null,a:null,x:null,u:null})
  assert(data.detail(id()).agents.some(row=>row.browser==='chrome'))
  assert.equal(data.support(id(1),'chrome 1,chrome 2').allSupported,false)
  assert.deepEqual(data.support(id(1),'chrome 1').agents.find(row=>row.browser==='chrome').flags,{y:1,a:null,x:4,u:5})
})

test('zero thresholds are retained rather than confused with absent flags',()=>{
  const input=fixture(),chrome=input.agents[3]
  chrome.versions[0]='0';delete chrome.release_date['1'];chrome.release_date['0']=0
  input.canonicalTargets[input.canonicalTargets.indexOf('chrome 1')]='chrome 0';input.canonicalTargets.sort()
  input.defaults.targets[input.defaults.targets.indexOf('chrome 1')]='chrome 0';input.defaults.targets.sort()
  for(const {slug} of input.catalog){delete input.support.stats[slug].chrome['1'];input.support.stats[slug].chrome['0']='y';input.support.flags[slug].chrome={y:0}}
  const data=createTrustedRaycastCanIUseData(input)
  assert.equal(data.support(id(),'chrome 0').allSupported,true)
  assert.deepEqual(data.detail(id()).agents.find(row=>row.browser==='chrome').flags,{y:0,a:null,x:null,u:null})
})

test('all synthetic canonical targets retain grammar/membership and missing raw data fails closed',()=>{
  const input=fixture(),data=createTrustedRaycastCanIUseData(input)
  for(const target of input.canonicalTargets){const [browser,version]=target.split(' ');if(Object.hasOwn(input.support.stats['feature-0'][browser],version))assert.equal(data.support(id(),target).allSupported,true);else unavailable(()=>data.support(id(),target))}
  for(const query of ['', 'chrome 999', 'chrome 01', 'android 4.4.3.4', 'chrome 1,', 'last 2 versions', 'all'])assert.throws(()=>data.support(id(),query),error=>error.code==='QUERY_UNSUPPORTED')
  assert.throws(()=>data.support(id(),Array(1)),error=>error.code==='QUERY_UNSUPPORTED')
  assert.throws(()=>data.support(id(),Array(65).fill('chrome 1').join(',')),error=>error.code==='LIMIT_EXCEEDED')
  assert.throws(()=>data.support(id(),' '.repeat(4097)),error=>error.code==='LIMIT_EXCEEDED')
  assert.deepEqual(data.support(id(),'chrome\t1\r\nfirefox 1,chrome 1').targets.map(row=>row.target),['chrome 1','firefox 1'])
  const feature={...id()};let calls=0;Object.defineProperty(feature,'slug',{get(){calls++;throw Error('secret')}})
  unavailable(()=>data.detail(feature));unavailable(()=>data.support(feature,'chrome 1'));assert.equal(calls,0)
})

for(const [name,mutate] of [
  ['wrong scope name',input=>input.support.scope[0]='ie'],
  ['wrong scope order',input=>input.support.scope.reverse()],
  ['duplicate scope',input=>input.support.scope[1]=input.support.scope[0]],
  ['missing scope',input=>input.support.scope.pop()],
  ['wrong agent index',input=>input.agents[11].sourceIndex=12],
  ['wrong agent order',input=>input.agents.reverse()],
  ['wrong agent label',input=>input.agents[11].label='Chrome'],
  ['wrong agent name',input=>input.agents[11].browser='unknown'],
  ['duplicate agent',input=>input.agents[12]={...input.agents[11],sourceIndex:12}],
  ['invalid feature enum',input=>input.catalog[0].status='draft'],
  ['wrong feature index',input=>input.catalog[0].sourceIndex=1],
  ['duplicate feature slug',input=>input.catalog[1].slug=input.catalog[0].slug],
  ['extra catalog property',input=>input.catalog[0].extra=1],
  ['missing feature status',input=>delete input.catalog[0].status],
  ['wrong defaults epoch',input=>input.defaults.epoch++],
  ['wrong selector',input=>input.defaults.selectors[0]='last 1 version'],
  ['wrong selector order',input=>input.defaults.selectors.reverse()],
  ['extra defaults property',input=>input.defaults.extra=1],
  ['missing defaults property',input=>delete input.defaults.epoch],
  ['wrong default count',input=>input.defaults.targets.pop()],
  ['unsorted defaults',input=>input.defaults.targets.reverse()],
  ['duplicate default',input=>input.defaults.targets[1]=input.defaults.targets[0]],
  ['unknown default',input=>{input.defaults.targets[0]='bogus 1';input.defaults.targets.sort()}],
  ['missing sole Opera Mini removal',input=>{input.defaults.targets[input.defaults.targets.indexOf('op_mini all')]='chrome 23';input.defaults.targets.sort()}],
  ['extra input property',input=>input.extra=1],
  ['invalid canonical bucket',input=>input.canonicalTargets[0]='android 4.4.3.4'],
  ['duplicate canonical target',input=>input.canonicalTargets[1]=input.canonicalTargets[0]],
  ['extra support property',input=>input.support.extra=1],
  ['missing feature flags',input=>delete input.support.flags['feature-0']],
  ['extra feature flags',input=>input.support.flags.unknown={}],
  ['null flag',input=>input.support.flags['feature-0'].chrome.y=null],
  ['null-prototype root',input=>Object.setPrototypeOf(input,null)],
  ['missing catalog row',input=>input.catalog.pop()],
  ['missing agent',input=>input.agents.pop()],
  ['too many versions',input=>input.agents[3].versions.push(...Array(13).fill('1'))],
  ['too many canonical targets',input=>input.canonicalTargets.push('chrome 999')],
  ['sparse defaults',input=>delete input.defaults.targets[1]],
  ['sparse versions',input=>delete input.agents[3].versions[1]],
  ['missing scope flags',input=>delete input.support.flags['feature-0'].chrome],
  ['unknown scope flag browser',input=>input.support.flags['feature-0'].unknown={}],
  ['unknown flag',input=>input.support.flags['feature-0'].chrome.n=1],
  ['nonfinite flag',input=>input.support.flags['feature-0'].chrome.y=Infinity],
  ['negative flag',input=>input.support.flags['feature-0'].chrome.y=-1],
  ['mismatched flag',input=>input.support.flags['feature-0'].chrome.y=9],
  ['missing feature stats',input=>delete input.support.stats['feature-0']],
  ['missing scoped browser stats',input=>delete input.support.stats['feature-0'].chrome],
  ['extra feature stats',input=>input.support.stats.unknown={}],
  ['too many version stats',input=>input.support.stats['feature-0'].chrome=Object.fromEntries(Array.from({length:513},(_,i)=>[String(i),'n']))],
  ['oversized raw status',input=>input.support.stats['feature-0'].chrome['1']=Array(130).fill('n').join(' ')],
  ['invalid raw note',input=>input.support.stats['feature-0'].chrome['1']='a #'],
  ['unsafe integer release date',input=>input.agents[3].release_date['1']=Number.MAX_SAFE_INTEGER+1],
  ['unknown stats browser',input=>input.support.stats['feature-0'].unknown={'1':'y'}],
  ['unknown stats version',input=>input.support.stats['feature-0'].chrome['999']='y'],
  ['unknown raw token',input=>input.support.stats['feature-0'].chrome['1']='yes'],
  ['empty raw status',input=>input.support.stats['feature-0'].chrome['1']=''],
  ['spaced raw status',input=>input.support.stats['feature-0'].chrome['1']=' y '],
  ['non-string raw status',input=>input.support.stats['feature-0'].chrome['1']=undefined],
  ['missing release_date',input=>delete input.agents[3].release_date],
  ['unknown release version',input=>input.agents[3].release_date.unknown=100],
  ['negative release date',input=>input.agents[3].release_date['1']=-1],
  ['fractional release date',input=>input.agents[3].release_date['1']=1.5],
  ['nonfinite release date',input=>input.agents[3].release_date['1']=NaN],
  ['string release date',input=>input.agents[3].release_date['1']='100'],
  ['duplicate version',input=>input.agents[3].versions[1]=input.agents[3].versions[0]],
  ['unknown agent version',input=>input.agents[3].versions[0]='999'],
  ['missing agent version',input=>input.agents[3].versions.pop()],
]) test(`rejects ${name}`,()=>{const input=fixture();mutate(input);unavailable(()=>createTrustedRaycastCanIUseData(input))})

for(const [name,locate] of [
 ['root',input=>[input,'defaults']],['defaults',input=>[input.defaults,'epoch']],['selector array',input=>[input.defaults.selectors,'0']],['target array',input=>[input.defaults.targets,'0']],['canonical array',input=>[input.canonicalTargets,'0']],['catalog array',input=>[input.catalog,'0']],['catalog row',input=>[input.catalog[0],'status']],['agents array',input=>[input.agents,'0']],['agent',input=>[input.agents[3],'versions']],['version array',input=>[input.agents[3].versions,'0']],['release dates',input=>[input.agents[3].release_date,'1']],['support',input=>[input.support,'scope']],['scope array',input=>[input.support.scope,'0']],['flags root',input=>[input.support.flags,'feature-0']],['browser flags',input=>[input.support.flags['feature-0'],'chrome']],['flag',input=>[input.support.flags['feature-0'].chrome,'y']],['stats root',input=>[input.support.stats,'feature-0']],['browser stats',input=>[input.support.stats['feature-0'],'chrome']],['raw status',input=>[input.support.stats['feature-0'].chrome,'1']],
]) test(`rejects accessor/prototype/extra key at ${name} without invoking accessors`,()=>{
  for(const attack of ['getter','setter','prototype','extra','symbol','hidden']) {
    const input=fixture(),[object,key]=locate(input);let calls=0
    if(attack==='getter')Object.defineProperty(object,key,{get(){calls++;throw Error('secret')},enumerable:true})
    if(attack==='setter')Object.defineProperty(object,key,{set(){calls++},enumerable:true})
    if(attack==='prototype')Object.setPrototypeOf(object,{})
    if(attack==='extra')object.unexpected=true
    if(attack==='symbol')object[Symbol('extra')]=1
    if(attack==='hidden')Object.defineProperty(object,key,{value:object[key],enumerable:false})
    unavailable(()=>createTrustedRaycastCanIUseData(input));assert.equal(calls,0)
  }
})
