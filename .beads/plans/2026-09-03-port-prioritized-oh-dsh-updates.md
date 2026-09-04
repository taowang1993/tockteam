# Plan: Port Prioritized Oh-DSH Updates

## Problem

TockTeam completed its npm-runtime migration and now pins `@deepseek-ai/dsh@0.1.1-rc.2`, but its current tree still lacks a small set of confirmed Oh-DSH fixes and stable surface updates. Merging Oh-DSH wholesale would import product-specific behavior and violate TockTeam's launcher, profile, data-root, security, and surface-ownership contracts.

## Solution

Port only six narrow behaviors:

1. Restore the browser settings namespace boundary in every assembled runtime.
2. Make the TockTeam Web launcher the sole browser-opening authority.
3. Preserve a saved skin during delayed Host appearance hydration.
4. Advance Better Sidebar from v0.15.0 to v0.15.2.
5. Advance dsh-TUI from the current v0.8.8-era pin to v0.9.2.
6. Hide protected built-in plugins in the Desktop Marketplace by default.

Keep the canonical DSH runtime at `0.1.1-rc.2`. Port behavior into TockTeam's existing modules and adapters rather than copying Oh-DSH's launcher, profiles, updater, or product presentation.

## Upstream References

| Slice | Oh-DSH Reference | Upstream Target |
| --- | --- | --- |
| Settings boundary | `056637f`, `7caf95d`, `a3c9080` | DSH rc.2 API proxy behavior |
| Web browser handoff | `6c67f7a` | Always pass `--no-open` to the child runtime |
| Skin hydration | `6e66dba` | Preserve persisted skin during delayed hydration |
| Better Sidebar | `71cd0ab` | `d9b8f15` / v0.15.2 |
| dsh-TUI | `7b688dc`, `9b5b83a`, `800efa0` | `b166c2e` / v0.9.2 |
| Marketplace visibility | `15ed66f`, `df3807d` | Hide built-ins and clear stale categories |

Commit hashes are research references, not cherry-pick instructions.

## Implementation Decisions

- `dsh-source.json` remains the source of truth for the one pinned DSH runtime. This plan does not add a mutable runtime pointer or independent update channel.
- The browser settings boundary is a packaging hardening step. Use one idempotent, exact-anchor transformation for pnpm-store and hoisted layouts, invoke it from regular and Nix assembly, and fail staging if the pinned package shape changes. Prefer a supported upstream extension point if one exists at implementation time.
- `src/web.ts` owns browser handoff. DSH always receives `--no-open`; TockTeam's existing `--open`, `--no-open`, and `TOCKTEAM_WEB_OPEN` parsing remains authoritative.
- `DesktopSkinsController` remains the single owner of saved skin adoption. Distinguish initial Host hydration from a later intentional built-in theme change without adding a second preference store.
- Git submodule commits remain the source of truth for Better Sidebar and dsh-TUI. TockTeam adapters stay exact-match, idempotent, and limited to identity, storage, protocol, and packaging seams TockTeam owns.
- The dsh-TUI upgrade must not enable a renderer self-update path that bypasses TockTeam packaging. `/reload` and `/restart` may restart the current pinned renderer only.
- Marketplace protection remains a Host contract. Built-in visibility is a client-only view preference over the existing snapshot; hiding an item must not alter installed/enabled state or transaction authority.
- Do not add dependencies. Reuse the existing React, shadcn-derived components, Node test runner, adapters, and smoke scripts.
- Implement every non-trivial slice test-first with the smallest public regression seam.

## Testing Decisions

- Highest useful seams:
  - runtime assembly fixtures for the settings boundary;
  - `main()` runtime options for Web browser handoff;
  - `DesktopSkinsController` behavior for hydration;
  - real Web sidebar and interactive TUI flows for upstream renderer changes;
  - rendered Desktop Marketplace behavior for built-in visibility.
- Existing prior art:
  - `tests/web-profile.test.ts`
  - `tests/skins.test.ts`
  - `tests/terminal-protocol.test.ts`
  - `tests/sidebar.test.ts`
  - `tests/tui.test.ts`
  - `tests/plugin-marketplace.test.ts`
  - `scripts/smoke-web.mjs`
  - `scripts/smoke-runtime.mjs`
- UI work must follow the design and shadcn skills and be verified with Playwright CLI. Use the current Marketplace hierarchy and components; this is a filtering correction, not a redesign.
- Every RED check must be run before implementation and recorded in the relevant bead. Every slice must report its exact final verification commands.

## Out of Scope

- Upgrading to `@deepseek-ai/dsh@0.1.2-rc.1` or the Oh-DSH `0.1.2-alpha.3` research branch.
- Independent runtime download, activation, rollback, or runtime release channels.
- Web or TUI Marketplace expansion; the Marketplace remains Desktop-owned in this plan.
- Desktop/Web subscription authentication or bundling `dsh-auth` beyond what the pinned dsh-TUI release already requires internally.
- `dsh-context`, Liangshen branding, Oh-DSH installers, website work, or unrelated desktop chrome.
- Linux Landlock preview support. Marketplace scripted previews continue to fail closed where no supported sandbox exists.
- A new About plugin. Runtime version visibility can be considered separately in the existing launcher settings.

## Task List

### Phase 1: Security and Correctness

#### Task 1: Restrict Browser Settings Namespaces

**Bead:** `tockteam-7sn.1`

**Description:** Add a fail-closed boundary to every staged DSH rc.2 API proxy so browser settings clients can describe and write only an explicit TockTeam allowlist plus namespaces returned by configurable model providers.

**Acceptance criteria:**

- [ ] A non-allowlisted registered namespace is omitted from browser descriptions and write attempts return `settings-not-exposed`.
- [ ] Required settings UI namespaces and configurable model-provider namespaces remain readable and writable.
- [ ] The transformation supports pnpm-store and hoisted Windows layouts, is idempotent, and fails when expected anchors or packages are absent.
- [ ] Regular staging and Nix assembly apply the same guard before publishing a runtime.

**Verification:**

- [ ] RED then GREEN: `node --test tests/settings-boundary.test.ts`
- [ ] `pnpm run stage:dsh`
- [ ] `pnpm run smoke:web`
- [ ] `nix build .#tockteam-web .#tockteam-tui`

**Dependencies:** None.

**Files likely touched:**

- `scripts/settings-boundary.mjs` (new)
- `scripts/stage-dsh.mjs`
- `nix/dsh-runtime-pinned.nix`
- `tests/settings-boundary.test.ts` (new)

**Estimated scope:** Medium.

#### Task 2: Make Web Browser Handoff Single-Owner

**Bead:** `tockteam-7sn.2`

**Description:** Always pass `--no-open` to the spawned DSH Web runtime. The outer TockTeam launcher remains solely responsible for the optional browser launch after runtime readiness.

**Acceptance criteria:**

- [ ] Captured child runtime arguments always include `--no-open` exactly once.
- [ ] Existing TockTeam option precedence remains unchanged.
- [ ] `--no-open` never launches a browser and `--open` performs only the existing outer handoff.

**Verification:**

- [ ] RED then GREEN: `node --test tests/web-profile.test.ts`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run smoke:web`

**Dependencies:** None.

**Files likely touched:**

- `src/web.ts`
- `tests/web-profile.test.ts`

**Estimated scope:** Small.

#### Task 3: Preserve a Saved Skin During Hydration

**Bead:** `tockteam-7sn.3`

**Description:** Prevent delayed Host hydration of a built-in appearance from erasing a valid skin restored during startup while preserving intentional post-start built-in theme selection.

**Acceptance criteria:**

- [ ] A valid saved skin remains active and persisted when delayed hydration publishes a built-in theme.
- [ ] An intentional built-in theme selection after startup still clears the skin and updates the fallback.
- [ ] Unknown skin IDs and disposal behavior remain unchanged.

**Verification:**

- [ ] RED then GREEN: `node --test tests/skins.test.ts`
- [ ] `pnpm run typecheck`

**Dependencies:** None.

**Files likely touched:**

- `plugins/skins/src/client/skin-controller.ts`
- `tests/skins.test.ts`

**Estimated scope:** Small.

### Checkpoint: Immediate Hardening

- [ ] Tasks 1–3 pass their narrow checks.
- [ ] `pnpm test` and `pnpm run typecheck` pass together.
- [ ] Commit each green slice separately before dependency updates.

### Phase 2: Stable Surface Updates

#### Task 4: Upgrade Better Sidebar to v0.15.2

**Bead:** `tockteam-7sn.4`

**Description:** Advance the Better Sidebar submodule and adapt only changed TockTeam-owned seams. Preserve session/workspace authority, path validation, and the binary terminal-exit protocol while gaining upstream PTY persistence and Windows Git-window fixes.

**Acceptance criteria:**

- [ ] The pinned submodule is exactly v0.15.2 (`d9b8f15`).
- [ ] The adapter remains exact-match and idempotent; unexpected upstream source fails the build.
- [ ] A terminal remains attached across conversation switches and returns with buffered output intact.
- [ ] Files, Git, workspace, and PTY operations remain bound to the active Session and Workspace.

**Verification:**

- [ ] RED compatibility check before changing the adapter.
- [ ] `node --test tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-browser-url.test.ts tests/terminal-protocol.test.ts tests/workspace-tools.test.ts`
- [ ] `pnpm run build`
- [ ] `pnpm run stage:dsh`
- [ ] `pnpm run smoke:web`
- [ ] Playwright CLI: open Web, create a terminal, switch conversations, return, and verify terminal identity/output.
- [ ] `nix build .#tockteam-web`

**Dependencies:** Schedule after the Phase 1 checkpoint to avoid mixing upstream churn with correctness fixes.

**Files likely touched:**

- `upstream/DSH-better-sidebar` submodule pointer
- `scripts/better-sidebar-upstream-adapter.mjs`
- `tests/terminal-protocol.test.ts`
- `pnpm-lock.yaml`
- `nix/tockteam.nix`

**Estimated scope:** Medium.

#### Task 5: Upgrade dsh-TUI to v0.9.2

**Bead:** `tockteam-7sn.5`

**Description:** Advance the pinned renderer to v0.9.2 and review each changed adapter seam. Keep the TockTeam profile, title, theme integration, `~/.tockteam` roots, resume command, language selection, fullscreen default, and package lifecycle intact.

**Acceptance criteria:**

- [ ] The pinned renderer is exactly v0.9.2 (`b166c2e`) and its dependency graph remains compatible with DSH rc.2.
- [ ] Existing profiles, sessions, settings, credentials, and themes resume without relocation or reset.
- [ ] Recap, paste folding, `/reload`, and `/restart` operate through the TockTeam launcher; no command mutates or self-updates the packaged renderer.
- [ ] Every adapter anchor is still necessary, exact, idempotent, and covered by `tests/tui.test.ts`.

**Verification:**

- [ ] RED compatibility check: build and run `node --test tests/tui.test.ts` against the new pristine submodule before adapting.
- [ ] `pnpm run build`
- [ ] `node --test tests/tui.test.ts`
- [ ] `pnpm run stage:dsh`
- [ ] Interactive PTY check: start `tockteam tui`, resume an existing temporary session, exercise recap/paste/reload/restart, and exit cleanly.
- [ ] `nix build .#tockteam-tui`

**Dependencies:** Schedule after the Phase 1 checkpoint. Keep separate from the Better Sidebar commit because both alter lock and Nix inputs.

**Files likely touched:**

- `upstream/dsh-TUI` and nested submodule pointers
- `scripts/tui-upstream-adapter.mjs`
- `tests/tui.test.ts`
- `pnpm-lock.yaml`
- `nix/tockteam.nix`
- `plugins/tui/cordis.patch.yml` only if the released bundle contract changed

**Estimated scope:** Medium to large; stop and split packaging into a follow-up child issue if more than one focused session is required.

### Checkpoint: Pinned Surface Compatibility

- [ ] `git submodule status --recursive` resolves every recorded commit.
- [ ] Desktop/Web sidebar composition still starts with the existing TockTeam Host/client split.
- [ ] TUI still runs one DSH agent loop and the upstream renderer only.
- [ ] No user profile or data file is rewritten merely by upgrading the packaged source.

### Phase 3: Marketplace Visibility

#### Task 6: Hide Protected Built-ins by Default

**Bead:** `tockteam-7sn.6`

**Design Read:** This is a dense Desktop administration surface for occasional plugin management. Preserve the current hierarchy and compact controls; add one explicit, accessible filter using the existing Checkbox and Label components.

**Description:** Hide protected built-in plugins from the default catalog view while retaining an explicit **Show Built-in Plugins** control. Derive status counts, search results, selected details, and category options from the visible catalog, and clear a category that ceases to exist when visibility changes.

**Acceptance criteria:**

- [ ] Built-ins are hidden on first open but remain installed, enabled, and Host-protected.
- [ ] **Show Built-in Plugins** reveals them without altering Host state.
- [ ] Counts, search, empty state, details selection, and categories stay coherent when visibility changes.
- [ ] The control is keyboard-operable, focus-visible, localized, and correct in light and dark themes.

**Verification:**

- [ ] RED then GREEN: leave one runnable Node test for catalog/category derivation, using a small pure client helper only if direct component testing would require a new framework.
- [ ] `node --test tests/plugin-marketplace.test.ts tests/plugin-marketplace-view.test.ts`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run build`
- [ ] Playwright CLI against the running Desktop surface: verify default hidden state, reveal action, category reset, search/counts, keyboard focus, and light/dark rendering.
- [ ] Stop Electron and every child process after verification.

**Dependencies:** Phase 1 complete. The UI slice is independent of the submodule updates but should land after them to minimize simultaneous lock/build churn.

**Files likely touched:**

- `plugins/plugin-marketplace/src/client/plugin.tsx`
- `plugins/plugin-marketplace/src/client/i18n.ts`
- `plugins/plugin-marketplace/src/client/catalog-view.ts` only if needed for the runnable check
- `tests/plugin-marketplace-view.test.ts` (new, if helper is used)

**Estimated scope:** Medium.

### Phase 4: Combined Verification

#### Task 7: Verify the Release Candidate

**Bead:** `tockteam-7sn.7`

**Description:** Validate all six ports together through source tests, runtime staging, public surfaces, and Nix packages. This task changes code only for regressions discovered by the combined run; create a discovered-from child bead for any unrelated failure.

**Acceptance criteria:**

- [ ] Root and TockTutor tests/typechecks pass on the combined tree.
- [ ] Desktop Marketplace, Web browser handoff/skin/sidebar, and TUI resume/restart flows pass through their public interfaces.
- [ ] Web and TUI Nix packages build from pinned sources.
- [ ] Verification leaves no Electron, Web, TUI, or child runtime process running.

**Verification:**

- [ ] `pnpm run typecheck`
- [ ] `pnpm run typecheck:tocktutor`
- [ ] `pnpm test`
- [ ] `pnpm run test:tocktutor`
- [ ] `pnpm run build`
- [ ] `pnpm run stage:dsh`
- [ ] `pnpm run smoke:runtime`
- [ ] `pnpm run smoke:web`
- [ ] `nix build .#tockteam-web .#tockteam-tui`
- [ ] Run the Playwright and interactive TUI checks from Tasks 4–6 again on the combined tree.
- [ ] `git status --short --branch` shows only intended changes.

**Dependencies:** `tockteam-7sn.1` through `tockteam-7sn.6`.

**Estimated scope:** Medium.

## Dependency Graph

```text
Phase 1
├── Settings Boundary (tockteam-7sn.1)
├── Web Browser Handoff (tockteam-7sn.2)
└── Skin Hydration (tockteam-7sn.3)
           │
           ▼
Phase 2
├── Better Sidebar v0.15.2 (tockteam-7sn.4)
└── dsh-TUI v0.9.2 (tockteam-7sn.5)
           │
           ▼
Phase 3
└── Marketplace Built-in Visibility (tockteam-7sn.6)
           │
           ▼
Combined Verification (tockteam-7sn.7)
```

Tasks 1–3 are independent and may be developed in isolated worktrees. Tasks 4 and 5 are logically independent but should not share a writer because both can modify `pnpm-lock.yaml` and `nix/tockteam.nix`. Task 6 is independent of the submodule pins. Task 7 is blocked in Beads by all six implementation tasks.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Settings allowlist blocks a legitimate UI namespace | High | Inventory the namespaces used by shipped settings clients; cover allowlisted and model-provider paths before enabling the guard. |
| Compiled runtime anchors drift | High | Exact-match, idempotent transformation that fails staging; remove it when DSH exposes a supported boundary. |
| Submodule upgrades break downstream adapters silently | High | Keep adapters exact-match and test pristine-new-source failure before updating anchors. |
| dsh-TUI relocates sessions or credentials | High | Preserve all TockTeam environment/data-root contracts and smoke with a copied existing session before release. |
| Renderer self-update bypasses the pinned distribution | High | Disable or redirect mutation commands; allow only restart/reload of the packaged renderer. |
| Better Sidebar broadens Files/Git/PTY authority | High | Re-run session/workspace/path security tests and real terminal persistence checks. |
| Hidden built-ins distort counts or leave stale selection | Medium | Derive all view state from one visible catalog and test the visibility/category transition. |
| Nix closure hashes lag submodule or lock changes | Medium | Update hashes only from successful builds; never commit placeholder hashes. |
| DSH 0.1.2 is adopted accidentally during dependency work | High | Assert rc.2 across `dsh-source.json`, workspace overrides, TockTutor manifests/locks, and staged metadata in final verification. |

## Beads

- Epic: `tockteam-7sn`
- `tockteam-7sn.1` — Restrict browser settings namespaces in staged DSH runtime
- `tockteam-7sn.2` — Make TockTeam Web the sole browser-opening authority
- `tockteam-7sn.3` — Preserve selected skin during delayed theme hydration
- `tockteam-7sn.4` — Upgrade Better Sidebar to v0.15.2
- `tockteam-7sn.5` — Upgrade dsh-TUI renderer to v0.9.2
- `tockteam-7sn.6` — Hide protected Marketplace plugins by default
- `tockteam-7sn.7` — Verify prioritized Oh-DSH ports across all surfaces

## Further Notes

- Oh-DSH main and TockTeam both remain on DSH rc.2. Do not use the unmerged Oh-DSH runtime-upgrade branch as a release pin.
- Reassess DSH 0.1.2 only after a released dsh-TUI removes its `Session.events` dependency. That future upgrade must update TockTutor pins, workspace overrides, runtime locks, Nix hashes, and session-resume compatibility together.
- Independent runtime updates remain intentionally skipped: the existing application updater already ships the pinned runtime, and a second mutable delivery channel has not demonstrated enough value to justify its transaction and supply-chain complexity.
