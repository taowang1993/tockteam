import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  auditParityCatalogs,
  CATALOG_NAMES,
  compareCatalog,
} from '../scripts/ueli/parity-catalogs.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(repoRoot, 'scripts/ueli/parity-catalogs.json')
const sourceMutations = [
  {
    catalog: 'bootstrap',
    file: 'src/main/index.ts',
    append: '\nCore.SyntheticParityModule.bootstrap(moduleRegistry);\n',
  },
  {
    catalog: 'extensions',
    file: 'src/main/Extensions/ExtensionLoader.ts',
    append: '\nnew SyntheticParityExtensionModule();\n',
  },
  {
    catalog: 'actionHandlers',
    file: 'src/main/Extensions/SyntheticParity/SyntheticParityActionHandler.ts',
    content: 'export class SyntheticParityActionHandler { public readonly id = "SyntheticParityAction"; }\n',
  },
  {
    catalog: 'bridgeMethods',
    file: 'src/common/Core/ContextBridge.ts',
    mutateSource: (source: string) => source.replace(/\n\};\s*$/u, '\n    syntheticParityMethod?(): void;\n};\n'),
  },
  {
    catalog: 'ipcChannels',
    file: 'src/preload/index.ts',
    append: '\nipcRenderer.invoke("syntheticParityChannel");\n',
  },
  {
    catalog: 'rendererSurfaces',
    file: 'src/renderer/Core/App.tsx',
    append: '\nconst syntheticParityRoute = <Route path="/synthetic-parity" />;\n',
  },
  {
    catalog: 'registries',
    file: 'src/main/Core/Terminal/TerminalModule.ts',
    append: '\nconst syntheticParityTerminal = new SyntheticParityTerminal();\n',
  },
  {
    catalog: 'settings',
    file: 'src/renderer/Core/App.tsx',
    append: '\nwindow.ContextBridge.getSettingValue("synthetic.parity.setting", false);\n',
  },
  {
    catalog: 'assets',
    file: 'assets/SyntheticParity/synthetic-parity.png',
    content: 'synthetic parity asset\n',
  },
  {
    catalog: 'dependencies',
    file: 'package.json',
    mutateJson: (packageJson: Record<string, unknown>) => ({
      ...packageJson,
      dependencies: {
        ...(packageJson.dependencies as Record<string, string>),
        'synthetic-parity-dependency': '1.0.0',
      },
    }),
  },
  {
    catalog: 'platforms',
    file: 'electron-builder.config.js',
    append: '\nconst syntheticParityTarget = { target: "synthetic-parity-target" };\n',
  },
]

function manifestCatalogs() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).catalogs as Record<string, Array<Record<string, unknown>>>
}

function catalogRows(catalog: string) {
  const rows = manifestCatalogs()[catalog]
  assert.ok(rows, `missing catalog ${catalog}`)
  return rows
}

test('the pinned Ueli source matches every TockTeam parity catalog', async () => {
  const result = await auditParityCatalogs({ repoRoot })

  assert.deepEqual(Object.keys(result.counts), CATALOG_NAMES)
  assert.deepEqual(Object.values(result.counts), [67, 24, 31, 39, 128, 34, 17, 100, 108, 699, 13])
  assert.equal(result.unclassified.length, 0)
})

for (const catalog of CATALOG_NAMES) {
  test(`${catalog} catalog rejects an in-memory addition`, () => {
    const expected = catalogRows(catalog)
    const actual = [...expected, {
      id: `synthetic-${catalog}`,
      source: `synthetic/${catalog}`,
      applicability: ['macOS'],
      capabilities: catalog,
      securityDisposition: 'compose-behind-tockteam-boundary',
      divergence: 'synthetic mutation',
      owner: 'test',
      issue: 'tockteam-tl.1',
      evidence: 'test',
      ...(catalog === 'settings' ? { defaultValue: 'undefined' } : {}),
    }]

    assert.throws(() => compareCatalog(catalog, expected, actual), new RegExp(`Ueli parity catalog ${catalog} drift`, 'u'))
  })

  test(`${catalog} catalog rejects an in-memory removal`, () => {
    const expected = catalogRows(catalog)
    const actual = expected.slice(1)

    assert.throws(() => compareCatalog(catalog, expected, actual), new RegExp(`Ueli parity catalog ${catalog} drift`, 'u'))
  })

  test(`${catalog} catalog rejects an in-memory row swap`, () => {
    const expected = catalogRows(catalog)
    const actual = [...expected]
    ;[actual[0], actual[1]] = [actual[1]!, actual[0]!]

    assert.throws(() => compareCatalog(catalog, expected, actual), /classification or source order changed/u)
  })

  test(`${catalog} catalog rejects an in-memory classification mutation`, () => {
    const expected = catalogRows(catalog)
    const actual = structuredClone(expected)
    actual[0]!.issue = 'tockteam-tl.15'

    assert.throws(() => compareCatalog(catalog, expected, actual), /classification or source order changed/u)
  })
}

test('source discovery rejects an unmapped addition without editing vendor or manifest', async () => {
  const source = await readFile(join(repoRoot, 'vendor/ueli/src/main/index.ts'), 'utf8')

  await assert.rejects(
    auditParityCatalogs({
      repoRoot,
      sourceOverrides: {
        'src/main/index.ts': `${source}\nCore.SyntheticParityModule.bootstrap(moduleRegistry);\n`,
      },
    }),
    /Ueli parity catalog bootstrap drift/u,
  )
})

test('AST discovery ignores IPC and route text in comments', async () => {
  const [preload, renderer] = await Promise.all([
    readFile(join(repoRoot, 'vendor/ueli/src/preload/index.ts'), 'utf8'),
    readFile(join(repoRoot, 'vendor/ueli/src/renderer/Core/App.tsx'), 'utf8'),
  ])

  await assert.doesNotReject(auditParityCatalogs({
    repoRoot,
    sourceOverrides: {
      'src/preload/index.ts': `${preload}\n// ipcRenderer.invoke("comment-only-channel");\n`,
      'src/renderer/Core/App.tsx': `${renderer}\n// <Route path="/comment-only-route" />\n`,
    },
  }))
})

for (const fixture of sourceMutations) {
  test(`${fixture.catalog} source discovery rejects an unmapped mutation`, async () => {
    let sourceOverrides: Record<string, string>
    if (fixture.content !== undefined) {
      sourceOverrides = { [fixture.file]: fixture.content }
    } else {
      const source = await readFile(join(repoRoot, 'vendor/ueli', fixture.file), 'utf8')
      if (fixture.mutateSource) sourceOverrides = { [fixture.file]: fixture.mutateSource(source) }
      else if (fixture.mutateJson) sourceOverrides = {
        [fixture.file]: `${JSON.stringify(fixture.mutateJson(JSON.parse(source)), null, 2)}\n`,
      }
      else sourceOverrides = { [fixture.file]: `${source}${fixture.append}` }
    }

    await assert.rejects(
      auditParityCatalogs({ repoRoot, sourceOverrides }),
      new RegExp(`Ueli parity catalog ${fixture.catalog} drift`, 'u'),
    )
  })
}

test('the parity manifest remains anchored to the pinned release and TockTeam wording', async () => {
  const manifestText = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestText)

  assert.deepEqual(manifest.baseline, {
    tag: 'v9.29.0',
    commit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  })
  assert.equal(manifestText.includes('tockbot-'), false)
})

test('the catalog audit rejects unknown or missing manifest catalog keys', async () => {
  const root = await mkdtemp(join(repoRoot, '.tmp-ueli-manifest-'))
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.catalogs.extra = []
    delete manifest.catalogs.platforms
    const mutatedManifestPath = join(root, 'parity-catalogs.json')
    await writeFile(mutatedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    await assert.rejects(
      auditParityCatalogs({ repoRoot, manifestPath: mutatedManifestPath }),
      /exactly the 11 known catalog keys/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the catalog audit rejects a duplicate registration at a different source offset', async () => {
  const source = await readFile(join(repoRoot, 'vendor/ueli/src/main/index.ts'), 'utf8')
  const registration = source.match(/^\s*(?:await\s+)?(?:Core|Extensions)\.[A-Za-z0-9_]+\.bootstrap\(moduleRegistry\);/mu)?.[0]
  assert.ok(registration)

  await assert.rejects(
    auditParityCatalogs({
      repoRoot,
      sourceOverrides: {
        'src/main/index.ts': `${source}\n${registration}\n`,
      },
    }),
    /duplicate bootstrap occurrence/u,
  )
})

test('golden catalog rows preserve provider ownership, security dispositions, and platform semantics', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const row = (catalog: string, id: string) => {
    const found = manifest.catalogs[catalog].find((candidate: { id: string }) => candidate.id === id)
    assert.ok(found, `missing ${catalog}:${id}`)
    return found
  }

  const extensionIssues = Object.fromEntries(manifest.catalogs.extensions.map((candidate: { id: string; issue: string }) => [candidate.id, candidate.issue]))
  assert.deepEqual(extensionIssues, {
    AppearanceSwitcherModule: 'tockteam-tl.10',
    ApplicationSearchModule: 'tockteam-tl.7',
    Base64ConversionModule: 'tockteam-tl.6',
    BrowserBookmarksModule: 'tockteam-tl.7',
    CalculatorModule: 'tockteam-tl.6',
    ColorConverterExtensionModule: 'tockteam-tl.6',
    CurrencyConversionModule: 'tockteam-tl.9',
    CustomWebSearchModule: 'tockteam-tl.9',
    DeeplTranslatorModule: 'tockteam-tl.9',
    FileSearchModule: 'tockteam-tl.8',
    JetBrainsToolboxModule: 'tockteam-tl.7',
    PasswordGeneratorModule: 'tockteam-tl.6',
    QuickFormatterModule: 'tockteam-tl.6',
    RowlandTextEditorModule: 'tockteam-tl.6',
    SimpleFileSearchExtensionModule: 'tockteam-tl.8',
    SystemCommandsModule: 'tockteam-tl.10',
    SystemSettingsModule: 'tockteam-tl.10',
    TerminalLauncherModule: 'tockteam-tl.11',
    UeliCommandModule: 'tockteam-tl.10',
    UuidGeneratorModule: 'tockteam-tl.6',
    VSCodeModule: 'tockteam-tl.7',
    WebSearchExtensionModule: 'tockteam-tl.9',
    WindowsControlPanelModule: 'tockteam-tl.10',
    WorkflowExtensionModule: 'tockteam-tl.12',
  })

  const platformApplicability = {
    'architecture:arm64': ['macOS', 'Windows', 'Linux'],
    'architecture:x64': ['macOS', 'Windows', 'Linux'],
    'package-target:AppImage': ['Linux'],
    'package-target:appx': ['Windows'],
    'package-target:deb': ['Linux'],
    'package-target:dmg': ['macOS'],
    'package-target:msi': ['Windows'],
    'package-target:nsis': ['Windows'],
    'package-target:rpm': ['Linux'],
    'package-target:zip': ['macOS', 'Windows', 'Linux'],
    'platform:darwin': ['macOS'],
    'platform:linux': ['Linux'],
    'platform:win32': ['Windows'],
  }
  for (const [id, applicability] of Object.entries(platformApplicability)) {
    assert.deepEqual(row('platforms', id).applicability, applicability, id)
  }

  assert.deepEqual(row('assets', 'assets/Core/Terminal/command-prompt.png').applicability, ['Windows'])
  assert.deepEqual(row('assets', 'assets/Core/Terminal/terminal.png').applicability, ['macOS'])
  assert.deepEqual(row('assets', 'assets/Core/WebBrowser/firefox.png').applicability, ['macOS', 'Windows'])
  assert.deepEqual(row('actionHandlers', 'LaunchDesktopFileActionHandler').applicability, ['Linux'])
  assert.deepEqual(row('settings', 'extension:FileSearch:everythingCliFilePath').applicability, ['Windows'])
  assert.equal(row('assets', 'assets/Extensions/AppearanceSwitcher/switch-to-dark-mode.png').issue, 'tockteam-tl.14,tockteam-tl.10')
  assert.equal(row('settings', 'extension:VSCode:command').issue, 'tockteam-tl.5,tockteam-tl.7')
  assert.equal(row('rendererSurfaces', 'extension-settings:VSCode').issue, 'tockteam-tl.5,tockteam-tl.13,tockteam-tl.7')

  const vscodeCommand = row('settings', 'extension:VSCode:command').defaultValue
  assert.match(vscodeCommand, /"code %s"/u)
  assert.match(vscodeCommand, /"\/usr\/local\/bin\/code %s"/u)
  assert.match(vscodeCommand, /this\.operatingSystem === "macOS"/u)

  for (const catalog of ['actionHandlers', 'bridgeMethods', 'ipcChannels']) {
    assert.equal(row(catalog, manifest.catalogs[catalog][0].id).securityDisposition, 'replace-with-typed-tockteam-adapter')
  }
  assert.equal(row('dependencies', manifest.catalogs.dependencies[0].id).securityDisposition, 'inventory-only-not-installed')
  assert.equal(row('dependencies', manifest.catalogs.dependencies[0].id).issue, 'tockteam-tl.14,tockteam-tl.15')
})
