# TockTutor Slash Menu Verification

## Delivered

Implemented approved epic `tockteam-ptmd` in commits `05e4aacc`, `554774d6`, and `da886ef6`.

- `/query` opens inside an existing paragraph or heading, including before a suffix. Conversion removes only the invocation, preserving existing text, compatible marks, inline content, neighboring blocks, and frontmatter.
- The 16-command catalog covers Text, Heading 1–6, Quote, Divider, three lists, Code Block, Image, Table, and Math. Atomic blocks replace empty invocation paragraphs or follow nonempty blocks; unsupported contexts refuse the action without deleting text.
- Commands use one history transaction, isolated from typing. Undo restores the query and original block; redo reapplies the action.
- TockTeam's shared Command/Button components, Lucide icons, semantic colors, accessible editor/list associations, keyboard selection, pointer selection, dismissal, and No Results replace Crepe's coupled menu UI.
- Milkdown still owns slash positioning, schema, editing, history, and block dragging. The add handle opens the same command list. The drag handle supports keyboard block selection for native cut/paste, and both controls reject stale document targets.
- IME composition, paste, read-only state, non-collapsed selection, code/link/URL contexts, authoritative replacement, and teardown have explicit guards. Modified Enter dismisses instead of swallowing the user's normal line-break behavior.
- Empty images now retain their upload form rather than becoming placeholder previews. Upload completion is document-revision-bound; a stale completion is cancelled without modifying a different revision, and retry remains possible.

No private Crepe patches, new editor framework, Host/IPC changes, shared palette changes, or user-profile mutations. Direct provider dependencies remain Milkdown 7.22.2; the direct Floating UI declaration reuses Milkdown's already-installed 1.8.0 positioning library. React/ReactDOM remain external singletons. Tracked browser outputs and the build manifest were regenerated.

## Tests and Builds

Commands below were run through the repository-local pnpm executable where applicable (`node node_modules/pnpm/bin/pnpm.cjs`).

| Check | Result |
| --- | --- |
| `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test` | 359 node tests and 653 component tests passed. |
| `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/live-preview-slash-menu.test.tsx tests/editor-adapters.test.tsx tests/milkdown-crepe.test.tsx --environment jsdom` | Final focused gate: 123 passed, including 32 new slash-menu cases. |
| `node --test tests/icons.test.ts tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts` | 24 passed. |
| `pnpm run typecheck:tocktutor` and `pnpm run typecheck` | Passed. |
| `pnpm run build:tocktutor` and `pnpm run build` | Passed. The final handle adjustment also passed the focused workbench build and runtime staging. |
| `node scripts/tocktutor-build-manifest.mjs --check` | Passed. |
| `node --test --test-concurrency=4 tests/*.test.ts` | 1,445 passed, 17 skipped, five environment failures detailed below. |
| React Doctor, changed scope from `94360a13` | No lint issues reported; maintainability analysis was incomplete. No score claim. |

Red checks preceded implementation: existing-text heading conversion failed before the menu existed; 13 catalog cases failed before extending the initial vertical slice; lifecycle/paste and upload cases exposed missing guards; Shift+Enter exposed an invocation that survived its line break; the real-app keyboard-handle probe failed before keyboard block selection was added.

The former Crepe class-name test was updated to type through the real editor input handler and assert the accessible Table and Task List commands. Programmatic source replacement intentionally does not trigger the menu.

## Real Desktop Evidence

Runnable check: `scripts/tocktutor-slash-menu-checks.js`, attached with Playwright CLI to an owned `extended_display` endpoint. Each app used a fresh isolated profile, mock keychain, seeded vault, and explicit appearance; no standalone browser or user-app attachment was used.

Every successful capture verified:

- `/tocktutor/Slash%20Editing.md`, Live Preview, 1512 × 949 CSS pixels, DPR 2, and decoded PNG size 3024 × 1898.
- Editor focus and accessible list/active-option associations; all 16 commands present.
- Chinese heading prefix, bold suffix, inline query conversion, one-step undo/redo, pointer conversion, and native add/drag behavior.
- A single menu in each split pane, constrained to its owning pane.
- Save completion through disappearance of the active tab's Unsaved marker, reopening the document, and exact independently read vault bytes:

```markdown
## 健康 **Lesson**

Before after

Destination Block

Drag This Block
```

- Zero runtime errors during the checked flow. Attach logs for successful runs also showed zero startup errors; development CSP/Vue warnings remain separate from errors.

### Appearances

All captures forced the system appearance opposite to the app appearance and exercised reduced motion. Canonical dark used `activeId: null`, explicit dark color scheme, and no skin attribute on either document or body. Named skins used the exact IDs from `plugins/skins/src/skin-ids.ts`, not display labels.

| Capture | Ordinary/Group Text Contrast | Selected Text Contrast | Evidence |
| --- | ---: | ---: | --- |
| Built-In Dark | 5.55:1 | 13.34:1 | `dark.png`, `dark.json` |
| Built-In Light | 15.97:1 | 18.90:1 | `light.png`, `light.json` |
| Deep Current | 10.45:1 | 13.67:1 | `deep-current.png`, `deep-current.json` |
| Jade Circuit | 9.48:1 | 13.57:1 | `jade-circuit.png`, `jade-circuit.json` |
| Porcelain | 11.09:1 | 12.39:1 | `porcelain.png`, `porcelain.json` |
| Ember Dusk | 10.50:1 | 13.44:1 | `ember-dusk.png`, `ember-dusk.json` |

Icons inherit the measured foreground. Small group headings use the semantic popover foreground because the default muted heading color missed 4.5:1 in built-in dark. Dark/light screenshots were also visually inspected.

The five non-dark records cover the core implementation at `05e4aacc`; the final dark record covers `da886ef6`, including the later keyboard-handle assertion. Those later fixes change keyboard/lifecycle behavior, not theme styling. Successful records contain 21 checks per appearance, with 22 in the final dark run.

Only allowlisted PNGs were published, after runtime, geometry, pixel-dimension, appearance, and persisted-byte checks. Temporary failures were not published as passing evidence.

### Defects Caught by the Browser Check

- A body-level popup was beneath TockTutor's route layer. It now portals into the owning route instead of escalating a global z-index.
- `display: none` broke BlockProvider's offset-parent measurement. Hidden provider surfaces now retain layout with `visibility: hidden` and disabled pointer events.
- Keyboard activation of the drag button originally did nothing. Enter now selects the whole block; stale hover targets cannot mutate another document revision.

## Cleanup

Every launched Electron tree was explicitly stopped through `extended_display.stop`, which reported `remaining: []`. This includes unsuccessful probes. Root PIDs were:

`7047, 7886, 11512, 12374, 13641, 16922, 24863, 25329, 25807, 26390, 26876, 27330, 27776, 37040, 37647, 38494`.

Playwright detached from successful sessions. No app/server was left running for the user. Temporary fixtures and failed-probe logs remain under `/tmp/tocktutor-slash-proof`; they are not user notes.

## Verification Limits

- The full root suite's five failures are the previously observed environment restrictions: two `sandbox-exec: sandbox_apply: Operation not permitted` failures and three `spawn EPERM` process-inventory/cleanup-proof failures. Their assertions were not disabled or weakened. Root log: `/tmp/tocktutor-slash-root-tests.log`.
- The full nested suite was not rerun into the already established Host-death `/bin/ps` restriction. The entire affected workbench passed; do not interpret that as a green full nested suite. The earlier blocker and fixture-cleanup evidence remain in the approved plan's upgrade record.
- The first React Doctor run timed out. A bounded local retry (`--scope changed --base 94360a13 --no-score --no-supply-chain --no-parallel --max-duration 30 --verbose`) scanned 11 files without lint findings, but its maintainability stage failed. Process inventory was also denied in this session, so no independent analyzer-descendant audit or score comparison is claimed.
- Appearance coverage uses explicitly seeded profiles, not the Settings picker. A separate picker-navigation attempt encountered an inert shell and was not worked around or changed as part of this editor feature.
- Accessibility semantics, focus, keyboard behavior, Chinese text preservation, and composition-event guards were automated. Actual screen-reader speech and an OS IME candidate session were not exercised; no permission to control the user's OS input was assumed.
- No installed smoke was run for this browser-editor-only change. No push or installed-app update was performed. The pre-existing modification to `.beads/reports/2026-09-26-tockcoder-review.md` was left untouched.
