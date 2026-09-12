import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

/** Only the five imports audited in the pinned Can I Use source; never resolve packages. */
export function trustedRaycastCanIUseAliases() {
  const sourcePath = fileURLToPath(new URL('../src/trusted-raycast-can-i-use-source.ts', import.meta.url))
  const source = JSON.stringify(sourcePath)
  const modules = {
    browserslist: `export { default } from ${source}`,
    'caniuse-api': `export { isSupported, getSupport } from ${source}`,
    'caniuse-lite': `export { features, feature, agents } from ${source}`,
    os: `export { homedir } from ${source}`,
    path: `import { join } from ${source}; export default Object.freeze({ join })`,
  }
  return {
    name: 'trusted-can-i-use-aliases',
    setup(build) {
      build.onResolve({ filter: /^(?:browserslist|caniuse-api|caniuse-lite|os|path)$/ }, args => ({ path: args.path, namespace: 'trusted-can-i-use' }))
      build.onLoad({ filter: /.*/, namespace: 'trusted-can-i-use' }, args => ({ contents: modules[args.path], loader: 'js', resolveDir: dirname(sourcePath) }))
    },
  }
}
