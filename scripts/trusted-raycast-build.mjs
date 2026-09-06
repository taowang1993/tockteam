import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { admitTrustedRaycastArtifact, TRUSTED_RAYCAST_ARTIFACT_SHA256 } from '../src/trusted-raycast-artifact-admission.ts'

/** Build upstream source from the same admitted bytes we ship; never install packages. */
export async function buildTrustedRaycast(dist, artifact) {
  if (!artifact) return
  const bytes = admitTrustedRaycastArtifact(artifact)
  const work = mkdtempSync(join(tmpdir(), 'tockteam-raycast-build-'))
  try {
    execFileSync('/usr/bin/tar', ['xf', '-', '-C', work], { input: bytes, timeout: 15000 })
    const source = join(work, 'tockteam-raycast-artifact', 'source')
    const output = join(dist, 'trusted-raycast')
    const repository = fileURLToPath(new URL('../', import.meta.url))
    const child = readFileSync(join(repository, 'src/trusted-raycast-child.ts'), 'utf8').replace('/tmp/trusted-raycast-source', source)
    writeFileSync(join(work, 'child.ts'), child)
    // Only compatibility aliases are bundled; all third-party bare imports resolve in the private artifact.
    await build({ entryPoints: [join(work, 'child.ts')], outfile: join(output, 'child.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node24', alias: {
      '@tockteam/trusted-raycast-child-contract': join(repository, 'src/trusted-raycast-contract.ts'),
      '@raycast/api': join(repository, 'src/trusted-raycast-compat-api.ts'),
      '@raycast/utils': join(repository, 'src/trusted-raycast-compat-utils.ts'),
    }, logLevel: 'silent' })
    await build({ entryPoints: [join(repository, 'src/trusted-raycast-resolution.ts')], outfile: join(output, 'resolution.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent' })
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'artifact.tar'), bytes)
    writeFileSync(join(output, 'build.json'), JSON.stringify({ artifactSha256: TRUSTED_RAYCAST_ARTIFACT_SHA256, command: 'translate', react: '19.0.0', reconciler: '0.31.0' }))
  } finally { rmSync(work, { recursive: true, force: true }) }
}
