import type { VaultGraphResult } from './types.ts'

export const MAX_GRAPH_NODES = 180
export const MAX_GRAPH_EDGES = 512

export interface GraphProjection {
  activePath: string | null
  edges: VaultGraphResult['edges']
  nodes: VaultGraphResult['nodes']
}

export interface GraphProjectionOptions {
  includeOrphans: boolean
  query: string
}

export interface GraphLayoutOptions {
  centerForce: number
  iterations: number
  linkDistance: number
  linkForce: number
  repelForce: number
}

export interface GraphPosition {
  depth: number | null
  path: string
  x: number
  y: number
}

function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 4_096 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
}

export function projectGraph(result: VaultGraphResult, options: GraphProjectionOptions): GraphProjection {
  if (!Array.isArray(result.nodes) || result.nodes.length > MAX_GRAPH_NODES) throw new Error('Graph node limit exceeded.')
  if (!Array.isArray(result.edges) || result.edges.length > MAX_GRAPH_EDGES) throw new Error('Graph edge limit exceeded.')
  const query = options.query.trim().toLocaleLowerCase().slice(0, 1_000)
  const orphanSet = new Set(result.orphans)
  const nodes = result.nodes
    .filter(node => safePath(node.path)
      && (options.includeOrphans || !orphanSet.has(node.path))
      && (query === '' || node.path.toLocaleLowerCase().includes(query)))
    .toSorted((left, right) => left.path.localeCompare(right.path))
  const paths = new Set(nodes.map(node => node.path))
  const edges = result.edges
    .filter(edge => paths.has(edge.sourcePath) && paths.has(edge.targetPath) && safePath(edge.sourcePath) && safePath(edge.targetPath))
    .toSorted((left, right) => left.sourcePath.localeCompare(right.sourcePath)
      || left.targetPath.localeCompare(right.targetPath)
      || left.line - right.line)
  return { activePath: result.path, edges, nodes }
}

function hash(value: string): number {
  let result = 2166136261
  for (const character of value) result = Math.imul(result ^ character.codePointAt(0)!, 16777619) >>> 0
  return result
}

function bounded(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function layoutGraph(graph: GraphProjection, options: GraphLayoutOptions): GraphPosition[] {
  if (graph.nodes.length > MAX_GRAPH_NODES || graph.edges.length > MAX_GRAPH_EDGES) throw new Error('Graph layout limit exceeded.')
  const iterations = Math.round(bounded(options.iterations, 1, 64, 32))
  const repel = bounded(options.repelForce, 0, 10_000, 1_800)
  const linkForce = bounded(options.linkForce, 0, 1, 0.08)
  const linkDistance = bounded(options.linkDistance, 20, 500, 120)
  const centerForce = bounded(options.centerForce, 0, 1, 0.1)
  const positions = graph.nodes.map((node, index) => {
    if (node.path === graph.activePath) return { ...node, x: 0, y: 0 }
    const angle = ((hash(node.path) % 3600) / 3600) * Math.PI * 2
    const radius = 80 + (index % 12) * 18
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
  const indexByPath = new Map(positions.map((node, index) => [node.path, index]))
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const delta = positions.map(() => ({ x: 0, y: 0 }))
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const a = positions[left]!
        const b = positions[right]!
        let dx = a.x - b.x
        let dy = a.y - b.y
        let distanceSquared = dx * dx + dy * dy
        if (distanceSquared < 1) {
          dx = ((hash(`${a.path}:${b.path}`) % 200) - 100) / 100
          dy = ((hash(`${b.path}:${a.path}`) % 200) - 100) / 100
          distanceSquared = Math.max(1, dx * dx + dy * dy)
        }
        const force = repel / distanceSquared
        delta[left]!.x += dx * force
        delta[left]!.y += dy * force
        delta[right]!.x -= dx * force
        delta[right]!.y -= dy * force
      }
    }
    for (const edge of graph.edges) {
      const source = indexByPath.get(edge.sourcePath)
      const target = indexByPath.get(edge.targetPath)
      if (source === undefined || target === undefined) continue
      const a = positions[source]!
      const b = positions[target]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - linkDistance) * linkForce
      const x = dx / distance * force
      const y = dy / distance * force
      delta[source]!.x += x
      delta[source]!.y += y
      delta[target]!.x -= x
      delta[target]!.y -= y
    }
    for (let index = 0; index < positions.length; index += 1) {
      const node = positions[index]!
      if (node.path === graph.activePath) {
        node.x = 0
        node.y = 0
        continue
      }
      node.x = bounded(node.x + delta[index]!.x - node.x * centerForce, -2_000, 2_000, 0)
      node.y = bounded(node.y + delta[index]!.y - node.y * centerForce, -2_000, 2_000, 0)
    }
  }
  return positions.map(node => ({ ...node, x: Math.round(node.x * 100) / 100, y: Math.round(node.y * 100) / 100 }))
}
