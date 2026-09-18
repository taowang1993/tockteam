# Tockbot Note Vault

A general-purpose, read-only Tockbot bundle for bounded local Markdown, Obsidian Canvas, and inert Base inspection.

| Tool | Purpose |
| --- | --- |
| `vault_search` | Run literal, advanced query, structured, or local Related search with citations and resumable cursors. |
| `vault_read` | Read a document or one Markdown heading, block ID, definition footnote, or inline-footnote ordinal. |
| `vault_list` | List documents or accepted attachment metadata, with optional Markdown statistics and deterministic ordering. |
| `vault_links` | Inspect resolved relationships and optional incoming unlinked mentions. |
| `vault_outline` | Return bounded ATX headings plus optional inline-footnote and inert `query`-block inventories. |
| `vault_graph` | Inspect a bounded local graph or cursor-paged global graph with optional tag and attachment nodes. |
| `vault_canvas` | Inspect validated, inert Canvas nodes and edges through deterministic pages. |
| `vault_facets` | Count additive tag and property facets, including bounded property types. |

## Install

Set the vault root before starting the profile:

```sh
export TOCKBOT_NOTE_VAULT_PATH="$HOME/Documents/Notes"
dsh plugin --profile desktop add /path/to/tockbot-note-vault
dsh --profile desktop --dump-config
dsh --profile desktop
```

For a reviewed GitHub revision, install `github:<owner>/<repo>#<commit>`. The package ships runnable JavaScript, so installation requires no build-script allowance.

Remove it with:

```sh
dsh plugin --profile desktop remove tockbot-note-vault
```

## Configuration

Override the bundle row in the profile's `cordis.patch.yml` when environment variables are unsuitable:

```yaml
- id: tockbot-note-vault
  name: tockbot-note-vault
  config:
    root: '/absolute/path/to/notes'
    maxReadBytes: 262144
    maxSearchBytes: 67108864
    maxSearchEntries: 20000
    maxSearchFileBytes: 2097152
    maxSearchResults: 50
```

Content reads remain limited to `.md`, `.markdown`, `.canvas`, and raw `.base` files. Accepted image, audio, video, and PDF attachments expose safe-stat metadata only; binary content is never opened. Hidden entries and scan-time symbolic links are skipped. Direct reads use verified handles and reject traversal, escapes, and type-changing links. File, byte, entry, metadata, result, and cursor bounds limit work; warnings and truncation reasons remain vault-relative.

## Tool Notes

- `vault_search` defaults to backward-compatible literal matching. Set `mode: query` for AND/OR/negation, regex, case, word, directory, `file:`, `path:`, `content:`, property, tag, line, block, section, and task operators. Set `mode: related` for deterministic local token/stem ranking; it does not use embeddings or a network service.
- `vault_read` accepts one optional Markdown selector: case-insensitive `heading`, `blockId` without the caret, definition `footnote` without brackets, or source-order `inlineFootnote`. Duplicate headings use selectors such as `Decisions::2`; duplicate block IDs or definition footnotes fail as ambiguous.
- `vault_list` defaults to documents; set `kind` to `attachments` or `all` for accepted safe-stat metadata, and `includeStats` for Markdown source word, UTF-16 character, ATX heading, and reading-minute counts. Its default sort remains `path`; use `sort: "recent"` for deterministic recent discovery. Random selection is intentionally caller-owned over bounded list pages.
- `vault_links` preserves the original `outgoing` and `backlinks` path arrays while adding detailed records, tag relations, unique-alias resolution, duplicate-alias ambiguity, and Canvas file nodes. `includeUnlinked` reports incoming body mentions only when the bounded scan proves target identifiers unique and complete. Canvas URL nodes and external URLs are never fetched.
- `vault_outline` keeps ATX headings as its default shape. `includeFootnotes` inventories bounded single-line inline footnotes; `includeQueries` extracts closed root-level `query` fences without executing them.
- `vault_graph` defaults to the existing local depth 1–3 traversal. `scope: "global"` returns option-bound combined cursor pages and can include normalized tag nodes or explicitly linked accepted attachments. It builds no persistent index; `complete: false` means configured scan, relationship, or output limits made the result partial. Alias-only traversal is intentionally excluded.
- `vault_canvas` returns nodes first and then valid edges. Authored URLs remain inert, credential-bearing URLs and unsafe file targets are omitted, unknown fields are ignored, and cursors are bound to the Canvas path.
- `vault_facets` counts each normalized tag and property once per Markdown document. Cursor pages describe additive source chunks, so repeated facet names must be summed; `complete` applies to each bounded page.
- Parser-derived Markdown syntax stays inert inside code, HTML comments/raw elements/processing instructions/CDATA, Obsidian comments, and math. Raw literal content search remains backward compatible.
- `.base` content is returned and searched only as inert text. Formulas, functions, filters, views, layouts, and URLs are not parsed or executed.
- Scan-backed responses include an opaque operation-bound `cursor`, scan counters, bounded warnings, and an explicit truncation reason when applicable.

## Provider Inspection API

Runtime packages can import `createVaultInspection` from `tockbot-note-vault/inspection` and supply bounded vault-relative `list` and `read` callbacks. The standalone plugin and its eight tool names remain unchanged.

`inspection.planPathRewrite({ oldPath, newPath, isDirectory, cursor? }, signal)` is a pure planning operation. It returns deterministic post-move logical paths, complete replacement content, optional pre-move provider revisions, scan counters, and honest completeness metadata. It never writes or exposes filesystem roots. Result cursors bind the move arguments and a full Markdown path/revision/content fingerprint; source, parser-work, or update-byte caps are terminal, while ordinary result pages can be drained until `complete: true`. Callers own physical-alias grouping, snapshots, revision and digest revalidation, applying updates, partial-failure reporting, and recovery.

## Scope

- [`features.md`](./.agents/references/features.md) is the source of truth for shipped, deferred, and excluded capabilities.
- [The completed read-port plan](./.beads/plans/2026-08-21-dsh-note-vault-read-ports.md), [the five-feature inspection plan](./.beads/plans/2026-08-22-tockbot-note-vault-inspection-ports.md), and [the bounded discovery plan](./.beads/plans/2026-08-21-tockbot-note-vault-discovery-ports.md) record implementation and verification decisions.

## Verify

```sh
pnpm install
pnpm check
pnpm pack
```
