import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      for (const key of ['extensionName', 'entryPointName', 'entryPointType', 'entryPointMode', 'commandName', 'commandMode']) {
        let rejected = false; try { environment[key]; } catch (error) { rejected = /not admitted by this capability/.test(String(error)); }
        if (!rejected) throw Error('Missing environment provider reported success for ' + key);
      }
      const supplied = { extensionName: 'configured', entryPointName: 'stable', entryPointMode: 'view' };
      configureCompatibility({ ...base, environment: supplied });
      supplied.extensionName = 'changed'; supplied.entryPointName = 'changed'; supplied.entryPointMode = 'no-view';
      if (environment.extensionName !== 'configured' || environment.commandName !== 'stable' || environment.commandMode !== 'view') throw Error('Environment retained a mutable provider object');
      const good = { extensionName: 'configured', entryPointName: 'stable', entryPointMode: 'view' };
      for (const invalid of [null, {}, { ...good, extensionName: '' }, { ...good, extensionName: 1 }, { ...good, extensionName: 'x'.repeat(129) },
        { ...good, entryPointName: '' }, { ...good, entryPointName: null }, { ...good, entryPointName: 'x'.repeat(129) }, { ...good, entryPointMode: 'tool' }]) {
        let rejected = false; try { configureCompatibility({ ...base, cache: () => ({ get: () => 'replaced' }), environment: invalid }); } catch (error) { rejected = /Invalid command environment/.test(String(error)); }
        if (!rejected) throw Error('Malformed environment provider was accepted: ' + JSON.stringify(invalid));
        if (environment.extensionName !== 'configured' || environment.commandName !== 'stable' || environment.entryPointType !== 'command' || new Cache().get('key') !== 'kept') throw Error('Rejected environment replaced active compatibility');
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
