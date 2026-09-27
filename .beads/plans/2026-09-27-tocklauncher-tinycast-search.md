# Plan: Three Tinycast-Inspired TockLauncher Search Behaviors

## Problem and Outcome

TockLauncher makes users retype a launcher query after choosing File Search, only indexes the `.app` filename for macOS applications, and ignores existing usage history when two typed results are equally relevant. Deliver three improvements in the existing Desktop launcher without introducing another agent, plugin, clipboard history, or source-code dependency on Tinycast.

## Design Read and Boundaries

**Design Read:** The keyboard-first Desktop launcher helps users reach a destination quickly. Keep its existing result rows, focus behavior, themes, and Host-owned action authority; change search behavior rather than adding a new palette or visual treatment.

- **Source of truth:** The current renderer input owns the query; the existing Host File Search provider owns bounded file discovery and actions; the existing validated index owns app metadata; the existing local ranking state owns usage. No new settings or storage.
- **Original implementation:** Use Tinycast's observed behaviors as requirements, not its AGPL-3.0 source. Do not copy its implementation. Reuse TockLauncher services and macOS's native bundle metadata tools.
- **Scope:** Desktop TockLauncher only. File Search follows its current macOS/Windows availability; app-name aliases are macOS-only; usage tie-breaking applies to both existing search engines. Existing favorite, exclusion, action validation, cancellation, and query-length limits remain authoritative.
- **Assumption:** Index English and Simplified Chinese app names (TockLauncher's supported interface languages) plus the bundle filename, regardless of the Mac's active language. Keep one app result, its current visible name and stable path-based ID; localized names are search-only aliases. No transliteration or all-language index.

## Slice 1 — Query to File Search (`tockteam-6ec0.1`)

Expose the current `file-search:invoke` action as an optional result for an ordinary nonempty launcher query when File Search is enabled; display an appropriately localized **Search Files for “invoice”** label. Capture the trimmed input *before* `invoke` clears it when `preserveUserInput` is false. Pass it to `createLauncherFileSearchTool`, populate the tool's existing search input, focus it, and call the existing prefixed Host search once. Invoking the command from an empty launcher query remains blank. No extra file-search route or wider IPC authority.

Likely files: `src/launcher-file-search.ts`, `src/launcher-file-search-tool.ts`, `src/launcher.ts`; `tests/launcher-file-search.test.ts`, `tests/launcher-file-search-tool.test.ts` and the closest renderer interaction test.

**Acceptance:** `invoice` offers the action and opens focused File Search prefilled with `invoice`; a single bounded query runs, even with preserve-input off. Empty/unsupported/disabled searches show no new suggestion or blank input as appropriate. Escape returns to intact launcher controls and respects the current focus behavior.

**Test first:** `node --test tests/launcher-file-search.test.ts tests/launcher-file-search-tool.test.ts` — demonstrate the new behavior failing before implementation.

## Slice 2 — Bilingual macOS App Names (`tockteam-6ec0.2`)

In the bounded macOS application scan, read app-provided `InfoPlist.loctable`/`InfoPlist.strings` names for English and Simplified Chinese using a fixed native utility with bounded output/time and safe filename handling. Fall back to the existing `.app` filename when metadata is missing, oversized, malformed, or inaccessible; do not fail the whole scan. Pass only deduplicated, bounded alternate names into an optional Host-only `searchAliases` field for applications. Validate and persist that field in the existing index so rescan and restart preserve searchability; never publish aliases as action targets or separate app results. Search both `name` and aliases through the configured engine, with the exact displayed name higher priority than an alias.

Likely files: `src/launcher-discovery-scanners.ts`, `src/launcher-discovery-extensions.ts`, `src/launcher-actions.ts`, `src/launcher-persistence.ts`, `src/launcher-core-search.ts` and focused tests in `tests/launcher-discovery-scanners.test.ts`, `tests/launcher-discovery-extensions.test.ts`, `tests/launcher-persistence.test.ts`, `tests/launcher-core-search.test.ts`.

**Acceptance:** Both `Calendar` and `日历` resolve to the *same* app ID/path in a bundle fixture; malformed metadata preserves filename search; English and Chinese aliases survive index reload and are not sent to the renderer; Linux and Windows behavior is unchanged. A real installed macOS system app is checked in a bounded local scan.

**Test first:** `node --test tests/launcher-discovery-scanners.test.ts tests/launcher-discovery-extensions.test.ts tests/launcher-persistence.test.ts tests/launcher-core-search.test.ts`.

## Slice 3 — Usage Breaks Typed-Search Ties (`tockteam-6ec0.3`)

Use the existing decayed ranking data only when indexed result match quality is *equal* (or falls in an explicitly tested narrow tier, if exact equality proves ineffective). Compare match quality before usage, preserving exact displayed-name results ahead of weaker/alias matches, favorites ahead of ordinary results, and instant providers in their existing positions. Break any remaining ties stably. Do not save query terms or create another ranking file.

Likely files: `src/launcher-core-search.ts`, `tests/launcher-core-search.test.ts`; use `rankLauncherItems`/`decayedLauncherRankingScore` from `src/launcher-ranking.ts` rather than inventing ranking state. Depends on slice 2's search metadata.

**Acceptance:** For both Fuse.js and fuzzysort, repeated use moves an equally good result ahead after an ordinary typed query; a less-relevant result never overtakes an exact match; empty-screen order, favorite/instant placement, exclusion, and result limits stay intact.

**Test first:** `node --test tests/launcher-core-search.test.ts`.

## Verification and Checkpoints

1. For each slice, make one focused public-behavior test fail, implement the minimum fix, rerun that test, and checkpoint only owned paths. Do not stage the unrelated, user-owned `AGENTS.md` or the peer's Models settings files.
2. Rerun the four focused suites, then `pnpm run typecheck`, `pnpm test`, and `pnpm run build`; distinguish baseline or environment-blocked failures from regressions. Do not run an existing Electron smoke script that launches a GUI outside the extended-display guard.
3. After coordinating `.stage` and side-display ownership with the other session, use an owned, bounded `extended_display` Electron instance with app-scoped CDP/Playwright to check visible query handoff, focused input, Escape/return, bilingual app result, and tied ordering. Record a 1512 × 949 CSS viewport at 2× (3024 × 1898 screenshot), route/state/theme and runtime errors. Publish only allowlisted evidence and stop/verify the entire owned process tree. Provide the screenshot as UI evidence and tell the user to start/restart Electron to eyeball it.
4. Close completed beads issues, inspect Git status, commit only owned paths in small checkpoints under the repository Git rule, and never push without new authority.

## Risks and Stop Gates

- macOS bundle metadata is untrusted and heterogeneous. Keep native invocations fixed, file reads bounded, abortable and time-limited; a bad app must not break every app. If the initial scan budget cannot support alias discovery, measure and report it rather than silently increasing deadlines.
- A cached index has a strict schema. Validate optional aliases explicitly and keep old indexes compatible; aliases must not cross the restricted public-result or native-action boundary.
- Browser-visible verification requires a guarded side display; coordinate with session `01a0e00c` before touching `.stage` or launching an Electron proof. If unavailable, report UI proof pending rather than bypassing the GUI guard.

## Beads

- Epic: `tockteam-6ec0`
- Slice 1: `tockteam-6ec0.1`
- Slice 2: `tockteam-6ec0.2`
- Slice 3: `tockteam-6ec0.3` (depends on slice 2)
