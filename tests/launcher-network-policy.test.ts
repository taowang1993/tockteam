import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublicLauncherNetworkAddress, parseLauncherExternalUrl, validateLauncherNetworkUrl } from '../src/launcher-network-extensions.ts'

test('network URL policy rejects unsafe schemes, credentials, ports, and private hosts', () => {
  for (const value of [
    'http://example.com/', 'javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com/',
    'https://example.com:444/', 'https://localhost/', 'https://example.local/', 'https://127.0.0.1/',
    'https://10.0.0.1/', 'https://172.16.0.1/', 'https://192.168.1.1/', 'https://[::1]/',
  ]) assert.throws(() => parseLauncherExternalUrl(value), /external|public|HTTPS|policy/u)
  assert.equal(parseLauncherExternalUrl('https://example.com/path').origin, 'https://example.com')
  assert.equal(validateLauncherNetworkUrl('https://example.com/path'), true)
})

test('public-address policy rejects mixed/private and special IPv4 or IPv6 values', () => {
  for (const address of ['0.0.0.1', '10.1.1.1', '100.64.0.1', '127.0.0.1', '169.254.1.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1']) {
    assert.equal(isPublicLauncherNetworkAddress(address), false, address)
  }
  assert.equal(isPublicLauncherNetworkAddress('8.8.8.8'), true)
})

test('network URL policy bounds hostile and oversized URLs', () => {
  assert.throws(() => parseLauncherExternalUrl(`https://example.com/${'x'.repeat(4096)}`), /Invalid|URL|policy/u)
  assert.throws(() => parseLauncherExternalUrl('https://example.com/a\nb'), /Invalid|URL/u)
})

test('public-address policy classifies embedded IPv4 and reviewed IPv6 special ranges', () => {
  for (const address of [
    '::192.168.1.1', '::10.0.0.1', '::127.0.0.1', '::ffff:192.168.1.1',
    '100::1', '2001:0::1', '2001:1::1', '2001:2::1', '2001:10::1', '2001:20::1',
    '2001:db8::1', '2002::1', '3fff::1', '64:ff9b::c000:201', 'fec0::1',
  ]) assert.equal(isPublicLauncherNetworkAddress(address), false, address)
  for (const address of ['192.0.1.1', '::8.8.8.8', '::ffff:8.8.8.8', '2001:4860:4860::8888', '2606:4700:4700::1111', '2a00:1450:4001::1']) {
    assert.equal(isPublicLauncherNetworkAddress(address), true, address)
  }
})
