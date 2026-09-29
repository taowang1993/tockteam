import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** Build first-party host code, never a selected extension, during product packaging. */
export async function buildUserRaycast(output) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  mkdirSync(output, { recursive: true })
  await Promise.all([
    build({ entryPoints: [join(root, 'src/user-raycast-child.ts')], outfile: join(output, 'child.mjs'), bundle: true, packages: 'external', external: ['./api.mjs'], format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent' }),
    build({ entryPoints: [join(root, 'src/trusted-raycast-compat-api.ts')], outfile: join(output, 'api.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent' }),
  ])
}
