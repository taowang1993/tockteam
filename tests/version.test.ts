import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  nearestVersionTag,
  normalizeVersionTag,
  resolveProductVersion,
} from '../src/version.ts'

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
}

test('product version follows the release manifest while tags remain discoverable', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-version-'))
  try {
    git(root, 'init', '--quiet')
    git(root, 'config', 'user.name', 'TockTeam Test')
    git(root, 'config', 'user.email', 'test@example.com')
    writeFileSync(join(root, 'package.json'), '{"version":"9.9.9"}\n')
    git(root, 'add', 'package.json')
    git(root, 'commit', '--quiet', '-m', 'initial')
    git(root, 'tag', 'v1.2.3')
    writeFileSync(join(root, 'next.txt'), 'next\n')
    git(root, 'add', 'next.txt')
    git(root, 'commit', '--quiet', '-m', 'next')

    assert.equal(nearestVersionTag(root), '1.2.3')
    assert.equal(resolveProductVersion(root), '9.9.9')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packaged product manifests resolve from the staged lib layout', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-version-packaged-'))
  try {
    mkdirSync(join(root, 'lib', 'tockteam'), { recursive: true })
    writeFileSync(join(root, 'lib', 'tockteam', 'package.json'), '{"version":"2.3.4"}\n')
    assert.equal(resolveProductVersion(root), '2.3.4')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('malformed manifests fall through to a valid tag and then zero', () => {
  const taggedRoot = mkdtempSync(join(tmpdir(), 'tockteam-version-tag-fallback-'))
  const unversionedRoot = mkdtempSync(join(tmpdir(), 'tockteam-version-zero-fallback-'))
  try {
    git(taggedRoot, 'init', '--quiet')
    git(taggedRoot, 'config', 'user.name', 'TockTeam Test')
    git(taggedRoot, 'config', 'user.email', 'test@example.com')
    writeFileSync(join(taggedRoot, 'package.json'), '{malformed\n')
    git(taggedRoot, 'add', 'package.json')
    git(taggedRoot, 'commit', '--quiet', '-m', 'malformed manifest')
    git(taggedRoot, 'tag', 'v4.5.6')
    assert.equal(resolveProductVersion(taggedRoot), '4.5.6')

    writeFileSync(join(unversionedRoot, 'package.json'), '{malformed\n')
    assert.equal(resolveProductVersion(unversionedRoot), '0.0.0')
  } finally {
    rmSync(taggedRoot, { recursive: true, force: true })
    rmSync(unversionedRoot, { recursive: true, force: true })
  }
})

test('release tag normalization preserves metadata and rejects non-semver shapes', () => {
  assert.equal(normalizeVersionTag('v0.2.0-rc.3+build.7\n'), '0.2.0-rc.3+build.7')
  for (const tag of ['release-0.2.0', 'v1.2', 'v1.2.3.4', 'v1.2.3-', 'v1.2.3+']) {
    assert.equal(normalizeVersionTag(tag), undefined)
  }
})
