import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

test('custom browser startup rejects a grant replaced by a FIFO without waiting for a writer', { skip: process.platform === 'win32' }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'launcher-browser-fifo-')))
  const parent = join(root, 'launcher')
  const grant = join(parent, 'custom-browser-grant.json')
  const originalBytes = '{"version":1}'
  mkdirSync(parent)
  writeFileSync(grant, originalBytes)
  const moduleUrl = pathToFileURL(resolve('src/launcher-custom-browser.ts')).href
  const script = `
    import assert from 'node:assert/strict'
    import { spawnSync } from 'node:child_process'
    import fs from 'node:fs/promises'
    import { syncBuiltinESMExports } from 'node:module'
    import { join } from 'node:path'
    const root = process.argv[1]
    const grant = join(root, 'launcher', 'custom-browser-grant.json')
    const originalLstat = fs.lstat
    let replaced = false
    fs.lstat = async (...args) => {
      const selected = await originalLstat(...args)
      if (String(args[0]) === grant && !replaced) {
        replaced = true
        await fs.rename(grant, grant + '.original')
        assert.equal(spawnSync('/usr/bin/mkfifo', [grant]).status, 0)
      }
      return selected
    }
    syncBuiltinESMExports()
    const { LauncherCustomBrowserController } = await import(${JSON.stringify(moduleUrl)})
    const controller = await LauncherCustomBrowserController.open({
      getSetting: (_key, fallback) => fallback,
      launch: () => { throw new Error('unexpected browser launch') },
      openDefault: () => { throw new Error('unexpected browser launch') },
      platform: 'macOS',
      userDataPath: root,
    })
    assert.equal(replaced, true)
    assert.deepEqual(controller.snapshot(), { platform: 'macOS', status: 'revoked' })
    await controller.close()
    assert.equal((await originalLstat(grant)).isFIFO(), true)
  `
  try {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], {
      timeout: 2_000,
      killSignal: 'SIGKILL',
    })
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
    assert.equal(child.status, 0, child.error?.message ?? child.stderr.toString())
    assert.equal(readFileSync(`${grant}.original`, 'utf8'), originalBytes)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
