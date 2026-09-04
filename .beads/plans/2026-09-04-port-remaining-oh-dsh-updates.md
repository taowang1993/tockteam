# Plan: Port Remaining Approved Oh-DSH Updates

## Problem

TockTeam already carries the six prioritized Oh-DSH ports, but six additional upstream capabilities remain absent: Windows-safe Marketplace cleanup, direct update retry after a dead proxy, Linux preview confinement, image-lightbox titlebar clearance, Windows close-to-tray, and on-demand GitHub repository metadata. Copying the upstream implementation wholesale would weaken or bypass TockTeam-owned profile, preview, launcher, UI, and pinned-runtime boundaries.

## Solution

Port each behavior through its current TockTeam owner. Keep `@deepseek-ai/dsh@0.1.1-rc.2` canonical, keep Marketplace Desktop-only, preserve prepare → pinned candidate → isolated preview → explicit apply, and reuse the existing launcher tray, updater state machine, shared UI, Tailwind utility, and staged DSH runtime.

## Implementation Decisions

- Treat Oh-DSH commits as behavioral references, not merge candidates:
  - `4f4c6ca` — junction-safe Marketplace cleanup.
  - `1af6122` + `3ea87e9` — one direct updater retry and pooled-connection reset.
  - `e3174b5` + `ddad6ea` — Linux Landlock preview launcher.
  - `619c28a` — body-level image-lightbox titlebar clearance.
  - `f4a84f7` — Windows close-to-tray.
  - `fdde364` + `721d598` + merge `c86977e` — repository metadata.
- The Marketplace transaction manager owns disposable-tree deletion. On Windows it must unlink links and junctions rather than descend into them; cleanup remains bounded and warning-based.
- The Desktop updater owns retry state. Only proxy-connect failures retry, at most once per updater lifetime, after the Electron `electron-updater` session switches to direct mode and closes pooled connections.
- Reuse the Landlock package family already pinned by the DSH rc.2 runtime graph. Resolve and functionally probe the matching Linux `x64` or `arm64` launcher from the staged runtime. Do not add an unsandboxed preview confirmation: unavailable or unenforcing confinement remains fail-closed.
- Extend the existing Marketplace preview launcher seam so Desktop runtime startup, DSH commands, and package lifecycle scripts share one confinement decision. Preserve macOS Seatbelt unchanged.
- Put the lightbox correction in `plugins/skins/src/client/tailwind.css`, the existing compatibility-selector owner. Target only a direct body child modal dialog with direct image and button children; do not add a feature stylesheet or hashed upstream selector.
- Reuse `SingleOwnedTray`. Windows main-window close hides only while the tray is active; preview windows, non-Windows platforms, explicit secure quit, and updater installation keep current behavior. A one-time native tray balloon explains how to restore or quit.
- Repository statistics are presentation metadata, never trust evidence. Validate the public GitHub response, load only when an entry is selected, retain it in the current catalog snapshot, and make failure non-fatal. Keep Web and TUI Marketplace behavior unchanged.
- Use existing `@tockteam/ui` primitives, semantic DSH tokens, Lucide icons, and bilingual copy. No dependency is added for formatting or caching.

## Testing Decisions

- Highest useful seams:
  - Pure filesystem regression around exported safe cleanup.
  - Public `createDesktopAppUpdater()` actions and emitted state.
  - Pure preview-launcher resolution/argv tests with injected filesystem/probe hooks.
  - Existing lifecycle owner tests plus source integration checks for Electron close wiring.
  - Protocol/catalog/platform tests for repository metadata and browser-visible Desktop verification.
  - Tailwind build assertion plus real DSH lightbox geometry in Desktop.
- Follow RED → GREEN per slice and commit each verified slice before proceeding.
- Focused commands:
  - `node --test tests/plugin-marketplace.test.ts`
  - `node --test tests/app-update.test.ts`
  - `node --test tests/launcher-lifecycle.test.ts tests/launcher-integration.test.ts`
  - `node --test tests/tailwind.test.ts tests/plugin-marketplace-view.test.ts`
- Final gates:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm run build`
  - `node scripts/stage-dsh.mjs --quick`
  - relevant runtime/packaging smoke checks and Linux `x86_64`/`aarch64` Nix evaluation or builds
  - React Doctor on the touched Marketplace client
  - Playwright CLI against the real Desktop surface for metadata, lightbox geometry, keyboard focus, English/Chinese copy, and light/dark themes
- Stop every Electron, DSH, browser, and child process started for verification.

## Out of Scope

- A DSH runtime upgrade or independent runtime updater.
- Web or TUI Marketplace ownership.
- Unsandboxed Marketplace previews on any platform.
- Treating stars, forks, language, license, or activity as source trust.
- Upstream source edits, feature-specific CSS files, or a new cache/dependency framework.

## Task List

### Phase 1: Security and Runtime Boundaries

- [ ] `tockteam-200.1`: Make Marketplace cleanup junction-safe.
- [ ] `tockteam-200.3`: Confine Linux Marketplace previews with the staged Landlock launcher.

### Checkpoint: Marketplace Safety

- [ ] Junction targets survive cleanup and unsupported confinement fails closed.
- [ ] Focused Marketplace tests pass.

### Phase 2: Desktop Lifecycle

- [ ] `tockteam-200.2`: Retry Desktop updates without a dead proxy.
- [ ] `tockteam-200.5`: Close Windows Desktop to the active existing tray.

### Checkpoint: Native Lifecycle

- [ ] Proxy retries, explicit quit, updater install, and tray restoration retain one owner each.
- [ ] Focused updater and launcher tests pass.

### Phase 3: Desktop Presentation

- [ ] `tockteam-200.4`: Keep image lightboxes below the titlebar.
- [ ] `tockteam-200.6`: Show on-demand Marketplace repository metadata.

### Checkpoint: Browser Surface

- [ ] Shared UI and compatibility CSS preserve accessibility and themes.
- [ ] Focused UI tests and real Desktop Playwright checks pass.

### Phase 4: Verification

- [ ] `tockteam-200.7`: Run repository, staging, package, React, and real-app gates.
- [ ] Close the epic only after all six slices are verified and the working tree is reviewed.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Windows cleanup follows a reparse point outside the preview | Critical data/runtime deletion | Use `lstat`/`readlink`, unlink the entry, and test external and dangling targets |
| Proxy retry loops or flashes stale error state | Update remains unusable or misleading | One remembered bypass, suppress only retryable transient events, then expose the final outcome |
| A present Landlock binary does not enforce on the host kernel | False isolation claim | Require a bounded functional `--probe` before use and fail closed |
| Linux confinement packaging differs by architecture | Preview unavailable on one Linux target | Resolve the runtime-pinned platform package for both `x64` and `arm64`; verify both package graphs |
| Close-to-tray traps a hidden app | User cannot restore or quit | Gate on the active tray, keep click/menu restore and secure Quit, show a one-time native notice |
| GitHub metadata exhausts rate limits or becomes stale | Slow or noisy Marketplace details | Fetch only on selection, once per refreshed catalog; keep failures non-fatal |
| Lightbox selector affects ordinary dialogs | Dialog layout regression | Require direct `body > [role=dialog][aria-modal=true]` structure and direct child image/button selectors |

## Beads

- Epic: `tockteam-200`
- Child issues:
  - `tockteam-200.1` — Marketplace cleanup
  - `tockteam-200.2` — updater proxy fallback
  - `tockteam-200.3` — Linux Landlock preview
  - `tockteam-200.4` — lightbox/titlebar
  - `tockteam-200.5` — Windows close-to-tray
  - `tockteam-200.6` — repository metadata
  - `tockteam-200.7` — final verification
