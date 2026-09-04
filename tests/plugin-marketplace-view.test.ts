import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveMarketplaceCatalogView } from '../plugins/plugin-marketplace/src/client/catalog-view.ts'
import { MARKETPLACE_MESSAGES } from '../plugins/plugin-marketplace/src/client/i18n.ts'
import type { MarketplacePlugin } from '../plugins/plugin-marketplace/src/protocol.ts'

function plugin(overrides: Partial<MarketplacePlugin> & Pick<MarketplacePlugin, 'id'>): MarketplacePlugin {
  return {
    category: 'plugins',
    currentCommit: null,
    description: `${overrides.id} description`,
    enabled: false,
    installed: false,
    latestCommit: null,
    mechanism: 'bundle',
    protected: false,
    pushedAt: null,
    repository: `example/${overrides.id}`,
    runtimeRisk: 'profile-bundle',
    stats: null,
    tags: [],
    title: overrides.id,
    trust: 'community',
    updateAvailable: false,
    url: `https://github.com/example/${overrides.id}`,
    ...overrides,
  }
}

const catalog = [
  plugin({
    category: 'system',
    enabled: true,
    id: 'built-in',
    installed: true,
    protected: true,
    tags: ['managed'],
  }),
  plugin({ category: 'skills', id: 'available', tags: ['searchable'] }),
  plugin({ id: 'disabled', installed: true, updateAvailable: true }),
]

test('Marketplace built-in visibility and repository metadata copy are localized', () => {
  assert.equal(MARKETPLACE_MESSAGES.en['show-builtins'], 'Show Built-in Plugins')
  assert.equal(MARKETPLACE_MESSAGES.zh['show-builtins'], '显示内置插件')
  assert.equal(MARKETPLACE_MESSAGES.en['open-issues'], 'Open Issues and Pull Requests')
  assert.equal(MARKETPLACE_MESSAGES.zh['open-issues'], '开放 Issue 与 PR')
  assert.equal(MARKETPLACE_MESSAGES.en.license, 'License')
  assert.equal(MARKETPLACE_MESSAGES.zh.license, '许可证')
})

const filters = {
  categoryFilter: 'all',
  search: '',
  showBuiltins: false,
  statusFilter: 'all' as const,
}

test('Marketplace catalog views hide built-ins and derive every filter from visible plugins', () => {
  const hidden = deriveMarketplaceCatalogView(catalog, filters)
  assert.deepEqual(hidden.visibleCatalog.map(plugin => plugin.id), ['available', 'disabled'])
  assert.deepEqual(hidden.categories, ['plugins', 'skills'])
  assert.deepEqual(hidden.statusCounts, {
    all: 2,
    available: 1,
    disabled: 1,
    installed: 1,
    updates: 1,
  })
  assert.deepEqual(
    deriveMarketplaceCatalogView(catalog, { ...filters, search: 'managed' }).plugins,
    [],
  )
  assert.deepEqual(
    deriveMarketplaceCatalogView(catalog, { ...filters, search: 'searchable' })
      .plugins.map(plugin => plugin.id),
    ['available'],
  )
  for (const [statusFilter, expected] of [
    ['available', ['available']],
    ['disabled', ['disabled']],
    ['installed', ['disabled']],
    ['updates', ['disabled']],
  ] as const) {
    assert.deepEqual(
      deriveMarketplaceCatalogView(catalog, { ...filters, statusFilter })
        .plugins.map(plugin => plugin.id),
      expected,
    )
  }

  const shown = deriveMarketplaceCatalogView(catalog, {
    ...filters,
    categoryFilter: 'system',
    showBuiltins: true,
  })
  assert.deepEqual(shown.visibleCatalog.map(plugin => plugin.id), ['built-in', 'available', 'disabled'])
  assert.deepEqual(shown.categories, ['plugins', 'skills', 'system'])
  assert.equal(shown.categoryFilter, 'system')
  assert.equal(shown.statusCounts.all, 3)

  const hiddenAgain = deriveMarketplaceCatalogView(catalog, {
    ...filters,
    categoryFilter: shown.categoryFilter,
  })
  assert.equal(hiddenAgain.categoryFilter, 'all')
  assert.deepEqual(hiddenAgain.plugins.map(plugin => plugin.id), ['available', 'disabled'])
})
