# Plan: Obsidian Migration — Images, Mermaid, and Properties

**Status:** Proposed; planning only. Implementation requires a separate go-ahead.

**Tracking:** Epic `tockteam-osw4`; image viewer `tockteam-osw4.1` → resizing `tockteam-osw4.2`; Mermaid Reading `tockteam-osw4.3` → Live Preview `tockteam-osw4.4`; property recognition `tockteam-osw4.5` → date/checkbox editing `tockteam-osw4.6` → remaining simple types `tockteam-osw4.7`. The three tracks have no artificial dependencies between them.

## Goal and Confirmed Scope

People bringing an Obsidian vault into TockTutor should be able to inspect and resize embedded images, read commonly used Mermaid diagrams, and edit supported properties with familiar controls without corrupting their notes or changing Obsidian's settings behind their backs.

The user explicitly chose **enlarge and resize**, not just an image popup, and **recognize and edit** imported property types, not merely display their labels. Tag suggestions are postponed. The migration path is opening a copied or selected local vault through the existing Desktop vault picker; it is not a new sync or import service.

**Design Read:** An existing, frequently used Desktop note editor for people moving from Obsidian. Preserve the note's authored Markdown, editing flow, semantic tokens, keyboard access, and recoverable saves; add inspection controls without obscuring writing.

## Verified Starting Point and Ownership

- TockTutor already displays Host-resolved local images, proxies eligible public images through its existing Web Clip Host, and bounds decoded/cached payloads. Reading uses `src/editor-surface.tsx` / `src/rich-markdown.ts` / `src/inline-images.ts`; Source and Live Preview use their own widgets and Milkdown editor. A viewer must consume those **already approved bytes**, not a Markdown URL.
- `src/milkdown-content.ts` deliberately preserves an image's alt text instead of Crepe's width-ratio serialization. Reading currently understands explicit local `WxH` sizing but not width-only `|W`. Resizing must update the exact authored image token through the owning editor transaction, not change a DOM width that disappears on save.
- `src/rich-markdown.ts` renders only a bounded subset of `graph TD/TB/LR/RL/BT` Mermaid; Source displays the fenced code in a static widget, and Live Preview does not supply broad diagram rendering. Static HTML/PDF output shares the safe synchronous renderer; a browser-only Mermaid upgrade must not silently add active markup to that path.
- `tockbot-note-runtime` already supports confined, no-follow, generation-bound passive reads under `.obsidian`, including `.json`, for backups. `src/host-read.ts` does **not** expose those reads to the browser. `src/properties.ts` infers types from YAML values; `src/linked-note-pane.tsx` enables editing through `MarkdownDocumentHeader`, whose current controls are largely text inputs. Recognizing `types.json` alone would not supply date pickers or list editing.
- WebObsidian `c41967a` demonstrates the interactions in `web/src/lib/imageLightbox.ts` and `web/src/lib/livePreview.ts`; `server/src/services/propertytypes.ts` describes Obsidian's `types.json` names. Use those as behavior references, not as trusted code or permission to widen TockTutor's Host/client boundary.

All work belongs to the existing Desktop-only TockTutor packages. Preserve the pinned DSH `0.1.2-rc.1` composition, `plugins/shared/surface.ts`, existing package IDs, and separate Host/browser responsibilities. No new plugin, Electron IPC endpoint, Web/TUI mount, or second vault writer is needed.

## Implementation Decisions

### Images

Use the existing public `@tockteam/ui/dialog` and buttons for one pane-owned viewer. Clicking a displayed image in Reading opens it; editable views expose a clearly named **View Image** action so viewing does not steal the editor's selection or resize gesture. Fit to viewport, bounded zoom, pan, reset, close on Escape/backdrop, visible focus, focus restoration, and an accessible control alternative to wheel/drag are required. Closing a pane or switching a note/vault disposes the viewer. Colors and sizing derive from DSH/TockTutor semantic tokens; use Tailwind utilities rather than a new stylesheet or theme layer.

In Live Preview, resizing uses an explicit handle plus a keyboard-accessible width control. Preview size may change during a drag; **one** revision-safe, undoable Markdown edit is committed on release. Cancellation leaves the original source intact. Write Obsidian-compatible width syntax (`![[photo.png|320]]` and `![Alt|320](photo.png)`), read existing `|320x200`, and preserve the file path, meaningful alt text, captions, surrounding Markdown and unrelated images. Keep width bounded by existing display limits and the pane. Reading and Source reflect the saved width; unsupported or unsafe images cannot initiate a write. The existing source/draft/save path remains the only document writer.

### Mermaid

Add a reviewed, pinned Mermaid browser dependency **only** because the current hand-written subset cannot provide broad diagram types; load it only when a Mermaid fence needs rendering. First prove that rendering untrusted fences does not execute scripts, admit authored URLs, fetch remote resources, or insert unsanitized HTML/SVG into the privileged renderer. Use strict/noninteractive configuration and a passive image projection of bounded generated SVG, not WebObsidian's direct `innerHTML = svg`. If that safety gate fails, retain the escaped-source fallback rather than weaken renderer isolation. Bound source length, diagram count and output size; ignore late results after a pane/note/vault/theme change or disposal. Use current semantic colors and re-render on appearance changes.

Start with ordinary Obsidian-authored flowchart, sequence, class, state, ER, pie and Gantt examples. This is useful multi-family support, **not** a claim to every Mermaid directive or interactive link. Reading renders them first; Live Preview reuses that renderer for a fence away from the editing caret and exposes the exact fenced Markdown while editing. Source always retains editable code. Malformed, too-large or unsupported diagrams show escaped source and never erase the note. The existing safe static HTML/PDF renderer retains its current bounded diagram/fallback behavior until a separate static-export contract is approved.

### Migrated Properties

Expose a fixed-purpose, read-only `getObsidianPropertyTypes(expectedVault)` Workbench Remote method. The Host alone calls the Runtime's existing passive **list + exact-revision read** for `.obsidian/types.json`, then bounds and validates the JSON and returns only known property-name/type pairs; the browser cannot supply a path or obtain raw hidden configuration. Treat missing, malformed, oversized, stale, symlinked or unrecognized settings as a safe fallback to current inference. Cache by the exact vault generation and discard late results; refresh on vault activation, not on every note render. Do not modify `.obsidian/types.json` in this plan.

Map Obsidian `text`, `multitext`, `number`, `checkbox`, `date`, `datetime`, `tags`, and `aliases` to supported TockTutor controls, retaining the authored YAML value as the data source of truth. For example, an empty `due:` with a declared date type should offer a date control in the **Properties** linked view; displayed properties in the document header should show the same effective type. Use native date/number/date-time inputs and existing checkbox/list controls where values can round-trip safely. Only a user's edit writes the note through the existing revision-bound `setProperty` / `setFrontmatterProperty` path. Never coerce unsupported structured YAML, incompatible typed values or zone-bearing date-times; offer Source Mode instead. Keep normal property inference for vaults without Obsidian metadata.

## Delivery Slices and Acceptance Checks

### 1. Inspect Images (`tockteam-osw4.1`, no blocker)

Ship one safe viewer for Reading, Live Preview and Source image surfaces. Verify fit, zoom/pan/reset, keyboard controls, Escape/backdrop, focus return, per-pane teardown, broken-image fallback, and local/proxied-image provenance. Preserve existing click-to-edit/reveal behavior in editable views. Likely owners: `src/editor-surface.tsx`, `src/live-preview-editor-runtime.tsx`, `src/source-embed-widgets.ts`, a Workbench-local dialog component; `tests/editor-adapters.test.tsx` and `tests/inline-images.test.tsx`. RED before implementation; verify through component tests and a guarded Desktop image walkthrough. Estimated scope: medium.

### 2. Resize Images (`tockteam-osw4.2`, after 1)

Resize one Live Preview image by dragging and by keyboard-accessible width action; persist width-only syntax, preserve existing `WxH` until an explicit change, support local wikilink and ordinary Markdown-image spellings, and keep alt/caption text. Verify cancel, undo/redo, same-path repeated embeds, split panes, saving/reopening exact Markdown bytes and the Unsaved indicator clearing. Likely owners: `src/milkdown-content.ts`, Live Preview image/widget integration, `src/embeds.ts`, `src/rich-markdown.ts`, focused editor/renderer tests. RED before implementation; guarded Desktop proof after the component/serialization checks. Estimated scope: medium, split further if Crepe's image node cannot carry a lossless source range.

### 3. Read Broader Mermaid Diagrams (`tockteam-osw4.3`, no blocker)

Deliver the safety-checked lazy renderer in Reading with fixtures for the named diagram families, built-in light/dark and skin changes, parse failure and hostile labels/links. Keep the authored fence and safe static export untouched. Likely owners: `src/rich-markdown.ts`, `src/editor-surface.tsx`, a Workbench-local browser renderer, the Workbench dependency/build inputs, `tests/rich-markdown.test.ts` and `tests/editor-adapters.test.tsx`. RED before implementation. **Stop gate:** no raw active SVG/HTML or external resource fetch in the Desktop renderer. Estimated scope: medium-to-large; keep library review within this slice rather than adding a separate parser project.

### 4. Show Mermaid While Editing (`tockteam-osw4.4`, after 3)

Reuse the same renderer in Live Preview without replacing Source or the editable fence. Verify caret enter/leave, pane/vault/theme switches, stale async completion, malformed fences, edit/save/reopen and existing simple diagrams. Likely owners: `src/live-preview-editor-runtime.tsx`, existing editor widget projection, `tests/editor-adapters.test.tsx` and a focused Live Preview component test. RED before implementation; guarded Desktop proof. Estimated scope: medium.

### 5. Recognize Imported Property Types (`tockteam-osw4.5`, no blocker)

Show that a copied vault's empty declared date retains its **Date** type in the note header and linked Properties view. Validate the fixed-file Host transport, malformed/missing/oversized/unsafe config fallback, exact vault generation, and unchanged `.obsidian/types.json` bytes. Likely owners: `src/host-read.ts`, `src/types.ts` and generated Typert outputs, `src/route.tsx`, `src/properties.ts`, `src/linked-note-pane.tsx`, `tests/host-read-transport.test.ts`, `tests/properties.test.ts`, `tests/route-linked-panes.test.tsx`. Use the runtime passive read; do not invent a browser filesystem API. RED before implementation and prove a copied vault in guarded Desktop. Estimated scope: medium-to-large.

### 6. Edit Dates and Checkboxes (`tockteam-osw4.6`, after 5)

Use native date input and the existing checkbox in the linked Properties pane for safe values, including an empty imported date and unset checkbox. Verify exact YAML bytes and type after save/reopen, no change to the Obsidian registry, validation/error state, stale linked pane rejection and retained draft on failure. Likely owners: `src/live-preview-editor.tsx`, `src/properties.ts`, route/linked-pane state and their focused tests. RED before implementation; guarded Desktop save/reopen proof. Estimated scope: medium.

### 7. Edit Remaining Simple Types (`tockteam-osw4.7`, after 6)

Extend the same flow to finite numbers, flat string lists, tag and alias lists, and date-times only when timezone representation can round-trip. Keep unsupported YAML in Source Mode, do not flatten data, and leave unrelated frontmatter untouched. Exercise copied-vault fixtures, switching between two vaults, invalid inputs, undo/recovery and exact save/reopen. Likely owners: the same existing property control and parser seams plus their tests; do not add a second persistence system. RED before implementation; guarded Desktop copied-vault proof and aggregate gates. Estimated scope: medium.

**Checkpoint after each track:** a user-visible demonstration and focused test must pass before expanding to the dependent slice. The independent tracks can proceed separately, but multiple writers must coordinate shared `src/route.tsx`, `src/editor-surface.tsx`, build outputs and installed smoke resources.

## Verification Contract for Implementation

Write one failing user-facing check per behavior before changing implementation. Reuse the existing Workbench Vitest/jsdom and `node:test` suites, Host transport fixtures, and route-linked-pane tests; do not add a new test framework. Representative focused commands (run from repository root; new focused tests may be added beside these):

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/inline-images.test.tsx tests/editor-adapters.test.tsx tests/route-linked-panes.test.tsx --environment jsdom
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench run build
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/rich-markdown.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/properties.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/host-read-transport.test.ts
```

After focused checks pass, run `pnpm run install:tocktutor`, `pnpm -C plugins/tocktutor run validate:parity`, `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, `pnpm run build:tocktutor`, `node scripts/tocktutor-build-manifest.mjs --check`, then `pnpm run typecheck`, `pnpm test`, and `pnpm run build`. The nested workspace and tracked build outputs must stay aligned; never hand-edit `lib/` or `dist/`. If the known frozen-install issue `tockteam-kn7` blocks the gate, report that as an environment/dependency blocker rather than claiming green tests.

For browser-visible changes, use the `playwright-cli` interaction guidance **only through** an owned `extended_display` Electron/CDP endpoint, not its standalone-browser launch path. Do not run scripts that spawn Electron directly. Verify 1512 × 949 CSS pixels, DPR 2, and 3024 × 1898 screenshot pixels; record route, note/mode, image/diagram/property state, focus, errors, and exact saved vault bytes. Canonical Obsidian comparisons use built-in dark, `skinId: null`, verified dark `colorScheme` and no active skin. Also inspect built-in light and all four named skins, reduced motion, keyboard use and narrow panes. Publish only allowlisted screenshots after assertions; stop and verify the complete owned app/browser/server process tree in `finally`. Show the screenshot and tell the user to restart Electron after an actual UX implementation.

## Risks and Deliberate Non-Goals

- Mermaid adds a large browser dependency and parses untrusted authored text. Audit the exact version, output, resource behavior, packaging size and cleanup; fail closed if safety cannot be demonstrated. Do not copy WebObsidian's direct SVG insertion or relax Electron CSP/permissions.
- Crepe's default image-width ratio is intentionally not serialized, so writing only its ratio would pretend resize persisted. Prove the exact Markdown edit, undo and reload before accepting the resize slice.
- `.obsidian/types.json` is user-owned and may be malformed, large or linked. Reuse Host no-follow reads; reading cannot mutate it. A future **type-changing** picker or two-way Obsidian interoperability would require a separate explicit write/recovery contract and approval.
- No Git sync, public sharing, tag autocomplete, image crop/edit/download pipeline, remote image URL bypass, arbitrary HTML diagrams, new parser for the whole Obsidian Markdown dialect, broad SVG/HTML/PDF export parity, or TockTutor Web/TUI mount in this plan. Complex YAML continues to be editable in Source Mode only.

No source code or runtime behavior is changed by this plan.
