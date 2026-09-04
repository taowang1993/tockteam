# Plan: Selective Oh-DSH Roadmap

## Context

The previous port audited Oh-DSH through `889258f` (`v0.1.11-31-g889258f`), not the final `v0.1.12` tag. Oh-DSH `v0.1.12` is `1926264`; its only new functional changes after that cutoff are packaged updater log suppression (`5afc236`) and Windows staging for a non-workspace plugin dependency (`e93ae98`).

TockTeam is currently at `c364abd` with DSH `0.1.2-rc.1`, Better Sidebar `v0.18.0`, and dsh-TUI `v0.10.0-beta.5`. This plan closes the final tag delta and then handles the broader selective candidates the user chose: legacy state recovery, composer history, an explicitly gated shared DSH home and runtime lock, and an explicitly gated Desktop/Web subscription sign-in path.

This is a behavioral port, not a merge. Oh-DSH remains a research feed; official DSH remains the runtime-contract authority.

## Problem

TockTeam has four remaining gaps:

1. The Oh-DSH → TockTeam rename changed default Desktop, Web, and TUI paths without migrating legacy sessions, settings, profiles, plugins, Marketplace receipts, or credentials.
2. The browser composer has focus compatibility for textarea and contenteditable shapes, but no session-scoped Arrow Up/Down input history.
3. The architecture says surfaces share sessions, while current defaults still use separate DSH homes and have no cross-process writer lock if roots coincide.
4. Subscription OAuth already ships inside the pinned TUI cohort, but Desktop/Web admission, packaging, and security have not been decided.

The final Oh-DSH `v0.1.12` tag also contains one useful updater cleanup and one packaging fix whose applicability must be proven rather than assumed.

## Solution

Deliver the roadmap in reversible stages:

1. Close the exact `v0.1.12` delta with updater log suppression and a deterministic Windows staging regression.
2. Recover legacy Oh-DSH data into the current TockTeam roots without changing current defaults, overwriting destinations, or deleting sources.
3. Add bounded session composer history through DSH `0.1.2-rc.1` public client contracts.
4. After the recovery release is proven, ask for explicit approval of a common `TOCKTEAM_HOME` contract. If approved, migrate current isolated DSH homes into the shared root and add a conservative cross-process writer lock.
5. Keep lock contention fail-closed initially. Evaluate a read-only viewer only if every write path can be comprehensively blocked or the viewer can attach to the owning runtime.
6. Audit the pinned dsh-auth package and ask for explicit admission. If approved, compose it as one Host-only Desktop/Web capability while retaining the existing sole TUI OAuth mount.
7. Validate dsh-context as an independently maintained Marketplace plugin; do not vendor it into TockTeam by default.

## User Stories

1. As an existing Oh-DSH user, I can install TockTeam and retain my sessions, settings, plugins, and credentials without losing or overwriting either copy.
2. As a Desktop or Web user, I can recall prior messages with Arrow Up/Down without breaking multiline editing, IME, or slash/reference menus.
3. As a user moving between Desktop, Web, and TUI, I can share sessions only after a safe migration contract is approved, and concurrent processes cannot corrupt one JSONL session store.
4. As a user with an eligible model subscription, I can use the reviewed OAuth capability on approved surfaces without exposing refresh tokens to browser code.

## Current State and Ownership

| Area                         | Current Owner              | Relevant Seam                                                                                |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Desktop data and runtime     | Electron Host              | `src/main.ts`, `desktopInfo()`, `runtimeEnvironment()`, `startRuntimeOwned()`, secure quit   |
| Web data and runtime         | Web launcher               | `src/web.ts`, `parseLaunchArgs()`, `ensureWebProfile()`, `DshRuntimeSupervisor`              |
| TUI data and runtime         | TUI launcher               | `src/tui.ts`, `parseTuiArgs()`, `tuiLaunchSpec()`, attached child lifecycle                  |
| Profile composition          | DSH Profile + Loader       | `src/profile.ts`, `cordis.patch.yml`, `web/cordis.patch.yml`, `plugins/tui/cordis.patch.yml` |
| Browser composer integration | Sidebar client             | `plugins/sidebar/src/client/plugin.tsx` and existing conversation/input-trigger injections   |
| Desktop updates              | Main-owned updater adapter | `src/app-update.ts`; Electron construction remains in `src/main.ts`                          |
| Runtime packaging            | TockTeam staging and Nix   | `scripts/stage-dsh.mjs`, `scripts/build.mjs`, `nix/tockteam.nix`, registration tests         |
| Third-party plugin changes   | Marketplace transaction    | prepare → pinned candidate → isolated preview → explicit apply                               |

## Implementation Decisions

### Selective Source Policy

- Port behavior attributable to reviewed Oh-DSH commits; do not merge branches or import its DSH `0.1.2-alpha.3` assembly.
- Preserve TockTeam package IDs, profile names, update ownership, launchers, security gates, data roots, and DSH `0.1.2-rc.1` contracts.
- Do not edit `upstream/*`; use downstream adapters, package staging, and profile layers.

### Legacy Recovery Before Root Unification

- Phase-one recovery keeps current defaults:
  - Desktop: `<appData>/TockTeam-Desktop[/dsh]` and `TockTeam-Desktop-Dev`.
  - Web: `~/.tockteam-web`, with DSH under `dsh/`.
  - TUI: `~/.tockteam`, used directly as DSH home.
- Recover only matching legacy roots:
  - packaged Desktop: `<appData>/Oh-DSH-Desktop`;
  - development Desktop: `<appData>/Oh-DSH-Desktop-Dev`;
  - Web: `~/.oh-dsh-web`;
  - TUI/interim shared state: `~/.ohdsh`.
- Never auto-import `~/.dsh`; its ownership is ambiguous.
- Explicit `--user-data-dir`, `--data`, `TOCKTEAM_WEB_HOME`, or `TOCKTEAM_TUI_HOME` remains authoritative and skips unrelated default-root import.
- New TockTeam variables win over pre-rename aliases. Old public Web/TUI input variables may remain fallback inputs; obsolete product-identifying child-runtime variables are not reintroduced unless the pinned renderer still consumes them.
- Migration is copy-only. Existing destination paths win; legacy sources remain untouched for rollback.
- Versioned completion markers are written only after a complete traversal. Missing Windows junction targets or unsafe/incomplete links stop startup before profile, Marketplace, preference, logging, launcher database, or runtime writes.
- Use `lstat`/`realpath` identity, avoid source/destination recursion, preserve safe links, and rebase relative links whose targets move with the copied tree.

### Shared DSH Home Is a Human-Gated Contract

The recommended contract for decision `tockteam-mlm.7` is:

- Add `TOCKTEAM_HOME`; accept `OH_DSH_HOME` only as a lower-priority compatibility fallback.
- Use `~/.tockteam` as the default shared DSH home, reusing the existing TUI root.
- Keep Electron/Chromium, TockLauncher, Desktop logs, and Desktop Marketplace operational data in the existing OS `userData` directory. Only DSH sessions, credentials, settings, and surface profiles become shared.
- Default packaged Desktop, default Web, and default TUI use the common DSH home. Development Desktop stays isolated unless `TOCKTEAM_HOME` is explicitly supplied.
- Explicit Web/TUI `--data` and per-surface home variables retain isolated behavior and current nested/flat compatibility.
- Phase-two migration copies current Desktop `dsh/` and Web `dsh/` state into the shared root. Same-content collisions are harmless; existing shared destination paths win; different-content collisions stop adoption and produce a reviewable report rather than silently choosing launch order.
- No source root is deleted or renamed.

Implementation may begin only after the decision issue records explicit human approval or a corrected contract.

### Runtime Ownership Starts Fail-Closed

- The JSONL persistence backend has no safe multi-writer contract. A shared DSH home therefore requires one writer across Desktop, Web, and TUI.
- Use `.runtime.lock` with atomic exclusive creation, `0600` mode, owner PID/surface/start identity, runtime child PID/start identity, a malformed-lock grace period, and a separately serialized reclaim mutex.
- Treat `EPERM` as a live process. Do not steal fresh malformed locks, live owners, live children, or ambiguous reclaim locks.
- Add only the smallest `DshRuntimeSupervisor` PID/spawn seam required to publish child ownership.
- Acquire before migration/profile/Marketplace/preference/runtime writes; release after bounded teardown on normal exit, signals, startup failure, and secure quit.
- A contending surface initially exits or shows an actionable owner diagnostic. Do not copy Oh-DSH's partial `sessionPersistence.create/append` monkeypatch as a complete read-only guarantee.
- Read-only viewing remains a later decision: either attach to the owning authenticated runtime or prove all profile, settings, session, Marketplace, credential, preference, updater, and privileged Host writes are blocked.

### Composer History Uses RC.1 Events

- Do not copy Oh-DSH's alpha-era `binding.session.getSnapshot().nodes` assumption. DSH `0.1.2-rc.1` exposes durable history through `SessionBinding.eventSource.entries`, with paging through `SessionFace.loadOlder()`.
- Keep only durable `user/message` events with `event.data.source.kind === 'user'`; concatenate text blocks and exclude assistant, tool, plugin, chunk, blank, and consecutive duplicate entries.
- Preserve event sequence as identity so repeated values and cursor position remain stable.
- Keep 100 entries per session and at most 32 resident session histories.
- Resolve writes through the existing public `sessions.scope(id)` → `conversation.input.for(scope).setDraft()` path.
- Intercept only unmodified, non-IME Arrow Up/Down at a collapsed textual boundary. Manual non-empty drafts keep native arrow behavior; recalled history may continue browsing and restore the original draft.
- Slash/reference trigger menus retain arrow ownership. Both `[data-composer-input="true"]` contenteditable and legacy textarea shapes work through one DOM adapter; no Lexical internals.
- Keep this in `@tockteam/sidebar`; no Host, IPC, profile, build-graph, upstream, or TUI change is needed.

### Updater and Windows Staging

- Apply `5afc236` narrowly: disable the real packaged `electron-updater` logger before event binding/checks. Preserve TockTeam state transitions, `onLog`, proxy bypass, and install recovery.
- Do not automatically port `e93ae98`'s standalone network install. TockTeam already builds a recursive `.tockteam-store` closure from pinned inputs.
- First prove a non-workspace package with a production dependency resolves from a copied Windows-oriented stage without source checkout or root `node_modules`. Add a new mechanism only if that deterministic closure fails; any replacement must remain pinned, frozen, self-contained, and launch-time offline.

### Subscription Sign-In Is Security-Gated

- Audit the exact pinned `@deepseek-harness-tui/dsh-auth` revision already carried by dsh-TUI.
- Verify DSH `0.1.2-rc.1` provider compatibility, OAuth question flow, headless refusal, route-collision behavior, refresh serialization, atomic credentials, `0700` parent and `0600` file modes, and redaction.
- Require an explicit decision among default inclusion, opt-in availability, or deferral.
- If admitted, stage the bare auth package directly for full/Desktop and Web-only distributions; Web packaging must not depend on the TUI build branch.
- Mount one Host-only Desktop/Web row through Profile + Loader, with entry-level `llm`/`commands` ordering. Do not create a browser secret bridge or custom OAuth implementation.
- TUI retains its existing sole `@deepseek-harness-tui/dsh-tui/oauth` row.
- Shared credentials follow the resolved DSH home only if the shared-home contract is approved.

### dsh-context Remains Third-Party

- Validate an exact dsh-context revision through Desktop Marketplace prepare, isolated preview, explicit apply, disable, and recovery.
- Do not add a submodule, built-in package, protected ID, floating dependency, or new Windows installer solely for dsh-context.
- Change TockTeam only if validation reveals a concrete Marketplace or RC.1 compatibility bug.

## Testing Decisions

- Use TDD for every implementation slice: run the focused failing regression first, then implement the smallest passing change.
- Highest migration seam: real temporary directory trees plus launcher factories that prove profile/runtime creation did or did not occur.
- Highest lock seam: real competing Node processes and mocked launchers, not only in-process object tests.
- Highest composer seam: pure history/event/keyboard tests plus a browser-visible Playwright flow against the real Web composer.
- Highest auth seam: upstream package verification plus packaged Host composition and a real interactive login flow cancelled before account authorization; no real tokens in fixtures.
- Keep release verification surface-specific until optional decisions are approved; stop every Web, Electron, Playwright, and child process started by verification.

Core commands:

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:runtime
pnpm run smoke:web
pnpm run test:launcher:electron
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
nix flake check --all-systems
```

Packaging-sensitive slices additionally verify canonical Desktop, Web, and TUI Nix packages and the hosted Windows lane. Native x64 Landlock evidence remains kernel-dependent and must not be overstated.

## Dependency Graph

```text
v0.1.12 updater suppression ─────────────────────────────── independent
Windows closure proof ───────────────────────────────┐
                                                     ├── approved browser auth composition
Auth admission decision ─────────────────────────────┘

Desktop legacy recovery/core migration
           ├── Web legacy recovery
           └── TUI legacy recovery
                    │
                    └── shared-home decision
                              │
                              └── shared-home migration
                                        │
                                        └── runtime-lock primitive
                                                  │
                                                  └── surface enforcement
                                                            │
                                                            └── viewer decision

RC.1 composer history ───────────────────────────────────── independent
dsh-context Marketplace validation ─────────────────────── independent
```

## Task List

### Phase 1: Close v0.1.12 and Restore Compatibility

#### Task 1: Suppress Packaged Updater Console Noise

**Description:** Apply Oh-DSH `5afc236` at the real Electron adapter boundary so packaged checks do not print raw updater logs while TockTeam's update state machine remains unchanged.

**Acceptance Criteria:**

- [ ] The packaged updater logger is disabled before checks and event binding.
- [ ] Disabled development/metadata-missing owners still do not load the adapter.
- [ ] Proxy retry, download, install, and recovery behavior remains unchanged.

**Verification:**

- [ ] Failing check first, then: `node --test tests/app-update.test.ts`.
- [ ] `pnpm run typecheck`.

**Dependencies:** None.

**Files Likely Touched:** `src/app-update.ts`, `tests/app-update.test.ts`.

**Estimated Scope:** Small.

**Beads:** `tockteam-mlm.1`.

#### Task 2: Prove Windows Non-Workspace Dependency Staging

**Description:** Exercise the existing recursive dependency closure with a non-workspace package containing a production dependency. Keep the implementation if it is self-contained; port no standalone installer unless the regression proves a real gap.

**Acceptance Criteria:**

- [ ] The staged package imports its production dependency without the source checkout or root `node_modules`.
- [ ] Windows-oriented output contains no external/dangling links.
- [ ] Launch remains offline and pinned.

**Verification:**

- [ ] Run the new focused staging regression, if one is needed.
- [ ] `node scripts/stage-dsh.mjs --quick`.
- [ ] Hosted Windows build/package lane or equivalent Windows evidence.

**Dependencies:** None.

**Files Likely Touched:** `scripts/stage-dsh.mjs`, a focused test under `tests/`; no production change is expected if current closure passes.

**Estimated Scope:** Small to medium.

**Beads:** `tockteam-mlm.2`.

#### Task 3: Recover Legacy Desktop State

**Description:** Introduce the reviewed copy-only migration primitive and run the Desktop mapping before any current-root writes. Keep packaged and development state separate and honor explicit Electron user-data selection.

**Acceptance Criteria:**

- [ ] Missing legacy files copy; destination files win; sources remain.
- [ ] Markers, retries, links, junctions, and incomplete-state refusal are covered.
- [ ] No profile, Marketplace, launcher database, logs, or runtime starts before a complete migration.

**Verification:**

- [ ] Failing migration/startup tests first: `node --test tests/data-root.test.ts tests/desktop-runtime-environment.test.ts`.
- [ ] `pnpm run typecheck`.
- [ ] Desktop smoke with disposable legacy and destination roots.

**Dependencies:** None.

**Files Likely Touched:** new `src/data-root.ts`, `src/main.ts`, new `tests/data-root.test.ts`, `tests/desktop-runtime-environment.test.ts` or a focused Desktop startup test.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.3`.

#### Task 4: Recover Legacy Web State

**Description:** Reuse the migration primitive for `~/.oh-dsh-web` → `~/.tockteam-web`, preserving nested DSH layout and explicit root precedence.

**Acceptance Criteria:**

- [ ] Legacy DSH and TockTeam preference files recover without replacement or deletion.
- [ ] Flags/new variables win; old public variables are fallback only; explicit roots skip default import.
- [ ] Incomplete migration blocks profile creation and runtime startup.

**Verification:**

- [ ] Failing Web cases first: `node --test tests/data-root.test.ts tests/web-profile.test.ts`.
- [ ] `pnpm run smoke:web` with disposable homes.

**Dependencies:** Task 3 (`tockteam-mlm.3`).

**Files Likely Touched:** `src/data-root.ts`, `src/web.ts`, `tests/data-root.test.ts`, `tests/web-profile.test.ts`, `.agents/references/usage.md`.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.4`.

#### Task 5: Recover Legacy TUI State

**Description:** Reuse the migration primitive for `~/.ohdsh` → `~/.tockteam`, treating the source as potentially shared Oh-DSH state and keeping upstream `~/.dsh` out of automatic migration.

**Acceptance Criteria:**

- [ ] Legacy sessions, profiles, credentials, and preferences recover without replacement or deletion.
- [ ] Flags/new variables win; old public variables are fallback only; explicit roots skip default import.
- [ ] Incomplete migration blocks profile creation and child spawn.

**Verification:**

- [ ] Failing TUI cases first: `node --test tests/data-root.test.ts tests/tui.test.ts`.
- [ ] Interactive TUI startup/exit against disposable roots.

**Dependencies:** Task 3 (`tockteam-mlm.3`).

**Files Likely Touched:** `src/data-root.ts`, `src/tui.ts`, `tests/data-root.test.ts`, `tests/tui.test.ts`, `.agents/references/usage.md`.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.5`.

### Checkpoint: Compatibility Release

- [ ] Legacy sources remain present and destination conflicts are reported.
- [ ] Desktop, Web, and TUI initialize only after complete migration.
- [ ] Current defaults and explicit-root behavior have not changed.
- [ ] Updater and Windows staging deltas are closed with evidence.
- [ ] Commit each verified slice separately before continuing.

### Phase 2: Composer Usability

#### Task 6: Add Session Composer History

**Description:** Add bounded, session-scoped Arrow Up/Down recall to the Sidebar client using RC.1 event windows and the existing scoped draft setter.

**Acceptance Criteria:**

- [ ] User-source text events recall in order, preserve repeated-message identity, lazily page, and restore the manual draft.
- [ ] Multiline editing, IME, selection, slash/reference menus, and missing APIs retain native behavior.
- [ ] Contenteditable and legacy textarea composer shapes work on Desktop/Web; TUI is unchanged.

**Verification:**

- [ ] Focused pure tests for history state, RC.1 extraction, loading, keyboard boundaries, and bridge failure behavior.
- [ ] `pnpm run typecheck && pnpm test && pnpm run build`.
- [ ] Playwright: submit two messages, recall older/newer, restore a draft, verify menu/multiline behavior, and stop the Web server.

**Dependencies:** None.

**Files Likely Touched:** new modules under `plugins/sidebar/src/client/`, `plugins/sidebar/src/client/plugin.tsx`, focused root tests. No manifest/profile/build change is expected.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.6`.

### Checkpoint: Browser Feature

- [ ] Web and Desktop use the same Sidebar history behavior.
- [ ] Browser-visible checks pass against the actual RC.1 contenteditable composer.
- [ ] No new dependency or persisted duplicate history store exists.

### Phase 3: Shared State and Runtime Safety

#### Task 7: Approve the Shared DSH Home Contract

**Description:** Produce the path/collision/override decision from real recovered fixtures, then obtain explicit human approval before changing defaults.

**Acceptance Criteria:**

- [ ] Every current and legacy source maps to the proposed destination.
- [ ] Development isolation and explicit-root precedence are unambiguous.
- [ ] Different-content collisions have a fail-closed, reviewable policy.

**Verification:**

- [ ] Decision examples cover macOS, Linux, Windows, same-content duplicates, divergent sessions, and broken links.
- [ ] User explicitly approves, corrects, or rejects the contract.

**Dependencies:** Tasks 3–5 (`tockteam-mlm.3`, `.4`, `.5`).

**Files Likely Touched:** Beads decision notes and, after approval, `.agents/references/architecture.md` / `.agents/references/usage.md`; no runtime code in this task.

**Estimated Scope:** Small.

**Beads:** `tockteam-mlm.7`.

#### Task 8: Adopt the Approved Shared DSH Home

**Description:** If approved, centralize default DSH-home resolution and copy current isolated DSH state into the common destination while leaving surface operational roots and all sources intact.

**Acceptance Criteria:**

- [ ] Default packaged Desktop, Web, and TUI share DSH_HOME and retain distinct profile names.
- [ ] Explicit per-surface roots and development Desktop remain isolated.
- [ ] Same-content collisions pass; different-content collisions stop with a report; migration is idempotent and retryable.

**Verification:**

- [ ] Resolver/migration fixtures for all roots and precedence rules.
- [ ] `node --test tests/data-root.test.ts tests/web-profile.test.ts tests/tui.test.ts` plus Desktop startup coverage.
- [ ] Surface smokes prove a session created on one surface is visible to the next after orderly shutdown.

**Dependencies:** Task 7 (`tockteam-mlm.7`) with an approved decision.

**Files Likely Touched:** `src/data-root.ts`, `src/main.ts`, `src/web.ts`, `src/tui.ts`, related tests and architecture/usage references.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.8`.

#### Task 9: Implement Conservative Runtime Ownership

**Description:** Implement an exclusive shared-home writer lock and the minimal runtime-child identity seam.

**Acceptance Criteria:**

- [ ] Live owners/children and reused PIDs cannot be reclaimed.
- [ ] Fresh malformed and ambiguous reclaim locks fail closed; dead owners/children reclaim safely.
- [ ] Release removes only the caller's still-owned lock.

**Verification:**

- [ ] `node --test tests/runtime-lock.test.ts tests/runtime.test.ts`.
- [ ] Real subprocess cases for owner death, live orphan child, and competing reclaimers.

**Dependencies:** Task 8 (`tockteam-mlm.8`).

**Files Likely Touched:** new `src/runtime-lock.ts`, `src/runtime.ts`, new `tests/runtime-lock.test.ts`, `tests/runtime.test.ts`.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.9`.

#### Task 10: Enforce Runtime Ownership Across Surfaces

**Description:** Acquire before all shared-root writes, publish children, and release after teardown in Desktop, Web, and TUI. Contention remains fail-closed with actionable owner information.

**Acceptance Criteria:**

- [ ] One shared root permits one writer; distinct explicit roots remain independent.
- [ ] Desktop restart/secure quit, Web signals/failure, and TUI attached-child exit preserve and release ownership correctly.
- [ ] No migration, profile, Marketplace, setting, or runtime write occurs after contention.

**Verification:**

- [ ] Per-surface launcher tests plus a two-process smoke.
- [ ] `pnpm run smoke:runtime`, `pnpm run smoke:web`, and interactive TUI startup/exit.
- [ ] Ensure every spawned process is stopped.

**Dependencies:** Task 9 (`tockteam-mlm.9`).

**Files Likely Touched:** `src/main.ts`, `src/web.ts`, `src/tui.ts`, `src/runtime-lifecycle.ts`, launcher/runtime tests.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.10`.

#### Task 11: Assess a Safe Read-Only Viewer

**Description:** Decide whether a contending surface can be truly mutation-free or attach to the owning runtime. Retain fail-closed behavior unless completeness is proven.

**Acceptance Criteria:**

- [ ] Session, profile, settings, Marketplace, credentials, preferences, updater, and privileged Host write paths are covered.
- [ ] The outcome is comprehensive viewer, authenticated owner attachment, or continued fail-closed behavior.
- [ ] No partial environment-flag guard ships.

**Verification:**

- [ ] Threat-model review and mutation tests for any proposed viewer.
- [ ] Explicit human decision recorded.

**Dependencies:** Task 10 (`tockteam-mlm.10`).

**Files Likely Touched:** Decision notes only unless a later approved implementation issue is created.

**Estimated Scope:** Small decision; implementation intentionally separate.

**Beads:** `tockteam-mlm.11`.

### Checkpoint: Shared-State Release

- [ ] Migration was approved from collision fixtures before default changes.
- [ ] Shared state is single-writer and sources remain rollback-safe.
- [ ] Contention is fail-closed unless a separately proven viewer replaces it.
- [ ] Full Desktop/Web/TUI smokes and package checks pass.

### Phase 4: Optional Authentication and Ecosystem Validation

#### Task 12: Admit Subscription Sign-In for Browser Surfaces

**Description:** Security- and compatibility-test the exact pinned dsh-auth package, then obtain an explicit default/opt-in/defer decision.

**Acceptance Criteria:**

- [ ] RC.1 provider routes, questions, refresh, collisions, headless behavior, and credential storage pass.
- [ ] Refresh tokens never cross into browser code, logs, profile patches, or generated authority variables.
- [ ] Standalone Web packaging can carry auth independently of TUI.

**Verification:**

- [ ] Upstream dsh-auth verification commands and downstream composition smoke.
- [ ] Permission/redaction tests and a real login flow cancelled before authorization.
- [ ] Explicit human decision recorded.

**Dependencies:** None.

**Files Likely Touched:** Tests and decision notes only; no profile change until approval.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.12`.

#### Task 13: Compose Approved Subscription Sign-In

**Description:** If admitted, build/stage the bare auth package for approved Desktop/Web distributions and mount exactly one Host-only row through DSH Profile + Loader.

**Acceptance Criteria:**

- [ ] Composition matches the approved default or opt-in policy without browser secrets or a custom OAuth flow.
- [ ] Full/Desktop, Web-only, Windows-hoisted, and Nix packages resolve auth without a source checkout or TUI build assumption.
- [ ] TUI retains exactly one renderer-owned OAuth mount.

**Verification:**

- [ ] Focused profile, Web profile, TUI duplicate-exclusion, stage, and Nix registration tests.
- [ ] `pnpm run build && node scripts/stage-dsh.mjs --quick`.
- [ ] Desktop/Web/TUI smokes and canonical Nix packages.

**Dependencies:** Tasks 2 and 12 (`tockteam-mlm.2`, `.12`) with an approved auth decision.

**Files Likely Touched:** `scripts/build.mjs`, `scripts/stage-dsh.mjs`, `nix/tockteam.nix`, `nix/register-plugins.py`, approved profile/patch layers, package metadata/lockfile, focused composition tests.

**Estimated Scope:** Medium.

**Beads:** `tockteam-mlm.13`.

#### Task 14: Validate dsh-context Through Marketplace

**Description:** Test one exact dsh-context revision as a third-party candidate through TockTeam's existing Desktop Marketplace transaction; do not bundle it.

**Acceptance Criteria:**

- [ ] Prepare/preview/apply/disable/recover works without bypassing authority or React singleton rules.
- [ ] Candidate, current, and previous states remain recoverable.
- [ ] Any TockTeam change addresses a reproduced compatibility bug only.

**Verification:**

- [ ] Marketplace transaction tests if a bug is found.
- [ ] Playwright verification of the installed context surface.
- [ ] Record exact revision and commands; stop all preview/runtime processes.

**Dependencies:** None.

**Files Likely Touched:** None expected; only a focused Marketplace fix/test if validation finds a defect.

**Estimated Scope:** Small validation.

**Beads:** `tockteam-mlm.14`.

### Checkpoint: Roadmap Complete

- [ ] Every accepted slice has focused red/green evidence and full relevant gates.
- [ ] Optional decision issues record approval, rejection, or deferral; unapproved implementation remains blocked.
- [ ] `git diff --check`, `git status`, Beads lint/preflight, and process cleanup pass.
- [ ] No feature branch is pushed or PR opened without explicit authority.

## Parallelization

Safe first-wave parallel work:

- `tockteam-mlm.1` updater suppression.
- `tockteam-mlm.2` Windows staging proof.
- `tockteam-mlm.3` Desktop migration/core primitive.
- `tockteam-mlm.6` composer history.
- `tockteam-mlm.12` auth admission review.
- `tockteam-mlm.14` dsh-context Marketplace validation.

Sequential work:

- Web/TUI recovery follows the common migration primitive.
- Shared-home decision follows all three recovery slices.
- Shared-home adoption → lock primitive → surface enforcement → viewer decision.
- Auth composition follows both auth admission and staging proof.

Use one writer per working directory. Parallel mutation work requires managed worktrees and the repository worktree skill.

## Risks and Mitigations

| Risk                                                                 | Impact | Mitigation                                                                                |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Legacy copy overwrites newer TockTeam state                          | High   | Destination-authoritative copy with exclusive file creation and no source deletion        |
| Partial migration initializes a fresh profile over recoverable state | High   | Completion result/marker; abort before all normal writes                                  |
| Symlink/junction traversal escapes or breaks state                   | High   | `lstat`/`realpath`, root identity checks, rebasing, Windows retry, fail closed            |
| Divergent isolated roots silently choose one session history         | High   | Same-content comparison; different-content collision report and explicit decision         |
| Shared JSONL writers corrupt sequence history                        | High   | Cross-process owner + child lock before any shared writes                                 |
| PID reuse or orphan child causes unsafe stale reclaim                | High   | Process-start identity, child publication before probing, conservative reclaim mutex      |
| Partial read-only guard still writes settings/credentials            | High   | Fail closed first; separate comprehensive viewer decision                                 |
| Alpha-era composer API yields empty history on RC.1                  | High   | Use `eventSource.entries` and `SessionFace.loadOlder()`                                   |
| Composer interception breaks IME/menu/multiline navigation           | Medium | Exact boundary/modifier/menu checks plus real browser verification                        |
| OAuth refresh tokens leak to browser/logs                            | High   | Host-only composition, redaction tests, private atomic storage, admission gate            |
| Web-only package assumes TUI build artifacts                         | Medium | Stage/compile bare auth independently for selected surfaces                               |
| Generic Windows fallback weakens reproducibility                     | High   | Prove existing closure first; no network installer unless pinned deterministic gap exists |
| Bundling dsh-context creates another maintained fork                 | Medium | Marketplace validation only; no built-in by default                                       |

## Out of Scope

- Wholesale Oh-DSH merge, rebase, feature parity, or upstream branch tracking.
- Oh-DSH's DSH `0.1.2-alpha.3` runtime/Nix assembly, self-update managers, About branding, website, maintainer workflows, or local installer.
- TUI/Web Marketplace parity.
- Automatic import of `~/.dsh`.
- Source deletion, in-place moves, destination overwrite, or automatic conflict resolution.
- Read-only mode implemented only by monkeypatching session persistence.
- New composer history UI, cross-session history, or a second persistence store.
- Custom OAuth code or browser exposure of credentials.
- Vendoring or protecting dsh-context as a built-in without a separate product decision.

## Beads

- Epic: `tockteam-mlm`
- Exact v0.1.12 delta: `tockteam-mlm.1`, `tockteam-mlm.2`
- Legacy recovery: `tockteam-mlm.3`, `tockteam-mlm.4`, `tockteam-mlm.5`
- Composer: `tockteam-mlm.6`
- Shared state and ownership: `tockteam-mlm.7`, `tockteam-mlm.8`, `tockteam-mlm.9`, `tockteam-mlm.10`, `tockteam-mlm.11`
- Authentication: `tockteam-mlm.12`, `tockteam-mlm.13`
- Ecosystem validation: `tockteam-mlm.14`

## Further Notes

- Reference Oh-DSH `v0.1.12` commit: `1926264`.
- Previous audit cutoff: `889258f`.
- Important behavioral references:
  - migration: `b6dc326`, `6582f3b`, then link/junction/incomplete-state hardening through `eebd5e8`;
  - runtime ownership: `4c40546` through `f8299db`;
  - composer history: `fefa403`, `5c12296`, `3cd89ea`, follow-up fixes through `8d35e3a`, and contenteditable compatibility `5814008`;
  - updater logging: `5afc236`;
  - Windows non-workspace staging: `e93ae98`;
  - browser auth references: `d70980b`, `9a91779`.
- Oh-DSH's partial read-only guard and standalone dependency installer are references to evaluate, not defaults to copy.
