import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { previewRuntimeBaseEnvironment } from '../plugins/plugin-marketplace/src/host/platform.ts'
import {
  DESKTOP_AUTHORITY_ENVIRONMENT_KEYS,
  scrubDesktopAuthorityEnvironment,
} from '../src/desktop-runtime-environment.ts'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const marketplacePlatform = readFileSync(
  new URL('../plugins/plugin-marketplace/src/host/platform.ts', import.meta.url),
  'utf8',
)

test('preview base environment withholds ambient Git, GitHub, SSH, and user-home authority', () => {
  const preview = previewRuntimeBaseEnvironment({
    GH_TOKEN: 'secret',
    GITHUB_TOKEN: 'secret',
    GH_CONFIG_DIR: '/user/gh',
    GIT_CONFIG_GLOBAL: '/user/gitconfig',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: 'steal',
    HOME: '/user',
    LANG: 'en_US.UTF-8',
    SSH_AUTH_SOCK: '/user/agent.sock',
  }, '/preview-home')

  assert.deepEqual(preview, {
    HOME: '/preview-home',
    LANG: 'en_US.UTF-8',
    USERPROFILE: '/preview-home',
    XDG_CACHE_HOME: '/preview-home/.cache',
    XDG_CONFIG_HOME: '/preview-home/.config',
  })
})

test('preview and live Runtime environments never inherit native or marketplace authority', () => {
  const environment: NodeJS.ProcessEnv = {
    SAFE_VALUE: 'kept',
    DSH_MARKETPLACE_AGENT_URL: 'http://inherited',
    DSH_MARKETPLACE_AGENT_TOKEN: 'inherited-token',
  }
  for (const key of DESKTOP_AUTHORITY_ENVIRONMENT_KEYS) environment[key] = `inherited-${key}`

  scrubDesktopAuthorityEnvironment(environment, [
    'DSH_MARKETPLACE_AGENT_URL',
    'DSH_MARKETPLACE_AGENT_TOKEN',
  ])

  assert.equal(environment.SAFE_VALUE, 'kept')
  for (const key of DESKTOP_AUTHORITY_ENVIRONMENT_KEYS) assert.equal(environment[key], undefined)
  assert.equal(environment.DSH_MARKETPLACE_AGENT_URL, undefined)
  assert.equal(environment.DSH_MARKETPLACE_AGENT_TOKEN, undefined)
})

test('Runtime environment scrubs inherited authority before selecting owned live channels', () => {
  const scrub = main.indexOf('scrubDesktopAuthorityEnvironment(environment')
  const reveal = main.indexOf("const reveal = overrides.preview === undefined")
  assert.ok(scrub > 0)
  assert.ok(reveal > scrub)
  assert.match(main, /scrubDesktopAuthorityEnvironment\(environment, \[MARKETPLACE_AGENT_URL_ENV, MARKETPLACE_AGENT_TOKEN_ENV\]\)/u)
  assert.match(main, /return overrides\.preview === undefined\s+\? withGitHubCredentials[\s\S]*?: environment/u)
  assert.match(main, /overrides\.preview === undefined\s+\? process\.env\s+: previewRuntimeBaseEnvironment/u)
  assert.equal((marketplacePlatform.match(/\.\.\.previewRuntimeBaseEnvironment\(this\.#options\.env, input\.sandboxRoot\)/g) ?? []).length, 2)
})
