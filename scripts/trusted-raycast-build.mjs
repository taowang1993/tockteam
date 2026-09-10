import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { admitTrustedRaycastArtifact, attestTrustedRaycastBuildIdentity } from '../src/trusted-raycast-artifact-admission.ts'
import { trustedRaycastDescriptors } from '../src/trusted-raycast-descriptors.ts'

/** Build upstream source from the same admitted bytes we ship; never install packages. */
export async function buildTrustedRaycast(dist, artifact, extensionId = 'google-translate') {
  if (!artifact) return
  const descriptor = trustedRaycastDescriptors[extensionId]
  if (!descriptor) throw new Error('Unknown trusted extension build descriptor')
  const bytes = admitTrustedRaycastArtifact(descriptor, artifact)
  // ponytail: per-process work dir (parallel test files) plus comment normalization keeps rebuilds byte-identical.
  const work = join(tmpdir(), `tockteam-raycast-build-work-${process.pid}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    execFileSync('/usr/bin/tar', ['xf', '-', '-C', work], { input: bytes, timeout: 15000 })
    const source = join(work, descriptor.artifactRoot, 'source')
    const output = join(dist, descriptor.extensionId === 'google-translate' ? 'trusted-raycast' : 'trusted-raycast-kaomoji')
    const repository = fileURLToPath(new URL('../', import.meta.url))
    const projectionSource = join(repository, 'src/trusted-raycast-projection.ts')
    const child = readFileSync(join(repository, 'src/trusted-raycast-child.ts'), 'utf8')
      .replaceAll('/tmp/trusted-raycast-source/src/translate', join(source, descriptor.sourceEntry))
      .replaceAll('/tmp/trusted-raycast-source', source)
    writeFileSync(join(work, 'child.ts'), child)
    // Only compatibility aliases are bundled; all third-party bare imports resolve in the private artifact.
    await build({ entryPoints: [join(work, 'child.ts')], outfile: join(output, 'child.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node24', alias: {
      '@tockteam/trusted-raycast-child-contract': join(repository, 'src/trusted-raycast-contract.ts'),
      '@tockteam/trusted-raycast-can-i-use-source': join(repository, 'src/trusted-raycast-can-i-use-source.ts'),
      '@tockteam/trusted-raycast-projection': projectionSource,
      '@raycast/api': join(repository, 'src/trusted-raycast-compat-api.ts'),
      '@raycast/utils': join(repository, 'src/trusted-raycast-compat-utils.ts'),
    }, logLevel: 'silent' })
    await build({ entryPoints: [join(repository, 'src/trusted-raycast-resolution.ts')], outfile: join(output, 'resolution.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent' })
    // esbuild annotates every bundled file with its path; normalize the build-work prefix so rebuilds are byte-identical.
    const emitted = readFileSync(join(output, 'child.mjs'), 'utf8').replace(/\/\/ [^\n]*tockteam-raycast-build-work-\d+\//g, '// tockteam-raycast-build-work/')
    writeFileSync(join(output, 'child.mjs'), emitted)
    mkdirSync(output, { recursive: true })
    if (descriptor.extensionId === 'google-translate') copyFileSync(join(source, 'assets', 'google-translate.png'), join(output, 'google-translate.png'))
    else copyFileSync(join(source, 'assets', 'command-icon.png'), join(output, 'kaomoji-search.png'))
    writeFileSync(join(output, 'artifact.tar'), bytes)
    const identity = { artifactSha256: descriptor.artifactSha256, childSha256: createHash('sha256').update(readFileSync(join(output, 'child.mjs'))).digest('hex'), command: descriptor.command, extensionId: descriptor.extensionId, projectionSha256: createHash('sha256').update(readFileSync(projectionSource)).digest('hex'), react: descriptor.react, reconciler: descriptor.reconciler, resolutionSha256: createHash('sha256').update(readFileSync(join(output, 'resolution.mjs'))).digest('hex') }
    writeFileSync(join(output, 'build.json'), JSON.stringify({ ...identity, metadataSha256: attestTrustedRaycastBuildIdentity(identity) }))
  } finally { rmSync(work, { recursive: true, force: true }) }
}
