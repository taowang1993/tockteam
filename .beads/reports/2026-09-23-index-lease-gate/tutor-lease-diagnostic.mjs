import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SearchIndexProcess } from '/Users/taowang/projects/worktrees/tutor/plugins/tocktutor/packages/tockbot-note-runtime/src/search-index-process.ts';
import { spawnOwnedProcess } from '/Users/taowang/projects/worktrees/tutor/plugins/tocktutor/packages/tockbot-note-runtime/src/owned-process.ts';
const root=await mkdtemp(join(tmpdir(),'tutor-lease-diagnostic-'));
const log=join(root,'child-errors.jsonl');
SearchIndexProcess.prototype.spawn = options => spawnOwnedProcess({...options,args:['/tmp/tutor-lease-child-diagnostic.mjs',options.args[0],log]});
const document={path:'Alpha.md',modifiedAt:1,revision:'revision-1'};
try {
  for(let round=1;round<=40;round++) {
    const directory=await mkdtemp(join(root,'round-'));
    const options={directory,identity:'fixture',vaultId:'vault:fixture',maxReadBytes:1024,list:async()=>[document],read:async()=>({...document,content:'#alpha'})};
    const indexes=[new SearchIndexProcess(options),new SearchIndexProcess(options)];
    let failed=false;
    try {
      const outcomes=await Promise.allSettled(indexes.map(index=>index.whenReady));
      failed=outcomes.filter(outcome=>outcome.status==='fulfilled').length!==1;
      console.log(JSON.stringify({round,pids:indexes.map(index=>index.pid),outcomes:outcomes.map(outcome=>outcome.status==='fulfilled'?'ready':String(outcome.reason))}));
      if(failed) console.log(await readFile(log,'utf8'));
    } finally {
      await Promise.all(indexes.map(index=>index.close()));
      for(const index of indexes) if(index.pid) assert.throws(()=>process.kill(index.pid,0),{code:'ESRCH'});
      console.log(JSON.stringify({round,closedPids:indexes.map(index=>index.pid),remaining:[]}));
      await rm(directory,{recursive:true,force:true});
    }
    if(failed) break;
  }
} finally {await rm(root,{recursive:true,force:true});}
