import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(process.argv[2] ?? '')
if (!output || output === root || existsSync(output)) {
  throw new Error('pack:desktop requires a new output path')
}

const work = mkdtempSync(join(tmpdir(), 'tockteam-desktop-pack-'))
try {
  execFileSync('pnpm', ['pack', '--pack-destination', work], {
    cwd: root,
    stdio: 'inherit',
  })
  const packed = join(work, 'tockteam-desktop-0.1.5.tgz')
  if (!existsSync(packed)) throw new Error(`pnpm pack did not create ${packed}`)

  execFileSync('tar', ['-xzf', packed, '-C', work])
  const packageDir = join(work, 'package')
  const manifestPath = join(packageDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  // Runtime/vault pins are app-staging inputs, not installable package
  // dependencies. The staged Desktop profile installs the retained vendor
  // artifacts explicitly; consumer installs must not resolve internal paths.
  delete manifest.dependencies
  delete manifest.devDependencies
  delete manifest.peerDependencies
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)

  execFileSync('tar', ['-czf', output, '-C', work, 'package'])
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`Retained Desktop package: ${output}`)
