# Settings Shadcn Migration

## Scope and Preservation

Inspected all six Desktop settings pages, including all three Plugins tabs, using the real isolated Electron application. Preserved the existing Switch, page-title origins, DSH theme ownership, settings persistence, credential boundaries, and Marketplace approval flow. The user's modified `.agents/uiux/settings/settings.html` was not touched.

## Inventory and Changes

| Page | Components | Result |
| --- | --- | --- |
| General | Five TockTeam Skin choices | Replaced independent buttons and manual pressed-state handling with shared `ToggleGroup` / `ToggleGroupItem`. Arrow-key navigation, checked state, disabled state, and non-empty selection are preserved. |
| General | Permission, Language, Appearance, Font Size, Conversation Display, Enter behavior while busy | Pinned DSH feature renderers retained. Potential equivalents are Select, ToggleGroup, Input/Button, and Field. These are not first-party component imports that can be swapped without replacing the upstream renderer. |
| Models | Provider cards, editor fields, credential controls, save/delete actions and dialogs | Pinned DSH renderer retained. Card, Input, Select, Button, Alert, and AlertDialog are potential equivalents, but its schema, credential, concurrent-draft and destructive-operation contracts must remain with DSH. |
| Plugins — Marketplace | Buttons, cards, filters, category select, checkboxes, tooltips, loading, alerts and empty states | Already shared shadcn components. Preserved; no migration churn merely to change their names. |
| Plugins — Plugin Config / Plugin List | Tabs, schema-driven inputs, secret fields, configuration cards and inventory actions | Pinned DSH renderers retained. Tabs, Input, Checkbox, Switch, Card, and Button are potential equivalents. Marketplace's separate prepare/preview/approve/apply ownership remains unchanged. |
| Agent Presets | Preset cards, badges, copy-dialog fields and actions | Pinned DSH renderer retained. Card, Badge, Dialog, Input, and Button are potential equivalents; replacing the entire stateful preset renderer is not a primitive migration. |
| Side Panel | Default Width | Migrated native range input to shared `Slider`; retained live width updates and bounds. Existing switches, labels, reset button and error alert were already shared. |
| TockLauncher | Search Fuzziness | Migrated native range input to shared `Slider`; draft updates while dragging, persistence on pointer release and keyboard changes. Accessible help is attached to the focusable thumb. |
| TockLauncher | Recent Search Entries, seven local-extension groups, four discovery groups | Migrated twelve native disclosures to shared `Accordion`. Groups open independently; collapsed inputs are hidden but remain mounted so invalid, unsaved drafts survive reopening. |
| TockLauncher | Remaining inputs, native selects, checkboxes, switches, buttons, cards, fields, badges and reset confirmation | Already shared shadcn components. Preserved. `NativeSelect` is itself a shadcn component, not an outstanding migration. |
| TockTutor Assistant Settings | Popover, inputs, actions and tooltip composition | Already shared primitives; existing Electron portal/focus/theme regression checks remain passing. |

Pinned DSH does support slot priority shadowing, but that replaces feature renderers; it is not a generic primitive-override API. No runtime monkey-patching, copied feature state machines, vendor edits, or cosmetic CSS pretending to be shadcn was introduced. Remaining upstream candidates are explicitly **not converted** in this change.

## Shared Components

Added `@tockteam/ui/slider` and `@tockteam/ui/accordion`, based on the official shadcn radix-nova registry source inspected through the CLI. Adaptations retain React 18 ref forwarding, DSH semantic tokens, native resets without Preflight, circular slider geometry, reduced-motion behavior, and accessible thumb labels/help. Only the two required Radix packages were added; both workspace lockfiles were updated. Tracked shared/TockTutor outputs were regenerated through their build commands, not edited manually.

## Verification

RED checks demonstrated that keyboard slider changes did not commit before blur, the original skin chooser lacked group keyboard semantics, and DSH inheritance broke slider shape/layout. The final checks pass:

- `pnpm --filter @tockteam/ui run typecheck`
- `pnpm run typecheck`
- `pnpm run typecheck:tocktutor`
- `pnpm run test:tocktutor`
- `pnpm run build:tocktutor`
- `pnpm run build`
- `node scripts/stage-dsh.mjs --quick`
- `node scripts/settings-design-electron-proof.mjs`
- `node scripts/settings-layout-electron-proof.mjs`
- `pnpm test` — 1,374 passed, 18 skipped, zero failures.

Electron checks cover slider keyboard bounds and pointer commits, names/help, focus, disabled tab order, contrast across all six palettes, round 12px thumbs, narrow layout, reduced motion, accordion arrow navigation and invalid-draft retention, and real skin selection/restoration. All eight real-page captures retain title origin (344, 94), built-in dark appearance with no active skin, and 1512 × 949 CSS / 3024 × 1898 PNG geometry. No renderer/console errors were recorded; all owned verification process trees were stopped.

React Doctor source comparison: nine existing diagnostics plus one accepted upstream Slider index-key warning. Thumb identity is its fixed position; using the changing numeric value as its key would remount the thumb during dragging. This is documented beside the map, not globally suppressed.

Source commit: `6e235501`.

Real Desktop evidence: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-layout-electron-RCNEzX`.
Component evidence: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/settings-electron-proof-IME8vz`.

A separate read-only screenshot gallery is published in `2026-09-20-settings-shadcn/settings.html` beside this report; the existing user-edited gallery is preserved.
