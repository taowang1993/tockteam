import { mkdir, readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'

const sources = {
  'client-api': 'src/client-api.ts',
  viewer: 'src/viewer.ts',
  client: 'src/client.tsx',
}
const modules = []
for (const [id, path] of Object.entries(sources)) {
  const source = await readFile(path, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  }).outputText
    .replaceAll('require("./viewer.ts")', 'require("viewer")')
    .replaceAll('require("./client-api.ts")', 'require("client-api")')
  modules.push(`${JSON.stringify(id)}: (require, module, exports) => {\n${output}\n}`)
}

const bundle = `window.__ModuleLoader__.load({ id: "tockbot-web-clip", factory: (require) => {
  const definitions = {${modules.join(',\n')}};
  const cache = {};
  const localRequire = (id) => {
    if (!(id in definitions)) return require(id);
    if (!(id in cache)) {
      const module = { exports: {} };
      cache[id] = module;
      definitions[id](localRequire, module, module.exports);
    }
    return cache[id].exports;
  };
  return localRequire("client");
} });
//# sourceMappingURL=client.js.map
`
await mkdir('lib', { recursive: true })
await writeFile('lib/client.js', bundle)
await writeFile('lib/client.js.map', JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }))
