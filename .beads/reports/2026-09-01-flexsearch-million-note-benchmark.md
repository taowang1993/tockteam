# FlexSearch million-note benchmark

Date: 2026-09-01

## Decision

Proceed with FlexSearch only as a **persistent, runtime-owned candidate index** behind TockTutor's existing parser and `noteVault.search()` contract. Do not replace the parser, exact match projection, or vault authority.

The production-shaped configuration handled one million synthetic notes with low steady-state memory and sub-500ms broad queries. The costs are a multi-gigabyte index, a roughly 24-minute initial build on this machine, and a new native `sqlite3` packaging obligation.

## Packaging and vertical-slice result

The first production slice now passes on macOS arm64:

- `tockbot-note-runtime` pins `flexsearch@0.8.212` and `sqlite3@5.1.7` as runtime dependencies.
- Both repository workspaces explicitly permit the reviewed `sqlite3` install build.
- The versioned SQLite index lives below TockTutor's state root and is keyed by opaque vault ID plus filesystem identity; no index data is written into the vault.
- Keyword query parsing remains in `tockbot-note-vault`. Only positive `tag:` and property anchors currently enter the index because their recall can be proven; literal, regex, Related, and unanchored structured searches keep the bounded scanner.
- Candidate paths are deduplicated, bounded, safely re-read through generation-bound runtime authority, and passed to the existing exact verifier. Candidate cursors bind the query and index epoch.
- Initial indexing and revision reconciliation run in the background. Until a complete index is ready—and after watcher or Host mutation events invalidate it—search automatically falls back to the scanner.
- Full DSH staging recursively includes FlexSearch, SQLite, and the arm64 `node_sqlite3.node` binary. A staged Node 26.0.0 smoke verified two indexed candidates, one exact match, and state-owned persistence.
- Core CI now installs and exercises the runtime package on macOS arm64, macOS x64, Linux x64, and Windows x64.

This host executed macOS arm64 only; the other native gates become proven when their CI matrix jobs pass. Ordinary file updates reconcile incrementally; ambiguous renames, folder mutations, watcher failures, and startup still require a bounded full inventory reconciliation. A durable per-path journal remains the next large-vault latency optimization.

## Environment

- Apple M5 Pro, 18 logical CPUs, 64GiB RAM
- Node.js 24.20.0
- `flexsearch@0.8.212` (Apache-2.0)
- `sqlite3@5.1.7` (BSD-3-Clause, N-API 3/6)
- FlexSearch SQLite persistent `Document` index
- 1,000,000 deterministic synthetic notes, 512 bytes each (488.3MiB corpus)
- Numeric document IDs; no FlexSearch document store
- Fields: title, path, headings, tags, content
- Commits in batches of 10,000
- 30 timed searches after warm-up; table reports reopened-index p95

The corpus is intentionally small and repetitive for one million notes. Real vaults with larger notes and more unique vocabulary can require materially more disk and indexing time.

## Results

| Configuration | Exact unique result | Initial build | Index size | Build peak RSS | Rare p95 | Medium p95 | Broad p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Forward content, built-in encoder | 20 false candidates | 15m 08s | 6.76GiB | 1.33GiB | 0.18ms | 137ms | 427ms |
| Strict content, built-in encoder | 10 false candidates | 9m 31s | 2.50GiB | 0.80GiB | 0.13ms | 136ms | 413ms |
| **Strict content, exact whitespace encoder** | **1 correct candidate** | **23m 53s** | **2.73GiB** | **1.42GiB** | **0.14ms** | **0.19ms** | **425ms** |

Production-shaped strict/exact results after reopening:

- Mount: 1.1ms
- Memory after queries and mutations: 142MiB RSS / 11MiB heap used
- Exact rare query: 0.14ms p95
- Selective topic query: 0.19ms p95
- Common two-term body query: 425ms p95
- Common title query: 286ms p95
- Common path query: 199ms p95
- 1,000 updates plus commit: 1.44s (695 notes/s)
- 1,000 removals plus commit: 37.7ms (26,560 notes/s)
- Removed document did not appear afterward

The strict/exact index was 5.7 times the synthetic source corpus size. FlexSearch `merge: true` can return more than the requested limit across fields, so TockTutor must deduplicate and enforce its existing result cap after retrieval.

## Findings

1. **Persistent SQLite is required for this target.** Reopening the one-million-note index is effectively instant and avoids retaining the full index in JavaScript memory.
2. **Use strict tokenization for note bodies.** Forward-tokenizing every body term increased disk from 2.73GiB to 6.76GiB without improving broad-query latency.
3. **Do not accept the default encoder blindly.** It merged distinct synthetic identifiers. A deterministic TockTutor encoder returned the exact candidate, but made the initial build slower.
4. **Treat FlexSearch as candidate retrieval.** TockTutor's parser must still apply `path:`, `file:`, `tag:`, `line:`, `section:`, properties, exclusions, `OR`, scope, and exact line/section projection.
5. **Keep index data outside the vault.** The index belongs under TockTutor's state root, keyed by opaque vault identity and schema version. User-owned vault contents must remain untouched.
6. **Initial indexing must be background and resumable.** A million-note rebuild takes tens of minutes. Search needs readiness/progress state, watcher-driven incremental updates, crash-safe generations, and rebuild-on-version-change.
7. **The SQLite adapter adds release work.** FlexSearch requires the native `sqlite3` package. TockTeam must explicitly allow its install build and verify staged/packaged macOS arm64/x64, Linux x64, and Windows x64 artifacts. FlexSearch documents no index migration tool; schema changes require a versioned rebuild.

## Rejected shape

A serialized in-memory index is not suitable for millions of mutable notes. In the spike:

- without `fastupdate`, removing 1,000 documents from a 10,000-document index took 10.25s;
- with `fastupdate`, a removed-only-term query required cleanup to avoid an internal error;
- restoring an exported `fastupdate` document index failed with `TypeError: c.add is not a function`.

Those observations apply to this exact package/configuration and are sufficient to reject that shape, not to claim every FlexSearch in-memory configuration is defective.

## Recommended integration seam

```text
Workbench / assistant
  -> existing noteVault.search()
  -> existing TockTutor query parser
  -> persistent FlexSearch candidate IDs
  -> generation-bound runtime reads
  -> existing exact matcher and result projection
```

Suggested field policy:

- `title`, `path`, headings: `forward`
- tags and body: `strict`
- deterministic TockTutor encoder with explicit Unicode/CJK tests
- numeric internal IDs with a separate persistent ID/path mapping
- no full document store in FlexSearch

The existing bounded scanner remains the not-ready/small-vault fallback and exact verifier; it should not scan a million-note vault after the index is ready.

## Reproduction

Benchmark source:

- `.beads/reports/2026-09-01-flexsearch-million-note-benchmark.mjs`
- SHA-256: `123450dbd076aa7ffd69c1b77c955a145d6e2d888f97d95774a8abca175adbac`

Run in an isolated temporary package:

```sh
BENCH="$(mktemp -d)"
cp .beads/reports/2026-09-01-flexsearch-million-note-benchmark.mjs "$BENCH/benchmark.mjs"
printf '%s\n' '{"private":true,"type":"module","dependencies":{"flexsearch":"0.8.212","sqlite3":"5.1.7"}}' > "$BENCH/package.json"
printf '%s\n' 'allowBuilds:' '  sqlite3: true' > "$BENCH/pnpm-workspace.yaml"
pnpm -C "$BENCH" install

NOTES=1000000 NOTE_BYTES=512 BATCH_SIZE=10000 \
CONTENT_TOKENIZE=strict ENCODER=whitespace \
DB_PATH="$BENCH/tocktutor.sqlite" \
node --expose-gc "$BENCH/benchmark.mjs" build

NOTES=1000000 NOTE_BYTES=512 BATCH_SIZE=10000 \
CONTENT_TOKENIZE=strict ENCODER=whitespace \
DB_PATH="$BENCH/tocktutor.sqlite" \
node --expose-gc "$BENCH/benchmark.mjs" reopen
```
