import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { UserRaycastManager, type UserRaycastMessage } from '../src/user-raycast-manager.ts'

const owner = { webContentsId: 17 }, artifact = resolve('plugins/trusted-raycast/vendor/google-translate.tar')

for (const mode of ['view', 'no-view', 'menu-bar'] as const) test(`selected ${mode} manual commands receive matching truthful SDK and top-level launch information`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-launch-props-')), runtime = join(root, 'host'), folder = join(root, 'source')
  const install = new UserRaycastInstall(join(root, 'installed')), messages: UserRaycastMessage[] = [], errors: string[] = [], groups = new Set<number>()
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
  await buildUserRaycast(runtime); mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'launch-info', title: 'Offline Launch Fixture', commands: [{ name: 'run', mode }] }))
  if (mode === 'menu-bar') writeFileSync(join(folder, 'icon.png'), readFileSync(resolve('assets/icon.png')))
  writeFileSync(join(folder, 'run.js'), `
    const React = require('react'), { List, MenuBarExtra, LaunchType, environment, showHUD } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
    const importedType = environment.launchType;
    process.env.TOCKTEAM_USER_RAYCAST_MODE = 'no-view'; process.env.TOCKTEAM_USER_RAYCAST_LAUNCH_TYPE = 'background';
    exports.default = function Command(props) {
      if (!LaunchType || LaunchType.UserInitiated !== 'userInitiated' || LaunchType.Background !== 'background' || importedType !== LaunchType.UserInitiated) throw Error('Missing truthful SDK launch type');
      if (props.launchType !== importedType || environment.launchType !== importedType || props.arguments === undefined || Object.keys(props.arguments).length) throw Error('Missing matching launch props: ' + JSON.stringify(props));
      if (props.launchContext !== undefined || props.fallbackText !== undefined || props.draftValues !== undefined) throw Error('Invented launch context');
      const title = JSON.stringify({ launchType: environment.launchType, propType: props.launchType, arguments: props.arguments });
      if (${JSON.stringify(mode)} === 'no-view') return showHUD(title);
      const Container = ${JSON.stringify(mode)} === 'menu-bar' ? MenuBarExtra : List;
      return React.createElement(Container, null, React.createElement(Container.Item, { title }));
    };
  `)
  const candidate = install.prepare(folder, 'run'); install.approve(candidate.digest); install.enable()
  for (let attempt = 0; attempt < 2; attempt++) {
    messages.length = 0; errors.length = 0
    const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
    const title = JSON.stringify({ launchType: 'userInitiated', propType: 'userInitiated', arguments: {} })
    if (mode === 'no-view') {
      const deadline = Date.now() + 3000
      while (!messages.some(message => message.type === 'outcome') && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(messages.find(message => message.type === 'outcome')?.succeeded, true, JSON.stringify({ errors, messages }))
      assert.equal(messages.find(message => message.type === 'toast')?.title, title)
    } else assert.ok(JSON.stringify(messages.find(message => message.type === 'ready')?.root).includes(JSON.stringify(title)), JSON.stringify({ errors, messages }))
    assert.deepEqual(errors, [])
    await manager.close()
  }
})

test('SDK launch metadata rejects unsupported and malformed providers without replacing active capability state', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-launch-provider-')), runtime = join(root, 'host'), folder = join(root, 'source')
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
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'launch-provider', title: 'Offline Provider Fixture', commands: [{ name: 'run', mode: 'view' }] }))
  writeFileSync(join(folder, 'run.js'), `
    const React = require('react'), { List, Cache, environment, LaunchType, configureCompatibility } = require('@raycast/api'); global.fetch = () => { throw Error('Network prohibited'); };
    exports.default = function Command() {
      const identity = { extensionName: 'configured', entryPointName: 'stable', entryPointMode: 'view' };
      const base = { native: async () => { throw Error('Native prohibited'); }, selection: async () => '', toast: () => {},
        cache: () => ({ get: () => 'kept', set: () => {}, remove: () => false, clear: () => {}, subscribe: () => () => {} }) };
      for (const provider of [base, { ...base, environment: identity }]) {
        configureCompatibility(provider);
        let rejected = false; try { environment.launchType; } catch (error) { rejected = /environment.launchType is not admitted/.test(String(error)); }
        if (!rejected) throw Error('Missing launch type reported compatibility');
      }
      for (const launchType of [LaunchType.UserInitiated, LaunchType.Background]) {
        const supplied = { ...identity, launchType }; configureCompatibility({ ...base, environment: supplied }); supplied.launchType = 'changed';
        if (environment.launchType !== launchType || environment.commandName !== 'stable') throw Error('Mutable launch snapshot');
        for (const invalid of [null, '', 1, 'manual', 'view', {}, []]) {
          let rejected = false; try { configureCompatibility({ ...base, cache: () => ({ get: () => 'replaced' }), environment: { ...identity, launchType: invalid } }); } catch (error) { rejected = /Invalid command environment/.test(String(error)); }
          if (!rejected || environment.launchType !== launchType || new Cache().get('key') !== 'kept') throw Error('Invalid launch metadata replaced active provider');
        }
      }
      return React.createElement(List, null, React.createElement(List.Item, { title: 'Launch Providers Validated' }));
    };
  `)
  const candidate = install.prepare(folder, 'run'); install.approve(candidate.digest); install.enable()
  const opening = manager.start(owner); if (manager.childPid) groups.add(manager.childPid); await opening
  assert.ok(JSON.stringify(messages.find(message => message.type === 'ready')?.root).includes('Launch Providers Validated'), JSON.stringify({ errors, messages }))
  assert.deepEqual(errors, [])
})
