import { registerHooks } from 'node:module'
import { realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolution hygiene, not confinement: this is explicitly trusted account-level code.
const root = realpathSync(dirname(fileURLToPath(import.meta.url))) + sep
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context)
    if (result.url.startsWith('node:')) return result
    if (!result.url.startsWith('file:') || !realpathSync(fileURLToPath(result.url)).startsWith(root)) throw new Error('Translate dependency resolved outside the reviewed private runtime')
    return result
  },
})
