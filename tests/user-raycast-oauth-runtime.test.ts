import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error First-party build helper is JavaScript.
import { buildUserRaycast } from '../scripts/user-raycast-build.mjs'
import { UserRaycastInstall } from '../src/user-raycast-install.ts'
import { isUserRaycastViewMessage } from '../src/user-raycast-contract.ts'
import { UserRaycastManager } from '../src/user-raycast-manager.ts'

test('an approved local fixture signs in by PKCE without exposing a token to the launcher', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-linear-fixture-'))
  const folder = join(root, 'fixture')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'linear', title: 'Local OAuth Fixture', commands: [{ name: 'search-issues', title: 'Search Issues', mode: 'view' }] }))
  const revoked = join(root, 'revoked.txt')
  writeFileSync(join(folder, 'search-issues.js'), `
    const React = require('react'); const { OAuth, List } = require('@raycast/api');
    global.fetch = async (url, options) => { if (url !== 'https://api.linear.app/oauth/revoke') throw Error('Unexpected network request'); require('fs').writeFileSync(${JSON.stringify(revoked)}, String(options.body), { mode: 0o600 }); return { ok: true, status: 200 } };
    const client = new OAuth.PKCEClient({ redirectMethod: OAuth.RedirectMethod.Web, providerId: 'linear', providerName: 'Linear' });
    exports.default = function Browse() {
      const [title, setTitle] = React.useState('Sign In');
      React.useEffect(() => {
        client.authorizationRequest({ endpoint: 'https://linear.app/oauth/authorize', clientId: 'public-test-client', scope: 'read', extraParameters: { actor: 'user' } })
          .then(request => client.authorize(request)).then(async ({ authorizationCode }) => {
            await client.setTokens({ access_token: 'fixture-token', scope: 'read' });
            setTitle(authorizationCode === 'fixture-code' && (await client.getTokens()).accessToken === 'fixture-token' ? 'Signed In' : 'Invalid Sign-In');
          }).catch(error => setTitle('Sign-In Error: ' + error.message));
      }, []);
      return React.createElement(List, null, React.createElement(List.Item, { title }));
    }`)
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: any[] = []
  const errors: string[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'), onMessage: (_owner, message) => messages.push(message), onError: (_owner, error) => errors.push(error.message) })
  t.after(async () => { await manager.close(); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime)
  const chosen = install.prepare(folder, 'search-issues')
  install.approve(chosen.digest); install.enable()
  await manager.start({ webContentsId: 17 })
  const deadline = Date.now() + 5000
  while (!messages.some(message => message.type === 'auth-url') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  const authMessage = messages.find(message => message.type === 'auth-url')
  assert.equal(isUserRaycastViewMessage(authMessage), true)
  assert.equal(isUserRaycastViewMessage({ ...authMessage, url: 'https://linear.oauth.raycast.com/authorize' }), false)
  const url = new URL(authMessage?.url ?? 'about:blank')
  assert.equal(url.hostname, 'linear.app')
  const callback = new URL(url.searchParams.get('redirect_uri')!)
  callback.searchParams.set('code', 'fixture-code')
  callback.searchParams.set('state', url.searchParams.get('state')!)
  assert.equal((await fetch(callback)).status, 200)
  while (!JSON.stringify(messages).includes('Signed In') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.match(JSON.stringify(messages), /Signed In/)
  assert.doesNotMatch(JSON.stringify(messages), /fixture-token/)
  await manager.close()
  assert.match(readFileSync(revoked, 'utf8'), /token=fixture-token/)
  assert.deepEqual(errors, [])
  assert.equal(await fetch(callback).then(response => response.status).catch(() => 'closed'), 'closed')
})

test('a suspended login started while rendering resumes after the owned callback', async t => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-linear-suspense-'))
  const folder = join(root, 'fixture')
  mkdirSync(folder)
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'linear', title: 'Suspended OAuth Fixture', commands: [{ name: 'search-issues', title: 'Search Issues', mode: 'view' }] }))
  writeFileSync(join(folder, 'search-issues.js'), `
    const React = require('react'); const { OAuth, List } = require('@raycast/api');
    const client = new OAuth.PKCEClient({ redirectMethod: OAuth.RedirectMethod.Web, providerId: 'linear' });
    const signedIn = client.authorizationRequest({ endpoint: 'https://linear.app/oauth/authorize', clientId: 'public-test-client', scope: 'read', extraParameters: { actor: 'user' } })
      .then(request => client.authorize(request)).then(result => result.authorizationCode === 'fixture-code' ? 'Signed In' : 'Invalid Sign-In');
    exports.default = function Browse() { return React.createElement(List, null, React.createElement(List.Item, { title: React.use(signedIn) })) }`)
  const runtime = join(root, 'host')
  const install = new UserRaycastInstall(join(root, 'installed'))
  const messages: any[] = []
  const manager = new UserRaycastManager({ install, runtime, nodePath: process.execPath, artifact: resolve('plugins/trusted-raycast/vendor/google-translate.tar'), onMessage: (_owner, message) => messages.push(message) })
  t.after(async () => { await manager.close(); rmSync(root, { recursive: true, force: true }) })
  await buildUserRaycast(runtime)
  const candidate = install.prepare(folder, 'search-issues')
  install.approve(candidate.digest); install.enable()
  await manager.start({ webContentsId: 17 })
  const deadline = Date.now() + 5000
  while (!messages.some(message => message.type === 'auth-url') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  const url = new URL(messages.find(message => message.type === 'auth-url')?.url ?? 'about:blank')
  const callback = new URL(url.searchParams.get('redirect_uri')!)
  callback.searchParams.set('code', 'fixture-code')
  callback.searchParams.set('state', url.searchParams.get('state')!)
  assert.equal((await fetch(callback)).status, 200)
  while (!JSON.stringify(messages).includes('Signed In') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.match(JSON.stringify(messages), /Signed In/)
})
