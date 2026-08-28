#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const EXPECTED_IDENTITY = Object.freeze({
  packageName: '@tockteam/desktop',
  productName: 'TockTeam Desktop',
  appId: 'ai.deepseek.tockteam-desktop',
  executableName: 'tockteam-desktop',
  desktopName: 'tockteam-desktop.desktop',
  protocols: Object.freeze(['tocktutor']),
  dataDirectory: 'TockTeam-Desktop',
})
const EXPECTED_TARGETS = Object.freeze([
  Object.freeze({ platform: 'mac', formats: Object.freeze(['dmg', 'zip']), architectures: Object.freeze(['arm64', 'x64']) }),
  Object.freeze({ platform: 'linux', formats: Object.freeze(['AppImage', 'deb']), architectures: Object.freeze(['arm64', 'x64']) }),
  Object.freeze({ platform: 'win', formats: Object.freeze(['dir']), architectures: Object.freeze(['x64']) }),
])
const EXPECTED_LAUNCHER_DEPENDENCIES = Object.freeze({
  color: '4.2.3',
  'electron-updater': '6.8.3',
  'fast-xml-parser': '5.7.0',
  'fuse.js': '7.1.0',
  fuzzysort: '3.1.0',
  mathjs: '15.2.0',
  uuid: '14.0.0',
})
const EXPECTED_LAUNCHER_DEPENDENCY_LIST = Object.freeze(['color@4.2.3', 'fast-xml-parser@5.7.0', 'mathjs@15.2.0', 'uuid@14.0.0', 'fuse.js@7.1.0', 'fuzzysort@3.1.0', 'electron-updater@6.8.3'])
const EXPECTED_LAUNCHER_RUNTIME_CLOSURE = Object.freeze([
  '@babel/runtime@7.29.7',
  '@nodable/entities@2.1.1',
  'argparse@2.0.1',
  'builder-util-runtime@9.5.1',
  'color-convert@2.0.1',
  'color-name@1.1.4',
  'color-string@1.9.1',
  'color@4.2.3',
  'complex.js@2.4.3',
  'debug@4.4.3',
  'decimal.js@10.6.0',
  'electron-updater@6.8.3',
  'escape-latex@1.2.0',
  'fast-xml-builder@1.2.0',
  'fast-xml-parser@5.7.0',
  'fraction.js@5.3.4',
  'fs-extra@10.1.0',
  'fuse.js@7.1.0',
  'fuzzysort@3.1.0',
  'graceful-fs@4.2.11',
  'is-arrayish@0.3.4',
  'javascript-natural-sort@0.7.1',
  'js-yaml@4.3.1',
  'jsonfile@6.2.1',
  'lazy-val@1.0.5',
  'lodash.escaperegexp@4.1.2',
  'lodash.isequal@4.5.0',
  'mathjs@15.2.0',
  'ms@2.1.3',
  'path-expression-matcher@1.5.0',
  'sax@1.6.1',
  'seedrandom@3.0.5',
  'semver@7.7.4',
  'simple-swizzle@0.2.4',
  'strnum@2.2.3',
  'tiny-emitter@2.1.0',
  'tiny-typed-emitter@2.1.0',
  'typed-function@4.2.2',
  'universalify@2.0.1',
  'uuid@14.0.0',
  'xml-naming@0.1.0',
])
const EXPECTED_LAUNCHER_LOCKFILE = Object.freeze({
  path: 'pnpm-lock.yaml',
  rootImporter: Object.freeze({
    color: Object.freeze({ specifier: '4.2.3', version: '4.2.3' }),
    'fast-xml-parser': Object.freeze({ specifier: '5.7.0', version: '5.7.0' }),
    'mathjs': Object.freeze({ specifier: '15.2.0', version: '15.2.0' }),
    uuid: Object.freeze({ specifier: '14.0.0', version: '14.0.0' }),
    'fuse.js': Object.freeze({ specifier: '7.1.0', version: '7.1.0' }),
    fuzzysort: Object.freeze({ specifier: '3.1.0', version: '3.1.0' }),
    'electron-updater': Object.freeze({ specifier: '6.8.3', version: '6.8.3(supports-color@7.2.0)' }),
  }),
  packages: Object.freeze({
    '@nodable/entities@2.1.1': Object.freeze({ integrity: 'sha512-Pig3HxDIoMgjdEH8OCf/dkcTmLFjJRjWuq8jSnklu284/TKOPibSRERmOykiwmyXTtv61mP+44f3GMx0tLAyjg==' }),
    'fast-xml-builder@1.2.0': Object.freeze({ integrity: 'sha512-00aAWieqff+ZJhsXA4g1g7M8k+7AYoMUUHF+/zFb5U6Uv/P0Vl4QZo84/IcufzYalLuEj9928bXN9PbbFzMF0Q==' }),
    'path-expression-matcher@1.5.0': Object.freeze({ integrity: 'sha512-cbrerZV+6rvdQrrD+iGMcZFEiiSrbv9Tfdkvnusy6y0x0GKBXREFg/Y65GhIfm0tnLntThhzCnfKwp1WRjeCyQ==' }),
    'strnum@2.2.3': Object.freeze({ integrity: 'sha512-oKx6RUCuHfT3oyVjtnrmn19H1SiCqgJSg+54XqURKp5aCMbrXrhLjRN9TjuwMjiYstZ0MzDrHqkGZ5dFTKd+zg==' }),
    'xml-naming@0.1.0': Object.freeze({ integrity: 'sha512-k8KO9hrMyNk6tUWqUfkTEZbezRRpONVOzUTnc97VnCvyj6Tf9lyUR9EDAIeiVLv56jsMcoXEwjW8Kv5yPY52lw==' }),
    'color@4.2.3': Object.freeze({ integrity: 'sha512-1rXeuUUiGGrykh+CeBdu5Ie7OJwinCgQY0bc7GCRxy5xVHy+moaqkpL/jqQq0MtQOeYcrqEz4abc5f0KtU7W4A==' }),
    'fast-xml-parser@5.7.0': Object.freeze({ integrity: 'sha512-MTcrUoRQ1GSQ9iG3QJzBGquYYYeA7piZaJoIWbPFGbRn6Jj6z7xgoAyi4DrZX4y2ZIQQBF59gc/zmvvejjgoFQ==' }),
    'mathjs@15.2.0': Object.freeze({ integrity: 'sha512-UAQzSVob9rNLdGpqcFMYmSu9dkuLYy7Lr2hBEQS5SHQdknA9VppJz3cy2KkpMzTODunad6V6cNv+5kOLsePLow==' }),
    'uuid@14.0.0': Object.freeze({ integrity: 'sha512-Qo+uWgilfSmAhXCMav1uYFynlQO7fMFiMVZsQqZRMIXp0O7rR7qjkj+cPvBHLgBqi960QCoo/PH2/6ZtVqKvrg==' }),
    'fuse.js@7.1.0': Object.freeze({ integrity: 'sha512-trLf4SzuuUxfusZADLINj+dE8clK1frKdmqiJNb1Es75fmI5oY6X2mxLVUciLLjxqw/xr72Dhy+lER6dGd02FQ==' }),
    'fuzzysort@3.1.0': Object.freeze({ integrity: 'sha512-sR9BNCjBg6LNgwvxlBd0sBABvQitkLzoVY9MYYROQVX/FvfJ4Mai9LsGhDgd8qYdds0bY77VzYd5iuB+v5rwQQ==' }),
    'electron-updater@6.8.3': Object.freeze({ integrity: 'sha512-Z6sgw3jgbikWKXei1ENdqFOxBP0WlXg3TtKfz0rgw2vIZFJUyI4pD7ZN7jrkm7EoMK+tcm/qTnPUdqfZukBlBQ==' }),
  }),
  snapshots: Object.freeze({
    '@nodable/entities@2.1.1': Object.freeze({}),
    'fast-xml-builder@1.2.0': Object.freeze({ dependencies: Object.freeze({ 'path-expression-matcher': '1.5.0', 'xml-naming': '0.1.0' }) }),
    'path-expression-matcher@1.5.0': Object.freeze({}),
    'strnum@2.2.3': Object.freeze({}),
    'xml-naming@0.1.0': Object.freeze({}),
    'color@4.2.3': Object.freeze({ dependencies: Object.freeze({ 'color-convert': '2.0.1', 'color-string': '1.9.1' }) }),
    'fast-xml-parser@5.7.0': Object.freeze({ dependencies: Object.freeze({ '@nodable/entities': '2.1.1', 'fast-xml-builder': '1.2.0', 'path-expression-matcher': '1.5.0', strnum: '2.2.3' }) }),
    'mathjs@15.2.0': Object.freeze({ dependencies: Object.freeze({ '@babel/runtime': '7.29.7', 'complex.js': '2.4.3', 'decimal.js': '10.6.0', 'escape-latex': '1.2.0', 'fraction.js': '5.3.4', 'javascript-natural-sort': '0.7.1', seedrandom: '3.0.5', 'tiny-emitter': '2.1.0', 'typed-function': '4.2.2' }) }),
    'uuid@14.0.0': Object.freeze({}),
    'fuse.js@7.1.0': Object.freeze({}),
    'fuzzysort@3.1.0': Object.freeze({}),
    'electron-updater@6.8.3(supports-color@7.2.0)': Object.freeze({
      dependencies: Object.freeze({
        'builder-util-runtime': '9.5.1(supports-color@7.2.0)',
        'fs-extra': '10.1.0',
        'js-yaml': '4.3.1',
        'lazy-val': '1.0.5',
        'lodash.escaperegexp': '4.1.2',
        'lodash.isequal': '4.5.0',
        semver: '7.7.4',
        'tiny-typed-emitter': '2.1.0',
      }),
      transitivePeerDependencies: Object.freeze(['supports-color']),
    }),
  }),
})
const EXPECTED_LAUNCHER_ASSETS = Object.freeze([
  ['Base64Conversion', 'base64-conversion.png', '4ec2ab60efec30d53dd04b48038dc5bfc97eee7c9e92c3c0fb6d1d8612a769a8'],
  ['Calculator', 'calculator.png', 'e0a078797184e5ebc584d305cefd201f83e7c3ea41383fbe1cdf5de668cd9391'],
  ['ColorConverter', 'color-converter.png', 'ae6d518c491a2451ff714c3d7329725db258d2d8bec861a9c0adde669e81bfd0'],
  ['PasswordGenerator', 'password-generator.png', '8d317883865b625a35b50d1e1150afec2a2cf8392584e482aa5d09117f7aa9ca'],
  ['QuickFormatter', 'quick-formatter.png', '5e1e438c834c0b37afc0106a47b7315d6090f089d5c10d271315c243c2d0c186'],
  ['RowlandTextEditor', 'rowland-texteditor.png', 'cb6bdcd60962680bb35be8db49469162951e1e5091d013b6dc11b149bd10700f'],
  ['UuidGenerator', 'uuid-generator.png', '2a4b0aef1d383d3927c431031290b7f6cc6c9993aa6ca600e6459b51f4e5de75'],
  ['application-linux', 'application-linux.png', '9571f48a26daa759c4243e28d1a427cfd459564d2a26e576b551d987be50d37f'],
  ['application-linux-generic', 'application-linux-generic.png', '954a84019db2c87f0c3465aa564e4b6ed6167a7b1765ec866cbd4bacafb7e892'],
  ['application-macos', 'application-macos.png', 'da0027a559a037e662b38a8ede779b6a2e31bd4ac1bce7fceca0c8ea62a512cb'],
  ['application-macos-generic', 'application-macos-generic.png', '8eaae03ecc49a1aa393cd5b256bae52a86a0a63ba16c3fa5ac32063bfd320b2b'],
  ['application-windows-dark', 'application-windows-dark.png', '454a47d635d60ebbab44344ba66450cf52346e823ca76ca31bcbda0997eda5fa'],
  ['application-windows-light', 'application-windows-light.png', 'ac3070b1ded77ae1dadc4f5aed1714128fab73f9a380a92c41b40329d3b3d4d2'],
  ['application-windows-generic', 'application-windows-generic.png', '000068955c67ab474df5b258a01a60f3bba2919d3c17326cade34a358a4912cc'],
  ['browser-bookmarks', 'browser-bookmarks.png', 'c2075df1fcf0e4e7e886e46ddd445e3c04b889dda20f5aca2566f7de0863a354'],
  ['jetbrains-toolbox', 'jetbrains-toolbox.png', '4793800c7cd1b793aac93b33e6a38c1a18e0008ebeecaf04c9a8b838f632c1b5'],
  ['vscode-file', 'vscode-file.png', '954a84019db2c87f0c3465aa564e4b6ed6167a7b1765ec866cbd4bacafb7e892'],
  ['vscode', 'vscode.png', '7ac29e00cd66e549acc2ea6a99a813f92cb23a6d165293be6959845670f0c5a4'],
  ['browser-arc', 'browser-arc.png', 'c8e0daa8bab62d9f71c00cf0637ec2ab557862bbab7c8d9859dce04bc095e755'],
  ['browser-brave', 'browser-brave-browser.png', 'ba9f99c1a35042f3b20e365e477d2cf5da72feed28ff3e735f54940ffd47643c'],
  ['browser-firefox', 'browser-firefox.png', '28651899a25e6665e1bd65ccf7a5302417a2822dc658263c12d57c9a247d51aa'],
  ['browser-google-chrome', 'browser-google-chrome.png', '68e998cddd32341a776e2fb5e0c2ad26748594cf44cd3635ccc2974f0d84ba27'],
  ['browser-microsoft-edge', 'browser-microsoft-edge.png', 'a94a9d74adf95e9bdab3b19c13de497d525aa5d85743f8a98e885d3934010e94'],
  ['browser-yandex', 'browser-yandex.svg', '29afe7aba01ff139dde1c22db8dad0300a5a8b6fea1c26e90bc3b20a3ac888b4'],
  ['browser-zen', 'browser-zen.png', 'e6893025a3f607b3d12b0c5abf8c36b643e453731886d97d0933358fc11fd2c9'],
  ['file-search-folder', 'file-search-folder.png', '61dbce43d87a5af31a9aba8e9f78079dd171103ac8e2c0110819445b0e090fe3'],
  ['simple-file-search-linux', 'simple-file-search-linux.png', 'ffd2b70c988295be38a2e507380c9c8328c9aad44870d2e12ff77b76e64200e7'],
  ['simple-file-search-macos', 'simple-file-search-macos.png', '59f8ff6242b8d79e6e8dba650ab1c7b0c55122472fb3e39ad4b56a21d4c0060a'],
  ['simple-file-search', 'simple-file-search.png', 'dc608686196c635d1fe0b55adb4e09f54fa5b1b238c839aa180dcb5d89c26f2f'],
  ['simple-file-search-windows', 'simple-file-search-windows.ico', 'd9b23fb20914aa0eb49de9df379c1628934bf0d77d274f0ba5391cfd4e596f2b'],
  ['currency-conversion', 'currency-conversion.png', '6a87b37bf251565739e90a82614cd01838a84038866834cfcc432e2d3c7a3316'],
  ['custom-web-search', 'custom-web-search.svg', 'b7ce4cc6685aaf4f0b8e6ec3420d2f9d36a48af0acc721181010cdb0c06518e3'],
  ['deepl-translator', 'deepl-translator.svg', 'b36e136107ca67812c0dc9265afd95951bde1ef9cc4736ff980a8ac0bccf496f'],
  ['web-search-duckduckgo', 'web-search-duckduckgo.svg', 'a552810b288ab1511f5ad547957de90d44b4245c364b60a2a90a437532e16f21'],
  ['web-search-google', 'web-search-google.png', 'e2087f585c3b213ba537a56c8bc8e6134c69d6fa1a5728d306df56d697b4e7ab'],
  ['web-search', 'web-search.png', '37667bef690d961232b7d290de1cdac56f8f33e23d4a7a732b95de2a7de3218a'],
  ['appearance-switcher-dark', 'appearance-switcher-dark.png', '0918bc78b8742066d8afbe522e3c47159aadcee50902ce8b39e6b76e94b9bb25'],
  ['appearance-switcher-light', 'appearance-switcher-light.png', 'e7642a2d2364376291691734f3b12449c613134e43fbf2de50f525a015376ced'],
  ['system-command-linux', 'system-command-linux.png', '39242bd103fa6dc422affb7cb40a7f864a533f6b94ba2e8bb595f867141d2ac9'],
  ['system-command-macos-lock-dark', 'system-command-macos-lock-dark.png', 'efd9efa69b3b1f1e2ae4db45ae1586c983b4681b935b34c283fa5273a2ca4fab'],
  ['system-command-macos-lock-light', 'system-command-macos-lock-light.png', '863b8ecbf73cd9714760d5ad1dd4f66e9997adb329b2c3ce8a37ae583433ef2f'],
  ['system-command-macos-logout-dark', 'system-command-macos-logout-dark.png', 'aa9649088899592199b11ce7af7c6b6f8cbacf9e49bd0f9a05acc8e7f66cd1d0'],
  ['system-command-macos-logout-light', 'system-command-macos-logout-light.png', '7d0c0edbcfd0f0bb6c57b8975fafa9869b69a9e4e9cf049d70573729593c3413'],
  ['system-command-macos-restart-dark', 'system-command-macos-restart-dark.png', 'af66662b5c3c691770e78f348071d858f0cc760e1d594ff8851f2fe950d63506'],
  ['system-command-macos-restart-light', 'system-command-macos-restart-light.png', 'e316a3aa47881d8efc51f13e9fb9a1143e86ac0d9edb2cd18ef6332cdd9cd488'],
  ['system-command-macos-shutdown-dark', 'system-command-macos-shutdown-dark.png', 'c035bcba9ac55fe61b7b6ec2a9f7a87b64461de596390279ad9e1180c7be07aa'],
  ['system-command-macos-shutdown-light', 'system-command-macos-shutdown-light.png', '0325906ab4d6019f5cb56c8fa08cbcdef514b06c040cbf2e1ae5a11eba32ebe9'],
  ['system-command-macos-sleep-dark', 'system-command-macos-sleep-dark.png', '1fd624e2ab370a896bd9bc21a777a219f1a4c92295157eee65ecf735dbf9c96b'],
  ['system-command-macos-sleep-light', 'system-command-macos-sleep-light.png', '38914903ea6fd4419492c1e840b0eab4a0b4ed83be8e0d5cac2f50d034e6bac9'],
  ['system-command-macos', 'system-command-macos.png', 'c37f0fc743564b621263fcaf937ed97f5fcc5e9329ad31c49c438e7c8c0219e9'],
  ['system-command-trash', 'system-command-trash.png', 'e9970c694b14eb163c975f430899500ce863cc4d617294baf7e05ff78447df20'],
  ['system-command-windows', 'system-command-windows.png', '41a80a39d7ea42f606b5cc1de9f133e03147a357360c8bcf8952a1d55d0dbd10'],
  ['system-settings-macos', 'system-settings-macos.png', 'c37f0fc743564b621263fcaf937ed97f5fcc5e9329ad31c49c438e7c8c0219e9'],
  ['system-settings-windows', 'system-settings-windows.png', '41a80a39d7ea42f606b5cc1de9f133e03147a357360c8bcf8952a1d55d0dbd10'],
  ['ueli-command-dark', 'ueli-command-dark.png', '3c62491065bec9cee765ebc238b6ae1546ebfd6288e0cf3ba642a4964b82979b'],
  ['ueli-command-light', 'ueli-command-light.png', '35c0b53a23b9ae22aebbc011b3f1e939be37d2a02c1db404320c41d5ff320aa9'],
  ['control-panel', 'control-panel.png', '6581a2084b71e7b65efb9665cd70469fe1cc237dc3c41a9d1c960ee2ce14accb'],
].map(([key, fileName, sha256]) => Object.freeze({ key, path: `dist/launcher-assets/${fileName}`, sha256 })))
const EXPECTED_LAUNCHER_NOTICES = Object.freeze([
  Object.freeze({ id: 'ueli-mit', source: 'THIRD_PARTY_NOTICES.md', license: 'MIT', attribution: 'https://github.com/oliverschwendener/ueli' }),
  Object.freeze({ id: 'gnome-application-search-icons', source: 'THIRD_PARTY_NOTICES.md', license: 'CC BY-SA 3.0', attribution: 'https://www.gnome.org' }),
  Object.freeze({ id: 'openmoji-custom-web-search-icon', source: 'THIRD_PARTY_NOTICES.md', license: 'CC BY-SA 4.0', attribution: 'https://openmoji.org/' }),
  Object.freeze({ id: 'ueli-os-assets', source: 'THIRD_PARTY_NOTICES.md', license: 'MIT', attribution: 'https://github.com/oliverschwendener/ueli' }),
])
const EXPECTED_FOUNDATION = Object.freeze({
  launcherImplemented: true,
  launcherPackaged: true,
  admittedRuntimeDependencies: EXPECTED_LAUNCHER_DEPENDENCY_LIST,
  runtimeDependencyClosure: EXPECTED_LAUNCHER_RUNTIME_CLOSURE,
  launcherAssets: EXPECTED_LAUNCHER_ASSETS,
  launcherNotices: EXPECTED_LAUNCHER_NOTICES,
  shippedVendorSource: false,
  importedUeliIdentity: false,
})
const EXPECTED_PUBLICATION = Object.freeze({
  configuredTargets: Object.freeze(['macOS arm64', 'macOS x64', 'Linux arm64', 'Linux x64', 'Windows x64']),
  workflowArtifacts: Object.freeze(['macOS arm64', 'macOS x64', 'Linux x64']),
  launcherArtifacts: Object.freeze([]),
  installedArtifact: false,
  signed: false,
  notarized: false,
  publicDistribution: false,
})
const EXPECTED_UELI_INTEGRATION = Object.freeze({
  baseline: 'v9.29.0',
  peeledCommit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  admittedRuntimeDependencies: EXPECTED_LAUNCHER_DEPENDENCY_LIST,
  runtimeDependencyClosure: EXPECTED_LAUNCHER_RUNTIME_CLOSURE,
  shippedVendorSource: false,
  importedIdentity: false,
})
const EXPECTED_NOTICE_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'ueli-mit',
    source: 'vendor/ueli/LICENSE',
    license: 'MIT',
    sha256: '8da6c1a79d367a41aadf313019833f4bb3f2ff55f0da5b522fd058183d2f9106',
    attribution: 'https://github.com/oliverschwendener/ueli',
    disposition: 'provenance-only',
  }),
  Object.freeze({
    id: 'gnome-application-search-icons',
    source: 'vendor/ueli/assets/Extensions/ApplicationSearch/LICENSE',
    license: 'CC BY-SA 3.0',
    sha256: 'ed29c8f605a1a27368c832b47816405bc6bb18f1d3ec53372cc5c40e64ae680d',
    attribution: 'https://www.gnome.org',
    disposition: 'provenance-only',
  }),
  Object.freeze({
    id: 'openmoji-custom-web-search-icon',
    source: 'vendor/ueli/docs/Extensions/CustomWebSearch/README.md',
    license: 'CC BY-SA 4.0',
    sha256: '377515334214846e9564c3dfb03d9a8e50f31e8d590fad20c6f09c165fa35244',
    attribution: 'https://openmoji.org/',
    disposition: 'shipped',
  }),
  Object.freeze({
    id: 'ueli-dependency-graph',
    source: Object.freeze(['vendor/ueli/package.json', 'vendor/ueli/package-lock.json']),
    license: 'mixed',
    attribution: 'Ueli package dependency graph',
    disposition: 'not-admitted',
  }),
  Object.freeze({
    id: 'ueli-os-assets',
    source: 'vendor/ueli/LICENSE',
    license: 'MIT',
    sha256: '8da6c1a79d367a41aadf313019833f4bb3f2ff55f0da5b522fd058183d2f9106',
    attribution: 'https://github.com/oliverschwendener/ueli',
    disposition: 'shipped',
  }),
])
const FORBIDDEN_APPLICATION_IDENTITY = /tockbot|works\.tockbot|OliverSchwendener\.Ueli|\bueli\b/iu
const VENDOR_SOURCE = /vendor[/\\]ueli/iu

function addFailure(failures, condition, message) {
  if (!condition) failures.push(message)
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function validateLauncherLockfile(lockfile, lockfileText, failures) {
  addFailure(failures, sameJson(lockfile, EXPECTED_LAUNCHER_LOCKFILE), 'launcher lockfile contract differs from the reviewed exact dependency evidence')
  if (typeof lockfileText !== 'string') {
    failures.push('launcher lockfile text is unavailable')
    return
  }
  addFailure(failures, /^lockfileVersion: '9\.0'$/mu.test(lockfileText), 'launcher lockfile version differs from pnpm 9 evidence')
  const importer = lockfileText.match(/^importers:\n\n  \.:([\s\S]*?)^packages:\n/m)?.[1] ?? ''
  const dependencies = importer.match(/^    dependencies:\n([\s\S]*?)^    devDependencies:/m)?.[1] ?? ''
  for (const [name, values] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.rootImporter)) {
    const packageKey = escapeRegExp(name)
    const specifier = escapeRegExp(values.specifier)
    const version = escapeRegExp(values.version)
    addFailure(
      failures,
      new RegExp(`^      ${packageKey}:\n        specifier: ${specifier}\n        version: ${version}$`, 'mu').test(dependencies),
      `launcher lockfile root importer differs for ${name}`,
    )
  }
  const packages = lockfileText.match(/^packages:\n([\s\S]*?)^snapshots:\n/m)?.[1] ?? ''
  for (const [name, values] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.packages)) {
    const packageKey = escapeRegExp(name)
    const integrity = escapeRegExp(values.integrity)
    addFailure(
      failures,
      new RegExp(`^  '?${packageKey}'?:\n    resolution: \\{integrity: ${integrity}\\}$`, 'mu').test(packages),
      `launcher lockfile package resolution differs for ${name}`,
    )
  }
  const snapshots = lockfileText.match(/^snapshots:\n([\s\S]*)$/m)?.[1] ?? ''
  for (const [name, expected] of Object.entries(EXPECTED_LAUNCHER_LOCKFILE.snapshots)) {
    if (Object.keys(expected).length === 0) {
      addFailure(
        failures,
        new RegExp(`^  '?${escapeRegExp(name)}'?: \\{\\}$`, 'mu').test(snapshots),
        `launcher lockfile snapshot is not empty for ${name}`,
      )
      continue
    }
    const block = `${snapshots}\n  __launcher_lockfile_end__: {}`.match(new RegExp(`^  '?${escapeRegExp(name)}'?:\\n([\\s\\S]*?)(?=^  \\S)`, 'mu'))?.[1] ?? ''
    for (const [dependency, version] of Object.entries(expected.dependencies ?? {})) {
      addFailure(
        failures,
        new RegExp(`^    dependencies:\\n(?:      .*\\n)*      '?${escapeRegExp(dependency)}'?: ${escapeRegExp(version)}$`, 'mu').test(block),
        `launcher lockfile snapshot dependency differs for ${name}: ${dependency}`,
      )
    }
    for (const peer of expected.transitivePeerDependencies ?? []) {
      addFailure(
        failures,
        new RegExp(`^    transitivePeerDependencies:\\n(?:      .*\\n)*      - ${escapeRegExp(peer)}$`, 'mu').test(block),
        `launcher lockfile snapshot peer differs for ${name}: ${peer}`,
      )
    }
  }
}

function expectedNoticeShape(entry) {
  return {
    id: entry.id,
    source: entry.source,
    license: entry.license,
    ...(entry.sha256 === undefined ? {} : { sha256: entry.sha256 }),
    attribution: entry.attribution,
    disposition: entry.disposition,
  }
}

function validateNoticeLedger(inputs, failures) {
  const { contract, noticeLedger, noticeContents = {} } = inputs
  addFailure(failures, contract.noticeLedger === 'scripts/ueli/notice-ledger.json', 'notice ledger path differs from the TockTeam contract')
  addFailure(failures, noticeLedger?.schemaVersion === 1, 'notice ledger schemaVersion is not 1')
  addFailure(failures, noticeLedger?.baseline === 'v9.29.0', 'notice ledger baseline differs from v9.29.0')
  const entries = Array.isArray(noticeLedger?.entries) ? noticeLedger.entries : []
  addFailure(failures, sameJson(entries.map(expectedNoticeShape), EXPECTED_NOTICE_ENTRIES.map(expectedNoticeShape)), 'notice ledger entries differ from the reviewed provenance ledger')
  for (const entry of entries) {
    const sources = Array.isArray(entry.source) ? entry.source : [entry.source]
    for (const source of sources) {
      const contents = noticeContents[source]
      addFailure(failures, typeof contents === 'string' && contents.length > 0, `notice source is missing or empty: ${source}`)
    }
    if (entry.sha256 !== undefined && sources.length === 1) {
      addFailure(failures, hash(noticeContents[sources[0]]) === entry.sha256, `notice source hash differs from the ledger: ${sources[0]}`)
    }
  }
  const openMoji = entries.find(({ id }) => id === 'openmoji-custom-web-search-icon')
  const openMojiText = openMoji && noticeContents[openMoji.source]
  addFailure(failures, typeof openMojiText === 'string' && /OpenMoji/u.test(openMojiText) && /CC BY-SA 4\.0/u.test(openMojiText), 'OpenMoji CC BY-SA 4.0 attribution is missing')
}

export function inspectLauncherPackageFeasibility(inputs) {
  const { contract, lockfileText, packageJson, vendorPackageJson, mainSource } = inputs
  const failures = []
  const build = packageJson?.build ?? {}
  const identity = contract?.identity ?? {}

  addFailure(failures, contract?.schemaVersion === 1, 'release contract schemaVersion is not 1')
  for (const key of ['packageName', 'productName', 'appId', 'executableName', 'desktopName', 'dataDirectory']) {
    addFailure(failures, identity[key] === EXPECTED_IDENTITY[key], `${key} differs from TockTeam identity`)
  }
  addFailure(failures, sameJson(identity.protocols, EXPECTED_IDENTITY.protocols), 'protocol list differs from TockTeam identity')
  addFailure(failures, packageJson?.name === identity.packageName, 'package name differs from TockTeam identity')
  addFailure(failures, packageJson?.productName === identity.productName, 'product name differs from TockTeam identity')
  addFailure(failures, packageJson?.desktopName === identity.desktopName, 'desktop name differs from TockTeam identity')
  addFailure(failures, build.appId === identity.appId, 'app ID differs from TockTeam identity')
  addFailure(failures, build.productName === identity.productName, 'Builder product name differs from TockTeam identity')
  addFailure(failures, build.linux?.executableName === identity.executableName, 'Builder executable name differs from TockTeam identity')
  addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`const PRODUCT_NAME = '${identity.productName}'`), 'Electron main display name differs from TockTeam identity')
  addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`const DATA_DIRECTORY = '${identity.dataDirectory}'`), 'Electron main data directory differs from TockTeam identity')
  for (const protocol of identity.protocols ?? []) {
    addFailure(failures, typeof mainSource === 'string' && mainSource.includes(`setAsDefaultProtocolClient('${protocol}')`), `Electron main protocol registration is missing: ${protocol}`)
  }

  const packageIdentityValues = [
    packageJson?.name,
    packageJson?.productName,
    packageJson?.desktopName,
    build.appId,
    build.linux?.executableName,
    ...Object.values(identity),
  ].filter((value) => typeof value === 'string')
  const sourceIdentityValues = []
  for (const expression of [
    /\b(?:PRODUCT_NAME|DATA_DIRECTORY)\s*=\s*(['"`])([^'"`]*)\1/gu,
    /\b(?:partition|userData|appId|productName|executableName|dataDirectory|applicationName|applicationId|sessionName|sessionId|profileName|profileId)\s*(?:=|:)\s*(['"`])([^'"`]*)\1/gu,
    /\bsetPath\(\s*(['"`])[^'"`]*\1\s*,\s*(['"`])([^'"`]*)\2/gu,
    /\b(?:setName|fromPartition|setAsDefaultProtocolClient)\(\s*(['"`])([^'"`]*)\1/gu,
  ]) {
    for (const match of String(mainSource ?? '').matchAll(expression)) sourceIdentityValues.push(match[match.length - 1])
  }
  addFailure(
    failures,
    ![...packageIdentityValues, ...sourceIdentityValues].some((value) => FORBIDDEN_APPLICATION_IDENTITY.test(value)),
    'forbidden launcher identity leakage',
  )

  const targets = Array.isArray(contract?.targets) ? contract.targets : []
  addFailure(failures, sameJson(targets, EXPECTED_TARGETS), 'configured target matrix differs from TockTeam packaging')
  for (const target of targets) {
    const builderTarget = build[target.platform]?.target
    addFailure(failures, Array.isArray(builderTarget) && sameJson(builderTarget, target.formats), `Builder ${target.platform} target differs from the release contract`)
    addFailure(failures, Array.isArray(target.architectures) && target.architectures.length > 0, `${target.platform} target architecture metadata is missing`)
  }

  const resources = contract?.resources ?? {}
  addFailure(failures, build.asar === true && resources.asar === true, 'ASAR packaging must remain enabled')
  addFailure(failures, sameJson(packageJson?.files, resources.npmFiles), 'npm package files differ from the release contract')
  addFailure(failures, sameJson(build.files, resources.builderFiles), 'Builder application files differ from the release contract')
  addFailure(failures, sameJson(build.extraResources, resources.builderExtraResources), 'Builder extra resources differ from the release contract')
  const resourceSource = JSON.stringify({
    files: packageJson?.files,
    buildFiles: build.files,
    extraResources: build.extraResources,
    contractResources: resources,
  })
  addFailure(failures, !VENDOR_SOURCE.test(resourceSource), 'vendor/ueli must not ship in npm, Builder files, or Builder resources')

  addFailure(failures, sameJson(packageJson?.dependencies, EXPECTED_LAUNCHER_DEPENDENCIES), 'launcher dependencies differ from the approved direct search set')
  const ueliRuntimeDependencies = new Set([
    ...Object.keys(vendorPackageJson?.dependencies ?? {}),
    ...Object.keys(vendorPackageJson?.optionalDependencies ?? {}),
  ])
  for (const [section, values] of Object.entries(packageJson ?? {})) {
    if (!/dependencies$/iu.test(section)) continue
    if (Array.isArray(values)) {
      for (const value of values) {
        addFailure(failures, typeof value !== 'string' || !VENDOR_SOURCE.test(value), `dependency value must not reference vendor/ueli: ${value}`)
        addFailure(failures, typeof value !== 'string' || !ueliRuntimeDependencies.has(value), `Ueli-derived dependency is admitted in package inputs: ${value}`)
      }
      continue
    }
    if (!values || typeof values !== 'object') continue
    for (const [dependencyName, version] of Object.entries(values)) {
      addFailure(failures, typeof version !== 'string' || !VENDOR_SOURCE.test(version), `dependency value must not reference vendor/ueli: ${dependencyName}@${version}`)
      const approvedVersion = EXPECTED_LAUNCHER_DEPENDENCIES[dependencyName]
      addFailure(
        failures,
        approvedVersion === undefined
          ? !ueliRuntimeDependencies.has(dependencyName)
          : version === approvedVersion,
        approvedVersion === undefined
          ? `Ueli-derived dependency is admitted in package inputs: ${dependencyName}`
          : `approved launcher dependency version differs: ${dependencyName}@${version}`,
      )
    }
  }

  validateLauncherLockfile(contract?.launcherLockfile, lockfileText, failures)

  const foundation = contract?.foundation ?? {}
  addFailure(failures, foundation.launcherImplemented === true, 'launcher implementation must be recorded in foundation')
  addFailure(failures, foundation.launcherPackaged === true, 'launcher must be packaged in foundation')
  addFailure(failures, sameJson(foundation.admittedRuntimeDependencies, EXPECTED_LAUNCHER_DEPENDENCY_LIST), 'Ueli-derived runtime dependencies differ from the approved launcher set')
  addFailure(failures, sameJson(foundation.runtimeDependencyClosure, EXPECTED_LAUNCHER_RUNTIME_CLOSURE), 'runtime dependency closure differs from the approved launcher set')
  addFailure(failures, sameJson(foundation.launcherAssets, EXPECTED_LAUNCHER_ASSETS), 'launcher asset admission differs from the reviewed asset provenance')
  addFailure(failures, sameJson(foundation.launcherNotices, EXPECTED_LAUNCHER_NOTICES), 'launcher notice admission differs from the reviewed notice rows')
  addFailure(failures, foundation.shippedVendorSource === false, 'foundation must not ship vendor source')
  addFailure(failures, foundation.importedUeliIdentity === false, 'foundation must not import Ueli identity')
  addFailure(failures, sameJson(foundation, EXPECTED_FOUNDATION), 'foundation contract differs from the reviewed empty-launcher state')

  const integration = contract?.ueliIntegration ?? {}
  addFailure(failures, sameJson(integration, EXPECTED_UELI_INTEGRATION), 'Ueli integration admission differs from the reviewed launcher state')

  const publication = contract?.publication ?? {}
  addFailure(failures, sameJson(publication.configuredTargets, EXPECTED_PUBLICATION.configuredTargets), 'configured publication targets differ from the release evidence')
  addFailure(failures, sameJson(publication.workflowArtifacts, EXPECTED_PUBLICATION.workflowArtifacts), 'workflow artifact evidence differs from the release evidence')
  addFailure(failures, Array.isArray(publication.launcherArtifacts) && publication.launcherArtifacts.length === 0, 'launcher publication evidence must remain empty in foundation')
  const publicationLabels = {
    installedArtifact: 'installed artifact',
    signed: 'signing',
    notarized: 'notarization',
    publicDistribution: 'public distribution',
  }
  for (const key of Object.keys(publicationLabels)) {
    addFailure(failures, publication[key] === false, `${publicationLabels[key]} evidence must remain false`)
  }
  addFailure(failures, sameJson(publication, EXPECTED_PUBLICATION), 'publication evidence contains an unapproved claim')

  validateNoticeLedger(inputs, failures)

  return {
    failures,
    summary: {
      packageName: identity.packageName,
      productName: identity.productName,
      appId: identity.appId,
      targets: targets.map(({ platform }) => platform),
      launcherImplemented: foundation.launcherImplemented,
      launcherPackaged: foundation.launcherPackaged,
      admittedRuntimeDependencies: foundation.admittedRuntimeDependencies,
    },
  }
}

export async function loadLauncherPackageFeasibilityInputs({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const contractPath = path.join(repoRoot, 'scripts/ueli/desktop-release-contract.json')
  const packagePath = path.join(repoRoot, 'package.json')
  const mainPath = path.join(repoRoot, 'src/main.ts')
  const contract = JSON.parse(await readFile(contractPath, 'utf8'))
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const noticeLedger = JSON.parse(await readFile(path.join(repoRoot, contract.noticeLedger), 'utf8'))
  const vendorPackageJson = JSON.parse(await readFile(path.join(repoRoot, 'vendor/ueli/package.json'), 'utf8'))
  const lockfileText = await readFile(path.join(repoRoot, contract.launcherLockfile.path), 'utf8')
  const noticeContents = {}
  for (const entry of noticeLedger.entries ?? []) {
    const sources = Array.isArray(entry.source) ? entry.source : [entry.source]
    for (const source of sources) {
      try {
        noticeContents[source] = await readFile(path.join(repoRoot, source), 'utf8')
      } catch {
        noticeContents[source] = ''
      }
    }
  }
  return {
    contract,
    packageJson,
    mainSource: await readFile(mainPath, 'utf8'),
    vendorPackageJson,
    lockfileText,
    noticeLedger,
    noticeContents,
  }
}

async function main() {
  const repoRoot = DEFAULT_REPO_ROOT
  const result = inspectLauncherPackageFeasibility(await loadLauncherPackageFeasibilityInputs({ repoRoot }))
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else if (result.failures.length === 0) {
    console.log(`TockTeam Desktop package feasibility passed: launcherImplemented=${result.summary.launcherImplemented}; launcherPackaged=${result.summary.launcherPackaged}`)
  } else {
    for (const failure of result.failures) console.error(`- ${failure}`)
  }
  process.exitCode = result.failures.length === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
