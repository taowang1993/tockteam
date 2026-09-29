import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildUserRaycastSource } from '../src/user-raycast-source-build.ts'
import { digestFiles, readFiles, UserRaycastInstall } from '../src/user-raycast-install.ts'
import type { UserRaycastSourceCandidate } from '../src/user-raycast-registry.ts'

test('approved source build uses no lifecycle scripts, pins metadata and stages only the selected command', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-raycast-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'source'); mkdirSync(join(source, 'src'), { recursive: true })
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'uuid-generator', title: 'UUID Generator', license: 'MIT', commands: [{ name: 'generate', mode: 'no-view' }], scripts: { preinstall: 'exit 80' } }))
  writeFileSync(join(source, 'package-lock.json'), JSON.stringify({ name: 'uuid-generator', lockfileVersion: 3, packages: { '': { name: 'uuid-generator' } } }))
  writeFileSync(join(source, 'src/generate.tsx'), 'export default () => "test"')
  const candidate: UserRaycastSourceCandidate = { command: 'generate', digest: digestFiles(readFiles(source)), extensionId: 'uuid-generator', title: 'UUID Generator', license: 'MIT', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: 3, bytes: 0, mode: 'no-view', source: `https://github.com/raycast/extensions/tree/${'a'.repeat(40)}/extensions/uuid-generator` }
  const npm = join(root, 'fake-npm')
  writeFileSync(npm, `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'npm-proof.json'), JSON.stringify({args: process.argv.slice(2), home: process.env.HOME, token: process.env.NPM_TOKEN}));
fs.mkdirSync(path.join(process.cwd(), 'node_modules/esbuild/bin'), {recursive:true});
fs.writeFileSync(path.join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), "require('node:fs').writeFileSync(process.argv.find(a=>a.startsWith('--outfile=')).slice(10), 'module.exports={default:()=>42}')");
`)
  chmodSync(npm, 0o700)
  const workspace = join(root, 'workspace'); mkdirSync(workspace)
  const previousToken = process.env.NPM_TOKEN
  process.env.NPM_TOKEN = 'test-only-must-not-inherit'
  try {
    await assert.rejects(buildUserRaycastSource({ source, candidate: { ...candidate, digest: '0'.repeat(64) }, workspace, nodePath: process.execPath, npmPath: npm }), /changed|digest/i)
    assert.equal(existsSync(join(workspace, 'source')), false)
    const canceled = join(root, 'canceled'); mkdirSync(canceled)
    const controller = new AbortController(); controller.abort()
    await assert.rejects(buildUserRaycastSource({ source, candidate, workspace: canceled, nodePath: process.execPath, npmPath: npm, signal: controller.signal }), /cancel/i)
    assert.equal(existsSync(join(canceled, 'source')), false)
    const built = await buildUserRaycastSource({ source, candidate, workspace, nodePath: process.execPath, npmPath: npm })
    const proof = JSON.parse(readFileSync(join(workspace, 'source', 'npm-proof.json'), 'utf8')) as { args: string[]; home: string; token?: string }
    assert.ok(proof.args.includes('--ignore-scripts'))
    assert.ok(proof.args.includes('--no-audit'))
    assert.equal(proof.token, undefined)
    assert.notEqual(proof.home, process.env.HOME)
    assert.equal(readFileSync(join(built, 'generate.js'), 'utf8'), 'module.exports={default:()=>42}')
    assert.equal(existsSync(join(built, 'package-lock.json')), false)
    const manifest = JSON.parse(readFileSync(join(built, 'package.json'), 'utf8')) as { repository: string }
    assert.equal(manifest.repository, candidate.source)
    const install = new UserRaycastInstall(join(root, 'install'))
    const selection = install.prepare(built, 'generate')
    assert.equal(selection.source, candidate.source)
    assert.equal(selection.mode, 'no-view')
    assert.equal(install.status().installed, false)
  } finally { if (previousToken === undefined) delete process.env.NPM_TOKEN; else process.env.NPM_TOKEN = previousToken }
})
