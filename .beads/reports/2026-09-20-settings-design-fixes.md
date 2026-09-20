# Settings Design Fixes

Implemented all nine findings from `2026-09-20-settings-design-audit.md` in commit `779f3776` (Beads task `tockteam-ymh7`).

| Finding | Correction |
| --- | --- |
| Primary Control Contrast | Shared primary/brand foregrounds use the inverted label token; Electron checks text ≥4.5:1 and checked marks ≥3:1 under both built-in themes and all four skins. |
| Assistant Portal Theme | Panel and body portal share DSH-derived aliases, text, box sizing, and focus treatment. Removed hardcoded theme fallbacks and white action/icon foregrounds. |
| Marketplace Search Focus | Restored a visible, tokenized keyboard outline with an explicit solid style. |
| Marketplace Theme Drift | Replaced system-dark and hardcoded status palettes with application semantic tokens; retained every transaction/approval state. Side Panel errors also use the semantic destructive token. |
| Native Control Geometry | Shared inputs, textareas, selects, buttons, checkboxes, and field descriptions own the required native resets. Text inputs render 32px; range inputs retain native geometry. |
| Duplicate Headings | Removed six repeated launcher section headers/descriptions; the enclosing card remains the owner. |
| Narrow Layout | Launcher labels retain a readable measure and control groups wrap. Side Panel reserves room for enlarged switch hit areas. The revision-bound preset grid can shrink below 268px and wrap card headers. |
| Label and Help Relationships | Single recognized launcher controls receive stable IDs, clickable labels, and merged help IDs. Compound rows remain named/described groups, not labels that activate arbitrary children. |
| Heading Hierarchy | First-party page headings use 18px semibold h2, sections use 16px semibold headings, and nested launcher headings follow their enclosing card. Pinned upstream hierarchies remain explicit compatibility exceptions. |

Updated `.pi/rules/web.md` with the corresponding settings recipe, no-Preflight requirements, contrast and portal rules, application-versus-system appearance checks, and **Electron-only rendered verification**. No `AGENTS.md`, dependencies, lockfiles, or Host/security authority changed. Rebuilt required tracked UI/TockTutor artifacts using the normal build commands.

## Verification

- `node scripts/settings-design-electron-proof.mjs` — passed. Durable runner/checks and component fixtures are in the repository. RED runs reproduced the original contrast, native geometry, duplicate headings, label/help, focus, theme, and overflow failures before correction.
- Final component proof: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-electron-proof-62v9dr`. Actual React components with pinned DSH CSS in a hidden, sandboxed Electron window; in-memory fixtures, not real Host transactions. Zero captured renderer/console errors during checks. Built-in dark/light and four skins; opposite system appearance; narrow layouts; keyboard focus and Escape restoration.
- Real Desktop visual check: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-desktop-final-kTVAp7`. Navigated General, Side Panel, TockLauncher, and Agent Presets through the real settings navigation after dismissing onboarding. Visually reviewed Side Panel and TockLauncher screenshots. No foreground focus theft: final focus checkpoint reported zero focused Electron windows.
- Both screenshot sets: **1512 × 949 CSS px, 2×, 3024 × 1898 PNG px**. Canonical dark mode, no active skin. Screenshots remain in temporary evidence directories; no product baselines were replaced.
- Both Electron runs used `--use-mock-keychain`, temporary user-data roots, preserved `HOME`, and verified full process-tree cleanup in `finally`. No standalone browser or Web test server was launched for this implementation. The real Desktop runtime's loopback page was rendered only inside Electron.
- `pnpm run typecheck`, `pnpm --filter @tockteam/ui run typecheck`, `pnpm run typecheck:tocktutor` — passed.
- `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/tocktutor-build-manifest.mjs --check` — passed.
- Focused root checks — 54/54 passed: `node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/sidebar.test.ts tests/skins.test.ts tests/launcher-renderer-build.test.ts tests/launcher-network-ui.test.ts`.
- `pnpm run test:tocktutor` — passed after restoring already-declared local tooling and updating the obsolete white-icon assertion. Includes 425 workbench component tests and 12 assistant component tests. Assistant node tests also passed 167/167 from their package directory.
- `pnpm test` — **1,373 passed, 18 skipped, 1 existing failure**: `TockTutor workspace setup uses local pnpm and ignores an ambient DSH checkout`; its isolated dependency-install subprocess exits 254. This is the same failing test observed before this task, not a settings assertion.
- React Doctor: no new source diagnostic categories/instances in the inspected four-file comparison. A temporary read-only HEAD-source baseline and the updated sources both reported the same 11 legacy findings (complexity/size, existing ref writes, existing effect dependencies, etc.). Generated bundles also trigger analyzer hook warnings; no source hooks were changed to silence them. The new field recipe had no findings.
- `git diff --check` — passed.

## Separate Existing Issue

The real Desktop startup logged `TypeError: workspaces.startSession is not a function` in the existing workspace-open flow, plus Electron's development CSP warning. Settings still rendered and navigated after onboarding; this is **not** a zero-error full-app smoke. Tracked separately as **tockteam-0ecj**. No workspace/session behavior was changed in this settings task.

The earlier audit did open `http://127.0.0.1:62075/` in a headless browser. That listener was absent at both the start and end of this implementation. The revised verification policy prevents repeating that workflow without explicit approval.
