# Plan: Raycast-Like TockLauncher First Screen

## Confirmed Intent

- **Outcome:** Make TockLauncher’s empty-query opening screen behave like a focused Raycast command screen.
- **User:** A TockTeam Desktop user opening the launcher to choose a workspace, command, or application.
- **Success:** The screen shows truthful `Pinned`, `Recent`, `Commands`, and `Applications` sections; repeated successful use improves the `Recent` order; TockCoder and TockTutor remain easy to reach.
- **Constraint:** Preserve TockLauncher’s sandboxed renderer, typed sender-bound IPC, opaque actions, finite providers, and Desktop-owned effects.
- **Out of scope:** Installing or executing Raycast extensions, copying SuperCmd’s privileged extension runtime, changing enabled-extension defaults, or changing non-empty fuzzy/instant search semantics.

## Problem

TockLauncher currently labels the ordinary empty-query list `Recent`, but the core actually sorts every available indexed item alphabetically. Discovered applications can crowd out TockCoder, TockTutor, and launcher commands before the result cap. The renderer knows only a pinned count and infers the remaining heading from whether the query is empty, so it cannot present truthful command-oriented sections.

Raycast and SuperCmd instead treat the opening screen as a command surface: explicit pinned and recent items appear first, then the remaining command catalog. SuperCmd’s reviewed implementation also demonstrates bounded section assembly and decaying launch-frequency ranking, but its Raycast extension executor requires an unsafe privileged renderer and is not part of this plan.

## Solution

Have Electron main assemble explicit bounded result sections for each search response. For an empty query, publish these sections in order:

1. `Pinned` — matching saved favorites in persisted user order.
2. `Recent` — up to five successfully invoked, non-pinned items ranked by bounded decaying usage.
3. `Commands` — remaining command-like indexed items in stable alphabetical order, including TockCoder, TockTutor, and enabled launcher commands.
4. `Applications` — remaining Application Search items in stable alphabetical order.

Content-discovery entries such as bookmarks and simple file results do not flood the opening screen unless they are pinned or recent; they remain available through typed search. For a non-empty query, preserve the current favorite/instant/fuzzy ordering and present the ordinary results under `Results`.

The renderer receives section identifiers and already-published public result items. It does not classify providers, calculate rank, report successful usage, or gain new authority.

## Implementation Decisions

- **Section ownership:** `src/launcher-core-search.ts` owns ordering, deduplication, caps, and a finite main-owned mapping from existing `sourceExtension` IDs to opening-screen eligibility. The renderer only displays returned sections.
- **Public projection:** Extend the validated launcher search response with explicit finite sections while retaining one result-set owner and opaque action publication. Do not expose paths, action arguments, ranking state, or provider internals.
- **Pinned order:** Preserve the order of the persisted `favorites` array instead of re-sorting favorites alphabetically.
- **Recent source of truth:** Add a dedicated machine-local managed ranking artifact under the existing launcher data root. Do not place local application usage in externally synchronized settings.
- **Successful-use boundary:** Associate each published default action with its result item and search term inside Electron main. Record usage only after the default action completes successfully. Additional actions, failures, expiration, and cancellation do not count.
- **Bounded ranking:** Store at most 500 validated entries. Each entry contains only a bounded item ID, use count, last-used timestamp, and decaying score. Use a 30-day half-life, remove stale negligible entries after 120 days, and use deterministic ties. No query-specific learning is needed for this first-screen scope.
- **Failure behavior:** Missing, malformed, oversized, or interrupted ranking persistence yields an empty `Recent` section and preserves the last validated backup where possible; it must never block search or invocation.
- **Result limits:** Keep the existing global result and action limits. Pinned items consume the cap first, Recent is limited to five, and Commands then Applications fill the remaining allowance without duplicates.
- **SuperCmd reuse:** Reimplement only the small ranking/section behavior needed by TockLauncher. If recognizable SuperCmd code is copied, retain its MIT notice in `THIRD_PARTY_NOTICES.md`; do not import its React launcher, extension loader, broad preload, or runtime evaluator.
- **No new dependency:** Use current TypeScript/Node facilities and existing launcher persistence helpers.

## System Coherence

- **Before:** Favorites and exclusions live in validated settings; the index lives in `search-index.json`; empty search is alphabetic; the renderer mislabels ordinary items as Recent.
- **After:** Favorites and exclusions remain unchanged; the provider index remains unchanged; successful machine-local launches additionally feed a bounded ranking artifact; main emits truthful sections.
- **State/lifecycle owner:** `LauncherPersistenceRepository` owns ranking durability, `LauncherActionStore` identifies successful default invocations, and `createLauncherCoreSearch()` owns presentation order.
- **Side-effect owner:** Electron main remains the sole owner. No renderer bridge method is added for usage reporting.
- **Retry/recovery:** Existing atomic-write and validated-backup patterns apply to ranking persistence. Search continues without ranking when recovery fails.
- **Cleanup:** Resetting TockLauncher settings also removes ranking history, while ordinary provider rescans retain it and naturally ignore entries absent from the current index.

## Testing Decisions

- **Highest useful seam:** Existing Electron smoke in `scripts/launcher-electron-smoke.mjs`, because it exercises main-owned indexing, IPC publication, renderer sections, real selection, successful invocation, hide/reopen behavior, and persistence together.
- **Core seams:** Extend `tests/launcher-core-search.test.ts`, `tests/launcher-actions.test.ts`, `tests/launcher-persistence.test.ts`, `tests/launcher-ipc.test.ts`, and launcher contract/renderer tests only where their existing responsibility changes.
- **TDD order:** Run the focused test first and capture the expected failure before each behavioral slice.
- **Visual/user-flow verification:** Use the project’s Playwright CLI workflow against the running Desktop launcher where practical, in addition to the deterministic Electron smoke. Confirm section order, headings, selection, scroll behavior, focus, and compact/detailed layouts.
- **Focused commands:**
  - `node --test tests/launcher-core-search.test.ts tests/launcher-contract.test.ts tests/launcher-ipc.test.ts`
  - `node --test tests/launcher-actions.test.ts tests/launcher-persistence.test.ts`
  - `node --test tests/launcher-renderer-build.test.ts tests/launcher-renderer-contract.test.ts`
  - `pnpm test:launcher:electron`
- **Final commands:**
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm run build`
  - `pnpm audit:ueli-package-feasibility`
  - `pnpm test:launcher:packaged`
  - `git diff --check`

## Out of Scope

- Raycast extension catalog, installation, manifests, preferences, bundle compilation, or execution.
- `@raycast/api` and `@raycast/utils` compatibility layers.
- A Node-enabled or non-isolated renderer.
- SuperCmd’s browser bridge, AI, scripts, quick links, native helpers, or application shell.
- New workspaces or reference-only Tockbot destinations.
- Replacing current non-empty `fuzzysort`/Fuse.js and instant-provider behavior.
- Enabling additional TockLauncher providers by default.
- Query-specific learned ranking, cloud synchronization, ranking controls, or analytics.

## Task List

### Phase 1: Truthful Opening Screen

#### Task 1: Render Truthful Opening-Screen Sections — `tockteam-uhf.1`

**Description:** Change the complete empty-query path so main publishes explicit sections and the renderer displays ordered Pinned, Commands, and Applications groups. Preserve favorite order, suppress unpinned content-only results on the opening screen, and keep typed search behavior unchanged.

**Acceptance criteria:**
- [ ] Empty search returns no section named Recent unless ranked usage exists.
- [ ] Favorites retain persisted order and appear only once.
- [ ] TockCoder, TockTutor, and enabled root commands appear under Commands; discovered applications appear under Applications.
- [ ] Content-only discovery remains searchable but does not crowd the empty opening screen.
- [ ] Non-empty favorite, fuzzy, and instant ordering remains unchanged.

**Verification:**
- [ ] Red then green: `node --test tests/launcher-core-search.test.ts tests/launcher-contract.test.ts tests/launcher-ipc.test.ts`
- [ ] Renderer contracts: `node --test tests/launcher-renderer-build.test.ts tests/launcher-renderer-contract.test.ts`
- [ ] Typecheck: `pnpm typecheck`

**Dependencies:** None.

**Files likely touched:**
- `src/launcher-core-search.ts`
- `src/launcher-contract.ts`
- `src/launcher-ipc.ts`
- `src/launcher-actions.ts`
- `src/launcher.ts`
- Existing focused launcher tests

**Estimated scope:** Medium.

### Checkpoint: Static First Screen

- [ ] A fresh profile shows Commands and Applications rather than a false Recent heading.
- [ ] TockCoder and TockTutor are visible in Commands without typing when the cap permits; pinning guarantees top placement.
- [ ] Typed search regression tests pass.

### Phase 2: Real Recent Results

#### Task 2: Learn Successful Launcher Usage Safely — `tockteam-uhf.2`

**Description:** Record successful default invocations in a bounded, validated machine-local ranking artifact and feed that state into the opening-screen Recent section. Verify reopen, restart, failure, cancellation, reset, and stale-entry behavior end to end.

**Acceptance criteria:**
- [ ] Only a successfully completed default action updates ranking.
- [ ] Recent contains at most five current, non-pinned results in deterministic decayed-usage order.
- [ ] The same item cannot appear in both Recent and a later section.
- [ ] Ranking survives Desktop restart but is cleared by launcher reset.
- [ ] Invalid or interrupted ranking persistence cannot block launcher search or overwrite valid settings/index state.

**Verification:**
- [ ] Red then green: `node --test tests/launcher-actions.test.ts tests/launcher-persistence.test.ts tests/launcher-core-search.test.ts`
- [ ] IPC ownership remains intact: `node --test tests/launcher-ipc.test.ts tests/launcher-actions.test.ts`
- [ ] Typecheck: `pnpm typecheck`

**Dependencies:** Task 1.

**Files likely touched:**
- `src/launcher-ranking.ts` or the equivalent smallest pure module
- `src/launcher-persistence.ts`
- `src/launcher-actions.ts`
- `src/launcher-core-search.ts`
- `src/main.ts`
- Existing focused launcher tests

**Estimated scope:** Medium.

### Checkpoint: Learned Opening Screen

- [ ] Invoke TockTutor successfully, reopen TockLauncher, and observe it under Recent.
- [ ] Pin TockCoder and confirm it stays above Recent in saved order.
- [ ] Failed and canceled actions do not move.

### Phase 3: Product Polish and Proof

#### Task 3: Polish and Prove the Raycast-Like Opening Flow — `tockteam-uhf.3`

**Description:** Finish localized section copy and keyboard/accessibility behavior, prove the real Desktop flow, update the implementation reference, and retain required SuperCmd attribution without widening feature scope.

**Acceptance criteria:**
- [ ] English and Chinese section labels use project capitalization rules and accessible headings.
- [ ] Arrow, Home/End, Cmd/Ctrl+number, Enter, action menu, focus restoration, and scrolling follow visible section order.
- [ ] Electron smoke covers fresh opening, successful invocation, reopen/recent ranking, pinning, exclusion, reset, and typed search.
- [ ] Documentation names SuperCmd commit `2da7b9e5dec0199a972a59cece402c85f729d5d7` as the ranking reference and explicitly excludes Raycast extension execution.
- [ ] Final quality and packaged gates pass with a clean worktree.

**Verification:**
- [ ] `node --test tests/launcher-settings-i18n.test.ts tests/launcher-renderer-build.test.ts tests/launcher-renderer-contract.test.ts`
- [ ] `pnpm test:launcher:electron`
- [ ] Playwright CLI visual/user-flow check against the running launcher.
- [ ] `pnpm typecheck && pnpm test && pnpm run build`
- [ ] `pnpm audit:ueli-package-feasibility`
- [ ] `pnpm test:launcher:packaged`
- [ ] `git diff --check && git status --short`

**Dependencies:** Task 2.

**Files likely touched:**
- `src/launcher.ts`
- `src/launcher-i18n.ts`
- `scripts/launcher-electron-smoke.mjs`
- `.agents/references/tocklauncher.md`
- `THIRD_PARTY_NOTICES.md` only if copied code requires an added notice
- Existing focused launcher tests

**Estimated scope:** Medium.

### Checkpoint: Complete

- [ ] Every visible section contains truthful content and no duplicate item.
- [ ] Main still owns classification, ranking, persistence, and invocation success.
- [ ] Renderer remains sandboxed with the same finite bridge and denied permissions.
- [ ] Installed Raycast extensions remain unsupported and no second plugin runtime exists.
- [ ] All applicable checks pass and the implementation receives a fresh review.

## Dependency Graph

```text
tockteam-uhf.1  Explicit Opening Sections
       │
       ▼
tockteam-uhf.2  Successful-Use Ranking
       │
       ▼
tockteam-uhf.3  UX Polish and Real-App Proof
       │
       ▼
  tockteam-uhf  Epic Acceptance
```

The tasks are sequential because each changes the same launcher search/publication flow. Do not assign concurrent writers to these files.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Section contract accidentally widens renderer authority | High | Return only finite section IDs and already-sanitized public items through the existing sender guard. |
| Usage is recorded before an effect actually succeeds | High | Record only after the consumed default action’s execution promise resolves. |
| Local application usage leaks into synced settings | Medium | Use a dedicated machine-local managed artifact, never the external settings file. |
| Ranking state grows indefinitely | Medium | Cap at 500 entries, validate every field, decay entries, and prune stale negligible rows. |
| New grouping changes typed-search relevance | Medium | Branch only on a trimmed empty query and retain current non-empty tests byte-for-behavior. |
| Commands disappear behind applications | Medium | Commands precede Applications and consume the remaining cap first. |
| Stale indexed items occupy Recent | Low | Intersect ranking state with the current available index on every empty search. |
| Copied SuperCmd code loses provenance | Low | Prefer a small local implementation; add MIT attribution when recognizable code is copied. |

## Beads

- Epic: `tockteam-uhf` — Make TockLauncher opening screen Raycast-like
- Child: `tockteam-uhf.1` — Render truthful opening-screen sections
- Child: `tockteam-uhf.2` — Learn successful launcher usage safely
- Child: `tockteam-uhf.3` — Polish and prove the Raycast-like opening flow

## Further Notes

- SuperCmd reference: `/Users/taowang/research/launcher/SuperCmd` at commit `2da7b9e5dec0199a972a59cece402c85f729d5d7`.
- Primary reusable references: `root-search-ranking.ts`, `root-search-sections.ts`, and `root-search-ranking-state.ts`.
- Explicitly rejected references: `ExtensionView.tsx`, the Node-enabled launcher web preferences, unrestricted `__scNodeRequire`, and the broad preload/IPC facade.
- TockLauncher’s current opening-list behavior is in `src/launcher-core-search.ts`; renderer grouping is in `src/launcher.ts`; action success is fenced in `src/launcher-actions.ts`; persistence is owned by `src/launcher-persistence.ts`.
