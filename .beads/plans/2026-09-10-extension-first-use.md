# Plan: Keyboard-First Extension Use

## Outcome and Scope

Users find Translate, Search Kaomoji, and Can I Use directly in launcher search. First use offers inline approval, installs in the background, collects required preferences, and opens the command. Later uses open directly. No separate install/enable screens or mandatory “Trusted Extensions” detour.

This is a moderate, cross-cutting change, not a new extension runtime. The user approved this interaction and requested a plan first if implementation is complex. This document records the implementation approach. Source implementation and browser acceptance are complete; the bounded macOS installed Can I Use first-use evidence passed at `156478b5` and is recorded in `.beads/reports/2026-09-11-extension-first-use-installed-verification.json`. Broader installed/platform evidence remains explicitly pending.

## User Flow

```text
Search → Enter → First-Use Approval → Preparing… → Required Preferences → Command
Search → Enter → Command (already installed, approved, and enabled)
Escape → Previous Search and Selection
```

- The one-time **Approve and Open** action clearly authorizes installation, enablement, and execution of the named reviewed extension. Explain its trusted local-code authority plainly; detailed verification information can be secondary, not omitted.
- Approval is bound to the exact reviewed candidate. Background work does not mean implicit consent, installation while typing, or execution before approval.
- Show compact progress without a modal detour. Keep Escape responsive. Retry errors in place without losing the search or requiring a mouse.
- Installed-but-disabled extensions offer an explicit **Enable and Open** choice. Do not interpret a search or ordinary Enter as permission to override a previous disable decision.
- Secondary management becomes **Extensions**, with keyboard-selectable rows and actions. Keep internal IDs/data roots unchanged. Selected rows must not look disabled.
- Use existing launcher spacing, icons, selection, typography, footer shortcuts, and theme tokens. Match the command-first interaction in the supplied Raycast screenshot, not merely its dark background.

## Existing Seams and Ownership

| Seam | Current Behavior | Planned Change |
| --- | --- | --- |
| `src/trusted-raycast-catalog.ts` | Hides commands until installed, approved, and enabled | Expose supported commands with a safe setup action when not runnable; use ordinary extension names |
| `src/launcher.ts` | Invokes opaque action IDs; opens a separate trust view | Route first use inline; preserve input/selection and fence asynchronous UI ownership |
| `src/main.ts` | Execution handlers require enabled, approved runtime bytes; trust actions rescan the catalog | Keep execution guards; own the serialized first-use mutation sequence |
| `src/trusted-raycast-trust.ts` | Pinned staging, isolated preview, apply, separate enable state, recovery | Reuse unchanged installation machinery rather than inventing an installer |
| Trust contract, guarded IPC, and preload bridge | Expose individually authorized trust operations | Add only the bounded approval/first-use operation and owner lifecycle plumbing needed for safe orchestration |
| Trust view and extension renderer | Management UI and existing preferences/command UI | Replace the everyday detour with one shared first-use view; reuse preferences and command rendering |

Host state remains authoritative. The renderer owns presentation, explicit consent, and focus—not installation paths, trust decisions, or runtime admission. A first-use operation composes existing stage/preview/apply/enable operations under the Host mutex, validates the approved candidate, and checks owner/cancellation state before proceeding. Do not implement an unfenced renderer-side chain that can overwrite an intervening disable/remove action.

After mutation, resolve a fresh authorized command action from the refreshed catalog. Do not reuse the consumed or invalidated action ID. Runtime start still passes the existing admission checks.

## Lifecycle Rules

- Repeated Enter or repeated invocation produces one first-use operation. The Enter that opens approval must not also approve it, including held-key repeats.
- Escape, owner destruction, capability loss, or a superseding command prevents further steps and late UI reopening. Close a child if a pending launch has already started.
- Cancellation does not interrupt atomic file rotation. Let an already-started commit finish safely; retain verified staged/installed state, but do not continue enablement or launch after cancellation.
- Missing/unsupported candidates stay unavailable. Preserve the Windows Can I Use exclusion. Invalid installations require explicit recovery; do not silently overwrite or reset them.
- Preferences, sessions, credentials, and other extensions' state remain untouched. Recoverable failures remain visible and retryable.

## Vertical Slices

### 1. Discover and Review Can I Use — `tockteam-u67.1`

A fresh profile can find Can I Use and enter its inline approval view using only the keyboard. Use existing guarded setup dispatch rather than relaxing the execution handler. Escape restores the original search and selection, with no install or enable side effect.

Verification: add failing catalog/first-use view checks, then make them pass. Browser-check search → Enter → approval → Escape. Existing runnable commands still open directly.

### 2. Approve, Install, and Open — `tockteam-u67.2`

Complete the Can I Use cold path through Host-owned installation, progress, required preferences, search, and details; verify warm use skips setup. Bind consent to the exact candidate, prevent duplicate work, and fence cancellation and catalog refresh.

Verification: exercise cold/warm paths, duplicate Enter, Escape during preparation, owner closure, candidate mismatch, failed preview, failed apply, and retry through the actual orchestration seam. A canceled operation must never unexpectedly open a command or re-enable a disabled extension.

### 3. Apply the Shared Experience — `tockteam-u67.3`

Use the same flow for Translate and Kaomoji, not copied per-extension coordinators. Make secondary Extensions management keyboard-accessible and consistent in both themes. Preserve explicit disabled/recovery choices. Update browser and installed smoke entry paths so they test first use rather than pre-install through the old manager.

Verification: keyboard-only first use and subsequent use for supported extensions; inspect light/dark screenshots, visible focus, errors, and progress. Preserve Translate/Kaomoji data and Can I Use runtime behavior. Complete focused regression and inactive Electron proof.

Dependencies: `tockteam-u67.1` → `tockteam-u67.2` → `tockteam-u67.3`. Keep overlapping writers sequential.

## Verification Commands and Evidence

Use Node 24 and repository-local tools. Start with the failing check for each slice:

```sh
node --test tests/trusted-raycast-first-use.test.ts
node --test --test-concurrency=4 tests/trusted-raycast-*.test.ts tests/trusted-raycast-*.test.mjs tests/launcher-preload-bridge.test.ts tests/launcher-installed.test.ts tests/launcher-packaged.test.ts tests/launcher-cdp-keyboard.test.mjs
./node_modules/.bin/tsc --noEmit
node scripts/build.mjs
git diff --check
```

The first-use test file is new work in slice 1, not an existing or already passing check. Extend the existing browser test harness and use `playwright-cli` for keyboard flows and visual checks. Adapt `scripts/trusted-raycast-can-i-use-electron-proof.mts` to start from an uninstalled command, using its inactive-window protocol rather than taking foreground focus. Keep its existing runtime checks.

Update `scripts/trusted-raycast-can-i-use-installed-proof.mjs` and other affected smoke callers for the new entry flow. Run an installed smoke only after focused checks pass, serialized and once per final application commit, with its temporary root in a `.noindex` cache. If the available installed harness requires foreground control, obtain fresh permission or report that check as pending; do not bypass focus safeguards.

Record root PIDs, stop every owned process tree in `finally`, verify cleanup, and retain evidence under `.beads/reports`. Make small verified commits; do not push.

## Non-Goals

No unrestricted extension store, new extensions, Raycast-wide clone, runtime/agent-loop rewrite, packaging redesign, permissions bypass, automatic updates, or user-data migration. Do not broaden Can I Use query support, alter native-effect restrictions, or change the Windows exclusion.

## Tracking

Epic: **`tockteam-u67`**. Its three child issues above contain the acceptance checks and implementation status. Planning and source implementation are complete with source acceptance at `c0cf353f`; the bounded macOS installed Can I Use first-use proof passed at `156478b5`. Remaining gaps are broader installed/platform evidence, screenshots from an installed run, and parent Beads closure; no release or push is implied.
