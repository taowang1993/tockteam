# Plan: Close Residual TockTutor Feature Parity Gaps

## Problem

The completed `tockteam-3t5` ledger proved 88 included Obsidian checklist rows and six broad Tockbot compatibility capabilities, but those umbrella rows were not a feature-level inventory of the shipped Tockbot TockTutor reference. A direct comparison against Tockbot commit `af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba` found five residual areas:

1. TockTeam Source and Live Preview use plain textareas instead of Tockbot's CodeMirror and Milkdown interaction model.
2. The Desktop parser accepts most TockTutor URI fields, but the workbench rejects named-vault, choose-vault, and window requests and does not complete the full callback/pane lifecycle.
3. TockTeam resolves only first-level embeds and cannot present Tockbot's depth-three nested note, media, Canvas, and Base behavior across editor and reading modes.
4. TockTeam escapes all authored HTML and does not provide Tockbot's bounded raw-HTML subset or isolated live external embeds.
5. TockTeam has equivalent runtime reads and reviewed writes, but does not expose Tockbot's `notes_*` TockDriver tool contract to the main DSH agent.

The previous “zero gaps” wording must be corrected: it meant zero gaps in the scoped ledger, not exhaustive Tockbot feature parity.

## Solution

Extend the existing TockTutor packages and Desktop owners in vertical slices:

- replace the Source textarea with a minimal CodeMirror Markdown adapter;
- replace line-based Live Preview with a source-preserving Milkdown adapter;
- port only the bounded Tockbot editor behaviors needed by the residual contract;
- build one cancellable, recursive embed resolver shared by all presentation modes;
- complete protocol behavior in trusted Desktop/Host ownership;
- expose thin `notes_*` compatibility tools over the existing runtime and proposal queue;
- rerun a corrected feature-level ledger through a fresh packaged Desktop and copied disposable profile.

Two Tockbot behaviors remain deliberate security divergences unless an equally inert representation is found:

- saved HTML/PDF will not contain active network frames or remote resources;
- saved HTML/PDF will not contain active audio, video, or PDF resource elements. Live Reading/Slides may use bounded, revocable local URLs, while static output retains labeled metadata.

## Design Read

TockTutor is a repeated-use Desktop writing workspace for keyboard-heavy local knowledge work. Prioritize exact-source preservation, predictable selection and history, dense but readable controls, visible recovery state, and consistent behavior across editor modes. Preserve TockTeam's semantic tokens, Tailwind/shadcn primitives, focus behavior, and native authority; port behavior rather than Tockbot chrome.

## Assumptions

- “Cover these features” means implement the bounded Tockbot behaviors identified above, not every unchecked Obsidian capability.
- Tockbot commit `af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba` is the behavior and fixture oracle for this plan.
- TockTeam commit `faa7fe6bb5c8bc6307ae905b2321b7460487231f` is the planning baseline.
- Existing package IDs, profile names, vault formats, settings namespaces, data roots, and `vault_*` tool names remain compatibility contracts.
- The corrected ledger may reuse prior evidence only when that evidence exercises the exact child behavior, not an umbrella label.

## Current Ownership Map

| Concern | Current TockTeam Owner | Main Seams |
| --- | --- | --- |
| Editor state, route, save gate, mode persistence | `@tockteam/tocktutor-workbench` | `src/route.tsx`, `src/editor-surface.tsx`, `src/session.ts` |
| Markdown projection and embeds | `@tockteam/tocktutor-workbench` | `src/rich-markdown.ts`, `src/embeds.ts`, `src/host-read.ts` |
| Vault identity, reads, writes, recovery | `tockbot-note-runtime` | Runtime service and tests |
| Protocol parsing and dispatch queue | TockTeam Desktop | `src/desktop-native-policy.ts`, `src/desktop-dispatch-*.ts`, `src/main.ts` |
| Pop-outs and print/export | TockTeam Desktop | `src/desktop-popout-*.ts`, `src/desktop-print-export-*.ts` |
| Inline assistant and reviewed writes | `@tockteam/tocktutor-assistant` | `src/index.ts`, `src/proposals.ts`, `src/proposal-state.ts` |
| Existing model-facing vault reads | `@tockteam/note-vault-tools` | `src/index.ts` |
| Live untrusted web content | `tockbot-web-clip` plus Desktop frame owner | Existing Web Viewer and authorization seams |

## Implementation Decisions

1. **Correct the contract before coding.** Split the prior umbrella capabilities into feature-level rows with exact Tockbot source/tests, TockTeam owner, status, and verification evidence.
2. **Use the proven editor engines rather than recreating them.** Add exact lockfile-pinned CodeMirror 6 and Milkdown 7.20 dependencies to the workbench package. Port only the Markdown adapters and TockTutor extensions; do not port Tockbot's generic chat artifact shell.
3. **Keep one browser owner.** Editor adapters are ordinary workbench components/modules, not new Cordis plugins or services.
4. **Keep Markdown authoritative.** All commands produce minimal source transactions. Untouched text, line endings, frontmatter, unsupported syntax, and selected widget syntax remain exact.
5. **Keep one embed resolver.** Reading, Slides, Source, Live Preview, HTML, and PDF consume one bounded target graph. No presentation mode gets its own filesystem scanner or parser fork.
6. **Keep native authority out of browser code.** Human vault names, absolute paths, clipboard reads, callback delivery, pop-out windows, and protocol supersession remain in Desktop/Host owners. The browser receives only validated relative targets and opaque vault identities.
7. **Reuse reviewed-write authority.** `notes_stage_write` and `notes_organize_capture` use the existing `NoteAssistant` proposal queue, storage-domain persistence, runtime recovery, review Remote, and audit trail. They do not create a second queue or direct write path.
8. **Use thin read aliases.** `notes_search` and `notes_read` adapt the existing runtime-backed search/read logic and Tockbot output contract. `vault_*` tools remain available and unchanged.
9. **Preserve inert static export.** Raw text/table HTML may be sanitized into static markup. Active remote frames and non-image media resources stay out of saved HTML/PDF; live external content uses the existing isolated frame boundary.
10. **Port tests before implementation.** Each non-trivial slice begins with the smallest Tockbot-derived public-behavior test that fails against TockTeam.
11. **Do not hand-edit generated files.** Change source and package manifests, then rebuild `dist`/`lib` and regenerate `plugins/tocktutor/build-manifest.json` through existing scripts.

## Testing Decisions

### Highest Useful Seams

- Pure tests for Markdown transactions, protocol normalization, sanitizer decisions, recursive resolution, cycles, and tool schemas.
- Component tests for CodeMirror/Milkdown behavior, focus, history, widgets, cleanup, and accessibility.
- Workbench controller/Remote tests for dirty saves, stale vault generations, async resolver results, and protocol delivery.
- Existing Desktop owner tests for picker, clipboard, dispatch, pop-out, callbacks, and print/export policy.
- `playwright-cli` against the real `/tocktutor` route for keyboard, pointer, mode, embed, and review flows.
- A real packaged Electron run for protocol, pop-outs, isolated web frames, clipboard, callbacks, print/export, copied-profile compatibility, and teardown.
- A real disposable DSH model call for each new `notes_*` tool, using non-guessable fixtures and exact canonical results.

### Red-Green-Refactor Loop

For each issue:

1. Port or write one failing public-behavior check and record the RED command/result.
2. Implement the minimum behavior behind the existing owner.
3. Re-run the focused check and touched package gates.
4. Verify the real browser/Desktop/model boundary when the slice crosses it.
5. Stop every started server, Electron process, browser session, child process, and temporary profile.

### Standard Commands

```sh
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench typecheck
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench build

pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant typecheck
pnpm -C plugins/tocktutor --filter @tockteam/note-vault-tools test

node --test tests/desktop-dispatch-owner.test.ts tests/desktop-dispatch-channel.test.ts
node --test tests/desktop-print-export-owner.test.ts tests/desktop-caller-bridge.test.ts

pnpm run install:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
pnpm run typecheck
pnpm test
pnpm run build
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:runtime
```

The final issue also runs the applicable packaged Desktop build/smoke and copied-profile acceptance matrix. Configuration dumps, unit tests, and startup logs are supporting evidence, not substitutes for real-consumer proof.

## Out of Scope

- Mobile, hosted sync, shared vaults, Publish, accounts, billing, or team administration.
- Full unchecked Obsidian Advanced Markdown, Bases, tabs, panes, plugins, themes, or CLI parity beyond the pinned Tockbot behaviors named in the residual ledger.
- Replacing DSH Profile + Loader, the DSH agent loop, or Cordis lifecycle.
- A second vault authority, metadata database, embed scanner, proposal queue, or browser-native bridge.
- Active network resources in saved HTML/PDF.
- Removing the already-separated Tockbot route-retirement commit or combining Tockbot and TockTeam repository changes.

## Delivery Plan

### Phase 0 — Correct the Acceptance Contract

#### `tockteam-tc9.1` — Correct the Residual TockTutor Parity Contract

**Description:** Extend the machine-checked ledger so the five residual areas are represented by bounded child behaviors rather than broad “proven” labels. Pin both repository revisions and map each row to its exact Tockbot source/test oracle, TockTeam owner, focused command, real-consumer check, and status.

**Acceptance Criteria:**

- The validator rejects a proven umbrella row when a required child is absent or unproven.
- Every residual behavior and both retained security divergences are explicit.
- Existing proof is reused only when it exercises the exact row.

**Verification:**

```sh
node plugins/tocktutor/parity/validate.mjs
node --test tests/tocktutor-parity-ledger.test.ts
git diff --check
```

**Dependencies:** None.

**Files Likely Touched:**

- `plugins/tocktutor/parity/ledger.json`
- `plugins/tocktutor/parity/validate.mjs`
- `tests/tocktutor-parity-ledger.test.ts`

**Estimated Scope:** Medium.

### Phase 1 — Replace the Editor Substrates

#### `tockteam-tc9.2` — Replace the Source Textarea With a CodeMirror Tracer

**Description:** Add the minimum Markdown CodeMirror adapter that opens, edits, selects, saves, and disposes through the existing workbench controller. Preserve exact source, per-tab mode/selection, dirty transitions, conflict handling, and workspace restoration.

**Acceptance Criteria:**

- Opening and saving a note does not normalize untouched source or line endings.
- Selection and focus route through existing command/assistant context.
- Note, vault, route, and plugin teardown dispose the editor and async work.

**Verification:** Focused Source component RED/GREEN test, workbench test/typecheck/build, then a `playwright-cli` open-edit-save-switch flow.

**Dependencies:** `tockteam-tc9.1`.

**Files Likely Touched:**

- `plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json`
- `pnpm-lock.yaml`
- `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/source-editor.tsx` (new)
- `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/editor-surface.tsx`
- `plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/source-editor.test.tsx` (new)

**Estimated Scope:** Medium.

#### `tockteam-tc9.3` — Complete Source Selection and Editing Parity

**Description:** Add Tockbot's bounded multi-selection and source-editing extensions: multiple cursors, rectangular selection, line copy/cut/delete, hard breaks, no-format paste, Escape simplification, task/comment decorations, and heading/list folds.

**Acceptance Criteria:**

- Multi-range edits are atomic, undoable, and preserve active-head semantics.
- Tockbot task/comment/fold and line-editing fixtures pass through the public editor.
- Unsafe, selected, malformed, or excessive syntax stays literal and editable.

**Verification:** Focused CodeMirror extension tests, component keyboard/pointer tests, workbench package gates, and real browser keyboard flows.

**Dependencies:** `tockteam-tc9.2`.

**Files Likely Touched:**

- `src/source-editor.tsx`
- focused `src/source-*.ts` extension modules
- focused `tests/source-*.test.ts[x]` files

**Estimated Scope:** Medium; keep each extension and its test together in small commits.

#### `tockteam-tc9.4` — Replace Line-Based Live Preview With a Milkdown Tracer

**Description:** Replace per-line textareas with one source-preserving Milkdown editor wired to the same save gate, selection context, per-tab state, commands, focus, and lifecycle as Source mode.

**Acceptance Criteria:**

- Untouched Markdown and line endings survive open/edit/save.
- Undo/redo, tab switching, workspace restoration, and conflicts use existing owners.
- Milkdown instances and listeners are removed on every identity/lifecycle transition.

**Verification:** Focused Live Preview component test, workbench package gates, and `playwright-cli` edit/undo/tab/restart flow.

**Dependencies:** `tockteam-tc9.2`.

**Files Likely Touched:**

- `package.json` and `pnpm-lock.yaml`
- `src/live-preview-editor.tsx` (new)
- `src/editor-surface.tsx`
- `tests/live-preview-editor.test.tsx` (new)

**Estimated Scope:** Medium.

#### `tockteam-tc9.5` — Complete Live Preview Block Interaction Parity

**Description:** Port bounded tasks, comments, callouts, heading/list folds, properties, hard breaks, no-format paste, and line editing as Milkdown transactions.

**Acceptance Criteria:**

- Visible state and resulting Markdown agree with Tockbot fixtures.
- Callout/fold/task mutations stay in editor history and alter only intended ranges.
- Unsupported or excessive content remains exact source rather than a lossy widget.

**Verification:** Focused Milkdown extension tests, component accessibility tests, workbench gates, and browser keyboard/pointer checks.

**Dependencies:** `tockteam-tc9.4`.

**Files Likely Touched:** focused `src/live-preview-*.ts[x]` modules and matching tests.

**Estimated Scope:** Medium.

#### `tockteam-tc9.14` — Complete Live Preview Table and Command Parity

**Description:** Add history-safe GFM table navigation/context operations, formatting and slash commands, internal links, page preview, drag/drop, templates, and command-palette selection routing.

**Acceptance Criteria:**

- Row/column/alignment/sort operations are undoable and preserve logical selection.
- Commands edit only intended ranges and retain view mode.
- Link preview and drag/drop stay bounded, accessible, and source-preserving.

**Verification:** Focused table/command tests, workbench gates, and real keyboard, context-menu, and drag flows.

**Dependencies:** `tockteam-tc9.4`.

**Files Likely Touched:** existing `editor-commands.ts`, focused Milkdown table/command modules, route command wiring, and matching tests.

**Estimated Scope:** Medium.

### Phase 2 — Unify Embed Resolution and Presentation

#### `tockteam-tc9.6` — Build One Bounded Recursive Embed Resolver

**Description:** Replace first-level projection with a pure/cancellable target graph that resolves Markdown full-note/heading/block targets, media, Canvas, and Bases through the existing runtime gateway. Preserve exact-path precedence, aliases, target-stable cache keys, aggregate budgets, depth three, cycles, and stale-generation invalidation.

**Acceptance Criteria:**

- Results are deterministic and bounded for every supported target kind.
- Cycles, ambiguous basenames/aliases, unsafe paths, malformed content, and exhausted budgets remain inert.
- Late results cannot cross vault, document, revision, or route identities.

**Verification:** Tockbot-derived resolver fixtures, hostile/large/cycle tests, workbench typecheck/build.

**Dependencies:** `tockteam-tc9.1`.

**Files Likely Touched:** `src/embeds.ts`, one new resolver module, `src/host-read.ts` only if an existing bounded read is missing, and focused tests.

**Estimated Scope:** Medium.

#### `tockteam-tc9.7` — Render Local Embeds in Reading, Slides, and Inert Export

**Description:** Feed the shared graph into Reading and Slides for bounded image/audio/video/PDF, nested notes, Canvas, Bases, and fenced Base blocks. Feed only inert nested text/Canvas/Base and allowlisted data images into HTML/PDF; retain labeled metadata for non-image static media.

**Acceptance Criteria:**

- Live Reading/Slides match depth-three fixtures and show bounded media controls/PDF hints.
- Static output preserves the current no-active-resource contract.
- Object URLs, resolver requests, and renderer resources are revoked on changes and teardown.

**Verification:** Cross-mode fixture tests, component cleanup tests, `desktop-print-export-owner` tests, and real Reading/Slides/HTML/PDF evidence.

**Dependencies:** `tockteam-tc9.6`.

**Files Likely Touched:** `src/rich-markdown.ts`, `src/editor-surface.tsx`, focused presentation/export modules, and existing Desktop print/export tests if the accepted static grammar changes.

**Estimated Scope:** Medium.

#### `tockteam-tc9.15` — Render Target-Stable Embeds in Source and Live Preview

**Description:** Add selection-aware media, note, Canvas, Base, fenced Base, Mermaid, and math widgets to both editors without recreating editor instances when async results arrive.

**Acceptance Criteria:**

- Selection or widget activation reveals exact source.
- Surrounding edits preserve editor selection/history and target-stable async context.
- Stale, unsafe, unresolved, fenced, escaped, or actively selected syntax remains literal.

**Verification:** Source/Live widget tests, stale-result and URL-revocation tests, workbench gates, and browser source-recovery flows.

**Dependencies:** `tockteam-tc9.3`, `tockteam-tc9.5`, `tockteam-tc9.6`.

**Files Likely Touched:** focused Source/Live embed extension modules, shared resolver hook/adapter, and matching tests.

**Estimated Scope:** Medium.

#### `tockteam-tc9.8` — Render the Safe Raw HTML Subset

**Description:** Port the bounded parser/sanitizer behavior for common inline, block, text, and table tags. Keep scripts, handlers, unsafe URLs, active resource elements, malformed nesting, and excessive markup escaped or removed.

**Acceptance Criteria:**

- Allowed raw text/table fixtures render consistently in Reading and static output.
- Unsafe or malformed fixtures cannot create script, event, style, form, frame, local-file, or network authority.
- CSP and Desktop export validation continue to pass.

**Verification:** Tockbot sanitizer fixtures plus hostile additions, workbench renderer gates, and Desktop print/export owner tests.

**Dependencies:** `tockteam-tc9.6`.

**Files Likely Touched:** `src/rich-markdown.ts`, one focused sanitizer module, renderer tests, and export-owner tests only if grammar must be clarified.

**Estimated Scope:** Medium.

#### `tockteam-tc9.16` — Add Isolated External Image and Web Embeds

**Description:** Recognize bounded credential-free external image, YouTube, Twitter/X, and HTTP(S) embed syntax. Route live content through the existing hardened Web Viewer/isolated Desktop frame; saved HTML/PDF remains inert.

**Acceptance Criteria:**

- Private, credential-bearing, malformed, redirected-private, and oversized URLs never load.
- Allowed live embeds are sandboxed, no-referrer, cancellable, and cleaned up.
- The ledger and reference explicitly record the inert static-export divergence.

**Verification:** URL/projection fixtures, Web Clip security tests, isolated-frame Desktop smoke, browser live-embed flow, and network-request inspection.

**Dependencies:** `tockteam-tc9.6`.

**Files Likely Touched:** focused external-embed projection, Web Viewer handoff, existing Web Clip tests, and workbench integration/tests.

**Estimated Scope:** Medium.

### Phase 3 — Complete Trusted Protocol Behavior

#### `tockteam-tc9.9` — Route Protocol Requests Through Trusted Vault Ownership

**Description:** Implement choose-vault, named/recent-vault, shorthand, and absolute-path resolution in Desktop/Host ownership. Reuse canonical recent-vault identity, most-specific containment, runtime activation, and the browser dirty-save handshake.

**Acceptance Criteria:**

- Browser code never receives or resolves human vault names or absolute paths.
- Unknown, outside, traversal, ambiguous, or stale requests fail before acting.
- Newer requests supersede older activation work and cannot leave the wrong vault active.

**Verification:** Desktop parser/owner/channel tests, runtime activation tests, and real overlapping protocol requests against copied disposable vaults.

**Dependencies:** `tockteam-tc9.1`.

**Files Likely Touched:** `src/desktop-native-policy.ts`, `src/desktop-dispatch-owner.ts`, `src/desktop-dispatch-provider.ts`, `src/main.ts`, and focused tests.

**Estimated Scope:** Medium.

#### `tockteam-tc9.10` — Complete Protocol Pane, Clipboard, and Callback Behavior

**Description:** Finish tab/split/window routing, pop-out persistence, clipboard content, silent/additive/overwrite policies, heading/block jumps, and bounded success/error callbacks through existing Desktop owners and exact dispatch completion.

**Acceptance Criteria:**

- Supported URI forms complete exactly once and return callbacks only after the final local result.
- Clipboard reads happen only in trusted Electron main and remain bounded.
- Failed/stale/untrusted requests preserve active editor state and required recovery.

**Verification:** Parser and dispatch completion tests, pop-out/caller bridge tests, and real protocol flows for each action/pane/callback outcome.

**Dependencies:** `tockteam-tc9.9`.

**Files Likely Touched:** current Desktop dispatch/pop-out/main files, workbench `native-actions.ts`/`route.tsx`, and focused tests.

**Estimated Scope:** Medium.

### Phase 4 — Expose TockDriver-Compatible Tools

#### `tockteam-tc9.11` — Expose TockDriver-Compatible Note Read Tools

**Description:** Register `notes_search` and `notes_read` as canonical DSH tools over the existing runtime-backed vault search/read implementation, adapting Tockbot parameters and output without a second scanner.

**Acceptance Criteria:**

- Canonical JSON values match the declared schemas; renderers remain separate.
- Results are bounded, generation-aware, redacted, and explicit about omissions/truncation.
- Cancellation, unload, oversized/replaced files, and absent vaults fail safely.

**Verification:** Tool definition/execute/render tests, package lifecycle tests, and a real disposable DSH model task that must retrieve non-guessable fixture values.

**Dependencies:** `tockteam-tc9.1`.

**Files Likely Touched:** `@tockteam/note-vault-tools/src/index.ts` or a focused adapter in the existing assistant package, matching tests, and package metadata only if ownership requires it.

**Estimated Scope:** Medium.

#### `tockteam-tc9.12` — Expose TockDriver-Compatible Staged Write Tools

**Description:** Register `notes_stage_write` and `notes_organize_capture` over `NoteAssistant`'s current proposal queue, runtime reads/recovery, settings, Remote review, persistence, and audit. The main DSH agent gains proposal capability, not direct mutation authority.

**Acceptance Criteria:**

- No tool call mutates before explicit approval.
- Model-visible values exclude absolute paths, full private proposal content, digests, and internal identities.
- Approval/rejection, exclusive create, update identity checks, recovery, restart, concurrent decisions, stale vaults, and disposal reuse existing guarantees.

**Verification:** RED/GREEN tool registration tests, proposal-state/loader composition tests, assistant package gates, then a real model stage/review/approve/reject flow in a disposable Desktop profile.

**Dependencies:** `tockteam-tc9.11`.

**Files Likely Touched:** `assistant/src/index.ts`, one focused TockDriver tool-registration module, existing proposal/organize helpers only where reuse needs a public function, and matching tests.

**Estimated Scope:** Medium.

### Phase 5 — Packaged Convergence

#### `tockteam-tc9.13` — Prove Packaged Residual Parity and Correct the Claims

**Description:** Run every corrected residual row through fresh built/staged/packaged artifacts and a copied disposable Tockbot profile. Update the TockTutor reference only after evidence exists, distinguishing exact parity from retained security divergences.

**Acceptance Criteria:**

- Every included row has focused and real packaged evidence.
- Copied vault hashes remain byte-identical except explicit fixture outputs.
- Upgrade, rollback, accessibility, security, cleanup, package, root, staging, and smoke gates pass.
- Documentation never claims exhaustive parity while a row remains absent or excluded.

**Verification:** All standard commands, packaged Desktop smoke, `playwright-cli` capability flows, real `notes_*` model calls, copied-profile hash comparison, and independent review.

**Dependencies:** `tockteam-tc9.3`, `tockteam-tc9.5`, `tockteam-tc9.7`, `tockteam-tc9.8`, `tockteam-tc9.10`, `tockteam-tc9.12`, `tockteam-tc9.14`, `tockteam-tc9.15`, `tockteam-tc9.16`.

**Files Likely Touched:** corrected ledger/evidence, `.agents/references/tocktutor.md`, generated package artifacts through build scripts, and focused acceptance fixtures/tests.

**Estimated Scope:** Medium verification/release slice.

## Dependency Shape

```text
Residual Contract
  ├─ CodeMirror Tracer
  │   ├─ Source Editing Parity ───────────────┐
  │   └─ Milkdown Tracer                      │
  │       ├─ Live Preview Block Parity ───────┤
  │       └─ Live Preview Table/Commands ─────┤
  ├─ Recursive Embed Resolver                 │
  │   ├─ Reading/Slides/Inert Export ─────────┤
  │   ├─ Source/Live Widgets ─────────────────┤
  │   ├─ Safe Raw HTML ───────────────────────┤
  │   └─ Isolated External Embeds ────────────┤
  ├─ Trusted Vault Protocol
  │   └─ Pane/Clipboard/Callbacks ────────────┤
  └─ TockDriver Read Tools
      └─ Staged Write/Organize Tools ─────────┤
                                               └─ Packaged Convergence
```

## Parallelization

After `tockteam-tc9.1`:

- Protocol, embed resolver, and TockDriver read-tool work can proceed independently.
- Editor work should have one writer because Source and Live Preview share `editor-surface.tsx`, route state, package dependencies, and command wiring.
- Reading/static embed integration, safe HTML, and isolated external embeds may run in separate worktrees after the resolver contract is fixed.
- The Source/Live editor-widget slice waits for both editor substrates and the resolver.
- Packaged convergence starts only after every terminal behavior slice is green.

## Checkpoints

### Checkpoint A — Honest Contract

- Feature-level residual rows validate.
- Retained security divergences are explicit.
- No implementation relies on an umbrella “proven” label.

### Checkpoint B — Source-Preserving Editors

- CodeMirror and Milkdown replace the textarea paths.
- Daily Source/Live editing, history, selection, commands, focus, conflicts, and cleanup pass through the real route.

### Checkpoint C — Bounded Content Projection

- One recursive resolver serves all modes.
- Nested local embeds, safe raw HTML, and isolated live external embeds pass hostile and stale-result checks.
- Static exports remain inert.

### Checkpoint D — Trusted Integration

- Cross-vault/window URI flows complete through Desktop/Host ownership.
- Main DSH agents can read and stage reviewed note changes without direct writes or duplicate state.

### Checkpoint E — Packaged Proof

- Corrected ledger, full gates, real Desktop flows, real model tools, copied-profile compatibility, and independent review pass.
- Documentation states exact supported scope.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Porting Tockbot's editor shell creates a second UI architecture | High | Port only minimal CodeMirror/Milkdown adapters and TockTutor extensions; reuse TockTeam controller, primitives, tokens, and commands. |
| Editor dependencies inflate the browser bundle | Medium | Pin only packages imported by the two adapters, measure built client size at each tracer, and lazy-load mode-specific code if the existing esbuild split supports it. |
| Milkdown serialization normalizes untouched Markdown | High | Keep exact source as controller truth, use minimal transactions, port source-preservation fixtures first, and fall back to literal Source for unsupported structures. |
| Async embed results reset selection/history | High | Use target-stable keys and editor effects/decorations; never recreate the editor on resolver completion. |
| Recursive embeds become unbounded | High | Preserve depth-three, target-count, byte, node/edge/row, aggregate-work, cycle, and cancellation limits from the oracle. |
| Raw HTML or external embeds widen authority | Critical | Allow only static text/table tags; route live network content through the existing isolated frame; keep saved output inert and test CSP/request blocking. |
| Cross-vault URI work bypasses dirty saves or switches to stale vaults | Critical | Resolve in trusted Host ownership, use the existing save handshake, canonical identity, monotonic request gate, and exact completion token. |
| `notes_*` tools duplicate scanners or queues | High | Thin adapters only; all reads use `noteVault`, all writes use the existing `NoteAssistant` proposal queue and Remote review. |
| Tool aliases confuse the model with `vault_*` names | Medium | Keep descriptions explicit and canonical outputs stable; verify assembled tool schemas and real model selection before release. |
| Prior documentation overstates completion again | High | Final reference text is generated from feature-level evidence status, and the validator rejects unproven required rows. |

## Beads

- Epic: `tockteam-tc9`
- Children: `tockteam-tc9.1` through `tockteam-tc9.16`.
- Plan path: `.beads/plans/2026-08-26-tocktutor-residual-parity.md`

Use `bd show tockteam-tc9 --long` for the epic and `bd show <issue-id> --long` for the current behavior-first acceptance contract.
