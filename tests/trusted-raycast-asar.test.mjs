import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import electron from 'electron'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const { createPackageWithOptions } = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar')

// Explicit Electron/ASAR gate: node --test tests/trusted-raycast-asar.test.mjs
// No windows or browser processes are created; Electron runs in Node mode.
test('packaged trusted candidates retain physical identity without weakening admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-trusted-asar-'))
  try {
    const input = join(root, 'input')
    const appPath = join(root, 'app.asar')
    await mkdir(join(input, 'dist'), { recursive: true })
    await writeFile(join(input, 'dist', 'proof.txt'), 'reviewed bytes')
    await createPackageWithOptions(input, appPath, { unpack: '**/*' })
    const probe = join(root, 'probe.cjs')
    await build({
      stdin: {
        contents: `import assert from 'node:assert/strict';
import { join } from 'node:path';
import { trustedRaycastCandidateRoot } from './src/trusted-raycast-paths.ts';
import { readTrustedRaycastFile } from './src/trusted-raycast-artifact-admission.ts';
const appPath = process.argv[2];
assert.throws(() => readTrustedRaycastFile(join(appPath, 'dist', 'proof.txt')), /changed while opening/);
assert.equal(readTrustedRaycastFile(join(trustedRaycastCandidateRoot(appPath, true), 'proof.txt')).toString(), 'reviewed bytes');
console.log('physical admission verified');`,
        resolveDir: join(import.meta.dirname, '..'),
      },
      bundle: true, platform: 'node', format: 'cjs', outfile: probe,
    })
    const output = execFileSync(electron, [probe, appPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15_000, encoding: 'utf8',
    })
    assert.match(output, /physical admission verified/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
