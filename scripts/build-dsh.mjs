import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { resolveDshSource, resolvePinnedPnpm } from './dsh-source.mjs'

const { kind, path: dshSource } = resolveDshSource()

// npm releases already contain the compiled CLI and Web assets.
if (kind === 'npm') {
  console.log('Using the prebuilt DSH npm assembly; skipping source build')
  process.exit(0)
}

const pnpm = resolvePinnedPnpm()

/** Keep nested DSH build commands on the integrity-pinned pnpm version. */
function pinInnerPnpm() {
  const binDir = join(dshSource, 'node_modules', '.bin')
  mkdirSync(binDir, { recursive: true })
  if (process.platform === 'win32') {
    writeFileSync(join(binDir, 'pnpm.cmd'),
      `@"${process.execPath}" "${pnpm.cliEntry}" %*\r\n`)
  } else {
    const launcher = join(binDir, 'pnpm')
    writeFileSync(launcher,
      `#!/bin/sh\nexec "${process.execPath}" "${pnpm.cliEntry}" "$@"\n`)
    chmodSync(launcher, 0o755)
  }
}

function run(args) {
  const result = spawnSync(process.execPath, [pnpm.cliEntry, ...args], {
    cwd: dshSource,
    env: {
      ...process.env,
      PATH: `${pnpm.binDir}${delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

run(['install', '--frozen-lockfile'])
pinInnerPnpm()
run(['run', 'build'])
