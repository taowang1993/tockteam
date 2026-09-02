export type VaultTruncationReason =
  | 'byte-limit'
  | 'entry-limit'
  | 'file-limit'
  | 'metadata-limit'
  | 'result-limit'
  | null

export type VaultMediaKind = 'audio' | 'image' | 'pdf' | 'video'
export type VaultDocumentType = 'base' | 'canvas' | 'markdown'

export interface VaultInspectionLimits {
  maxReadBytes: number
  maxSearchBytes: number
  maxSearchEntries: number
  maxSearchFileBytes: number
  maxSearchResults: number
}

export interface VaultInspectionInventoryRequest {
  cursor?: string | null
  limit?: number
}

export interface VaultInspectionDocumentEntry {
  path: string
  kind: 'document'
  createdMs: number
  modifiedMs: number
  size: number
  revision?: string
}

export interface VaultInspectionAttachmentEntry {
  path: string
  kind: 'attachment'
  mediaKind: VaultMediaKind
  createdMs: number
  modifiedMs: number
  size: number
  revision?: string
}

export type VaultInspectionInventoryEntry =
  | VaultInspectionDocumentEntry
  | VaultInspectionAttachmentEntry

export interface VaultInspectionInventoryPage {
  /**
   * Accepted, non-hidden vault files in strict ascending path order. Ordering
   * must remain global across pages reached through `cursor`.
   */
  entries: VaultInspectionInventoryEntry[]
  cursor: string | null
  complete: boolean
  truncated: boolean
  truncationReason: VaultTruncationReason
  warnings: string[]
}

export interface VaultInspectionDocument {
  path: string
  content: string
}

export interface VaultSearchCandidateRequest {
  directory: string
  groups: Array<Array<{ field: 'property' | 'tag'; value: string }>>
  limit: number
}

export interface VaultSearchCandidateResult {
  complete: true
  epoch: string
  paths: string[]
}

export interface VaultInspectionInput {
  /** Return one bounded, deterministic inventory page. */
  list(
    request: VaultInspectionInventoryRequest,
    signal: AbortSignal,
  ): Promise<VaultInspectionInventoryPage>
  read(
    path: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<VaultInspectionDocument>
  /** Return a complete conservative path superset, or null to use the bounded scanner. */
  searchCandidates?(
    request: VaultSearchCandidateRequest,
    signal: AbortSignal,
  ): Promise<VaultSearchCandidateResult | null>
}

export interface VaultScanCounters {
  bytes: number
  entries: number
  files: number
}

export interface VaultScanResult {
  cursor: string | null
  scan: VaultScanCounters
  truncationReason: VaultTruncationReason
  warnings: string[]
}

export interface VaultPathRewriteArgs {
  /** Pre-move vault-relative POSIX path for a file or directory. */
  oldPath: string
  newPath: string
  isDirectory: boolean
  cursor?: string
}

export interface VaultPathRewriteUpdate {
  /** Post-move logical path. Invert the requested move to recover its pre-move source path. */
  path: string
  newContent: string
  /** Exact pre-move inventory revision for this logical referrer, when supplied by the provider. */
  revision?: string
}

export interface VaultPathRewriteResult extends VaultScanResult {
  /** Changed Markdown referrers only; Canvas and Base documents are never rewritten. */
  updates: VaultPathRewriteUpdate[]
  /**
   * True only after the full Markdown inventory, source fingerprint, parser
   * work, update bytes, and every result page are complete. Source caps are
   * terminal; only result-limit pages return a continuation cursor.
   */
  complete: boolean
  truncated: boolean
}

export interface VaultSearchArgs {
  query: string
  mode?: 'literal' | 'query' | 'related'
  scope?: 'all' | 'content' | 'path' | 'properties'
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  directory?: string
  limit?: number
  cursor?: string
}

export interface VaultSearchMatch {
  path: string
  kind: 'base' | 'block' | 'canvas' | 'content' | 'line' | 'path' | 'property' | 'section' | 'tag' | 'task'
  line: number | null
  preview: string
  lineEnd?: number | null
  score?: number
  operator?: 'any' | 'block' | 'content' | 'file' | 'line' | 'path' | 'property' | 'related' | 'section' | 'tag' | 'task' | 'task-done' | 'task-todo'
  provenance?: 'body' | 'canvas' | 'frontmatter' | 'path' | 'section' | 'task'
}

export interface VaultSearchResult extends VaultScanResult {
  query: string
  matches: VaultSearchMatch[]
  truncated: boolean
}

export interface VaultReadArgs {
  path: string
  heading?: string
  blockId?: string
  footnote?: string
  inlineFootnote?: number
}

export interface VaultListArgs {
  directory?: string
  kind?: 'documents' | 'attachments' | 'all'
  includeStats?: boolean
  sort?: 'created' | 'modified' | 'path' | 'recent'
  limit?: number
  cursor?: string
}

export interface VaultPropertyValue {
  isNull: boolean
  key: string
  values: string[]
}

export interface VaultTaskCounts {
  done: number
  todo: number
  total: number
}

export interface VaultDocumentStats {
  words: number
  characters: number
  headings: number
  readingMinutes: number
}

export interface VaultListedDocument {
  path: string
  type: VaultDocumentType
  title: string
  modifiedMs: number
  createdMs: number | null
  size: number
  tags: string[]
  aliases: string[]
  properties: VaultPropertyValue[]
  tasks: VaultTaskCounts
  stats?: VaultDocumentStats
}

export interface VaultListedAttachment {
  path: string
  type: 'attachment'
  mediaKind: VaultMediaKind
  extension: string
  modifiedMs: number
  createdMs: number | null
  size: number
}

export type VaultListedEntry = VaultListedDocument | VaultListedAttachment

export interface VaultListResult extends VaultScanResult {
  entries: VaultListedEntry[]
  truncated: boolean
}

export type VaultLinkKind =
  | 'canvas-file'
  | 'embed'
  | 'image'
  | 'image-reference'
  | 'markdown'
  | 'reference'
  | 'tag'
  | 'wiki'

export interface VaultLinkRecord {
  authoredTarget: string
  displayText: string
  fragment: string | null
  kind: VaultLinkKind
  line: number
  normalizedTarget: string
  resolvedPath: string | null
  sourcePath: string
  status: 'ambiguous' | 'resolved' | 'unresolved'
}

export interface VaultLinksArgs {
  path: string
  includeUnlinked?: boolean
  cursor?: string
}

export interface VaultTagRelation {
  tag: string
  paths: string[]
}

export interface VaultUnlinkedMention {
  sourcePath: string
  line: number
  matchedText: string
  identifierKind: 'title' | 'basename' | 'alias'
  snippet: string
}

export interface VaultLinksResult extends VaultScanResult {
  path: string
  outgoing: string[]
  backlinks: string[]
  outgoingDetails: VaultLinkRecord[]
  backlinkDetails: VaultLinkRecord[]
  tagRelations: VaultTagRelation[]
  truncated: boolean
  complete?: boolean
  unlinkedMentions?: VaultUnlinkedMention[]
}

export interface VaultOutlineArgs {
  path: string
  includeFootnotes?: boolean
  includeQueries?: boolean
  limit?: number
}

export interface VaultHeading {
  level: number
  line: number
  selector: string
  text: string
}

export interface VaultInlineFootnote {
  ordinal: number
  kind: 'inline'
  content: string
  line: number
}

export interface VaultQueryBlock {
  ordinal: number
  query: string
  line: number
  lineEnd: number
  fence: string
}

export interface VaultOutlineResult {
  path: string
  headings: VaultHeading[]
  truncated: boolean
  footnotes?: VaultInlineFootnote[]
  footnotesTruncated?: boolean
  queries?: VaultQueryBlock[]
  queriesTruncated?: boolean
}

export interface VaultGraphArgs {
  scope?: 'local' | 'global'
  path?: string
  depth?: number
  direction?: 'outgoing' | 'backlinks' | 'both'
  tag?: string
  includeTags?: boolean
  includeAttachments?: boolean
  limit?: number
  cursor?: string
}

export interface VaultGraphNode {
  path: string
  depth: number | null
}

export interface VaultGraphEdge {
  sourcePath: string
  targetPath: string
  kind: VaultLinkKind
  line: number
  fragment: string | null
}

export interface VaultGraphResult {
  path: string | null
  nodes: VaultGraphNode[]
  edges: VaultGraphEdge[]
  missing: VaultLinkRecord[]
  orphans: string[]
  complete: boolean
  truncated: boolean
  scan: VaultScanCounters
  truncationReason: VaultTruncationReason
  warnings: string[]
  cursor?: string | null
}

export interface VaultCanvasArgs {
  path: string
  limit?: number
  cursor?: string
}

export interface VaultCanvasItem {
  kind: 'node' | 'edge'
  id: string
  line: number
  type: string | null
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  text: string | null
  file: string | null
  url: string | null
  label: string | null
  color: string | null
  fromNode: string | null
  toNode: string | null
  fromSide: string | null
  toSide: string | null
  fromEnd: string | null
  toEnd: string | null
}

export interface VaultCanvasResult {
  path: string
  items: VaultCanvasItem[]
  cursor: string | null
  truncated: boolean
  truncationReason: VaultTruncationReason
  warnings: string[]
}

export interface VaultFacetsArgs {
  directory?: string
  limit?: number
  cursor?: string
}

export type VaultPropertyType = 'null' | 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'list'

export interface VaultFacetsResult extends VaultScanResult {
  tags: Array<{ tag: string; count: number }>
  properties: Array<{ key: string; count: number; types: VaultPropertyType[] }>
  complete: boolean
  truncated: boolean
}

export interface VaultInspection {
  search(args: VaultSearchArgs, signal?: AbortSignal): Promise<VaultSearchResult>
  read(args: VaultReadArgs, signal?: AbortSignal): Promise<VaultInspectionDocument>
  list(args?: VaultListArgs, signal?: AbortSignal): Promise<VaultListResult>
  links(args: VaultLinksArgs, signal?: AbortSignal): Promise<VaultLinksResult>
  outline(args: VaultOutlineArgs, signal?: AbortSignal): Promise<VaultOutlineResult>
  graph(args?: VaultGraphArgs, signal?: AbortSignal): Promise<VaultGraphResult>
  canvas(args: VaultCanvasArgs, signal?: AbortSignal): Promise<VaultCanvasResult>
  facets(args?: VaultFacetsArgs, signal?: AbortSignal): Promise<VaultFacetsResult>
  planPathRewrite(
    args: VaultPathRewriteArgs,
    signal?: AbortSignal,
  ): Promise<VaultPathRewriteResult>
}

export function createVaultInspection(
  input: VaultInspectionInput,
  limits: VaultInspectionLimits,
): VaultInspection
