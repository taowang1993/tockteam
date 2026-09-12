import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build, stop } from 'esbuild'
// @ts-expect-error First-party JavaScript build plugin.
import { trustedRaycastCanIUseAliases } from '../scripts/trusted-raycast-can-i-use-aliases.mjs'
// @ts-expect-error First-party JavaScript build helper.
import { trustedRaycastTarPath } from '../scripts/trusted-raycast-build.mjs'
// @ts-expect-error First-party process-group cleanup.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { admitTrustedRaycastArtifact, readTrustedRaycastFile } from '../src/trusted-raycast-artifact-admission.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'
import { inspectTrustedRaycastProjection } from '../src/trusted-raycast-contract.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_ASSET } from '../src/trusted-raycast-can-i-use-assets.ts'
import { loadTrustedRaycastCanIUseData } from '../src/trusted-raycast-can-i-use-runtime.ts'
import { prepareTrustedRaycastCanIUseRoot } from '../src/trusted-raycast-can-i-use-command.ts'
import { TrustedRaycastCanIUseActionRegistry } from '../src/trusted-raycast-can-i-use-actions.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-can-i-use-preferences.ts'

const repository = fileURLToPath(new URL('../', import.meta.url))
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const sourcePin = 'cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c'

for (const rejection of ['component', 'environment', 'replay', 'context', 'oversized', 'action'] as const) test(`unchanged pinned source renders main-selected roots through ${rejection === 'component' ? 'a component probe' : `the production reconciler (${rejection} rejection)`}`, { timeout: 20000 }, async t => {
  const reconciled = rejection !== 'component'
  const sourcePath = join(repository, 'plugins/trusted-raycast/vendor/can-i-use-source.tar')
  const archive = readTrustedRaycastFile(sourcePath, 3246080)
  const tar = trustedRaycastTarPath()
  assert.equal(archive.length, 3246080)
  assert.equal(sha(archive), sourcePin)
  const reactArchive = admitTrustedRaycastArtifact(trustedRaycastDescriptors['google-translate'], join(repository, 'plugins/trusted-raycast/vendor/google-translate.tar'))
  const data = loadTrustedRaycastCanIUseData(join(repository, 'plugins/trusted-raycast/vendor'))
  const work = mkdtempSync(join(tmpdir(), 'tockteam-can-i-use-source-proof-'))
  let child: ReturnType<typeof spawn> | undefined
  try {
    const env = { PATH: '/usr/bin:/bin', HOME: work, TMPDIR: work, TMP: work, TEMP: work, TZ: 'UTC', LANG: 'C' }
    for (const input of [archive, reactArchive]) execFileSync(tar, ['xf', '-', '-C', work], { input, timeout: 5000, env })
    symlinkSync(join(work, trustedRaycastDescriptors['google-translate'].artifactRoot, 'runtime/node_modules'), join(work, 'node_modules'))
    const entry = join(work, 'probe.ts')
    writeFileSync(entry, reconciled ? readFileSync(join(repository, 'src/trusted-raycast-child.ts'), 'utf8')
      .replaceAll("'/tmp/trusted-raycast-source/src/translate'", () => JSON.stringify(join(work, 'can-i-use/src/index.tsx')))
      .replaceAll("'/tmp/trusted-raycast-source/package.json'", () => JSON.stringify(join(work, 'can-i-use/package.json'))) : `import Command from ${JSON.stringify(join(work, 'can-i-use/src/index.tsx'))};
import { replaceTrustedRaycastCanIUseRoot, trustedRaycastCanIUseRootCounts } from ${JSON.stringify(join(repository, 'src/trusted-raycast-can-i-use-source.ts'))};
function emit() {
  const view = Command();
  const rows = view.props.children.map(row => ({ title: row.props.title, slug: row.props.keywords[0], accessories: row.props.accessories, actions: row.props.actions.props.children.map(action => action.props.title ?? 'Open in Browser') }));
  process.stdout.write(JSON.stringify({ rows, ...trustedRaycastCanIUseRootCounts() }) + '\\n');
}
emit();
process.stdin.setEncoding('utf8'); let pending = '';
process.stdin.on('data', chunk => {
  pending += chunk; if (Buffer.byteLength(pending) > 32768) throw Error('LIMIT_EXCEEDED');
  let end; while ((end = pending.indexOf('\\n')) >= 0) { const message = pending.slice(0, end); pending = pending.slice(end + 1); replaceTrustedRaycastCanIUseRoot(message); emit(); }
});
process.stdin.on('end', () => process.exit(0));
`, { flag: 'wx', mode: 0o600 })
    const probe = join(work, 'probe.mjs')
    const built = await build({ entryPoints: [entry], outfile: probe, bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node24', jsx: 'automatic', metafile: true,
      alias: { '@raycast/api': join(repository, 'src/trusted-raycast-compat-api.ts'),
        '@tockteam/trusted-raycast-child-contract': join(repository, 'src/trusted-raycast-contract.ts'),
        '@tockteam/trusted-raycast-projection': join(repository, 'src/trusted-raycast-projection.ts'),
        '@tockteam/trusted-raycast-can-i-use-source': join(repository, 'src/trusted-raycast-can-i-use-source.ts'),
      }, plugins: [trustedRaycastCanIUseAliases()], logLevel: 'silent' })
    const imports = Object.values(built.metafile!.outputs).flatMap(output => output.imports.map(value => value.path))
    assert.deepEqual([...new Set(imports)].sort(), reconciled ? ['react', 'react-reconciler', 'react/jsx-runtime'] : ['react', 'react/jsx-runtime'])
    const derivedSha = sha(readTrustedRaycastFile(probe))
    const registry = new TrustedRaycastCanIUseActionRegistry()
    const context = { extensionId: 'can-i-use', command: 'index', sessionId: 'source-proof', workspaceId: 'no-workspace', snapshotIdentity: TRUSTED_RAYCAST_CAN_I_USE_ASSET.sha256, snapshotGeneration: 0 }
    const preferences = { ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: 'chrome 100' }
    const root = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, '')
    child = spawn(process.execPath, [probe], { cwd: work, detached: true, env: { ...env, TRUSTED_RAYCAST_EXTENSION_ID: 'can-i-use', TRUSTED_RAYCAST_SESSION_ID: context.sessionId, TRUSTED_RAYCAST_GENERATION: 'root-proof-generation',
      TRUSTED_RAYCAST_CAN_I_USE_CONTEXT: JSON.stringify(context), TRUSTED_RAYCAST_CAN_I_USE_ROOT: root.message, TRUSTED_RAYCAST_PREFERENCES: JSON.stringify(root.preferences) }, stdio: ['pipe', 'pipe', 'pipe'] })
    const messages: Array<{ rows: Array<{ title: string; slug: string; accessories: unknown[]; actions: string[] }>; visibleCount: number; matchCount: number; totalCount: number }> = []
    let pending = '', diagnostics = '', outputBytes = 0
    let failure: Error | undefined
    child.on('error', error => { failure = error })
    child.stderr!.on('data', chunk => { diagnostics += chunk; if (diagnostics.length > 65536) failure = new Error('Diagnostic bound exceeded') })
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk)
      if (outputBytes > 1024 * 1024) { failure = new Error('Output bound exceeded'); return }
      pending += chunk
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1)
        try {
          const message = JSON.parse(line)
          if (!reconciled) { messages.push(message); continue }
          assert.equal(message.type, messages.length === 0 ? 'ready' : 'patch')
          assert.equal(message.extensionId, 'can-i-use')
          assert.equal(message.sessionId, context.sessionId)
          assert.equal(message.generation, 'root-proof-generation')
          assert.equal(message.revision, messages.length)
          const metrics = inspectTrustedRaycastProjection(message.root)
          assert.ok(metrics.itemNodes <= 64)
          assert.ok(metrics.actionNodes <= 128)
          assert.equal(metrics.actionableHandles, 0, 'root-only scope must not publish actionable source callbacks')
          assert.ok(metrics.rootBytes <= 128 * 1024)
          assert.equal(message.root.props.searchable, true)
          assert.equal(message.root.props.querySequence, messages.length)
          type Node = { type: string; props: Record<string, any>; children: Array<Node | string> }
          const nodes = (node: Node): Node[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : nodes(child))]
          const all = nodes(message.root)
          assert.ok(all.filter(node => node.type === 'raycast-action').every(node => node.props.unavailable === true))
          const rows = all.filter(node => node.type === 'raycast-list-item').map(node => ({ title: node.props.title,
            slug: '', accessories: JSON.parse(node.props.accessories), actions: nodes(node).filter(child => child.type === 'raycast-action').map(child => child.props.title) }))
          messages.push({ rows, ...message.root.props })
        } catch (error) { failure = error instanceof Error ? error : new Error('Invalid source output') }
      }
    })
    const next = async (count: number) => {
      const deadline = Date.now() + 5000
      while (messages.length < count) {
        if (failure) throw failure
        if (child!.exitCode !== null || child!.signalCode !== null) throw new Error(`Source process closed: ${diagnostics.slice(0, 1024)}`)
        if (Date.now() > deadline) throw new Error(`Source process timed out: ${diagnostics.slice(0, 1024)}`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      return messages[count - 1]!
    }
    const initial = await next(1)
    assert.equal(initial.rows.length, 64)
    assert.equal(initial.matchCount, 581)
    assert.equal(initial.totalCount, 581)
    assert.deepEqual(initial.rows.map(row => row.title), root.rows.map(row => row.title))
    if (!reconciled) assert.deepEqual(initial.rows.map(row => row.slug), root.rows.map(row => row.slug))
    assert.ok(initial.rows.every(row => row.actions.join(',') === 'Show Details,Open in Browser'))
    const target = data.catalog.entries[500]!
    assert.ok(!initial.rows.some(row => row.title === target.title))
    const found = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, target.slug)
    child.stdin!.write(found.message + '\n')
    assert.ok((await next(2)).rows.some(row => row.title === target.title))
    child.stdin!.write(prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, 'css-grid').message + '\n')
    const grid = (await next(3)).rows.find(row => row.title === data.catalog.entries.find(feature => feature.slug === 'css-grid')!.title)!
    assert.deepEqual(grid.accessories, [{ text: 'W3C candidate recommendation' }, { icon: { source: 'Checkmark', tintColor: 'Green' }, tooltip: 'Supported' }])
    child.stdin!.write(prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, 'zzzz-no-matching-feature').message + '\n')
    const empty = await next(4)
    assert.equal(empty.rows.length, 0)
    assert.equal(empty.matchCount, 0)
    assert.equal(diagnostics, '')
    // A rejected parent packet cannot publish another source view or execute an action.
    let invalid = prepareTrustedRaycastCanIUseRoot(data, { ...preferences, environment: 'modern' }, context, registry, 'css-grid').message
    if (rejection === 'replay') invalid = root.message
    if (rejection === 'context') invalid = prepareTrustedRaycastCanIUseRoot(data, preferences, { ...context, sessionId: 'another-session' }, registry, 'css-grid').message
    if (rejection === 'oversized') {
      const decoded = JSON.parse(root.message)
      decoded.revision += 100
      decoded.features.push(decoded.features[0])
      invalid = JSON.stringify(decoded)
    }
    if (rejection === 'action') invalid = JSON.stringify({ extensionId: 'can-i-use', sessionId: context.sessionId, generation: 'root-proof-generation', revision: 3, eventId: 'action-0', kind: 'action', value: 'action-0' })
    child.stdin!.write(invalid + '\n')
    const rejectedBy = Date.now() + 2000
    while (messages.length === 4 && child.exitCode === null && Date.now() < rejectedBy) await new Promise(resolve => setTimeout(resolve, 10))
    if (failure) throw failure
    assert.equal(messages.length, 4, 'invalid packets must not produce another source view or effect')
    assert.notEqual(child.exitCode, null)
    assert.notEqual(child.exitCode, 0)
    assert.match(diagnostics, rejection === 'action' ? /ACTION_DENIED/ : rejection === 'oversized' ? /RENDER_INVALID/ : /SNAPSHOT_STALE/)
    assert.equal(sha(readTrustedRaycastFile(probe)), derivedSha)
    assert.equal(sha(readTrustedRaycastFile(sourcePath, 3246080)), sourcePin)
  } finally {
    if (child) {
      await stopOwnedChild(child, 250, process.platform !== 'win32')
      t.diagnostic(JSON.stringify({ scope: reconciled ? 'root-reconciler-only' : 'root-source-only', pid: child.pid, processGroupGone: process.platform !== 'win32' }))
    }
    stop()
    rmSync(work, { recursive: true, force: true })
  }
})
