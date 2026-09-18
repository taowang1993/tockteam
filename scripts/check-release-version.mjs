import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

function readVersion(path, label) {
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8')).version
  } catch (error) {
    throw new Error(`Unable to read ${label} version from ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof value !== 'string' || !SEMVER.test(value)) throw new Error(`${label} version is not valid semver: ${String(value)}`)
  return value
}

/** Require the pushed tag to identify exactly the package and optional artifact version. */
export function assertReleaseVersion({ tag, packageVersion, artifactVersion }) {
  if (typeof tag !== 'string' || tag.length === 0) throw new Error('Release tag is required')
  if (typeof packageVersion !== 'string' || !SEMVER.test(packageVersion)) throw new Error(`Package version is not valid semver: ${String(packageVersion)}`)
  const expectedTag = `v${packageVersion}`
  if (tag !== expectedTag) throw new Error(`Release tag ${tag} must equal ${expectedTag}`)
  if (artifactVersion !== undefined && artifactVersion !== packageVersion) {
    throw new Error(`Release artifact version ${artifactVersion} does not equal package version ${packageVersion}`)
  }
  return packageVersion
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

export function checkReleaseVersion({ tag, packagePath = 'package.json', artifactPath } = {}) {
  const packageVersion = readVersion(resolve(packagePath), 'package')
  const artifactVersion = artifactPath === undefined ? undefined : readVersion(resolve(artifactPath), 'artifact')
  return assertReleaseVersion({ tag, packageVersion, ...(artifactVersion === undefined ? {} : { artifactVersion }) })
}

async function main() {
  const tag = argumentValue('--tag') ?? process.env.GITHUB_REF_NAME
  const packagePath = argumentValue('--package') ?? 'package.json'
  const artifactPath = argumentValue('--artifact')
  const version = checkReleaseVersion({ tag, packagePath, artifactPath })
  console.log(`Release version check passed: v${version}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
