import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveLandlockLauncher,
} from '../src/landlock-launcher.ts'
import { previewSandboxLauncher } from '../plugins/plugin-marketplace/src/host/platform.ts'

test('resolves and probes the staged Landlock launcher for both Linux architectures', () => {
  for (const arch of ['x64', 'arm64'] as const) {
    const packageName = `@deepseek-ai/node-addon-landlock-run-linux-${arch}`
    const packageJson = `/runtime/node_modules/${packageName}/package.json`
    const launcher = `/runtime/node_modules/${packageName}/bin/landlock-run`
    const requested: string[] = []
    const probed: string[] = []
    assert.equal(resolveLandlockLauncher('/runtime', 'linux', arch, {
      executable: path => path === launcher,
      probe: path => { probed.push(path); return true },
      resolvePackageJson: specifier => { requested.push(specifier); return packageJson },
    }), launcher)
    assert.deepEqual(requested, [`${packageName}/package.json`])
    assert.deepEqual(probed, [launcher])
  }
})

test('rejects unsupported, external, non-executable, and unenforcing Landlock launchers', () => {
  const inside = '/runtime/node_modules/@deepseek-ai/node-addon-landlock-run-linux-x64/package.json'
  assert.equal(resolveLandlockLauncher('/runtime', 'darwin', 'x64'), undefined)
  assert.equal(resolveLandlockLauncher('/runtime', 'linux', 'riscv64'), undefined)
  assert.equal(resolveLandlockLauncher('/runtime', 'linux', 'x64', {
    resolvePackageJson: () => '/outside/package.json',
  }), undefined)
  assert.equal(resolveLandlockLauncher('/runtime', 'linux', 'x64', {
    executable: () => false,
    resolvePackageJson: () => inside,
  }), undefined)
  assert.equal(resolveLandlockLauncher('/runtime', 'linux', 'x64', {
    executable: () => true,
    probe: () => false,
    resolvePackageJson: () => inside,
  }), undefined)
})

test('Linux Marketplace previews run through Landlock and otherwise fail closed', () => {
  assert.deepEqual(previewSandboxLauncher({
    pathExists: () => true,
    platform: 'linux',
    root: '/preview',
    sandbox: '/runtime/landlock-run',
  }), {
    command: '/runtime/landlock-run',
    args: ['--ro', '/', '--rw', '/preview', '--rw', '/dev/null', '--'],
  })
  assert.throws(() => previewSandboxLauncher({
    pathExists: () => false,
    platform: 'linux',
    root: '/preview',
    sandbox: '/runtime/landlock-run',
  }), /unavailable on linux/u)
})
