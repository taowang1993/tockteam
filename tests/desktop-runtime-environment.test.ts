import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  DESKTOP_AUTHORITY_ENVIRONMENT_KEYS,
  scrubDesktopAuthorityEnvironment,
} from '../src/desktop-runtime-environment.ts'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

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
})
