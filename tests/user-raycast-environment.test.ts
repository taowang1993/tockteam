import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }
const artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')

for (const mode of ['view', 'no-view', 'menu-bar'] as const) test(`selected ${mode} commands expose immutable SDK identity at import and namespace Cache by command`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-command-environment-')), runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: UserRaycastMessage[] = [], errors: string[] = [], groups = new Set<number>()
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact,
    onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) }, onError: (_owner, error) => errors.push(error.message),
    copyText: async () => { throw Error('Native effects prohibited') },
  })
  t.after(async () => {
    await manager.close()
    for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`)
    rmSync(root, { recursive: true, force: true })
  })
  await buildUserRaycast(runtime)
  for (const extensionId of ['identity-first', 'identity-second']) {
    const folder = join(root, extensionId)
    mkdirSync(folder)
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: extensionId, title: 'Offline Environment Fixture', commands: ['browse', 'other'].map(name => ({ name, mode })) }))
    if (mode === 'menu-bar') writeFileSync(join(folder, 'icon.png'), readFileSync(resolve('assets/icon.png')))
    for (const command of ['browse', 'other']) {
      const expected = { extensionName: extensionId, entryPointName: command, entryPointType: 'command', entryPointMode: mode, commandName: command, commandMode: mode, isDevelopment: false }
      writeFileSync(join(folder, `${command}.js`), `
        const React = require('react'), { List, MenuBarExtra, Cache, environment, showHUD } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
        const read = () => ({ extensionName: environment.extensionName, entryPointName: environment.entryPointName, entryPointType: environment.entryPointType,
          entryPointMode: environment.entryPointMode, commandName: environment.commandName, commandMode: environment.commandMode, isDevelopment: environment.isDevelopment });
        const imported = read();
        process.env.TOCKTEAM_USER_RAYCAST_ID = 'changed'; process.env.TOCKTEAM_USER_RAYCAST_COMMAND = 'changed'; process.env.TOCKTEAM_USER_RAYCAST_MODE = 'no-view';
        exports.default = function Command() {
          if (JSON.stringify(imported) !== JSON.stringify(${JSON.stringify(expected)}) || JSON.stringify(read()) !== JSON.stringify(imported)) throw Error('Incorrect command environment: ' + JSON.stringify(imported));
          if (!Object.isFrozen(environment) || Reflect.set(environment, 'entryPointName', 'wrong') !== false) throw Error('Command environment must be immutable');
          const cache = new Cache({ namespace: environment.entryPointName }), count = Number(cache.get('runs') ?? '0') + 1; cache.set('runs', String(count));
          const title = JSON.stringify({ ...imported, count });
          if (${JSON.stringify(mode)} === 'no-view') return showHUD(title);
          const Container = ${JSON.stringify(mode)} === 'menu-bar' ? MenuBarExtra : List;
          return React.createElement(Container, null, React.createElement(Container.Item, { title }));
        };
      `)
    }
    for (const [command, count] of [['browse', 1], ['browse', 2], ['other', 1], ['browse', 3]] as const) {
      const selected = install.prepare(folder, command); install.approve(selected.digest); install.enable()
      messages.length = 0; errors.length = 0
      const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid)
      await opening
      const expected = JSON.stringify({ extensionName: extensionId, entryPointName: command, entryPointType: 'command', entryPointMode: mode, commandName: command, commandMode: mode, isDevelopment: false, count })
      if (mode === 'no-view') {
        const deadline = Date.now() + 3000
        while (!messages.some(message => message.type === 'outcome') && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        assert.equal(messages.find(message => message.type === 'outcome')?.succeeded, true, `Missing no-view result: ${JSON.stringify({ errors, messages })}`)
        assert.equal(messages.find(message => message.type === 'toast')?.title, expected)
      } else {
        const ready = messages.find(message => message.type === 'ready')
        assert.ok(ready, `Missing projection: ${JSON.stringify({ errors, messages })}`)
        assert.ok(JSON.stringify(ready.root).includes(JSON.stringify(expected)), `Missing identity or namespaced count: ${JSON.stringify({ errors, messages })}`)
      }
      assert.deepEqual(errors, [])
      await manager.close()
    }
  }
})

test('owner or author uses the approved declared owner at import without changing its text', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-owner-author-import-')), runtime = join(root, 'host'), folder = join(root, 'source'), proof = join(root, 'import.json')
  const install = new UserRaycastInstall(join(root, 'installed')), messages: UserRaycastMessage[] = [], groups = new Set<number>()
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) } })
  t.after(async () => { await manager.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/); t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime); mkdirSync(folder)
  const declared = '  Étude 李 🙂  '
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'creator-import', title: 'Not the Creator', owner: declared, author: 'Not the Owner', commands: [{ name: 'browse', mode: 'view' }] }))
  writeFileSync(join(folder, 'browse.js'), `
    const React = require('react'), { List, environment } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
    const imported = environment.ownerOrAuthorName;
    require('node:fs').writeFileSync(${JSON.stringify(proof)}, JSON.stringify({ value: imported }));
    process.env.TOCKTEAM_USER_RAYCAST_OWNER_OR_AUTHOR_NAME = 'Changed Ambient Value';
    exports.default = () => React.createElement(List, null, React.createElement(List.Item, { title: JSON.stringify({ value: environment.ownerOrAuthorName, frozen: Object.isFrozen(environment), immutable: Reflect.set(environment, 'ownerOrAuthorName', 'Changed') === false, sameAtImport: imported === environment.ownerOrAuthorName }) }));
  `)
  const selected = install.prepare(folder, 'browse'); install.approve(selected.digest); install.enable()
  const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
  assert.deepEqual(JSON.parse(readFileSync(proof, 'utf8')), { value: declared }, 'The declared owner must be available before command import')
  const item = (messages.find(message => message.type === 'ready')!.root as any).children[0].children.find((node: any) => node.type === 'raycast-list-item')
  assert.deepEqual(JSON.parse(item.props.title), { value: declared, frozen: true, immutable: true, sameAtImport: true })
})

test('SDK environment rejects missing or malformed providers without replacing a valid snapshot', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-environment-provider-')), runtime = join(root, 'host'), folder = join(root, 'source')
  const install = new UserRaycastInstall(join(root, 'installed')), messages: UserRaycastMessage[] = [], errors: string[] = [], groups = new Set<number>()
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact,
    onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) }, onError: (_owner, error) => errors.push(error.message),
  })
  t.after(async () => {
    await manager.close()
    for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`)
    rmSync(root, { recursive: true, force: true })
  })
  await buildUserRaycast(runtime); mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'environment-provider', title: 'Offline Provider Fixture', commands: [{ name: 'browse', mode: 'view' }] }))
  writeFileSync(join(folder, 'browse.js'), `
    const React = require('react'), { List, Cache, environment, configureCompatibility } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
    exports.default = function Command() {
      const base = { native: async () => { throw Error('Native prohibited'); }, selection: async () => '', toast: () => {},
        cache: () => ({ get: () => 'kept', set: () => {}, remove: () => false, clear: () => {}, subscribe: () => () => {} }) };
      configureCompatibility(base);
      for (const key of ['extensionName', 'entryPointName', 'entryPointType', 'entryPointMode', 'commandName', 'commandMode', 'assetsPath', 'supportPath', 'ownerOrAuthorName']) {
        let rejected = false; try { environment[key]; } catch (error) { rejected = /not admitted by this capability/.test(String(error)); }
        if (!rejected) throw Error('Missing environment provider reported success for ' + key);
      }
      const supplied = { extensionName: 'configured', entryPointName: 'stable', entryPointMode: 'view', assetsPath: '/owned/assets', supportPath: '/owned/state/configured.support', ownerOrAuthorName: '  Étude 李 🙂  ' };
      configureCompatibility({ ...base, environment: supplied });
      supplied.extensionName = 'changed'; supplied.entryPointName = 'changed'; supplied.entryPointMode = 'no-view'; supplied.assetsPath = '/changed'; supplied.supportPath = '/changed'; supplied.ownerOrAuthorName = 'Changed';
      if (environment.extensionName !== 'configured' || environment.commandName !== 'stable' || environment.commandMode !== 'view' || environment.assetsPath !== '/owned/assets' || environment.supportPath !== '/owned/state/configured.support' || environment.ownerOrAuthorName !== '  Étude 李 🙂  ') throw Error('Environment retained a mutable provider object');
      const good = { extensionName: 'configured', entryPointName: 'stable', entryPointMode: 'view', assetsPath: '/owned/assets', supportPath: '/owned/state/configured.support', ownerOrAuthorName: '  Étude 李 🙂  ' };
      const invalidPaths = [null, false, 3, {}, [], '', 'relative/assets', '/owned\\0assets', '/' + 'x'.repeat(4096), '/' + '🙂'.repeat(1024)];
      for (const invalid of [null, {}, { ...good, extensionName: '' }, { ...good, extensionName: 1 }, { ...good, extensionName: 'x'.repeat(129) },
        { ...good, entryPointName: '' }, { ...good, entryPointName: null }, { ...good, entryPointName: 'x'.repeat(129) }, { ...good, entryPointMode: 'tool' },
        ...invalidPaths.flatMap(path => [{ ...good, assetsPath: path }, { ...good, supportPath: path }])]) {
        let rejected = false; try { configureCompatibility({ ...base, cache: () => ({ get: () => 'replaced' }), environment: invalid }); } catch (error) { rejected = /Invalid command environment/.test(String(error)); }
        if (!rejected) throw Error('Malformed environment provider was accepted: ' + JSON.stringify(invalid));
        if (environment.extensionName !== 'configured' || environment.commandName !== 'stable' || environment.entryPointType !== 'command' || environment.assetsPath !== good.assetsPath || environment.supportPath !== good.supportPath || environment.ownerOrAuthorName !== good.ownerOrAuthorName || new Cache().get('key') !== 'kept') throw Error('Rejected environment replaced active compatibility');
      }
      const invalidCreators = [null, false, 3, {}, [], new String('Ada'), Symbol('Ada'), '', '   ', '\\u00a0\\u2003', '\\ud800', '\\udfff', 'Name\\0', 'Name\\u007f', 'Name\\u0085', 'x'.repeat(1025), '🙂'.repeat(257), '李'.repeat(342)];
      let invoked = false;
      const accessor = Object.defineProperty({ ...good }, 'ownerOrAuthorName', { enumerable: true, get() { invoked = true; throw Error('Creator getter must not run'); } });
      const setter = Object.defineProperty({ ...good }, 'ownerOrAuthorName', { set() { invoked = true; } });
      const beforeSpread = Object.defineProperty({ ...good, ownerOrAuthorName: '' }, 'extensionName', { enumerable: true, get() { invoked = true; throw Error('Spread must not run before rejecting creator'); } });
      for (const invalid of [...invalidCreators.map(ownerOrAuthorName => ({ ...good, ownerOrAuthorName })), accessor, setter, beforeSpread]) {
        let rejected = false; try { configureCompatibility({ ...base, cache: () => ({ get: () => 'replaced' }), environment: invalid }); } catch (error) { rejected = /Invalid command environment/.test(String(error)); }
        if (!rejected || invoked || environment.ownerOrAuthorName !== good.ownerOrAuthorName || new Cache().get('key') !== 'kept') throw Error('Rejected creator changed active capability or invoked an accessor');
      }
      for (const ownerOrAuthorName of ['x'.repeat(1024), '🙂'.repeat(256), '李'.repeat(341) + 'x']) {
        configureCompatibility({ ...base, environment: { ...good, ownerOrAuthorName } });
        if (environment.ownerOrAuthorName !== ownerOrAuthorName) throw Error('Creator byte boundary changed valid text');
      }
      const { ownerOrAuthorName: ignored, ...withoutCreator } = good;
      const inherited = Object.assign(Object.create({ ownerOrAuthorName: 'Inherited Creator' }), withoutCreator);
      for (const provider of [withoutCreator, { ...good, ownerOrAuthorName: undefined }, inherited]) {
        configureCompatibility({ ...base, environment: provider });
        let rejected = false; try { environment.ownerOrAuthorName; } catch (error) { rejected = /environment.ownerOrAuthorName is not admitted/.test(String(error)); }
        if (!rejected || environment.extensionName !== 'configured') throw Error('Missing creator was invented or blocked legacy identity');
      }
      const nonenumerable = Object.defineProperty({ ...withoutCreator }, 'ownerOrAuthorName', { value: good.ownerOrAuthorName });
      configureCompatibility({ ...base, environment: nonenumerable });
      if (environment.ownerOrAuthorName !== good.ownerOrAuthorName) throw Error('Own nonenumerable creator was lost');
      configureCompatibility({ ...base, environment: { extensionName: 'legacy', entryPointName: 'stable', entryPointMode: 'view' } });
      for (const key of ['assetsPath', 'supportPath', 'ownerOrAuthorName']) {
        let rejected = false; try { environment[key]; } catch (error) { rejected = /not admitted by this capability/.test(String(error)); }
        if (!rejected) throw Error('Legacy provider invented an owned path');
      }
      return React.createElement(List, null, React.createElement(List.Item, { title: 'Missing and Invalid Providers Rejected' }));
    };
  `)
  const selected = install.prepare(folder, 'browse'); install.approve(selected.digest); install.enable()
  const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid)
  await opening
  assert.ok(JSON.stringify(messages.find(message => message.type === 'ready')?.root).includes('Missing and Invalid Providers Rejected'), JSON.stringify({ errors, messages }))
  assert.deepEqual(errors, [])
})

test('owner or author admits only valid declared metadata while non-reading commands still start', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-owner-author-admission-')), runtime = join(root, 'host'), groups = new Set<number>(), managers: UserRaycastManager[] = []
  t.after(async () => { for (const manager of managers) await manager.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/); t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime)
  const cases: Array<{ declared: object; expected?: string }> = [
    { declared: { author: '  Author 李 🙂  ' }, expected: '  Author 李 🙂  ' },
    { declared: {} }, { declared: { owner: null, author: 'No Fallback' } },
    { declared: { owner: { name: 'No Coercion' }, author: 'No Fallback' } },
    { declared: { owner: '   ', author: 'No Fallback' } }, { declared: { owner: 'Name\u0085', author: 'No Fallback' } },
    { declared: { owner: '\ud800', author: 'No Fallback' } },
    { declared: { owner: 'x'.repeat(1024) }, expected: 'x'.repeat(1024) },
    { declared: { author: '🙂'.repeat(256) }, expected: '🙂'.repeat(256) },
    { declared: { owner: '李'.repeat(341) + 'x' }, expected: '李'.repeat(341) + 'x' },
    { declared: { owner: 'x'.repeat(1025), author: 'No Fallback' } },
    { declared: { author: '🙂'.repeat(257) } }, { declared: { author: '李'.repeat(342) } },
  ]
  for (const [index, entry] of cases.entries()) {
    const folder = join(root, `case-${index}`, 'source'), installed = join(root, `case-${index}`, 'installed'); mkdirSync(folder, { recursive: true })
    const install = new UserRaycastInstall(installed), messages: UserRaycastMessage[] = []
    const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) } }); managers.push(manager)
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: `creator-case-${index}`, title: 'Never a Creator Fallback', ...entry.declared, commands: ['browse', 'ignore'].map(name => ({ name, mode: 'view' })) }))
    writeFileSync(join(folder, 'browse.js'), `
      const React = require('react'), { List, environment } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
      let answer; try { answer = { value: environment.ownerOrAuthorName }; } catch (error) { if (!/environment.ownerOrAuthorName is not admitted by this capability/.test(String(error))) throw error; answer = { unavailable: true }; }
      exports.default = () => React.createElement(List, null, React.createElement(List.Item, { title: JSON.stringify(answer) }));
    `)
    writeFileSync(join(folder, 'ignore.js'), `const React = require('react'), { List, environment } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); }; const identity = environment.extensionName; exports.default = () => React.createElement(List, null, React.createElement(List.Item, { title: identity }));`)
    for (const command of entry.expected === undefined ? ['browse', 'ignore'] : ['browse']) {
      const selected = install.prepare(folder, command); install.approve(selected.digest); install.enable(); messages.length = 0
      const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
      const item = (messages.find(message => message.type === 'ready')!.root as any).children[0].children.find((node: any) => node.type === 'raycast-list-item')
      if (command === 'ignore') assert.equal(item.props.title, `creator-case-${index}`)
      else assert.deepEqual(JSON.parse(item.props.title), entry.expected === undefined ? { unavailable: true } : { value: entry.expected }, `Manifest creator case ${index}`)
      await manager.close()
    }
  }
})

test('owner or author follows approved snapshot updates and rollback without persisted metadata or storage writes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-owner-author-snapshot-')), runtime = join(root, 'host'), folder = join(root, 'source'), installed = join(root, 'installed'), groups = new Set<number>()
  const install = new UserRaycastInstall(installed), messages: UserRaycastMessage[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) } })
  t.after(async () => { await manager.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/); t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime); mkdirSync(folder)
  const manifest = { name: 'creator-snapshot', title: 'Never the Creator', owner: '  Original 李 🙂  ', author: 'Ignored Author', commands: [{ name: 'browse', mode: 'view' }] }
  writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(folder, 'browse.js'), `
    const React = require('react'), { List, environment } = require('@raycast/api'), fs = require('node:fs'), path = require('node:path'); global.fetch = () => { throw Error('Network prohibited'); };
    const imported = environment.ownerOrAuthorName;
    const privateManifest = path.join(__dirname, 'package.json'), manifest = JSON.parse(fs.readFileSync(privateManifest, 'utf8'));
    manifest.owner = 'Changed After Import'; fs.writeFileSync(privateManifest, JSON.stringify(manifest)); process.env.TOCKTEAM_USER_RAYCAST_OWNER_OR_AUTHOR_NAME = 'Changed Ambient Name';
    exports.default = () => React.createElement(List, null, React.createElement(List.Item, { title: JSON.stringify({ imported, current: environment.ownerOrAuthorName, assetsPath: environment.assetsPath, supportPath: environment.supportPath }) }));
  `)
  const original = install.prepare(folder, 'browse'); install.approve(original.digest); install.enable()
  const selectionPath = join(installed, 'current', 'selection.json'), selectionKeys = Object.keys(JSON.parse(readFileSync(selectionPath, 'utf8'))).sort()
  for (const record of [original, JSON.parse(readFileSync(selectionPath, 'utf8'))]) for (const key of ['owner', 'author', 'ownerOrAuthorName']) assert.equal(Object.hasOwn(record, key), false)
  const state = install.statePath(manifest.name), raw = Buffer.from('{ "legacy": "Kept Exactly" }\n'), typedPath = `${state}.local-storage.v1.json`, typed = Buffer.from('{ "version": 1, "values": { "typed": 7, "empty": "" } }\n')
  writeFileSync(state, raw); writeFileSync(typedPath, typed)
  let originalAssets: string | undefined, supportPath: string | undefined
  for (const step of ['first', 'cold-open', 'unapproved-edit', 'update', 'rollback']) {
    let expected = manifest.owner
    if (step === 'unapproved-edit') writeFileSync(join(folder, 'package.json'), JSON.stringify({ ...manifest, owner: 'Unapproved Live Source Name' }))
    if (step === 'update') {
      expected = '  Updated Étude  '; writeFileSync(join(folder, 'package.json'), JSON.stringify({ ...manifest, owner: expected }))
      const updated = install.prepare(folder, 'browse'); assert.notEqual(updated.digest, original.digest); install.approve(updated.digest); install.enable()
    } else if (step === 'rollback') { install.recoverPrevious(); install.enable(); assert.equal(install.status().digest, original.digest) }
    messages.length = 0
    const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
    const item = (messages.find(message => message.type === 'ready')!.root as any).children[0].children.find((node: any) => node.type === 'raycast-list-item'), answer = JSON.parse(item.props.title)
    assert.equal(answer.imported, expected, step); assert.equal(answer.current, expected, step)
    if (originalAssets) assert.notEqual(answer.assetsPath, originalAssets); originalAssets = answer.assetsPath
    if (supportPath) assert.equal(answer.supportPath, supportPath); supportPath = answer.supportPath
    assert.deepEqual(readFileSync(state), raw); assert.deepEqual(readFileSync(typedPath), typed)
    const selection = JSON.parse(readFileSync(selectionPath, 'utf8')); assert.deepEqual(Object.keys(selection).sort(), selectionKeys)
    for (const key of ['owner', 'author', 'ownerOrAuthorName']) assert.equal(Object.hasOwn(selection, key), false)
    await manager.close()
  }
})

test('selected extension reads approved asset files and writes its own stable save folder', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-owned-environment-paths-')), runtime = join(root, 'host'), folder = join(root, 'source'), installed = join(root, 'installed')
  const install = new UserRaycastInstall(installed), messages: UserRaycastMessage[] = [], errors: string[] = [], groups = new Set<number>()
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact,
    onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) }, onError: (_owner, error) => errors.push(error.message),
    copyText: async () => { throw Error('Native effects prohibited') },
  })
  t.after(async () => {
    await manager.close()
    for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`)
    rmSync(root, { recursive: true, force: true })
  })
  await buildUserRaycast(runtime); mkdirSync(join(folder, 'assets'), { recursive: true })
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'owned-files', title: 'Offline Owned Files Fixture', commands: [{ name: 'browse', mode: 'view' }] }))
  writeFileSync(join(folder, 'assets/reviewed.txt'), 'Included in the approved snapshot')
  writeFileSync(join(folder, 'browse.js'), `
    const React = require('react'), { List, Action, ActionPanel, environment } = require('@raycast/api');
    const fs = require('node:fs'), path = require('node:path'); global.fetch = () => { throw Error('Network prohibited'); };
    const imported = { assetsPath: environment.assetsPath, supportPath: environment.supportPath };
    process.env.TOCKTEAM_USER_RAYCAST_ASSETS = '/not-the-approved-snapshot'; process.env.TOCKTEAM_USER_RAYCAST_SUPPORT = '/not-the-owned-folder';
    exports.default = function Command() {
      const [answer, setAnswer] = React.useState('Ready');
      return React.createElement(List, { actions: React.createElement(ActionPanel, null, React.createElement(Action, { title: 'Use Owned Files', onAction: () => {
        const current = { assetsPath: environment.assetsPath, supportPath: environment.supportPath };
        if (typeof imported.assetsPath !== 'string' || typeof imported.supportPath !== 'string') throw Error('Owned SDK asset and support paths were not supplied');
        if (!Object.isFrozen(environment) || JSON.stringify(current) !== JSON.stringify(imported) || Reflect.set(environment, 'supportPath', '/wrong') !== false || !path.isAbsolute(current.assetsPath) || !path.isAbsolute(current.supportPath)) throw Error('Owned SDK paths were not immutable absolute startup data');
        if (fs.realpathSync(current.assetsPath) !== path.join(fs.realpathSync(__dirname), 'assets')) throw Error('Assets did not come from the private approved snapshot');
        const included = fs.readFileSync(path.join(current.assetsPath, 'reviewed.txt'), 'utf8');
        const savedPath = path.join(current.supportPath, 'saved.txt'), previous = fs.existsSync(savedPath) ? fs.readFileSync(savedPath, 'utf8') : null;
        if (previous === null) fs.writeFileSync(savedPath, 'Saved by the approved fixture', { flag: 'wx' });
        setAnswer(JSON.stringify({ ...current, included, previous, saved: fs.readFileSync(savedPath, 'utf8') }));
      } })) }, React.createElement(List.Item, { title: answer }));
    };
  `)
  const selected = install.prepare(folder, 'browse'); install.approve(selected.digest); install.enable()
  const state = install.statePath(selected.extensionId), before = Buffer.from('{"legacy":"kept exactly"}'); writeFileSync(state, before)
  const approved = readFileSync(join(installed, 'current/browse.js')), nodes = (node: any): any[] => [node, ...node.children.flatMap((child: unknown) => typeof child === 'string' ? [] : nodes(child))]
  const support = join(realpathSync(installed), 'state', `${selected.extensionId}.support`)
  let previousAssets: string | undefined
  for (const step of ['first', 'cold-reopen', 'update', 'rollback'] as const) {
    if (step === 'update') {
      const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')); manifest.version = '2.0.0'; writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
      const next = install.prepare(folder, 'browse'); assert.notEqual(next.digest, selected.digest); install.approve(next.digest); install.enable()
    } else if (step === 'rollback') { install.recoverPrevious(); install.enable(); assert.equal(install.status().digest, selected.digest) }
    messages.length = 0; errors.length = 0
    const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
    const ready = messages.find(message => message.type === 'ready')!; assert.ok(ready, JSON.stringify({ errors, messages }))
    const eventId = nodes(ready.root).find(node => node.props.title === 'Use Owned Files').props.actionEventId
    manager.send(owner, { kind: 'action', eventId, revision: ready.revision, sessionId: ready.sessionId })
    const deadline = Date.now() + 3000, owns = (message: UserRaycastMessage): boolean => message.type === 'outcome' && message.extensionId === ready.extensionId && message.sessionId === ready.sessionId && message.revision === ready.revision && message.eventId === eventId
    while (!messages.some(owns) && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    const outcome = messages.find(owns); t.diagnostic(`Owned-file ${step} result: ${JSON.stringify(outcome)}`)
    assert.equal(outcome?.succeeded, true, JSON.stringify({ errors, outcome }))
    const projected = messages.filter(message => message.type === 'ready' || message.type === 'patch').at(-1)!, answer = JSON.parse(nodes(projected.root).find(node => node.type === 'raycast-list-item').props.title)
    assert.deepEqual(answer, { assetsPath: answer.assetsPath, supportPath: support, included: 'Included in the approved snapshot', previous: step === 'first' ? null : 'Saved by the approved fixture', saved: 'Saved by the approved fixture' })
    assert.notEqual(answer.assetsPath, join(folder, 'assets')); if (previousAssets) assert.notEqual(answer.assetsPath, previousAssets); previousAssets = answer.assetsPath
    assert.equal(lstatSync(support).isDirectory(), true); assert.equal(lstatSync(support).mode & 0o777, 0o700)
    assert.equal(readFileSync(join(support, 'saved.txt'), 'utf8'), 'Saved by the approved fixture'); assert.deepEqual(readFileSync(state), before)
    assert.deepEqual(readFileSync(join(installed, 'current/browse.js')), approved); assert.equal(existsSync(join(installed, 'current/assets/reviewed.txt')), true); assert.deepEqual(errors, [])
    await manager.close()
  }
})

test('a missing assets folder stays an absent absolute locator without changing the approved snapshot', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-missing-assets-')), runtime = join(root, 'host'), folder = join(root, 'source'), installed = join(root, 'installed')
  const install = new UserRaycastInstall(installed), messages: UserRaycastMessage[] = [], groups = new Set<number>()
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: (_owner, message) => { if (manager.childPid) groups.add(manager.childPid); messages.push(message) } })
  t.after(async () => { await manager.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/); t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime); mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'missing-assets', title: 'Offline Missing Assets Fixture', commands: [{ name: 'browse', mode: 'view' }] }))
  writeFileSync(join(folder, 'browse.js'), `
    const React = require('react'), { List, environment } = require('@raycast/api'), fs = require('node:fs'), path = require('node:path');
    global.fetch = () => { throw Error('Network prohibited'); };
    const locator = environment.assetsPath;
    if (!path.isAbsolute(locator) || locator !== path.join(fs.realpathSync(__dirname), 'assets') || fs.existsSync(locator)) throw Error('Missing assets were invented or created');
    let missing = false; try { fs.readFileSync(path.join(locator, 'absent.txt')); } catch (error) { if (error.code !== 'ENOENT') throw error; missing = true; }
    exports.default = () => React.createElement(List, null, React.createElement(List.Item, { title: JSON.stringify({ locator, missing, stillAbsent: !fs.existsSync(locator) }) }));
  `)
  const selected = install.prepare(folder, 'browse'); install.approve(selected.digest); install.enable()
  const before = readFileSync(join(installed, 'current/browse.js')), opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
  const ready = messages.find(message => message.type === 'ready'); assert.ok(ready)
  const item = (ready.root as any).children[0].children.find((node: any) => node.type === 'raycast-list-item'), answer = JSON.parse(item.props.title)
  assert.deepEqual(answer, { locator: answer.locator, missing: true, stillAbsent: true }); assert.equal(existsSync(answer.locator), false)
  assert.equal(existsSync(join(folder, 'assets')), false); assert.equal(existsSync(join(installed, 'current/assets')), false); assert.deepEqual(readFileSync(join(installed, 'current/browse.js')), before)
  const support = join(realpathSync(installed), 'state/missing-assets.support'), identity = lstatSync(support).ino
  await manager.close(); assert.equal(lstatSync(support).ino, identity, 'Normal close preserves even an empty support directory')
})

test('failed child startup discards only new empty support while preserving existing and newly written data', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-support-start-failure-')), runtime = join(root, 'host'), groups = new Set<number>(), managers: UserRaycastManager[] = []
  t.after(async () => { for (const manager of managers) await manager.close(); for (const pid of groups) assert.throws(() => process.kill(-pid, 0), /ESRCH/); t.diagnostic(`Stopped owned process groups: ${[...groups].join(', ')}`); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime)
  for (const kind of ['new-empty', 'new-written', 'existing-empty', 'existing-data'] as const) {
    const folder = join(root, kind, 'source'), installed = join(root, kind, 'installed'); mkdirSync(folder, { recursive: true })
    const install = new UserRaycastInstall(installed), manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact, onMessage: () => { if (manager.childPid) groups.add(manager.childPid) } }); managers.push(manager)
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: kind, title: 'Offline Startup Failure Fixture', commands: [{ name: 'browse', mode: 'view' }] }))
    writeFileSync(join(folder, 'browse.js'), `
      const { environment } = require('@raycast/api'), fs = require('node:fs'), path = require('node:path');
      global.fetch = () => { throw Error('Network prohibited'); };
      if (${JSON.stringify(kind)} === 'new-written') fs.writeFileSync(path.join(environment.supportPath, 'new-data.txt'), 'Data written before startup failed');
      throw Error('Intentional offline startup failure');
    `)
    const selected = install.prepare(folder, 'browse'); install.approve(selected.digest); install.enable()
    const state = install.statePath(kind), before = Buffer.from('{"legacy":"Kept through startup failure"}'); writeFileSync(state, before)
    const support = join(realpathSync(installed), 'state', `${kind}.support`)
    if (kind.startsWith('existing-')) mkdirSync(support, { mode: 0o750 })
    if (kind === 'existing-data') writeFileSync(join(support, 'kept.txt'), 'Existing user data')
    const previous = existsSync(support) ? lstatSync(support) : undefined
    const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await assert.rejects(opening, /exited|start|closed/i)
    assert.equal(manager.childPid, undefined); assert.deepEqual(readFileSync(state), before)
    if (kind === 'new-empty') assert.equal(existsSync(support), false)
    else {
      assert.equal(lstatSync(support).isDirectory(), true)
      if (previous) { assert.equal(lstatSync(support).ino, previous.ino); assert.equal(lstatSync(support).mode, previous.mode) }
      if (kind === 'new-written') assert.equal(readFileSync(join(support, 'new-data.txt'), 'utf8'), 'Data written before startup failed')
      if (kind === 'existing-data') assert.equal(readFileSync(join(support, 'kept.txt'), 'utf8'), 'Existing user data')
    }
  }
})
