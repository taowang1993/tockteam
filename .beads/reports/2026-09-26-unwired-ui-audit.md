# Unwired UI Audit

Date: 2026-09-26

Reviewed revision: `0a046e3f`

Tracking: `tockteam-44wt`

## Summary

**Three confirmed actionable findings**, all P2: Page Preview has no behavior behind its setting, shared web-link bookmarks cannot be reopened, and bookmark groups have no rendered children or expansion action.

Separately, **two UI components are unmounted** (`MarkdownSlidesView` and `ResolvedEmbedsView`), and **one selector is fixed to a single value** (`Execution Environment`). These are recorded below without treating every unused helper or platform limitation as a bug.

This is a source-wiring audit, not a full runtime/UI certification. No application fixes were made.

## Scope and Method

- Searched 454 tracked application-source files under `src/`, `plugins/`, and `web/`, excluding tests, declarations, generated `lib/`/`dist/`, and build scripts from the reference-count scan. Inspected relevant tests and build/composition files separately.
- Traced TockLauncher settings/search, sidebar/workspace tools, terminal controls, skins, pinned summary, Save as Image, marketplace, and TockTutor route/contribution owners.
- Used TypeScript AST scans to identify JSX controls without direct handlers and uppercase function declarations without application references. Manually rejected false positives: form submission, Radix triggers, read-only controls, and components used within their own file.
- Checked package client metadata, Desktop/Web bundle layers, and TockTutor slot registration. A component can be wired through a slot even without a normal JSX caller.
- Queried CodeGraph for structure. Its exploration reported stale source slices despite the initial status saying up to date; conclusions below use current on-disk source and direct reference searches instead.
- Applied the review skill's simplification, security/hardening, and performance references. Recommendations preserve the isolated Web Viewer, existing composition, and native authority boundaries.
- The upstream Better Sidebar browser UI is not the shipped TockTeam UI: `scripts/build.mjs:221-222` builds its Host entry, while TockTeam owns the browser adapter. Upstream TUI received a placeholder search only, not an exhaustive interaction audit. Third-party/pinned DSH internals and generated distributions were not independently certified.

## Confirmed Findings

1. **[P2] Page Preview is a persisted setting with no feature consumer.**

   **Affected paths:**
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/utility-panel.tsx:276`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/settings.ts:30,63,107`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx:3081-3088,6448`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/editor-commands.ts:279`

   **Evidence:** Under **Workspaces and Panes → Settings and Workspaces**, the **Page Preview** checkbox calls `onSettingsChange`, which reaches `controller.updateSettings()` and persists the value. Application references to `pagePreview` occur only in the settings model and this checkbox; no mounted preview feature consumes it. `pagePreviewTargetAtOffset()` exists, but has no application caller. The architecture reference explicitly acknowledges this limitation at `.agents/references/tocktutor.md:150-151`.

   **Impact:** The setting defaults to enabled and accepts changes, but users cannot obtain the implied link-hover preview in either state. Saving successfully is not proof that the feature is connected.

   **Smallest remedy:** Hide or clearly disable the setting until a preview consumer exists. If implementing it, connect the existing target resolver to the owning editor and keep vault/path checks intact.

   **Verification/fix status:** Confirmed by current-source reference and callback-chain assertions. No rendered hover test or fix performed. A regression check should toggle the setting and assert the actual preview appears/disappears, not merely that the setting is stored.

2. **[P2] Web Viewer bookmarks are added to the shared list but cannot be opened from it.**

   **Affected paths:**
   - `plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx:502-506`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx:3140-3157,3173-3191,6412,6482`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/utility-panel.tsx:177-185`

   **Evidence:** Web Viewer's **Bookmark** action saves its own viewer bookmark and calls `addLinkBookmark`. The route supplies a real persistence callback, so a `kind: 'link'` record reaches the shared Workbench bookmark list. That list renders an enabled button invoking `onOpenBookmark`. The route calls `controller.openBookmark(id)`, but its link branch unconditionally returns `false`; the UI discards the result.

   **Impact:** Bookmark a page in Web Viewer, then open the Workbench **Bookmarks** panel: the shared link row appears clickable but does nothing. The separate bookmark list inside Web Viewer does call `navigate(bookmark.url)` and is wired; this finding is specifically about the shared Workbench list.

   **Smallest remedy:** Dispatch shared link bookmarks through the existing isolated Web Viewer opening path, or render them explicitly unavailable until supported. Do not substitute unrestricted browser/native navigation.

   **Verification/fix status:** Producer → stored record → button → rejected dispatcher confirmed in current source and executable assertions. No end-to-end browser reproduction or fix performed. Add a route-level check that creates a viewer bookmark and reopens it from the shared list.

3. **[P2] Bookmark Group selection is supported, but the list has no group expansion or child rendering.**

   **Affected paths:**
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx:3126-3134,3173-3191,4322-4419,5287-5288`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/utility-panel.tsx:177-185`
   - `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/bookmarks.ts:174`

   **Evidence:** The bookmark editor offers existing groups through **Bookmark Group** and persists moving a note bookmark into a group. Its component test exercises that selection (`tests/route-panel-controls.test.tsx:325-348`). However, the shared list only maps the top-level `snapshot.bookmarks`; it never renders `group.children` or supplies an expand action. Clicking the group instead calls `openBookmark(group.id)`, whose dispatcher has no group branch and returns `false`.

   **Impact:** For a vault with existing persisted groups, putting a note bookmark into a group removes its usable row from the shared list. The group row remains, but cannot expose its children. This is conditional on existing group data; this audit did not establish a current UI path for creating the first group.

   **Smallest remedy:** Render groups with their children using an existing disclosure pattern, or temporarily flatten child bookmarks into usable rows. Do not expose a group row as an ordinary open action without implementing one.

   **Verification/fix status:** Current-source assertions confirm the top-level-only rendering and absent group dispatcher. The existing group-edit component test passed, but only proves editor callback delivery, not list usability. No fix performed; add a check that moves a bookmark into an existing group and then opens it from the list.

## Unmounted or Static UI, Not Counted as Defects

- **`MarkdownSlidesView` — unmounted, documented helper.** Defined at `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/editor-surface.tsx:78-94`. Its only application-source occurrence is its declaration; there is no route/menu/slot caller. `tests/editor-adapters.test.tsx:840-845` mounts it directly and verifies external-embed callback behavior. That test passed, but cannot establish product reachability. `.agents/references/tocktutor.md:152` explicitly says **Slides Preview** is not mounted. Keep it as an explicit deferred capability or remove it if no longer needed; do not claim slides are available to users.

- **`ResolvedEmbedsView` — unmounted redundant renderer.** Defined at `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/editor-surface.tsx:46-76`; no application callers. This does **not** mean embeds are missing: `RichReadingView` passes resolved embeds into Markdown rendering (`editor-surface.tsx:212`), and **Attachments and Embeds** has its own mounted renderer (`utility-panel.tsx:197-214`). The reading test explicitly rejects a duplicate **Resolved Embeds** section (`tests/editor-adapters.test.tsx:593`). Prefer deleting this helper if obsolete rather than mounting a duplicate section just to make it “wired.”

- **Execution Environment — fixed Local selector.** `plugins/sidebar/src/client/plugin.tsx:1510-1515` renders `value="local"`, a single **Local** option, and `onChange={() => {}}`. There is no environment-switch action behind it. Since it offers no other environment, this audit does not infer that remote execution was promised. A static value would communicate the current implementation more accurately than an enabled selector.

## False Positives and Limits

- `NoteOutline`, `TockTutorRouteView`, `ImportExportReviewPanelView`, and `LauncherSettingsMenu` have same-file consumers; lack of cross-file references is not evidence of disconnection.
- TockTutor utility-menu entries, editor mode controls, Base copy/edit/export callbacks, and assistant/review/native/Web Viewer slot contributions have concrete wiring. This is source-level evidence, not a blanket assertion that every action succeeds at runtime.
- Web intentionally omits the Desktop bridge, TockLauncher, marketplace, and TockTutor. Missing those controls on Web is not an unwired-component finding (`web/cordis.patch.yml`, `src/profile.ts`). Platform-disabled launcher extensions, trust-gated actions, read-only embedded canvases, and shared UI primitives awaiting reuse are likewise not automatically defects.
- Additional bookmark branches warrant follow-up: graph bookmarks explicitly return `false`, and block bookmarks open the note without using `blockId` (`route.tsx:3176-3190`). They are not counted as separate findings because this audit did not establish a current mounted creation flow for those target types.
- No GUI, Electron, native-dialog, model-provider, or live-server verification was run. No screenshots were produced. Geometry/theme checks and full build/typecheck suites were outside this report-only task. No environment-blocked runtime check is counted as a bug.

## Fresh Verification

All commands below completed on the reviewed checkout on 2026-09-26.

```sh
node --test tests/surface.test.ts tests/tocktutor-route.test.ts tests/launcher-extension-settings.test.ts tests/sidebar.test.ts
```

**Result:** 25 passed, 0 failed; exit 0. These verify composition/route/service contracts, not the missing interactions above.

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx tests/route-panel-controls.test.tsx --environment jsdom -t 'opens external embeds from Slides|renders local embeds inline|edits one stable bookmark|creates a bookmark through|Live Preview|right-panel|Bookmarks'
```

**Result:** 55 passed, 119 skipped by the name filter, 0 failed; two files passed, exit 0. These are source-backed jsdom component tests, not browser proof. The command unexpectedly ran pnpm's workspace synchronization first; its sole tracked lockfile-specifier rewrite was identified and reversed after checking with both other active sessions. No dependency declaration change is included in this audit.

Temporary AST/reference and assertion scripts in `/tmp` also completed successfully: 454 source files scanned; 196 uppercase function declarations examined; both unmounted component declarations, the inert selector, and all three actionable callback/consumer gaps confirmed. These assertions characterize current wiring, not repaired behavior.

Useful repeatable searches (generated output and tests excluded deliberately):

```sh
rg -n '\bpagePreview\b|pagePreviewTargetAtOffset' src plugins web -g '*.{ts,tsx}' -g '!**/tests/**' -g '!**/lib/**' -g '!**/dist/**'
rg -n 'MarkdownSlidesView|ResolvedEmbedsView' src plugins web -g '*.{ts,tsx}' -g '!**/tests/**' -g '!**/lib/**' -g '!**/dist/**'
rg -n 'openBookmark|addLinkBookmark' plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx plugins/tocktutor/packages/tockbot-web-clip/src/client.tsx
rg -n 'workspace.execution-environment' plugins/sidebar/src/client/plugin.tsx
```

**Verdict:** Needs attention for the three user-facing wiring gaps. The unmounted helpers are not evidence that the existing editor or embed flow is broken. No application code was changed, and the pre-existing modification to `.beads/reports/2026-09-26-tockcoder-review.md` was left untouched.
