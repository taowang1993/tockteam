import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageName = '@tockteam/tocktutor-workbench'
const workspace = await mkdtemp(join(tmpdir(), 'tocktutor-typert-'))
const packageRoot = join(workspace, 'packages', 'workbench')

try {
  const protocolRoot = join(workspace, 'packages', 'typert-protocol')
  const modulesRoot = join(workspace, 'node_modules')
  await mkdir(join(modulesRoot, '@deepseek-ai'), { recursive: true })
  await mkdir(join(modulesRoot, '@tockteam'), { recursive: true })
  await mkdir(packageRoot, { recursive: true })
  await mkdir(protocolRoot, { recursive: true })
  await cp(join(root, 'src'), join(packageRoot, 'src'), { recursive: true })
  const pinnedProtocol = await realpath(join(root, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol'))
  await cp(join(pinnedProtocol, 'lib', 'types'), join(protocolRoot, 'src'), { recursive: true })
  await symlink(join(root, 'node_modules', '@deepseek-ai', 'cordis'), join(modulesRoot, '@deepseek-ai', 'cordis'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', '@deepseek-ai', 'dsh-api-remotes')), join(modulesRoot, '@deepseek-ai', 'dsh-api-remotes'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots')), join(modulesRoot, '@deepseek-ai', 'dsh-client-ui-slots'), 'dir')
  await symlink(protocolRoot, join(modulesRoot, '@deepseek-ai', 'dsh-typert-protocol'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', '@tockteam', 'desktop')), join(modulesRoot, '@tockteam', 'desktop'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', '@tockteam', 'ui')), join(modulesRoot, '@tockteam', 'ui'), 'dir')
  await symlink(join(root, 'node_modules', '@types'), join(modulesRoot, '@types'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', 'lucide-react')), join(modulesRoot, 'lucide-react'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', 'react')), join(modulesRoot, 'react'), 'dir')
  await symlink(await realpath(join(root, 'node_modules', 'tockbot-note-runtime')), join(modulesRoot, 'tockbot-note-runtime'), 'dir')
  await symlink(join(root, 'node_modules', 'undici-types'), join(modulesRoot, 'undici-types'), 'dir')

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  manifest.exports = {
    '.': './src/index.ts',
    './client': './src/client.ts',
    './types': './src/types.ts',
    './remote': './remote-stub.d.ts',
    './package.json': './package.json',
  }
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(protocolRoot, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-typert-protocol',
    type: 'module',
    exports: { '.': './src/index.d.ts' },
  }, null, 2))
  await writeFile(join(packageRoot, 'remote-stub.d.ts'), [
    "import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'",
    'declare const contribution: TypertRemoteContribution',
    'export default contribution',
    '',
  ].join('\n'))
  const compilerOptions = {
    allowImportingTsExtensions: true,
    composite: true,
    exactOptionalPropertyTypes: true,
    jsx: 'react-jsx',
    lib: ['ES2024', 'DOM'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    noEmit: true,
    noUncheckedIndexedAccess: true,
    paths: {
      '@deepseek-ai/dsh-typert-protocol': [join(protocolRoot, 'src', 'index.d.ts')],
    },
    skipLibCheck: true,
    strict: true,
    target: 'ES2024',
    types: ['node'],
    verbatimModuleSyntax: true,
  }
  await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions,
    include: ['src/**/*.ts'],
  }, null, 2))
  await writeFile(join(protocolRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions,
    include: ['src/**/*.d.ts'],
  }, null, 2))
  await writeFile(join(workspace, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions,
    files: [],
    references: [
      { path: './packages/typert-protocol' },
      { path: './packages/workbench' },
    ],
  }, null, 2))

  const model = new WorkspaceAnalyzer({
    faces: ['host'],
    packages: [packageName],
    root: workspace,
  }).analyze()
  const host = model.faces.find(face => face.face === 'host')
  if (host === undefined) throw new Error('Typert did not discover the Host face')
  const artifact = new FaceModelEmitter(host).emit(packageName)
  if (artifact.remote === undefined) throw new Error('Typert did not emit the read/tree Remote contribution')

  const output = join(root, 'dist')
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(join(output, 'typert.host.js'), artifact.js),
    writeFile(join(output, 'typert.host.d.ts'), artifact.dts),
    writeFile(join(output, 'typert.remote-client.js'), artifact.remote.js),
    writeFile(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts),
    writeFile(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap),
  ])
} finally {
  await rm(workspace, { force: true, recursive: true })
}
