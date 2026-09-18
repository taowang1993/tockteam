import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { parseLaunchArgs } from '../src/web.ts'
import { parseTuiArgs } from '../src/tui.ts'

for (const surface of ['web', 'tui'] as const) {
  test(`${surface} accepts legacy launch variables below current variables and flags`, () => {
    const parse = (args: string[], env: NodeJS.ProcessEnv) => surface === 'web'
      ? parseLaunchArgs(args, env, false, '/default')
      : parseTuiArgs(args, env, '/workspace', '/default')
    const prefix = surface.toUpperCase()
    assert.equal(parse([], { [`DSH_OH_${prefix}_HOME`]: '/legacy' }).dataRoot, '/legacy')
    assert.equal(parse([], { [`DSH_OH_${prefix}_HOME`]: '/legacy', [`TOCKTEAM_${prefix}_HOME`]: '/current' }).dataRoot, '/current')
    assert.equal(parse(['--data', '/flag'], { [`DSH_OH_${prefix}_HOME`]: '/legacy', [`TOCKTEAM_${prefix}_HOME`]: '/current' }).dataRoot, '/flag')
  })

  for (const scenario of ['recover', 'broken', 'explicit', 'legacy override'] as const) {
    test(`${surface} startup ${scenario} preserves legacy and destination state`, t => {
      const home = mkdtempSync(join(tmpdir(), 'tockteam-recovery-'))
      t.after(() => rmSync(home, { recursive: true, force: true }))
      const legacy = join(home, surface === 'web' ? '.oh-dsh-web' : '.ohdsh')
      const destination = join(home, surface === 'web' ? '.tockteam-web' : '.tockteam')
      const dshSuffix = surface === 'web' ? 'dsh' : ''
      const write = (path: string, text: string) => {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, text)
      }
      write(join(legacy, dshSuffix, 'sessions', 'legacy.jsonl'), 'legacy')
      write(join(legacy, dshSuffix, 'settings.yaml'), 'old')
      write(join(destination, dshSuffix, 'settings.yaml'), 'current')
      if (scenario === 'broken') symlinkSync(join(home, 'missing'), join(legacy, 'broken'), 'junction')
      const packaged = join(home, 'package')
      write(join(packaged, 'node-runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node'), '')
      write(join(packaged, 'dsh-runtime/lib/bin.js'), '')
      const explicit = scenario === 'explicit' || scenario === 'legacy override'
      const args = scenario === 'explicit' ? ['--data', join(home, 'isolated')] : []
      const env = {
        [`TOCKTEAM_${surface.toUpperCase()}_ROOT`]: packaged,
        ...(scenario === 'legacy override' ? { [`DSH_OH_${surface.toUpperCase()}_HOME`]: join(home, 'isolated') } : {}),
      }
      const script = `
        const { main } = await import(${JSON.stringify(pathToFileURL(resolve(`src/${surface}.ts`)).href)});
        const output = { isTTY: true, write() {} };
        try {
          await main(${JSON.stringify(args)}, ${JSON.stringify(env)}, output,
            ${surface === 'web' ? '() => { throw new Error("REACHED_RUNTIME") }' : 'output, () => { throw new Error("REACHED_RUNTIME") }, { isTTY: true }'});
        } catch (error) { process.stdout.write(error.message); }
      `
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: home,
        env: { ...process.env, HOME: home, USERPROFILE: home },
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(readFileSync(join(legacy, dshSuffix, 'sessions', 'legacy.jsonl'), 'utf8'), 'legacy')
      assert.equal(readFileSync(join(destination, dshSuffix, 'settings.yaml'), 'utf8'), 'current')
      if (scenario === 'broken') {
        assert.match(result.stdout, /migration is incomplete/)
        assert.equal(existsSync(join(destination, dshSuffix, 'profiles')), false)
        assert.equal(existsSync(join(destination, '.migrations', `${surface}-state-v1.complete`)), false)
      } else {
        assert.equal(result.stdout, 'REACHED_RUNTIME', result.stderr)
        assert.equal(existsSync(join(destination, dshSuffix, 'sessions', 'legacy.jsonl')), !explicit)
        assert.equal(existsSync(join(destination, '.migrations', `${surface}-state-v1.complete`)), !explicit)
      }
    })
  }
}

test('legacy non-home launch settings retain current-variable precedence', () => {
  const web = parseLaunchArgs([], { DSH_OH_WEB_PORT: '4000', DSH_OH_WEB_HOST: 'localhost', DSH_OH_WEB_OPEN: '1' }, false, '/default')
  assert.equal(web.port, 4000)
  assert.equal(web.host, 'localhost')
  assert.equal(web.open, true)
  assert.equal(parseLaunchArgs([], { DSH_OH_WEB_PORT: 'invalid', TOCKTEAM_WEB_PORT: '4001' }, false, '/default').port, 4001)
  const tui = parseTuiArgs([], { DSH_OH_TUI_LANG: 'zh', DSH_OH_TUI_PRESET: 'old', DSH_OH_TUI_SESSION_ID: 'session', DSH_OH_TUI_CWD: '/old', DSH_OH_TUI_FULLSCREEN: '0' })
  assert.equal(tui.lang, 'zh')
  assert.equal(tui.preset, 'old')
  assert.equal(tui.sessionId, 'session')
  assert.equal(tui.cwd, '/old')
  assert.equal(tui.fullscreen, false)
})
