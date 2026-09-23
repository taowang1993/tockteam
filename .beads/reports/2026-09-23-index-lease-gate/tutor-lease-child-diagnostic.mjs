import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const sqlite = createRequire('/Users/taowang/projects/worktrees/tutor/plugins/tocktutor/packages/tockbot-note-runtime/package.json')('sqlite3');
for (const method of ['run','all']) {
  const original = sqlite.Database.prototype[method];
  sqlite.Database.prototype[method] = function(sql,...args) {
    const callback=args.at(-1);
    if(typeof callback==='function') args[args.length-1]=function(error,...rest) {
      if(error) appendFileSync(process.argv[3],JSON.stringify({pid:process.pid,method,sql,code:error.code,error:error.message})+'\n');
      return Reflect.apply(callback,this,[error,...rest]);
    };
    return Reflect.apply(original,this,[sql,...args]);
  };
}
import { IndexProtocol } from '/Users/taowang/projects/worktrees/tutor/plugins/tocktutor/packages/tockbot-note-runtime/src/search-index-protocol.ts';
const close = IndexProtocol.prototype.close;
IndexProtocol.prototype.close = function(error) {
  appendFileSync(process.argv[3], JSON.stringify({ pid:process.pid, code:error?.code, error:error?.stack ?? String(error) })+'\n');
  return Reflect.apply(close,this,[error]);
};
await import(pathToFileURL(process.argv[2]).href);
