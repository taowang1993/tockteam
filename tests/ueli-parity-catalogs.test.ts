import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  auditParityCatalogs,
  CATALOG_NAMES,
  compareCatalog,
} from '../scripts/ueli/parity-catalogs.mjs'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/u, '')
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

test('the parity manifest remains anchored to the pinned release', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  assert.deepEqual(manifest.baseline, {
    tag: 'v9.29.0',
    commit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  })
})
