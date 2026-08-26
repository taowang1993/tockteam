import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  nodeDistributionPlatform,
  resolveNodeDistributionArchitecture,
  resolveNodeDistributionPlatform,
} from '../src/node-platform.ts'

test('Node distribution platforms normalize native Windows hosts', () => {
  assert.equal(nodeDistributionPlatform('win32'), 'win')
  assert.equal(nodeDistributionPlatform('darwin'), 'darwin')
  assert.equal(nodeDistributionPlatform('linux'), 'linux')
})

test('Node distribution architectures reject path-like and unsupported values', () => {
  assert.equal(resolveNodeDistributionArchitecture({ DSH_DESKTOP_NODE_ARCH: 'arm64' }, 'x64'), 'arm64')
  assert.equal(resolveNodeDistributionArchitecture({}, 'x64'), 'x64')
  assert.throws(
    () => resolveNodeDistributionArchitecture({ DSH_DESKTOP_NODE_ARCH: '../victim' }, 'x64'),
    /unsupported Node distribution architecture/u,
  )
})

test('Node distribution platform overrides remain authoritative', () => {
  assert.equal(resolveNodeDistributionPlatform({
    DSH_DESKTOP_NODE_PLATFORM: 'linux',
  }, 'win32'), 'linux')
  assert.equal(resolveNodeDistributionPlatform({}, 'win32'), 'win')
  assert.throws(
    () => resolveNodeDistributionPlatform({ DSH_DESKTOP_NODE_PLATFORM: '../../victim' }, 'linux'),
    /unsupported Node distribution platform/u,
  )
})
