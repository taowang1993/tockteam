# Markdown-Native Slash Commands

Implemented the approved plan in `.beads/plans/2026-09-26-tocktutor-markdown-slash-commands.md` (epic `tockteam-e5sd`). Source checkpoints: `c9bbc259`, `9b0916ed`, `31a39944`.

## Behavior

- **Link** inserts an HTTP(S) Markdown link with optional display text.
- **Link to Note** searches exact vault-relative Markdown paths and inserts an encoded, source-relative link. Reading and Live Preview open the selected file, including spaces, `#` and `%`.
- **New Note** confirms the name/folder, creates one ordinary Markdown file, links it, and stays in the source note. Undo removes only the link. Successful writes survive cancelled/stale insertion and are reported; retry does not repeat a known successful write or an ambiguous write.
- **File Attachment** links an existing supported attachment or uploads through existing bounded storage. The existing suffix allowlist and 25 MiB limit are unchanged. The result is a link, not an image/audio/video embed.
- **Media** contains Image, Code Block and File Attachment. All 16 previous commands remain: 20 commands total.

No custom syntax/schema, callouts, toggles, nested-page model, rich bookmarks, new dependency, Host authority or supported file type was introduced.

## Verification

Red checks preceded implementation: missing Link command/insertion tests, stale note-creation behavior, and attachment behavior. Rendered checks also caught a dialog behind the route and insufficient contrast with the shared default popover fill. The form now uses the route's established overlay/content layers and the body-visible shell-chrome token, without changing shared Dialog defaults.

Commands run from the repository root (the pinned local pnpm executable was invoked directly to avoid the global launcher's automatic installation):

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test
# PASS: 371 node:test checks + 665 component checks across 28 Vitest files

node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/{route,markdown-links,rich-markdown,session,attachments,host-read-transport}.test.ts
# PASS: 217 checks

pnpm run typecheck:tocktutor
pnpm run typecheck
pnpm run build:tocktutor
pnpm run build
node scripts/stage-dsh.mjs --quick
node scripts/tocktutor-build-manifest.mjs --check
# PASS
```

The final generated build includes the concurrently verified pane-tab/divider/seam changes through `d9df1b43`. Their separate reports remain in `2026-09-26-tocktutor-tab-hover`, `2026-09-26-tocktutor-dividers`, and `2026-09-26-tocktutor-tab-seam`.

### Full-Suite Environment Blocks

- `pnpm run test:tocktutor`: the existing runtime host-death check cannot spawn `/bin/ps` (`EPERM`); 209/210 runtime tests pass before recursive execution stops. No assertion was weakened.
- `pnpm test`: **1,445 passed, 17 skipped, 5 failed**. Two marketplace sandbox tests fail because `sandbox-exec` reports `sandbox_apply: Operation not permitted`; three trusted-RayCast cleanup tests cannot spawn process inventory (`EPERM`). Feature-related root checks, including titlebar/Tailwind and frozen nested-workspace installation, pass.
- Follow-up: `tockteam-w328`, rerun those unchanged gates in an approved environment supporting their required primitives.
- React Doctor: `react-doctor plugins/tocktutor/packages/tockteam-tocktutor-workbench --scope changed --base 43799113 --no-score --no-supply-chain --max-duration 30 --no-parallel --yes`. Partial result: existing imperative-editor ref mutation is flagged in both source and generated output, alongside existing accessibility/complexity warnings; maintainability analysis exhausted its budget. This is not a clean audit or a complete score. The ref assignment and attachment non-null assertion also exist at the base commit; no rule was disabled.

## Desktop Evidence

App-scoped Playwright attached only to owned `extended_display` Electron endpoints. Fresh isolated app data and explicit `skins.json` seeds prevented inheritance from user preferences. Renderer-only CDP focus emulation allowed background animation frames without activating the OS window.

- `scripts/tocktutor-markdown-slash-checks.js`: **22 checks** covering all four forms, unsafe URL refusal, exact cross-folder selection, native undo/redo, created-file retention after undo, upload and existing attachment selection, five saved/reopened links, and Reading/Live Preview navigation.
- `scripts/tocktutor-markdown-slash-theme-checks.js`: built-in dark/light plus Deep Current, Jade Circuit, Porcelain and Ember Dusk; **55 checks** covering the 20-command catalog, keyboard scrolling in both directions, shell fill, long names, modal focus, Escape restoration, bounds and contrast. Opposite system appearance and reduced motion were explicit. Minimum measured text contrast: **5.32:1**.
- Final successful sessions: zero runtime errors. Bootstrap development warnings were not treated as errors. Failed exploratory fixture/locator runs were excluded from accepted proof and their owned trees were stopped too.
- `proof.json` records geometry, route, appearance, checks, exact file hashes, and final root PIDs with empty remaining-descendant lists from `extended_display.stop`.
- `saved-source.md` is the exact 299-byte saved source; the created Markdown file is empty and the uploaded PDF retains the exact nine fixture bytes. Bytes were asserted again after all theme cancellations.

### Canonical Screenshot

`canonical-dark.png`: **1512 × 949 CSS pixels, 2× scale, 3024 × 1898 PNG pixels**. Built-in dark, `skinId: null`, no skin marker on document or body, Live Preview at `/tocktutor/Drafts/Source.md`. New Note is open with a long draft title; Folder is focused. The pending slash and Unsaved marker are intentionally visible. Cancelling restored the source without creating another file.

The PNG signature/dimensions, appearance, errors and allowlisted filename were validated before transactional directory publication. The screenshot was visually inspected. No user profile, Keychain or foreground application was controlled.

The root lockfile now matches the previously approved Milkdown 7.22.2 dependency upgrade. The unrelated automatic nested React-link specifier rewrite was removed; frozen installation and the final manifest check pass.
