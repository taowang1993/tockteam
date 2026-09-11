# Plan: Notion-Like TockTutor Search

## Decision

The user selected **Full Notion-Like Search**. This plan therefore includes semantic Related results and AI Quick Answer, not only local keyword-search repairs.

The implementation remains a TockTutor feature over the pinned DSH runtime. It must reuse the existing `noteVault`, Workbench Remote/controller, DSH LLM, and `NoteAssistant` owners. It must not add another agent loop, expose model credentials to browser code, or move filesystem authority out of `tockbot-note-runtime`.

## Problem

TockTutor already has a capable bounded local search engine, but its current dialog has correctness, workflow, and presentation gaps:

1. A non-empty query with no backend matches can display the first 100 note paths as if they matched.
2. Query and mode changes retain stale results; in-flight responses are not bound to the current query and can publish after the dialog closes.
3. Search runs only after Enter or the **Search** button instead of updating as the user types.
4. Keyword results are not relevance-ranked, duplicate hits have indistinguishable outcomes, and the cursor/truncation contract has no user-facing continuation.
5. Result selection discards the match line, keyboard navigation cannot move/open the active result from the input, and no new-tab shortcut exists.
6. The right pane is a decorative summary rather than a bounded preview of the selected note and match.
7. Useful local filters, recents, metadata, highlighted snippets, complete loading/empty/error states, and a focused modal backdrop are missing.
8. **Related** currently means lexical token overlap with simple suffix stripping, not semantic similarity.
9. Search does not offer a Notion-like Quick Answer with validated note citations.

## Solution

Deliver the work as eight reversible vertical slices:

1. Make keyword search instant, query-bound, cancellable, and honest; show deterministic recent notes before typing.
2. Rank and group matches, highlight snippets safely, and consume the existing cursor through an explicit **Load More** action.
3. Add **Title Only**, **In**, structured field/task, and modified-date filters that execute before result limits.
4. Add keyboard-first result navigation, exact-line opening, current/new-tab dispositions, and a real inert local preview.
5. Add an optional assistant-owned search-intelligence contract that performs model-assisted query expansion and candidate reranking without a vector database.
6. Add bounded Quick Answer generation with exact, generation-bound citations and no write tools or conversation-history side effects.
7. Complete the dialog hierarchy, responsive behavior, themes, accessibility, shortcuts, and all state cycles.
8. Rebuild tracked outputs and prove the packaged Desktop flow against a synthetic vault.

## User Stories

1. As a student, I can type naturally and see trustworthy results without submitting a form.
2. As a keyboard user, I can move through results, preview a match, and open it at the relevant line without leaving the keyboard.
3. As a user with a large vault, I can narrow results and load additional pages without duplicates or silent truncation.
4. As a user who remembers a concept but not its wording, I can use **Related** to find a note with no literal word overlap.
5. As a user asking a question about my notes, I can receive a bounded answer whose citations open the exact supporting notes.
6. As a privacy-conscious user, I can keep AI Search off, invoke it only when requested, or explicitly enable automatic assistance.

## Current Ownership and Governing Seams

| Concern | Current Owner | Planned Change |
| --- | --- | --- |
| Vault reads, tree metadata, search index, cursors | `tockbot-note-runtime` | Retain sole filesystem/index authority; extend only bounded search metadata needed by filters/ranking. |
| Query parser and inspection semantics | `tockbot-note-vault/inspection.js` | Add deterministic scoring/filter semantics while preserving safe regex, bounds, and standalone compatibility. |
| Browser boundary validation | `@tockteam/tocktutor-workbench/src/host-read.ts` | Validate all new filter, cursor, intelligence, and result fields before delegation. |
| Dialog state, request lifecycle, navigation | `WorkbenchRouteController` in `route.tsx` | Own one query-keyed search state machine and all cancellation/open behavior. |
| Dialog composition and local preview | `WorkbenchNoteSearchPalette` in `route.tsx` | Reuse existing shadcn/Tailwind primitives and Workbench Markdown rendering. |
| Provider/model settings and model calls | `NoteAssistant` | Provide optional read-only search intelligence through the configured DSH LLM. |
| Browser model boundary | `tocktutorAssistant` Typert Remote | Add strict bounded semantic/answer requests and validated results; no credentials or filesystem paths beyond safe relative paths. |
| Desktop composition | Existing TockTutor aggregate bundle | No new package or Loader row; rebuild existing package outputs only. |

## Implementation Decisions

### One Search State Machine

- The Workbench controller remains the source of truth for query, mode, filters, active result, preview, page cursor, loading, error, and answer state.
- Derive an immutable request key from the active vault generation, trimmed query, mode, filters, sort, and cursor.
- Every query/filter/mode change aborts local search, preview, semantic, and answer work from the prior key; clears incompatible results; and schedules a new local search after a short debounce.
- Closing the dialog or changing vault generation aborts all search-owned work. A completion may publish only when its request key and vault generation still match.
- Remove the unfiltered `notePaths.slice(0, 100)` fallback. Empty input shows recents; a completed query with no matches shows a real no-results state.
- Keep the 1,000-character query boundary and existing Host validation.

### Local Search Before AI

- Local keyword results must remain useful with no model provider, offline operation, AI Search disabled, model failure, or invalid model output.
- Run the local search first. Semantic ranking and Quick Answer enhance that result; they never block or erase it.
- Debounce local work at approximately 150–250 ms. Do not send model requests on each keystroke.
- Semantic and answer work begins only for a stable query, never for empty input.

### Ranking, Grouping, and Pagination

- Add deterministic scores to `VaultSearchMatch` using semantic evidence already available to the inspection layer: exact filename/title, filename prefix, path, heading/section, property/tag/task, and body matches. Use modified time only as a bounded tie-breaker, not as the primary relevance signal.
- Preserve every exact match location, but group the visible list by path. Show the best snippet in the parent row and allow additional hits in that note to be reached without rendering identical rows with identical actions.
- Highlight matches by splitting trusted React text nodes; never inject result HTML.
- Keep one bounded page and explicit **Load More** control. Merge pages by stable match identity, reject cursor/query mismatches, and announce truncation. Do not add infinite-scroll machinery.
- Return and validate enough metadata for display: safe relative path, line range, provenance, score, modified time, and the next cursor.

### Filters

- **Title Only** maps to filename/title matching, not a browser-only post-filter.
- **In** sends one safe vault-relative directory scope.
- **Filter** exposes existing tag/property/task semantics and a modified-date range. Advanced **Search Syntax** remains available for power users.
- Extend the persistent search index schema only where pre-limit filtering requires indexed metadata, notably modification time. Rebuild an old schema deterministically under the existing external state root; never write search state inside the user vault.
- Filter state is part of the request/cursor identity and updates results immediately.
- Do not add **Created By**: local Markdown notes have no trustworthy author field. Add it only after an authorship contract exists.

### Navigation and Preview

- Maintain a roving active-result index while focus stays in the combobox: Arrow Up/Down moves selection, Enter opens the active exact match, and Command+Enter opens it in a new Workbench tab.
- Reuse Workbench tab/session operations; do not create another navigation store.
- Pass the full validated match to the controller so opening can select the note and jump to its line or section. Preserve current dirty-save and vault-generation checks.
- Fetch preview content through the existing bounded `openDocument` Remote. Abort on selection/query/vault changes and reject stale revisions/generations.
- Render Markdown through the existing inert Workbench renderer, scroll to and highlight the selected line range, provide a **Hide Preview** control, and keep the result list usable when preview is unavailable.
- Preview content remains local. Browser automation and screenshot evidence must use synthetic notes so a full preview cannot expose real credentials or personal content.

### Semantic Related Search Without a New Index

- Do not introduce a vector database, embedding provider contract, or new dependency in the first implementation.
- Add a narrow optional search-intelligence contract implemented by `NoteAssistant` and consumed structurally by the Workbench. The Workbench must still load and search when the assistant plugin is disabled.
- Use the selected DSH provider/model and the existing direct text-turn runner, not a new Agent or conversation.
- For **Related**, ask the model for a strict, bounded JSON set of alternate search phrases/concepts; validate it, run bounded `noteVault.search` calls, merge those candidates with lexical Related results, and optionally rerank only the bounded candidate set.
- Prove semantic behavior with a fixture whose query and target note share no lexical token. Invalid JSON, unsupported providers, timeout, or cancellation falls back to lexical results and exposes a non-blocking status.
- If measured quality or latency later proves query expansion inadequate, evaluate embeddings as a separate architecture decision rather than silently adding persistent vectors now.

### AI Search Policy and Privacy

- Extend assistant settings with `aiSearch: 'off' | 'on-demand' | 'automatic'`; default to `on-demand`.
- **Off** never calls a model from search. **On Demand** runs only after the user selects **Related** or **Quick Answer**. **Automatic** may begin assistance after a stable local result, never per keystroke.
- Before model calls, bound and redact the query, safe paths, snippets, and selected note excerpts with existing assistant boundary utilities.
- Display that AI Search uses the configured provider/model. Provider/model credentials remain Host-only.
- Model errors do not replace local results. No search request receives write tools, stages proposals, mutates notes, or joins the active conversation history.

### Quick Answer and Citations

- Build Quick Answer from a bounded set of retrieved candidates, then read only the minimum supporting excerpts through `noteVault`.
- Use a search-specific system prompt requiring concise answers and citations by opaque candidate ID. Never trust a model-authored path.
- Resolve returned citation IDs only against the exact candidate map captured for the active vault generation. Reject unknown, duplicate, stale, or over-limit citations.
- The Remote returns bounded answer text plus validated safe citations. Citation actions reuse exact-match navigation.
- Show idle, **Thinking…**, partial/local-search-ready, completed, no-evidence, cancelled, provider-unavailable, error, and retry states. A visible cancel action aborts the Host call.
- A no-result query may offer or automatically start Quick Answer according to `aiSearch`; it must not fabricate note evidence.

### Dialog UI and Accessibility

- Preserve the existing centered split-dialog proportions and shared `@tockteam/ui` primitives.
- Use a tokenized dim backdrop instead of a transparent overlay.
- Before typing, show recent notes grouped by recency. After typing, show count, sort, filters, metadata, highlighted snippets, and preview.
- Keep **Search Syntax** as an advanced option and expose every supported operator accurately; apply project Title Case to standalone labels.
- Footer shortcuts change from “Enter Search” to result actions once results exist and remain truthful in every state.
- Preserve explicit dialog, combobox, listbox/result, preview-region, status, and button names. Verify visible focus, focus restoration, Escape nesting, reduced motion, zoom, long paths, duplicate titles, and narrow layout.
- Use DSH semantic tokens through existing `--tt-*` aliases. No raw UI palette, new component library, or feature stylesheet.

## Testing Decisions

- Use TDD for every non-trivial slice: run the focused failing check first and record the exact command in the issue/commit handoff.
- Highest local-search seam: `tockbot-note-vault` inspection tests plus runtime search-index integration tests.
- Highest controller seam: `@tockteam/tocktutor-workbench/tests/route.test.ts` with deferred requests proving cancellation and query identity.
- Highest UI seam: `route-panel-controls.test.tsx` for combobox/listbox behavior, filters, shortcuts, preview states, and accessibility semantics.
- Highest intelligence seam: assistant Host/Remote tests with a fake DSH LLM and zero-overlap semantic fixture; no live provider in deterministic tests.
- Highest user-visible seam: packaged TockTutor Desktop with a synthetic vault, driven by Playwright Electron/CDP at 1512 × 949 CSS pixels and 2× device scale.
- Never use a real Notion profile, real TockTutor profile, credentials, recovery codes, or personal notes in fixtures or screenshots.

Focused commands:

```sh
pnpm -C plugins/tocktutor --filter tockbot-note-vault test
pnpm -C plugins/tocktutor --filter tockbot-note-runtime test:search-index
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test
```

Required TockTutor and repository gates after focused checks:

```sh
pnpm run install:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
```

Run `pnpm test:launcher:electron` only for the final Desktop integration slice, because this feature affects a Desktop-only Electron-rendered route. Run installed smoke once only if the final changes alter packaging/composition beyond rebuilt tracked TockTutor payloads.

## Dependency Graph

```text
1. Instant, trustworthy keyword search
                 │
                 ▼
2. Ranked, grouped, paged results ───────┐
                 │                       │
                 ▼                       ▼
3. Local-vault filters          4. Exact navigation and preview
                 │                       │
                 └──────────┬────────────┘
                            ▼
5. Semantic Related search
                            │
                            ▼
6. Quick Answer and citations
                            │
                            ▼
7. Dialog completion and accessibility
                            │
                            ▼
8. Packaged synthetic-vault proof
```

## Task List

### Phase 1: Trustworthy Local Search

#### Task 1: Make Keyword Search Instant and Trustworthy

**Description:** Replace the fake path fallback and submit-only workflow with one query-keyed, debounced, cancellable local-search flow. Empty input shows deterministic recents; loading, no-results, and errors render inside the dialog.

**Acceptance Criteria:**

- [ ] No unrelated note path is labeled as a match.
- [ ] Query/mode/filter changes, close, disposal, and vault changes prevent stale publication.
- [ ] Typing updates results without Enter; empty input shows recents; local errors remain recoverable.

**Verification:**

- [ ] Failing controller and component checks first.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.

**Dependencies:** None.

**Files Likely Touched:** Workbench `src/route.tsx`, `tests/route.test.ts`, `tests/route-panel-controls.test.tsx`; generated output only through the package build.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.1`.

#### Task 2: Rank and Page Search Results

**Description:** Add deterministic relevance, stable identities, grouped same-note hits, highlighted snippets, honest truncation, and explicit cursor continuation through the existing inspection → runtime → Remote → controller → dialog path.

**Acceptance Criteria:**

- [ ] Exact title/path/structured/body fixtures rank in the documented order.
- [ ] Grouped rows preserve all exact match locations without duplicate actions.
- [ ] **Load More** merges the matching cursor page without duplicates and rejects stale cursors.

**Verification:**

- [ ] Failing inspection/runtime/controller checks first.
- [ ] `pnpm -C plugins/tocktutor --filter tockbot-note-vault test`.
- [ ] `pnpm -C plugins/tocktutor --filter tockbot-note-runtime test:search-index`.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.

**Dependencies:** Task 1 (`tockteam-1s5.1`).

**Files Likely Touched:** `tockbot-note-vault/inspection.js` and declarations/tests, runtime search integration, Workbench types/Host validation/route tests.

**Estimated Scope:** Medium; split the index change into Task 3 rather than widening this slice.

**Beads:** `tockteam-1s5.2`.

#### Task 3: Add Useful Local-Vault Search Filters

**Description:** Deliver **Title Only**, **In**, tag/property/task, and modified-date filtering end to end. Add only the metadata needed for correct pre-limit filtering to the persistent search index.

**Acceptance Criteria:**

- [ ] Filters combine predictably, participate in the cursor identity, and update results immediately.
- [ ] Modified-date filtering occurs before the result limit and survives index reopen/rebuild.
- [ ] Old indexes rebuild outside the vault; **Created By** is absent without authorship data.

**Verification:**

- [ ] Failing filter/parser/index migration checks first.
- [ ] `pnpm -C plugins/tocktutor --filter tockbot-note-vault test`.
- [ ] `pnpm -C plugins/tocktutor --filter tockbot-note-runtime test:search-index`.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.

**Dependencies:** Task 2 (`tockteam-1s5.2`).

**Files Likely Touched:** inspection contracts/tests, runtime search-index source/tests, Workbench types/validation/route UI tests.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.3`.

### Checkpoint: Local Search

- [ ] Search is useful without AI or a configured provider.
- [ ] Recents, instant query, filters, ranking, grouping, pagination, and failures are truthful.
- [ ] Each slice has a small verified commit before AI work begins.

### Phase 2: Navigation and Local Preview

#### Task 4: Navigate, Preview, and Open Exact Matches

**Description:** Add roving keyboard selection, exact-line/current-tab/new-tab opening, and a cancellable local full-note preview using existing Workbench read, tab, and inert Markdown seams.

**Acceptance Criteria:**

- [ ] Arrow Up/Down, Enter, Command+Enter, Escape, Tab, and pointer selection have one consistent state model.
- [ ] Opening a result reaches its validated line/section and preserves dirty-save safeguards.
- [ ] Preview is generation-bound, cancellable, locally rendered, match-highlighted, and optional on narrow layouts.

**Verification:**

- [ ] Failing controller/component checks first.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.
- [ ] Playwright component/Desktop check with duplicate filenames and multiple matches in one note.

**Dependencies:** Task 2 (`tockteam-1s5.2`).

**Files Likely Touched:** Workbench route/controller and focused tests; reuse existing renderer/tab modules rather than adding a preview subsystem.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.4`.

### Phase 3: Semantic Search and Quick Answer

#### Task 5: Provide Opt-In Semantic Related Search

**Description:** Add the assistant-owned optional search-intelligence contract and model-assisted query expansion/reranking over bounded local candidates, with lexical fallback and explicit AI policy.

**Acceptance Criteria:**

- [ ] A zero-lexical-overlap synonym fixture returns the intended related note.
- [ ] `off`, `on-demand`, and `automatic` policies work, with `on-demand` as the default.
- [ ] Cancellation, provider absence, timeout, invalid output, plugin disable, and vault/settings changes preserve local search and leak no credentials.

**Verification:**

- [ ] Failing assistant service/Remote and Workbench integration checks first.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test`.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.

**Dependencies:** Tasks 2 and 3 (`tockteam-1s5.2`, `tockteam-1s5.3`).

**Files Likely Touched:** assistant settings/context/text-turn/Remote tests plus the narrow Workbench optional contract and integration tests. No new package or vector dependency.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.5`.

#### Task 6: Add Quick Answer with Verified Citations

**Description:** Generate a bounded read-only answer from retrieved note excerpts and render it in the search dialog with validated candidate citations, cancellation, retry, and provider/no-evidence states.

**Acceptance Criteria:**

- [ ] Quick Answer uses no write tools, creates no proposal, changes no note, and does not enter conversation history.
- [ ] Only citations captured for the active query/vault resolve; unknown or stale model citations are rejected.
- [ ] Answer, no-evidence, cancellation, timeout, provider failure, retry, and query-change behavior are visible and local search remains available.

**Verification:**

- [ ] Failing Host/Remote/UI checks first with fake provider streams and malicious citation fixtures.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test`.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.

**Dependencies:** Tasks 4 and 5 (`tockteam-1s5.4`, `tockteam-1s5.5`).

**Files Likely Touched:** assistant search-intelligence/Remote source and tests, Workbench route UI/controller tests, generated Typert/build outputs through normal scripts.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.6`.

### Phase 4: Dialog Completion and Release Proof

#### Task 7: Finish the Search Dialog Experience

**Description:** Complete the Notion-like hierarchy and state cycle using existing TockTeam tokens and shared UI primitives, then verify accessibility, themes, responsive behavior, and truthful shortcuts.

**Acceptance Criteria:**

- [ ] Dim backdrop, filters, counts, result metadata, preview/filters toggles, Quick Answer, and footer actions form one coherent hierarchy.
- [ ] Focus trap/restoration, Escape nesting, visible focus, reduced motion, zoom/reflow, duplicate titles, long paths, light/dark, and every skin pass.
- [ ] Standalone labels use Title Case; no raw ordinary UI colors, feature stylesheet, or new component dependency appears.

**Verification:**

- [ ] Focused component checks first.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test`.
- [ ] `pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test`.
- [ ] `pnpm run typecheck:tocktutor`.

**Dependencies:** Tasks 1, 3, 4, and 6 (`tockteam-1s5.1`, `.3`, `.4`, `.6`).

**Files Likely Touched:** Workbench route/component tests and assistant search UI tests; shared `@tockteam/ui` only if an existing primitive is objectively incomplete.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.7`.

#### Task 8: Prove Packaged Search Parity Safely

**Description:** Rebuild all tracked package outputs and verify the complete flow in the real packaged Desktop composition using an isolated synthetic vault and bounded Playwright Electron/CDP session.

**Acceptance Criteria:**

- [ ] Focused package tests, TockTutor gates, build manifest, root gates, and applicable Desktop launcher smoke pass.
- [ ] Evidence records exact 1512 × 949 CSS and 3024 × 1898 device pixels, dark/light/skin mode, route, query/filter/result/preview/answer state, and runtime errors.
- [ ] Fixtures contain no real credentials or personal notes; only allowlisted screenshots publish transactionally; the full Electron/browser/runtime process tree stops.

**Verification:**

- [ ] Run all commands under **Testing Decisions**.
- [ ] `pnpm test:launcher:electron` once after focused checks pass.
- [ ] `git diff --check`, `git status --short`, `bd lint`, and `bd preflight`.

**Dependencies:** Task 7 (`tockteam-1s5.7`).

**Files Likely Touched:** generated TockTutor `lib/`/`dist/` payloads and `plugins/tocktutor/build-manifest.json`; test evidence only where the established harness requires it.

**Estimated Scope:** Medium.

**Beads:** `tockteam-1s5.8`.

### Checkpoint: Complete

- [ ] Local search remains complete and reliable without AI.
- [ ] Semantic Related and Quick Answer are optional, bounded, cancellable, and provider-safe.
- [ ] Every visible result and citation opens a validated local destination.
- [ ] No second agent loop, vector database, browser credential path, or filesystem authority was introduced.
- [ ] Final review confirms no stale state, secret-bearing fixture, generated-output drift, or live process remains.

## Parallelization

After Task 1:

- Task 2 must complete before downstream result consumers.
- After Task 2, Task 4 may proceed while Task 3 adds filter/index behavior, provided writers use isolated managed worktrees.
- Task 5 waits for both ranked results and filters because semantic retrieval must preserve those contracts.
- Task 6 waits for semantic retrieval and exact-match navigation.
- Tasks 7 and 8 are sequential integration/release work.

Use one writer per worktree. Before any delegated worktree, load the repository worktree skill and base it on the owner-approved commit.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale response replaces current query results | High | Immutable request key plus AbortController and vault-generation checks at every completion. |
| Date filtering after a limit omits valid matches | High | Filter in the candidate/index layer before pagination, not only in React. |
| Semantic expansion sends excessive note data | High | Explicit AI policy, bounded candidate snippets, redaction, Host-only provider, and on-demand default. |
| Model invents a citation/path | High | Opaque candidate IDs resolved only against the captured generation-bound candidate map. |
| AI failure makes ordinary search unusable | High | Local search publishes first; semantic/answer failures are non-blocking fallbacks. |
| Automatic AI creates surprising cost/network traffic | High | Default on-demand; automatic behavior requires explicit setting. |
| Full preview exposes sensitive content in test artifacts | High | Synthetic vault only, screenshot allowlist, and no real profile/session reuse. |
| Search index migration writes into the vault | High | Existing external state root, schema-version rebuild, and regression protecting nested state-root layouts. |
| Result grouping loses exact matches | Medium | Stable match identities and grouped child hits retain line ranges and provenance. |
| Keyboard model conflicts with combobox/dialog behavior | Medium | Roving selection while input keeps focus; focused component and Playwright checks. |
| Query expansion latency feels slower than lexical search | Medium | Local results first, visible semantic progress, cancellation, bounded terms/candidates, and no model call per keystroke. |
| Optional assistant creates a package dependency cycle | High | Workbench declares a narrow structural optional contract; assistant implements it and already depends on Workbench, never the reverse. |

## Out of Scope

- Copying Notion code, private APIs, analytics, cloud workspace behavior, collaboration metadata, or visual branding.
- **Created By** filtering until TockTutor has a trustworthy authorship contract.
- A vector database, persistent embeddings, embedding-provider API, background model indexing, or new search dependency in this plan.
- Search across inactive vaults, Web/TUI surfaces, external websites, attachments whose content is not already safely inspectable, or third-party plugin data.
- Replacing the existing search syntax/parser, assistant panel, DSH Agent lifecycle, or noteVault filesystem authority.
- Persisting Quick Answer into conversation history or allowing search to invoke write tools.
- Infinite scrolling; bounded **Load More** is sufficient.
- A new global design system, theme layer, component library, or root-level documentation file.

## Beads

- Epic: `tockteam-1s5`
- Instant trustworthy search: `tockteam-1s5.1`
- Ranking and pagination: `tockteam-1s5.2`
- Filters and index metadata: `tockteam-1s5.3`
- Keyboard navigation and preview: `tockteam-1s5.4`
- Semantic Related: `tockteam-1s5.5`
- Quick Answer and citations: `tockteam-1s5.6`
- Dialog completion: `tockteam-1s5.7`
- Packaged proof: `tockteam-1s5.8`

## Further Notes

- Primary implementation owners are `plugins/tocktutor/packages/tockteam-tocktutor-workbench`, `tockbot-note-runtime`, `tockbot-note-vault`, and `tockteam-tocktutor-assistant`.
- Tracked `lib/` and `dist/` files are rebuilt outputs; never hand-edit them.
- The existing persistent FlexSearch/SQLite index is sufficient for lexical candidates and metadata filters. Semantic behavior is supplied on demand by the configured model over bounded candidates.
- The existing `AssistantTextTurnRunner` already provides bounded direct DSH LLM streaming without tools or a second Agent. Extend/reuse that seam rather than submitting search questions into the user's active conversation.
