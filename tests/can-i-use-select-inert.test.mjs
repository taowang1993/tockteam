import test, {after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'

// Block real artifacts before importing the inert module, including accidental future I/O.
const forbidden=new Set(['/private/tmp/tockteam-can-i-use-fixture-gate-r1.noindex','/private/tmp/tockteam-can-i-use-fixture-gate-r2.noindex','/private/tmp/tockteam-can-i-use-inert-capsule-r1.noindex'])
const attempts=[], originals=new Map()
for(const key of ['openSync','readFileSync','writeFileSync','lstatSync','statSync','unlinkSync','renameSync','rmSync']){
  const original=fs[key];originals.set(key,original)
  fs[key]=(...args)=>{
    for(const value of args){const path=value instanceof URL?fileURLToPath(value):typeof value==='string'?value:undefined;if(path&&forbidden.has(path.replace(/^\/tmp\//,'/private/tmp/'))){attempts.push({key,path});throw Error('REAL_ARTIFACT_IO_FORBIDDEN')}}
    return original(...args)
  }
}
after(()=>{for(const [key,original] of originals)fs[key]=original;assert.deepEqual(attempts,[])})
const selector=await import('../scripts/can-i-use-select-inert.mjs')

function fixture() {
  const agents=Array.from({length:19},(_,sourceIndex)=>({browser:'b'+sourceIndex,label:'Browser '+sourceIndex,sourceIndex,versions:Array.from({length:sourceIndex===0?37:34},(_,i)=>String(i+1)),release_date:{'1':0}}))
  const targets=agents.flatMap(agent=>agent.versions.map(version=>agent.browser+' '+version)).sort()
  const scope=agents.slice(0,15).map(agent=>agent.browser)
  const defaults=[...scope.map(browser=>browser+' 1'),...Array.from({length:21},(_,i)=>'b0 '+(i+2))].sort()
  const catalog=Array.from({length:581},(_,sourceIndex)=>({slug:'f'+sourceIndex,title:'Feature '+sourceIndex,status:'ls',sourceIndex}))
  const flags=Object.fromEntries(catalog.map(row=>[row.slug,Object.fromEntries(scope.map(browser=>[browser,{y:1}]))]))
  const stats=Object.fromEntries(catalog.map(row=>[row.slug,Object.fromEntries(agents.map(agent=>[agent.browser,{'1':'y'}]))]))
  const files=new Map([
    ['defaults.json',selector.canonicalJson({epoch:1777030995000,selectors:['> 0.5%','last 2 versions','Firefox ESR','not dead'],targets:defaults})],
    ['canonical-targets.json',selector.canonicalJson(targets)],['catalog.json',selector.canonicalJson(catalog)],
    ['agents.json',selector.canonicalJson(agents)],['support.json',selector.canonicalJson({scope,flags,stats})],
  ])
  for(const path of selector.ASSET_PATHS)if(path!=='CAN_I_USE_ATTRIBUTION.md'&&!files.has(path))files.set(path,Buffer.from('Synthetic legal text: '+path+'\n'))
  const notice=Buffer.from('Synthetic approved notice\n'), generatorSha256=selector.sha(Buffer.from('synthetic generator'))
  const moduleFiles=new Map(Array.from({length:599},(_,i)=>[i===0?'browserslist/index.js':i===1?'node-releases/envs.json':'pkg/m'+i+'.js',Buffer.from(i===1?'[]':'Inert synthetic bytes '+i)]))
  const moduleManifest=[...moduleFiles].map(([id,bytes])=>({id,bytes:bytes.length,sha256:selector.sha(bytes),kind:id.endsWith('.json')?'json-data':'executed-if-loaded-js'})).sort((a,b)=>a.id<b.id?-1:1)
  const treeFiles=new Map([...moduleFiles].map(([id,bytes])=>['extracted/'+id,bytes]))
  for(const [path,bytes] of files)treeFiles.set('output/'+path,bytes)
  const ids=moduleManifest.map(row=>row.id)
  const graph=Object.fromEntries(ids.map((id,index)=>[id,id.endsWith('.json')?{}:{'./next':ids[(index+1)%ids.length]}]))
  graph['browserslist/index.js'].path='@denied-path'
  const requests=Object.entries(graph).flatMap(([id,edges])=>Object.entries(edges).map(([spec,target])=>[id,spec,target]))
  requests.push([...requests[0]])
  treeFiles.set('output/module-trace.json',selector.canonicalJson({loads:ids,requests,denials:[],configCalls:0}))
  treeFiles.set('output/adaptation-source/caniuse-api-utils.js.txt',Buffer.from('Inert synthetic adaptation evidence'))
  const outputs=[...treeFiles].filter(([path])=>path.startsWith('output/')).map(([path,bytes])=>({path:path.slice(7),bytes:bytes.length,sha256:selector.sha(bytes)}))
  treeFiles.set('output/provenance.json',selector.canonicalJson({schemaVersion:1,node:'v24.20.0',generatorSha256,epoch:1777030995000,sourceCommit:'186d955eda64f9e956b25a3fdf5566b1d38f57f2',sourceArtifactSha256:'cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c',archives:selector.PROVENANCE_ARCHIVES,moduleManifest,graph,outputs,adaptation:'caniuse-api UI support flags only; no candidate command execution',runtimeAdmitted:false}))
  const tree=selector.logicalTree(treeFiles)
  const envelope=selector.canonicalJson(selector.evidenceEnvelope(generatorSha256,{first:tree,second:structuredClone(tree)}))
  const fixtureSha256=selector.sha(envelope)
  const supplement=selector.canonicalJson({schemaVersion:1,evidenceOnly:true,runtimeAdmitted:false,packageAdmissionAuthorized:false,fixtureRuntimeAdmitted:false,fixture:{sha256:fixtureSha256},approvedNotice:{sha256:selector.sha(notice)}})
  const pins={fixtureSha256,fixtureBytes:envelope.length,generatorSha256,moduleManifestSha256:selector.sha(selector.canonicalJson(moduleManifest)),supplementSha256:selector.sha(supplement),supplementBytes:supplement.length,noticeSha256:selector.sha(notice),noticeBytes:notice.length,assets:selector.ASSET_PATHS.map(path=>{const bytes=path==='CAN_I_USE_ATTRIBUTION.md'?notice:files.get(path);return{path,bytes:bytes.length,sha256:selector.sha(bytes)}})}
  return {envelope,notice,supplement,pins}
}

function reseal(input, change, refreshOutputs=true) {
  const value=JSON.parse(input.envelope), files=new Map(value.trees.first.map(row=>[row.path,Buffer.from(row.base64,'base64')]))
  change(files)
  if(refreshOutputs){
    const provenance=JSON.parse(files.get('output/provenance.json'))
    provenance.outputs=[...files].filter(([path])=>path.startsWith('output/')&&path!=='output/provenance.json').map(([path,bytes])=>({path:path.slice(7),bytes:bytes.length,sha256:selector.sha(bytes)}))
    files.set('output/provenance.json',selector.canonicalJson(provenance))
  }
  const tree=selector.logicalTree(files), envelope=selector.canonicalJson(selector.evidenceEnvelope(input.pins.generatorSha256,{first:tree,second:structuredClone(tree)}))
  const fixtureSha256=selector.sha(envelope), supplementValue=JSON.parse(input.supplement)
  supplementValue.fixture.sha256=fixtureSha256
  const supplement=selector.canonicalJson(supplementValue)
  const assets=input.pins.assets.map(row=>{const bytes=row.path==='CAN_I_USE_ATTRIBUTION.md'?input.notice:files.get('output/'+row.path);return bytes?{...row,bytes:bytes.length,sha256:selector.sha(bytes)}:row})
  return {...input,envelope,supplement,pins:{...input.pins,fixtureSha256,fixtureBytes:envelope.length,supplementSha256:selector.sha(supplement),supplementBytes:supplement.length,assets}}
}

function temp(run) {
  const path='/private/tmp/tockteam-can-i-use-selector-test-'+randomUUID()
  let held
  try{return run(path,(...args)=>held=selector.openEvidenceFile(path,...args))}
  finally{held?.close();for(const suffix of ['','.moved','.outside','.hard'])fs.rmSync(path+suffix,{force:true,recursive:true});for(const suffix of ['','.moved','.outside','.hard'])assert.throws(()=>fs.lstatSync(path+suffix),{code:'ENOENT'})}
}
function patched(key,transform,run){const original=fs[key];fs[key]=transform(original);try{return run()}finally{fs[key]=original}}

test('synthetic envelope selects exactly fourteen inert entries and binds the independent notice',()=>{
  const input=fixture(), bytes=selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins)
  const capsule=JSON.parse(bytes)
  assert.equal(capsule.runtimeAdmitted,false)
  assert.equal(capsule.entries.length,14)
  assert.deepEqual(capsule.entries.map(row=>row.path),[...selector.ASSET_PATHS].sort())
  assert(!capsule.entries.some(row=>row.path.startsWith('extracted/')||/\.(?:js|mjs|cjs)$/.test(row.path)))
  assert.equal(selector.verifyInertCapsuleBytes(bytes,input.pins),selector.sha(bytes))
  assert(bytes.equals(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins)))
  assert.equal(Buffer.from(capsule.entries.find(row=>row.path==='CAN_I_USE_ATTRIBUTION.md').base64,'base64').toString(),input.notice.toString())
})

test('fixed production pins never accept synthetic fixtures; source, supplement and notice digests fail closed',()=>{
  const input=fixture()
  assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice),/SOURCE_/)
  for(const key of ['envelope','supplement','notice']){
    const changed={...input,[key]:Buffer.concat([input[key],Buffer.from('!')])}
    assert.throws(()=>selector.selectInertAssets(changed.envelope,changed.supplement,changed.notice,input.pins),/SOURCE_|SUPPLEMENT_|NOTICE_/)
  }
  assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,{...input.pins,moduleManifestSha256:'0'.repeat(64)}),/MODULE_MANIFEST/)
})

test('selected capsule rejects extra keys, admission flags, changed bytes, executable/duplicate paths and invalid encodings',()=>{
  const input=fixture(), good=selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins)
  for(const mutate of [
    value=>value.extra=true,value=>value.runtimeAdmitted=true,value=>value.source.fixtureSha256='0'.repeat(64),
    value=>value.entries.pop(),value=>value.entries.push(value.entries[0]),value=>value.entries[0].path='escape.js',
    value=>value.entries[0].path='../escape',value=>value.entries[0].base64+='!',value=>value.entries[0].sha256='0'.repeat(64),
    value=>value.entries[0].bytes++,value=>value.entries[0].extra=true,
  ]){const bad=JSON.parse(good);mutate(bad);assert.throws(()=>selector.verifyInertCapsuleBytes(selector.canonicalJson(bad),input.pins))}
  assert.throws(()=>selector.verifyInertCapsuleBytes(Buffer.concat([good,Buffer.from(' ')]),input.pins),/CANONICAL/)
})

test('closed source schema rejects tree mismatches and missing/extra source paths even when a synthetic digest is resealed',()=>{
  for(const change of [
    value=>value.trees.second.pop(),value=>value.extra=true,value=>value.runtimeAdmitted=true,
    value=>{value.trees.first.push(value.trees.first[0]);value.trees.second=structuredClone(value.trees.first)},
    value=>{value.trees.first[0].path='output/extra.json';value.trees.second=structuredClone(value.trees.first)},
  ]){
    const input=fixture(), value=JSON.parse(input.envelope);change(value)
    const bytes=selector.canonicalJson(value),pins={...input.pins,fixtureSha256:selector.sha(bytes),fixtureBytes:bytes.length}
    assert.throws(()=>selector.selectInertAssets(bytes,input.supplement,input.notice,pins))
  }
})

test('resealed synthetic sources still reject unlisted paths, invalid datasets, traces and supplement binding',()=>{
  for(const mutate of [
    files=>{files.delete('output/module-trace.json');files.set('output/unlisted.json',Buffer.from('{}'))},
    files=>{const value=JSON.parse(files.get('output/module-trace.json'));value.configCalls=1;files.set('output/module-trace.json',selector.canonicalJson(value))},
    files=>{const value=JSON.parse(files.get('output/defaults.json'));value.epoch++;files.set('output/defaults.json',selector.canonicalJson(value))},
    files=>{const value=JSON.parse(files.get('output/defaults.json'));value.targets.pop();files.set('output/defaults.json',selector.canonicalJson(value))},
    files=>{const value=JSON.parse(files.get('output/canonical-targets.json'));value[0]='b0 04.4.3';files.set('output/canonical-targets.json',selector.canonicalJson(value.sort()))},
    files=>{const value=JSON.parse(files.get('output/catalog.json'));value[0].extra=true;files.set('output/catalog.json',selector.canonicalJson(value))},
    files=>{const value=JSON.parse(files.get('output/agents.json'));value[0].extra=true;files.set('output/agents.json',selector.canonicalJson(value))},
    files=>{const value=JSON.parse(files.get('output/support.json'));value.stats.f0.b0={'999':'y'};files.set('output/support.json',selector.canonicalJson(value))},
  ]){const input=reseal(fixture(),mutate);assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))}
  const input=fixture(), value=JSON.parse(input.supplement);value.runtimeAdmitted=true
  const supplement=selector.canonicalJson(value),pins={...input.pins,supplementSha256:selector.sha(supplement),supplementBytes:supplement.length}
  assert.throws(()=>selector.selectInertAssets(input.envelope,supplement,input.notice,pins),/SUPPLEMENT_BINDING/)
})

test('comma-key and empty-key collisions cannot masquerade as schema fields or tree names',()=>{
  for(const trees of [{'first,second':[]},{'':[]}]){
    const value={schemaVersion:2,generatorSha256:'0'.repeat(64),runtimeAdmitted:false,status:'failed',trees,failure:{message:'synthetic failure',trace:null}}
    const bytes=selector.canonicalJson(value)
    assert.throws(()=>selector.verifyEnvelopeBytes(bytes,bytes),/ENVELOPE_TREES/)
  }
  const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
  delete value.schemaVersion;delete value.source;value['schemaVersion,source']={}
  assert.throws(()=>selector.validateInertCapsule(value,input.pins),/ENVELOPE_SCHEMA/)
})

test('source provenance has exact fields and fixed scalar/archive identities',()=>{
  for(const mutate of [
    value=>value.extra=true,value=>delete value.graph,value=>value.schemaVersion=2,value=>value.node='v99.0.0',
    value=>value.epoch++,value=>value.sourceCommit='0'.repeat(40),value=>value.sourceArtifactSha256='0'.repeat(64),
    value=>value.runtimeAdmitted=true,value=>value.adaptation='different',value=>value.archives[0].sha256='0'.repeat(64),
    value=>value.archives[0].extra=true,value=>value.archives.reverse(),
  ]){
    const input=reseal(fixture(),files=>{const value=JSON.parse(files.get('output/provenance.json'));mutate(value);files.set('output/provenance.json',selector.canonicalJson(value))},false)
    assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins),/ENVELOPE_SCHEMA|SOURCE_PROVENANCE/)
  }
})

test('source graph rejects missing nodes, malformed edges and unknown or misplaced targets',()=>{
  for(const mutate of [
    graph=>delete graph[Object.keys(graph)[0]],graph=>graph.unlisted={},
    graph=>graph[Object.keys(graph)[0]]=[],graph=>graph[Object.keys(graph)[0]]['./next']=null,
    graph=>graph[Object.keys(graph)[0]]['./next']='unlisted/module.js',
    graph=>graph[Object.keys(graph)[0]]['./next']='@denied-path',
    graph=>graph['pkg/m2.js'].path='@denied-path',
    graph=>graph['node-releases/envs.json'].edge=Object.keys(graph)[0],
    graph=>graph[Object.keys(graph)[0]]['']=Object.keys(graph)[0],
  ]){
    const input=reseal(fixture(),files=>{const value=JSON.parse(files.get('output/provenance.json'));mutate(value.graph);files.set('output/provenance.json',selector.canonicalJson(value))})
    assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins),/ENVELOPE_SCHEMA|SOURCE_GRAPH/)
  }
})

test('source output descriptors are an exact unique binding to every non-provenance output',()=>{
  for(const mutate of [
    rows=>rows.pop(),rows=>rows.push(rows[0]),rows=>rows[0]=rows[1],rows=>rows[0].path='provenance.json',
    rows=>rows[0].path='unlisted.json',rows=>rows[0].bytes++,rows=>rows[0].sha256='0'.repeat(64),rows=>rows[0].extra=true,
  ]){
    const input=reseal(fixture(),files=>{const value=JSON.parse(files.get('output/provenance.json'));mutate(value.outputs);files.set('output/provenance.json',selector.canonicalJson(value))},false)
    assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins),/ENVELOPE_SCHEMA|SOURCE_OUTPUTS/)
  }
})

test('source request tuples must name an own graph edge and its exact authorized target',()=>{
  for(const mutate of [
    tuple=>[],tuple=>tuple.slice(0,2),tuple=>[...tuple,'extra'],tuple=>({0:tuple[0],1:tuple[1],2:tuple[2]}),
    tuple=>[0,tuple[1],tuple[2]],tuple=>[tuple[0],null,tuple[2]],tuple=>[tuple[0],tuple[1],0],
    tuple=>['unlisted/module.js',tuple[1],tuple[2]],tuple=>[tuple[0],'absent-edge',tuple[2]],
    tuple=>[tuple[0],'toString',tuple[2]],tuple=>[tuple[0],tuple[1],tuple[0]],
    tuple=>[tuple[0],tuple[1],'unlisted/module.js'],tuple=>[tuple[0],tuple[1],'@denied-path'],
  ]){
    const input=reseal(fixture(),files=>{const value=JSON.parse(files.get('output/module-trace.json'));value.requests[0]=mutate(value.requests[0]);files.set('output/module-trace.json',selector.canonicalJson(value))})
    assert.throws(()=>selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins),/SOURCE_REQUEST/)
  }
})

test('held descriptor publishes capsule with full readback; partial I/O succeeds without reopening and cannot repeat',()=>temp((path,open)=>{
  const input=fixture(),bytes=selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins),value=JSON.parse(bytes)
  const held=open(v=>selector.validateInertCapsule(v,input.pins),16*1024*1024)
  patched('openSync',()=>()=>{throw Error('REOPEN')},()=>patched('writeSync',original=>(fd,buffer,offset,length,position)=>original(fd,buffer,offset,Math.min(length,65536),position),()=>patched('readSync',original=>(fd,buffer,offset,length,position)=>original(fd,buffer,offset,Math.min(length,32768),position),()=>assert.equal(held.publish(value),selector.sha(bytes)))))
  assert.equal(selector.verifyInertCapsuleBytes(fs.readFileSync(path),input.pins),selector.sha(bytes))
  assert.throws(()=>held.publish(value),/OUTPUT_ONESHOT/)
}))

test('existing files, symlinks, directories and hardlinks are never overwritten; nested output paths rejected',()=>{
  for(const kind of ['file','symlink','directory','hardlink'])temp((path,open)=>{
    fs.writeFileSync(path+'.outside','untouched',{flag:'wx'})
    if(kind==='file')fs.writeFileSync(path,'existing',{flag:'wx'})
    if(kind==='directory')fs.mkdirSync(path)
    if(kind==='symlink')fs.symlinkSync(path+'.outside',path)
    if(kind==='hardlink')fs.linkSync(path+'.outside',path)
    assert.throws(open);assert.equal(fs.readFileSync(path+'.outside','utf8'),'untouched')
  })
  assert.throws(()=>selector.openEvidenceFile('/private/tmp/nested/escape'),/OUTPUT_PATH/)
})

test('replacement, unlink and hardlink attacks during publication fail without redirected writes',()=>{
  for(const kind of ['replacement','unlink','hardlink'])temp((path,open)=>{
    const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
    const held=open(v=>selector.validateInertCapsule(v,input.pins),16*1024*1024)
    fs.writeFileSync(path+'.outside','untouched',{flag:'wx'})
    patched('fsyncSync',original=>fd=>{original(fd);if(kind==='replacement'){fs.renameSync(path,path+'.moved');fs.symlinkSync(path+'.outside',path)}if(kind==='unlink')fs.unlinkSync(path);if(kind==='hardlink')fs.linkSync(path,path+'.hard')},()=>assert.throws(()=>held.publish(value)))
    assert.equal(fs.readFileSync(path+'.outside','utf8'),'untouched')
  })
})

test('externally changed reserved-file content is not truncated or replaced',()=>temp((path,open)=>{
  const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
  const held=open(v=>selector.validateInertCapsule(v,input.pins),selector.MAX_CAPSULE)
  fs.writeFileSync(path,'external synthetic content')
  assert.throws(()=>held.publish(value),/OUTPUT_CHANGED/)
  assert.equal(fs.readFileSync(path,'utf8'),'external synthetic content')
}))

test('even pre-write validation failure consumes the single publication attempt',()=>temp((path,open)=>{
  const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
  const held=open(v=>selector.validateInertCapsule(v,input.pins),selector.MAX_CAPSULE)
  assert.throws(()=>held.publish({...value,runtimeAdmitted:true}),/CAPSULE_SCHEMA/)
  assert.throws(()=>held.publish(value),/OUTPUT_ONESHOT/)
  assert.equal(fs.statSync(path).size,0)
}))

test('zero/throwing writes and fsync failure retain the reserved inode and forbid success retries',()=>{
  for(const kind of ['zero','throw','fsync'])temp((path,open)=>{
    const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
    const held=open(v=>selector.validateInertCapsule(v,input.pins),selector.MAX_CAPSULE),before=fs.statSync(path).ino
    patched(kind==='fsync'?'fsyncSync':'writeSync',()=>()=>{if(kind==='zero')return 0;throw Error('IO_FAILURE')},()=>assert.throws(()=>held.publish(value),/OUTPUT_WRITE|IO_FAILURE/))
    assert.equal(fs.statSync(path).ino,before)
    assert.throws(()=>held.publish(value),/OUTPUT_ONESHOT/)
  })
})

test('parent, permission, and late content mutations suppress successful publication',()=>{
  for(const kind of ['parent','permission','late'])temp((path,open)=>{
    const input=fixture(),value=JSON.parse(selector.selectInertAssets(input.envelope,input.supplement,input.notice,input.pins))
    const held=open(v=>selector.validateInertCapsule(v,input.pins),selector.MAX_CAPSULE)
    if(kind==='permission')fs.chmodSync(path,0o644)
    let checks=0
    patched('lstatSync',original=>(name,...args)=>{
      if(kind==='late'&&name===path&&++checks===2)fs.appendFileSync(path,'!')
      const stat=original(name,...args)
      if(kind==='parent'&&name==='/private/tmp')stat.ino++
      return stat
    },()=>assert.throws(()=>held.publish(value),/OUTPUT_PARENT_CHANGED|OUTPUT_FILE|OUTPUT_CHANGED/))
  })
})

test('tree validator and exact host environment remain closed without any platform subprocess',()=>{
  for(const paths of [['output/../escape'],['output/A','output/a'],['output/a','output/a/b'],['/output/a']])assert.throws(()=>selector.logicalTree(new Map(paths.map(path=>[path,Buffer.from('x')]))))
  const env={PATH:'/usr/bin:/bin',TZ:'UTC',LANG:'C',LC_ALL:'C',__CF_USER_TEXT_ENCODING:'0x1F5:0x0:0x52'}
  assert.doesNotThrow(()=>selector.validateHostEnvironment(env))
  for(const key of Object.keys(env)){const missing={...env};delete missing[key];assert.throws(()=>selector.validateHostEnvironment(missing),/ENVIRONMENT/);assert.throws(()=>selector.validateHostEnvironment({...env,[key]:'wrong'}),/ENVIRONMENT/)}
  assert.throws(()=>selector.validateHostEnvironment({...env,NODE_OPTIONS:''}),/ENVIRONMENT/)
  assert(Object.isFrozen(selector.PRODUCTION_PINS)&&Object.isFrozen(selector.PRODUCTION_PINS.assets)&&selector.PRODUCTION_PINS.assets.every(Object.isFrozen))
  assert.equal(selector.PRODUCTION_PINS.assets.reduce((sum,row)=>sum+row.bytes,0),8473611)
  assert.throws(()=>selector.verifyInertCapsuleBytes(Buffer.alloc(selector.MAX_CAPSULE+1)),/CAPSULE_BOUND/)
})

test('input descriptor reader rejects symlinks, directories, early EOF and same-inode changes',()=>{
  for(const kind of ['symlink','directory','eof','tamper'])temp(path=>{
    const digest=selector.sha(Buffer.from('synthetic'))
    if(kind==='symlink'){fs.writeFileSync(path+'.outside','synthetic',{flag:'wx',mode:0o600});fs.symlinkSync(path+'.outside',path);assert.throws(()=>selector.readPinnedFile(path,digest,9));return}
    if(kind==='directory'){fs.mkdirSync(path);assert.throws(()=>selector.readPinnedFile(path,digest,9),/INPUT_FILE/);return}
    fs.writeFileSync(path,'synthetic',{flag:'wx',mode:0o600})
    let changed=false
    patched('readSync',original=>(...args)=>{
      if(kind==='eof')return 0
      const count=original(...args)
      if(!changed){changed=true;fs.appendFileSync(path,'!')}
      return count
    },()=>assert.throws(()=>selector.readPinnedFile(path,digest,9),/INPUT_CHANGED/))
  })
})

test('input descriptor reader refuses mismatches and hardlinks with owned synthetic bytes',()=>temp(path=>{
  fs.writeFileSync(path,'synthetic',{flag:'wx',mode:0o600})
  const digest=selector.sha(Buffer.from('synthetic'))
  assert.equal(selector.readPinnedFile(path,digest,9).toString(),'synthetic')
  assert.throws(()=>selector.readPinnedFile(path,'0'.repeat(64),9),/INPUT_DIGEST/)
  assert.throws(()=>selector.readPinnedFile(path,digest,8),/INPUT_SIZE/)
  fs.linkSync(path,path+'.hard');assert.throws(()=>selector.readPinnedFile(path,digest,9),/INPUT_FILE/)
}))
