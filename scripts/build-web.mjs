import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { portableZipArguments } from '../src/archive.ts'
import { resolveProductVersion } from '../src/version.ts'
import { resolveNodeDistributionPlatform } from '../src/node-platform.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, '.stage')
const release = join(root, 'release')
const version = resolveProductVersion(root)
const platform = resolveNodeDistributionPlatform()
const arch = process.env.DSH_DESKTOP_NODE_ARCH ?? process.arch
const isWindowsHost = process.platform === 'win32'
const isWindowsTarget = platform === 'win'
const stagedNode = join(stage, 'node-runtime', isWindowsTarget ? 'node.exe' : join('bin', 'node'))
const dirName = `tockteam-web-${version}-${platform}-${arch}`
const packageDir = join(release, dirName)

for (const required of [
  join(root, 'dist', 'web.js'),
  join(root, 'dist', 'tockteam.js'),
  join(stage, 'dsh-runtime', 'lib', 'bin.js'),
  stagedNode,
  join(stage, 'dsh-runtime', 'node_modules', '@tockteam', 'web', 'dist', 'index.js'),
  join(stage, 'dsh-runtime', 'node_modules', '@tockteam', 'web', 'dist', 'cordis.patch.yml'),
]) {
  if (!existsSync(required)) {
    throw new Error(`web distribution artifact missing: ${required}; run pnpm run build && pnpm run stage:dsh first`)
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${String(result.status)}`)
  }
}

rmSync(packageDir, { recursive: true, force: true })
mkdirSync(join(packageDir, 'bin'), { recursive: true })
mkdirSync(join(packageDir, 'lib', 'tockteam-web'), { recursive: true })
mkdirSync(join(packageDir, 'lib', 'tockteam'), { recursive: true })

copyFileSync(join(root, 'dist', 'web.js'), join(packageDir, 'lib', 'tockteam-web', 'main.js'))
copyFileSync(join(root, 'dist', 'tockteam.js'), join(packageDir, 'lib', 'tockteam', 'cli.js'))
copyFileSync(join(root, 'dist', 'release-package.json'), join(packageDir, 'package.json'))
copyFileSync(join(root, 'LICENSE'), join(packageDir, 'LICENSE'))
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(packageDir, 'THIRD_PARTY_NOTICES.md'))
// Keep the staged relative links relative: Node's default cpSync rewrites
// them as absolute links into this build's .stage, which would dangle after
// the package is extracted elsewhere.
cpSync(join(stage, 'dsh-runtime'), join(packageDir, 'dsh-runtime'), {
  recursive: true,
  verbatimSymlinks: true,
})
cpSync(join(stage, 'node-runtime'), join(packageDir, 'node-runtime'), {
  recursive: true,
  verbatimSymlinks: true,
})

const launcher = join(packageDir, 'bin', 'tockteam')
copyFileSync(join(root, 'bin', 'tockteam'), launcher)
writeFileSync(
  launcher,
  readFileSync(launcher, 'utf8').replace(
    'set -eu\n',
    'set -eu\nexport TOCKTEAM_SURFACES=web\n',
  ),
)
chmodSync(launcher, 0o755)

const legacyLauncher = join(packageDir, 'bin', 'tockteam-web')
writeFileSync(legacyLauncher, `#!/usr/bin/env sh
# Compatibility launcher. Prefer: tockteam web
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$ROOT/bin/tockteam" web "$@"
`)
chmodSync(legacyLauncher, 0o755)
if (isWindowsTarget) {
  const windowsLauncher = join(packageDir, 'bin', 'tockteam.cmd')
  copyFileSync(join(root, 'bin', 'tockteam.cmd'), windowsLauncher)
  writeFileSync(
    windowsLauncher,
    readFileSync(windowsLauncher, 'utf8').replace(
      'SETLOCAL\n',
      'SETLOCAL\nSET "TOCKTEAM_SURFACES=web"\n',
    ),
  )
  writeFileSync(join(packageDir, 'bin', 'tockteam-web.cmd'), [
    '@ECHO off',
    'SETLOCAL',
    'SET "ROOT=%~dp0.."',
    'CALL "%ROOT%\\bin\\tockteam.cmd" web %*',
    '',
  ].join('\r\n'))
}

writeFileSync(join(packageDir, 'README.md'), `# TockTeam Web

TockTeam 的轻量浏览器发行版，不包含 Electron。它携带 Web runtime、Node.js
和 Web 可用的内置插件，数据默认保存在 \`~/.tockteam-web\`。

## 启动

\`\`\`sh
./bin/tockteam web
\`\`\`

Windows：

\`\`\`bat
bin\\tockteam.cmd web
\`\`\`

默认地址是 \`http://127.0.0.1:3080\`。运行
\`./bin/tockteam web --help\` 查看监听地址、端口、数据目录和可信主机选项。
按 \`Ctrl+C\` 优雅退出。

默认只监听 loopback。向局域网开放前，请配置 \`--trusted-host\`、鉴权和 TLS。

## English

This is the lightweight TockTeam browser distribution without Electron. It
includes the Web runtime, Node.js, and Web-compatible bundled plugins.

Start it with \`./bin/tockteam web\` (or \`bin\\tockteam.cmd web\` on Windows).
The default URL is \`http://127.0.0.1:3080\`. Run
\`./bin/tockteam web --help\` for host, port, data-directory, and trusted-host
options. Press \`Ctrl+C\` for a graceful shutdown.

Documentation: https://github.com/taowang1993/tockteam/tree/main/docs
`)

const tarball = join(release, `${dirName}.tar.gz`)
const zip = join(release, `${dirName}.zip`)
rmSync(tarball, { force: true })
rmSync(zip, { force: true })
run('tar', ['-czf', tarball, dirName], { cwd: release })
if (isWindowsHost) {
  // bsdtar builds zip archives from the .zip suffix.
  run('tar', ['-a', '-cf', zip, dirName], { cwd: release })
} else {
  run('zip', portableZipArguments(zip, dirName), { cwd: release })
}

console.log(`Packaged TockTeam Web ${version}: ${packageDir}`)
console.log(`  ${tarball}`)
console.log(`  ${zip}`)

// Self-verify the packaged layout exactly like the staged one.
const smoke = join(root, 'scripts', 'smoke-web.mjs')
const hostPlatform = { darwin: 'darwin', linux: 'linux', win: 'win32' }[platform]
if (hostPlatform === process.platform) {
  const verify = spawnSync(process.execPath, [smoke, 'release'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  if (verify.error !== undefined) throw verify.error
  if (verify.status !== 0) process.exit(verify.status ?? 1)
} else {
  console.log(`Skipping packaged smoke test: ${platform} runtime cannot launch on ${process.platform}`)
}
