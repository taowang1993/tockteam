import type { MarketplacePlugin } from '../protocol.ts'

export type MarketplaceStatusFilter = 'all' | 'installed' | 'available' | 'updates' | 'disabled'

interface MarketplaceCatalogFilters {
  categoryFilter: string
  search: string
  showBuiltins: boolean
  statusFilter: MarketplaceStatusFilter
}

export function deriveMarketplaceCatalogView(
  catalog: readonly MarketplacePlugin[],
  filters: MarketplaceCatalogFilters,
): {
  categories: string[]
  visibleCatalog: readonly MarketplacePlugin[]
  categoryFilter: string
  plugins: MarketplacePlugin[]
  statusCounts: Record<MarketplaceStatusFilter, number>
} {
  const visibleCatalog = filters.showBuiltins
    ? catalog
    : catalog.filter(plugin => !plugin.protected)
  const categories = [...new Set(visibleCatalog.map(plugin => plugin.category))].sort()
  const categoryFilter = filters.categoryFilter === 'all'
    || categories.includes(filters.categoryFilter)
    ? filters.categoryFilter
    : 'all'
  const installed = visibleCatalog.filter(plugin => plugin.installed).length
  const needle = filters.search.trim().toLowerCase()
  return {
    categories,
    visibleCatalog,
    categoryFilter,
    plugins: visibleCatalog.filter(plugin => {
      if (filters.statusFilter === 'installed' && !plugin.installed) return false
      if (filters.statusFilter === 'available' && plugin.installed) return false
      if (filters.statusFilter === 'updates' && !plugin.updateAvailable) return false
      if (filters.statusFilter === 'disabled' && (!plugin.installed || plugin.enabled)) return false
      if (categoryFilter !== 'all' && plugin.category !== categoryFilter) return false
      return needle === '' || [plugin.title, plugin.description, plugin.category, ...plugin.tags]
        .some(value => value.toLowerCase().includes(needle))
    }),
    statusCounts: {
      all: visibleCatalog.length,
      available: visibleCatalog.length - installed,
      disabled: visibleCatalog.filter(plugin => plugin.installed && !plugin.enabled).length,
      installed,
      updates: visibleCatalog.filter(plugin => plugin.updateAvailable).length,
    },
  }
}
