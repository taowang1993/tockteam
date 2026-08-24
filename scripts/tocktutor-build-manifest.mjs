import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = join(root, 'plugins', 'tocktutor')
const manifestPath = join(workspace, 'build-manifest.json')
const excludedDirectories = new Set(['node_modules', 'test', 'tests', 'THIRD_PARTY_NOTICES'])
const excludedFiles = new Set(['build-manifest.json', 'test-utils.ts'])

function filesIn(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesIn(path))
    else if (entry.isFile()
      && !excludedFiles.has(entry.name)
      && !entry.name.endsWith('.md')
      && entry.name !== 'LICENSE') files.push(path)
  }
  return files
}

export function createTockTutorBuildManifest() {
  const files = filesIn(workspace)
    .map(path => ({
      path: relative(workspace, path).split(sep).join('/'),
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return { version: 1, files }
}

export function verifyTockTutorBuildManifest() {
  if (!existsSync(manifestPath)) {
    throw new Error('TockTutor build manifest is missing; run pnpm run build:tocktutor')
  }
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const actual = createTockTutorBuildManifest()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('TockTutor source or outputs changed without a successful build; run pnpm run build:tocktutor')
  }
}

function writeManifest() {
  const manifest = createTockTutorBuildManifest()
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--write') writeManifest()
  else verifyTockTutorBuildManifest()
}
