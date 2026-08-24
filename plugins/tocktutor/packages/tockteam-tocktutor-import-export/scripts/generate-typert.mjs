import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageName = '@tockteam/tocktutor-import-export'
const workspace = await mkdtemp(join(tmpdir(), 'tocktutor-import-export-typert-'))
const packageRoot = join(workspace, 'packages', 'import-export')

async function link(name, target) {
  const destination = join(workspace, 'node_modules', ...name.split('/'))
  await mkdir(dirname(destination), { recursive: true })
  await symlink(await realpath(join(root, 'node_modules', target ?? name)), destination, 'dir')
}

try {
  const protocolRoot = join(workspace, 'packages', 'typert-protocol')
  await mkdir(packageRoot, { recursive: true })
  await mkdir(protocolRoot, { recursive: true })
  await cp(join(root, 'src'), join(packageRoot, 'src'), { recursive: true })
  await cp(join(root, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol', 'src'), join(protocolRoot, 'src'), { recursive: true })
  await mkdir(join(workspace, 'node_modules', '@deepseek-ai'), { recursive: true })
  await symlink(protocolRoot, join(workspace, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol'), 'dir')
  await Promise.all([
    link('@deepseek-ai/cordis'),
    link('@deepseek-ai/dsh-client-runtime'),
    link('@deepseek-ai/dsh-client-ui-slots'),
    link('@tockteam/desktop'),
    link('@tockteam/tocktutor-workbench'),
    link('react'),
    link('tockbot-note-runtime'),
    link('tockbot-note-vault'),
    link('undici-types'),
    link('zod'),
  ])
  await mkdir(join(workspace, 'node_modules', '@types'), { recursive: true })
  await symlink(join(root, 'node_modules', '@types', 'node'), join(workspace, 'node_modules', '@types', 'node'), 'dir')
  await symlink(join(root, 'node_modules', '@types', 'react'), join(workspace, 'node_modules', '@types', 'react'), 'dir')

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
    exports: { '.': './src/index.ts' },
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
    skipLibCheck: true,
    strict: true,
    target: 'ES2024',
    types: ['node'],
    verbatimModuleSyntax: true,
  }
  await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions, include: ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2))
  await writeFile(join(protocolRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions, include: ['src/**/*.ts'] }, null, 2))
  await writeFile(join(workspace, 'tsconfig.host.json'), JSON.stringify({
    files: [],
    references: [{ path: './packages/typert-protocol' }, { path: './packages/import-export' }],
  }, null, 2))

  const model = new WorkspaceAnalyzer({ faces: ['host'], packages: [packageName], root: workspace }).analyze()
  const host = model.faces.find(face => face.face === 'host')
  if (host === undefined) throw new Error('Typert did not discover the Host face')
  const artifact = new FaceModelEmitter(host).emit(packageName)
  if (artifact.remote === undefined) throw new Error('Typert did not emit the reviewed-operation Remote contribution')
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
